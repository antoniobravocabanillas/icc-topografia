import assert from "node:assert/strict";

async function run() {
  const url = new URL(process.env.DATABASE_URL || "invalid:");
  assert.equal(process.env.TERRAQO_LOCAL_S24_TEST, "synthetic-only");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.username, "terraqo_s24_test");
  const { prisma } = await import("../lib/prisma");
  const service = await import("../lib/terraqo/publication-review");
  const sharing = await import("../lib/terraqo/scoped-sharing");
  const { loadPublicationProjections } =
    await import("../lib/terraqo/publication-projection");
  try {
    assert.equal(
      await prisma.user.count({ where: { id: "migration-sentinel" } }),
      1,
    );
    const owner = await prisma.user.create({
      data: { email: "owner@s24.invalid" },
    });
    const admin = await prisma.user.create({
      data: { email: "admin@s24.invalid" },
    });
    const other = await prisma.user.create({
      data: { email: "other@s24.invalid" },
    });
    const profile = await prisma.terraqoProfessionalProfile.create({
      data: { userId: owner.id },
    });
    const workspace = await prisma.terraqoWorkspace.create({
      data: { name: "Synthetic S24", slug: "synthetic-s24" },
    });
    await prisma.terraqoWorkspaceMember.createMany({
      data: [admin, other].map((user) => ({
        userId: user.id,
        workspaceId: workspace.id,
        role: "ADMIN",
      })),
    });
    const worklog = await prisma.terraqoWorklogEntry.create({
      data: {
        professionalProfileId: profile.id,
        authorId: owner.id,
        workspaceId: workspace.id,
        title: "Privado",
        summary: "Resumen",
        locationLabel: "Lugar aprobado",
      },
    });
    const revision = await prisma.terraqoWorklogRevision.create({
      data: {
        worklogId: worklog.id,
        revisionNo: 1,
        title: "Privado",
        summary: "Resumen",
        contentHash: "immutable",
        createdById: owner.id,
      },
    });
    await prisma.terraqoWorklogEntry.update({
      where: { id: worklog.id },
      data: { currentRevisionId: revision.id },
    });
    const collection = await prisma.terraqoShareCollection.create({
      data: {
        professionalProfileId: profile.id,
        createdById: owner.id,
        title: "Selección sintética",
        operationKey: "synthetic-op",
        operationFingerprint: "synthetic",
        items: {
          create: {
            revisionId: revision.id,
            allowedFields: ["summary", "locationLabel"],
            sortOrder: 0,
          },
        },
      },
    });
    const [review] = await service.requestPublicationReviews({
      userId: owner.id,
      collectionId: collection.id,
      expectedVersion: 1,
    });
    await assert.rejects(
      sharing.publishCollectionProjection({
        userId: owner.id,
        collectionId: collection.id,
        expectedVersion: 1,
      }),
      /Falta una autorización/,
    );
    const decisions = await Promise.allSettled(
      [admin, other].map((user) =>
        service.decidePublicationReview({
          userId: user.id,
          reviewId: review.id,
          payload: {
            decision: "APPROVED",
            confirmed: true,
            scopeHash: review.scopeHash,
          },
        }),
      ),
    );
    assert.equal(
      decisions.filter((result) => result.status === "fulfilled").length,
      1,
      "Concurrent administrators cannot overwrite each other's decision.",
    );
    assert.equal(
      await prisma.terraqoPublicProjection.count(),
      0,
      "Approval does not publish.",
    );
    const published = await sharing.publishCollectionProjection({
      userId: owner.id,
      collectionId: collection.id,
      expectedVersion: 1,
    });
    await prisma.terraqoWorklogEntry.update({
      where: { id: worklog.id },
      data: { locationLabel: "Lugar posterior" },
    });
    const projection = await sharing.getPublicCollectionProjection(
      published.slug,
    );
    assert.equal(projection.items[0].locationLabel, "Lugar aprobado");
    assert.equal("title" in projection.items[0], false);
    await service.revokePublicationReview({
      userId: admin.id,
      reviewId: review.id,
      reason: "Prueba de retiro",
    });
    await assert.rejects(
      sharing.getPublicCollectionProjection(published.slug),
      /no disponible/,
    );
    assert.equal(
      (await loadPublicationProjections(prisma, [published.id])).size,
      0,
    );
    const current = await prisma.terraqoShareCollection.findUniqueOrThrow({
      where: { id: collection.id },
    });
    const [renewed] = await service.requestPublicationReviews({
      userId: owner.id,
      collectionId: collection.id,
      expectedVersion: current.version,
    });
    await service.decidePublicationReview({
      userId: admin.id,
      reviewId: renewed.id,
      payload: {
        decision: "APPROVED",
        confirmed: true,
        scopeHash: renewed.scopeHash,
      },
    });
    const republished = await sharing.publishCollectionProjection({
      userId: owner.id,
      collectionId: collection.id,
      expectedVersion: current.version,
    });
    assert.notEqual(republished.id, published.id);
    assert.notEqual(republished.slug, published.slug);
    await assert.rejects(
      sharing.getPublicCollectionProjection(published.slug),
      /no disponible/,
    );
    assert.equal(
      (await sharing.getPublicCollectionProjection(republished.slug)).items[0]
        .locationLabel,
      "Lugar posterior",
    );
    await prisma.terraqoWorkspace.update({
      where: { id: workspace.id },
      data: { active: false },
    });
    await assert.rejects(
      sharing.getPublicCollectionProjection(republished.slug),
      /no disponible/,
    );
    assert.equal(
      await prisma.user.count({ where: { id: "migration-sentinel" } }),
      1,
    );
    console.log(
      "PASS real PostgreSQL: migration preservation, explicit publication, concurrent decision conflict, immutable public fields, revocation, new access identity and inactive workspace denial.",
    );
  } finally {
    await prisma.$disconnect();
  }
}
run().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message.replace(/postgresql:\/\/\S+/g, "postgresql://[redacted]")
      : "Local test failed",
  );
  process.exitCode = 1;
});
