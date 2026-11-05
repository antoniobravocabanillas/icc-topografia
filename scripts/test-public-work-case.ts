// Run against a local Next dev server sharing the disposable work_case_test
// database, local media directory and a fresh work-case-local-* AUTH_SECRET.
// Enable TERRAQO_WORK_CASES_V1, TERRAQO_SCOPED_SHARING_V1 and
// TERRAQO_WORKSPACE_PUBLICATION_V1 in both processes. No external services.
import assert from "node:assert/strict";
import { encode } from "@auth/core/jwt";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { chromium, expect } from "@playwright/test";
import { confirmedLocalDisposableDatabaseUrl } from "./lib/confirmed-local-disposable-database";
import { prisma } from "../lib/prisma";
import {
  publicWorkCase,
  publicWorkCaseCards,
} from "../lib/terraqo/public-work-case";
import {
  requestPublicationReviews,
  decidePublicationReview,
  revokePublicationReview,
} from "../lib/terraqo/publication-review";
import { Prisma } from "@prisma/client";
import { publishCollectionProjection } from "../lib/terraqo/scoped-sharing";
import {
  publicCaseRecordHref,
  publicWorkCaseHref,
} from "../lib/terraqo/public-cv-permalink";

async function main() {
  confirmedLocalDisposableDatabaseUrl({
    value: process.env.DATABASE_URL,
    expected: "work_case_test",
    valueVariable: "DATABASE_URL",
    expectedVariable: "work_case_test",
  });
  const origin = new URL(
    process.env.WORK_CASE_TEST_ORIGIN ?? "http://localhost:3190",
  );
  assert.ok(
    origin.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(origin.hostname),
  );
  const secret = process.env.AUTH_SECRET;
  assert.ok(
    secret?.startsWith("work-case-local-"),
    "Use a fresh work-case-local-* secret in both disposable local processes.",
  );
  const username = `case-${randomUUID()}`;
  const cv = `/cv/${username}`;
  const bytes = await sharp({
    create: { width: 4, height: 4, channels: 3, background: "#173549" },
  })
    .webp()
    .toBuffer();
  const storageKey = username + ".webp";
  const mediaDir = path.join(
    process.env.WORK_CASE_TEST_APP_ROOT || process.cwd(),
    ".next",
    "local-media",
    "terraqo-worklog-evidence",
  );
  await mkdir(mediaDir, { recursive: true });
  await writeFile(path.join(mediaDir, storageKey), bytes, { flag: "wx" });
  const owner = await prisma.user.create({
    data: { email: `${username}@test.invalid`, name: "Profesional de prueba" },
  });
  const browser = await chromium.launch();
  try {
    const profile = await prisma.terraqoProfessionalProfile.create({
      data: {
        username,
        userId: owner.id,
        liveCvEnabled: true,
        liveCvVisibility: "PUBLIC",
      },
    });
    const records = [];
    for (const [i, title] of [
      "PRIVATE-TITLE-1",
      "PRIVATE-TITLE-2",
      "Bitácora independiente",
    ].entries()) {
      const record = await prisma.terraqoWorklogEntry.create({
        data: {
          authorId: owner.id,
          professionalProfileId: profile.id,
          title,
          summary: "Contenido de la fuente",
          visibility: i === 2 ? "PUBLIC" : "PRIVATE",
          locationLabel: "PRIVATE-LOCATION",
        },
      });
      const revision = await prisma.terraqoWorklogRevision.create({
        data: {
          worklogId: record.id,
          revisionNo: 1,
          title,
          summary: `Resumen autorizado ${i + 1}`,
          contentHash: randomUUID(),
          createdById: owner.id,
        },
      });
      records.push({ id: record.id, revisionId: revision.id });
    }
    const group = await prisma.terraqoWorkCase.create({
      data: {
        professionalProfileId: profile.id,
        createdById: owner.id,
        title: "PRIVATE-GROUP",
        lifecycle: "ACTIVE",
        records: {
          create: records.map((record) => ({
            worklogId: record.id,
            relationshipStatus: "CONFIRMED",
          })),
        },
      },
    });
    const media = await prisma.terraqoWorklogMedia.create({
      data: {
        worklogId: records[0].id,
        storageKey,
        fileName: "PRIVATE-FILENAME.webp",
        contentType: "image/webp",
        size: bytes.length,
      },
    });
    const omitted = await prisma.terraqoWorklogMedia.create({
      data: {
        worklogId: records[0].id,
        storageKey: storageKey + "-other",
        fileName: "PRIVATE-OTHER.webp",
        contentType: "image/webp",
        size: bytes.length,
      },
    });
    const collection = await prisma.terraqoShareCollection.create({
      data: {
        professionalProfileId: profile.id,
        createdById: owner.id,
        title: "Control de campo",
        description: "Dos registros seleccionados",
        operationKey: username,
        operationFingerprint: username,
        items: {
          create: records.slice(0, 2).map((record, i) => ({
            revisionId: record.revisionId,
            sortOrder: i,
            allowedFields: ["summary"],
            includeMedia: i === 0,
            mediaIds: i === 0 ? [media.id] : [],
          })),
        },
      },
    });
    assert.deepEqual((await publicWorkCaseCards(username, 2)).cards, []);
    assert.equal(await publicWorkCase(username, group.id), null);
    process.env.TERRAQO_WORKSPACE_PUBLICATION_V1 = "false";
    const legacy = await publishCollectionProjection({
      userId: owner.id,
      collectionId: collection.id,
      expectedVersion: 1,
    });
    const target = { id: group.id, version: group.version };
    assert.equal(await publicWorkCase(username, legacy.slug), null);
    await assert.rejects(
      publishCollectionProjection({
        userId: owner.id,
        collectionId: collection.id,
        expectedVersion: 2,
        workCase: target,
      }),
    );
    process.env.TERRAQO_WORKSPACE_PUBLICATION_V1 = "true";
    assert.equal(await publicWorkCase(username, legacy.slug), null);
    const ordinary = await publishCollectionProjection({
      userId: owner.id,
      collectionId: collection.id,
      expectedVersion: 2,
    });
    assert.equal(await publicWorkCase(username, ordinary.slug), null);
    assert.deepEqual((await publicWorkCaseCards(username, 2)).cards, []);
    const propose = {
      userId: owner.id,
      collectionId: collection.id,
      expectedVersion: 3,
      workCase: target,
    };
    await assert.rejects(
      publishCollectionProjection({
        ...propose,
        workCase: { ...target, version: target.version + 1 },
      }),
    );
    const account = await browser.newContext({ baseURL: origin.origin });
    await account.route("**/*", (route) =>
      new URL(route.request().url()).origin === origin.origin
        ? route.continue()
        : route.abort(),
    );
    const cookie = "authjs.session-token";
    await account.addCookies([
      {
        name: cookie,
        value: await encode({
          secret: secret!,
          salt: cookie,
          token: { sub: owner.id, email: owner.email },
          maxAge: 600,
        }),
        url: origin.origin,
      },
    ]);
    const ownerPage = await account.newPage();
    await ownerPage.goto("/portal/selecciones");
    await ownerPage
      .getByRole("button", { name: "Revocar publicación", exact: true })
      .click();
    await ownerPage
      .getByRole("button", { name: "Confirmar revocación" })
      .click();
    const consent = ownerPage.getByRole("checkbox", {
      name: /Mostrar esta selección como trabajo agrupado/,
    });
    await expect(consent).not.toBeChecked();
    await consent.check();
    const sent = ownerPage.waitForResponse(
      (response) =>
        response.url().endsWith("/projection") &&
        response.request().method() === "POST",
    );
    await ownerPage
      .getByRole("button", {
        name: "Publicar selección y mostrar trabajo en mi CV",
      })
      .click();
    const result = await sent;
    assert.deepEqual(result.request().postDataJSON(), {
      expectedVersion: 4,
      workCase: target,
    });
    assert.equal(result.status(), 200, await result.text());
    const publication = (await result.json()).data as {
      id: string;
      slug: string;
    };
    await account.close();
    console.log(
      "PASS Chromium: authenticated owner revoked ordinary selection, explicitly opted in, published through the real HTTP route.",
    );
    const read = () => publicWorkCase(username, publication.slug);
    const pinned = await prisma.terraqoPublicProjection.findUniqueOrThrow({
      where: { id: publication.id },
    });
    const original = pinned.snapshot as Prisma.JsonObject;
    await prisma.terraqoPublicProjection.update({
      where: { id: publication.id },
      data: { snapshot: { ...original, title: "CHANGED" } },
    });
    assert.equal(
      await read(),
      null,
      "The intent cannot be transplanted onto different public content.",
    );
    await prisma.terraqoPublicProjection.update({
      where: { id: publication.id },
      data: { snapshot: original },
    });
    await prisma.terraqoWorkCase.update({
      where: { id: group.id },
      data: { version: { increment: 1 } },
    });
    assert.equal(
      await read(),
      null,
      "Changed group needs fresh affirmative intent.",
    );
    // Restore the isolated fixture before exercising the original browser path.
    await prisma.terraqoWorkCase.update({
      where: { id: group.id },
      data: { version: target.version },
    });
    const work = await read();
    assert.ok(work && work.items.length === 2);
    assert.doesNotMatch(
      JSON.stringify(work),
      /PRIVATE-|Contenido de la fuente/,
    );
    assert.equal(work.items[0].media.length, 1);
    assert.equal(work.items[0].media[0].id, media.id);
    assert.equal(await publicWorkCase(username, legacy.slug), null);
    assert.equal(await publicWorkCase("other-profile", publication.slug), null);
    await prisma.terraqoWorkCaseRecord.update({
      where: { worklogId: records[0].id },
      data: { relationshipStatus: "SUGGESTED" },
    });
    assert.equal(await read(), null);
    await prisma.terraqoWorkCaseRecord.update({
      where: { worklogId: records[0].id },
      data: { relationshipStatus: "CONFIRMED" },
    });
    await prisma.terraqoWorklogEntry.update({
      where: { id: records[1].id },
      data: { deletedAt: new Date() },
    });
    assert.equal(await read(), null);
    await prisma.terraqoWorklogEntry.update({
      where: { id: records[1].id },
      data: { deletedAt: null },
    });
    await prisma.terraqoProfessionalProfile.update({
      where: { id: profile.id },
      data: { liveCvEnabled: false },
    });
    assert.equal(await read(), null);
    await prisma.terraqoProfessionalProfile.update({
      where: { id: profile.id },
      data: { liveCvEnabled: true },
    });
    for (const flag of ["TERRAQO_WORK_CASES_V1", "TERRAQO_SCOPED_SHARING_V1"]) {
      const previous = process.env[flag];
      try {
        process.env[flag] = "false";
        assert.equal(await read(), null);
      } finally {
        process.env[flag] = previous;
      }
    }
    const otherGroup = await prisma.terraqoWorkCase.create({
      data: {
        professionalProfileId: profile.id,
        createdById: owner.id,
        title: "PRIVATE-OTHER",
        lifecycle: "ACTIVE",
      },
    });
    await prisma.terraqoWorkCaseRecord.update({
      where: { worklogId: records[1].id },
      data: { workCaseId: otherGroup.id },
    });
    assert.equal(
      await read(),
      null,
      "A collection spanning different groups is not a published work case.",
    );
    await prisma.terraqoWorkCaseRecord.update({
      where: { worklogId: records[1].id },
      data: { workCaseId: group.id },
    });
    console.log(
      "PASS PostgreSQL: private grouping, restricted v1/v2 publications, rotation, wrong owner, suggested link, source and CV withdrawal.",
    );

    const context = await browser.newContext({
      baseURL: origin.origin,
      viewport: { width: 375, height: 830 },
    });
    await context.route("**/*", (route) =>
      new URL(route.request().url()).origin === origin.origin
        ? route.continue()
        : route.abort(),
    );
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const groupPath = publicWorkCaseHref(username, publication.slug);
    const itemPath = publicCaseRecordHref(
      username,
      publication.slug,
      records[0].id,
      records[0].revisionId,
    );
    const groupTitle = page.getByRole("heading", {
      name: work.title,
      exact: true,
    });
    const scopedMedia = work.items[0].media[0].href;
    const mediaResponse = await context.request.get(scopedMedia);
    assert.equal(mediaResponse.status(), 200, scopedMedia);
    assert.deepEqual(await mediaResponse.body(), bytes);
    assert.match(mediaResponse.headers()["cache-control"], /no-store/);
    assert.doesNotMatch(JSON.stringify(mediaResponse.headers()), /PRIVATE-/);
    assert.equal(
      (
        await context.request.get(scopedMedia.replace(media.id, omitted.id))
      ).status(),
      404,
    );
    await page.goto(cv);
    await expect(groupTitle).toBeVisible({ timeout: 45000 });
    await expect(
      page
        .getByRole("heading", { name: "Bitácora independiente", exact: true })
        .first(),
    ).toBeVisible();
    await page.getByRole("link", { name: "Ver todos los trabajos" }).click();
    await expect(page).toHaveURL(origin.origin + cv + "/trabajos");
    await page.getByRole("link", { name: /Control de campo/ }).click();
    await expect(page).toHaveURL(origin.origin + groupPath);
    await expect(groupTitle).toBeVisible();
    await page.screenshot({ path: "output/public-work-case-mobile.png" });
    await page
      .getByRole("link", { name: "Ver bitácora", exact: true })
      .first()
      .click();
    await expect(page).toHaveURL(origin.origin + itemPath);
    await expect(
      page.getByText("Resumen autorizado 1", { exact: true }),
    ).toBeVisible();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.reload();
    await expect(
      page.getByText("Resumen autorizado 1", { exact: true }),
    ).toBeVisible();
    await page.goBack();
    await expect(groupTitle).toBeVisible();
    await page.goForward();
    await expect(
      page.getByText("Resumen autorizado 1", { exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Volver al trabajo" }).click();
    await expect(groupTitle).toBeVisible();

    for (const path of [groupPath, itemPath, cv + "/trabajos"]) {
      const response = await context.request.get(path);
      assert.equal(response.status(), 200);
      assert.doesNotMatch(
        await response.text(),
        /PRIVATE-|Contenido de la fuente/,
      );
    }
    for (const path of [
      cv + "/evidencias/" + records[0].id,
      itemPath + "&trabajo=otro",
      itemPath.replace(records[0].revisionId, records[1].revisionId),
      cv + "/trabajos/" + group.id,
    ]) {
      assert.equal((await context.request.get(path)).status(), 404, path);
    }

    const barePath = cv + "/evidencias/" + records[0].id;
    const bareMedia = `/api/public/cv/${username}/worklogs/${media.id}`;
    await prisma.terraqoWorklogEntry.update({
      where: { id: records[0].id },
      data: { visibility: "PUBLIC" },
    });
    assert.match(
      await (await context.request.get(barePath)).text(),
      /PRIVATE-TITLE-1/,
    );
    assert.deepEqual(
      await (await context.request.get(bareMedia)).body(),
      bytes,
    );
    assert.doesNotMatch(
      await (await context.request.get(itemPath)).text(),
      /PRIVATE-/,
    );
    await prisma.terraqoProfessionalProfile.update({
      where: { id: profile.id },
      data: { liveCvEnabled: false },
    });
    for (const path of [barePath, bareMedia, itemPath, scopedMedia])
      assert.equal((await context.request.get(path)).status(), 404);
    await prisma.terraqoProfessionalProfile.update({
      where: { id: profile.id },
      data: { liveCvEnabled: true },
    });
    await prisma.terraqoPublicProjection.update({
      where: { id: publication.id },
      data: { revokedAt: new Date() },
    });
    await page.goBack();
    await expect(page).toHaveURL(origin.origin + itemPath);
    await expect(
      page.getByText("Resumen autorizado 1", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText(/Esta selección no está disponible|404/).first(),
    ).toBeVisible();
    assert.equal((await context.request.get(scopedMedia)).status(), 404);
    assert.equal((await context.request.get(barePath)).status(), 200);
    await prisma.terraqoWorklogEntry.update({
      where: { id: records[0].id },
      data: { visibility: "PRIVATE" },
    });
    for (const path of [groupPath, itemPath])
      assert.equal((await context.request.get(path)).status(), 404);
    await page.goBack();
    await expect(page).toHaveURL(origin.origin + groupPath);
    await page.goBack();
    await expect(page).toHaveURL(origin.origin + cv + "/trabajos");
    await expect(
      page.getByText("No hay trabajos agrupados disponibles."),
    ).toBeVisible();
    await expect(groupTitle).toHaveCount(0);
    await page.goto(cv + "/trabajos?despues=" + publication.slug);
    await page.getByRole("link", { name: "Volver al CV" }).click();
    await expect(page).toHaveURL(origin.origin + cv + "#trabajos");
    await expect(page.getByRole("heading", { name: "Profesional de prueba", exact: true })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(
      origin.origin + cv + "/trabajos?despues=" + publication.slug,
    );
    await expect(
      page.getByText("No hay trabajos agrupados disponibles."),
    ).toBeVisible();
    await page.goto(cv);
    await expect(groupTitle).toHaveCount(0);
    await page
      .locator("#trabajos")
      .getByRole("link", { name: "Ver bitácora", exact: true })
      .click();
    await expect(page).toHaveURL(
      origin.origin + cv + "/evidencias/" + records[2].id,
    );
    await expect(
      page
        .getByRole("heading", { name: "Bitácora independiente", exact: true })
        .first(),
    ).toBeVisible();
    const workspace = await prisma.terraqoWorkspace.create({
      data: { name: "Case workspace", slug: username },
    });
    try {
      await prisma.terraqoWorkspaceMember.create({
        data: { workspaceId: workspace.id, userId: owner.id, role: "ADMIN" },
      });
      await prisma.terraqoWorkCase.update({
        where: { id: group.id },
        data: { workspaceId: workspace.id },
      });
      await prisma.terraqoWorklogEntry.updateMany({
        where: { id: { in: records.map((row) => row.id) } },
        data: { workspaceId: workspace.id },
      });
      const enterprise = { ...propose, expectedVersion: 5 };
      await assert.rejects(
        publishCollectionProjection(enterprise),
        /Falta una autorización/,
      );
      const ordinaryRequest = {
        userId: owner.id,
        collectionId: collection.id,
        expectedVersion: 5,
      };
      const [ordinaryReview] = await requestPublicationReviews(ordinaryRequest);
      const approve = (review: { id: string; scopeHash: string }) =>
        decidePublicationReview({
          userId: owner.id,
          reviewId: review.id,
          payload: {
            decision: "APPROVED",
            confirmed: true,
            scopeHash: review.scopeHash,
          },
        });
      await approve(ordinaryReview);
      await assert.rejects(
        publishCollectionProjection(enterprise),
        /Falta una autorización/,
      );
      await publishCollectionProjection(ordinaryRequest);
      const current = { ...enterprise, expectedVersion: 6 };
      const [caseReview] = await requestPublicationReviews(current);
      await approve(caseReview);
      const approved = await publishCollectionProjection(current);
      assert.ok(await publicWorkCase(username, approved.slug));
      await revokePublicationReview({
        userId: owner.id,
        reviewId: caseReview.id,
        reason: "Retiro de prueba",
      });
      assert.equal(await publicWorkCase(username, approved.slug), null);
      console.log(
        "PASS PostgreSQL: ordinary approval cannot authorize CV grouping; explicit company scope, approval and withdrawal.",
      );
    } finally {
      await prisma.terraqoPublicationReview.deleteMany({
        where: { collectionId: collection.id },
      });
      await prisma.terraqoWorkspace.delete({ where: { id: workspace.id } });
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS Chromium: CV, list, case, scoped canonical detail, direct reload, Back/Forward, neutral 404s, revocation and standalone evidence at 375px.",
    );
  } finally {
    await browser.close();
    await prisma.terraqoShareCollection.deleteMany({
      where: { createdById: owner.id },
    });
    await prisma.terraqoProfessionalProfile.deleteMany({
      where: { userId: owner.id },
    });
    await prisma.user.delete({ where: { id: owner.id } });
    await prisma.$disconnect();
    await unlink(path.join(mediaDir, storageKey));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
