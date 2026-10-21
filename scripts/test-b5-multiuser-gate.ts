import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

function confirmedGateUrl() {
  const value = process.env.B5_GATE_DATABASE_URL?.trim();
  const expected = process.env.B5_GATE_EXPECTED_DATABASE?.trim();
  assert.ok(value, "Define B5_GATE_DATABASE_URL con una base disposable.");
  assert.ok(expected, "Define B5_GATE_EXPECTED_DATABASE para confirmar el destino.");
  const parsed = new URL(value);
  assert.match(parsed.protocol, /^postgres(?:ql)?:$/, "El fixture B5 solo admite PostgreSQL.");
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(parsed.hostname), "El fixture mutante B5 solo puede ejecutarse contra localhost.");
  assert.equal(decodeURIComponent(parsed.pathname.replace(/^\//, "")), expected, "La base no coincide con B5_GATE_EXPECTED_DATABASE.");
  assert.match(expected, /(?:gate|test|staging|disposable)/i, "El nombre de la base debe declarar que es aislada.");
  return value;
}

async function main() {
  process.env.DATABASE_URL = confirmedGateUrl();
  process.env.TERRAQO_DISCOVERY_NEEDS_V1 = "true";
  process.env.TERRAQO_COLLABORATION_V1 = "true";
  process.env.TERRAQO_CLOSURE_V1 = "true";
  process.env.TERRAQO_EVIDENCE_ANALYSIS_V1 = "true";
  process.env.TERRAQO_EMPLOYER_NEEDS_MONTHLY_LIMIT = "2";
  process.env.TERRAQO_EVIDENCE_ANALYSIS_MONTHLY_LIMIT = "2";

  const [{ prisma }, entitlements, discovery] = await Promise.all([
    import("@/lib/prisma"),
    import("@/lib/terraqo/product-entitlements"),
    import("@/lib/terraqo/discovery-needs"),
  ]);

  const runId = randomUUID().replaceAll("-", "").slice(0, 12);
  const emails = [`b5-owner-a-${runId}@example.invalid`, `b5-owner-b-${runId}@example.invalid`];
  const slugs = [`b5-pilot-${runId}`, `b5-control-${runId}`];
  const createdWorkspaceIds: string[] = [];
  const createdUserIds: string[] = [];

  try {
    const [ownerA, ownerB] = await Promise.all(emails.map((email, index) => prisma.user.create({
      data: { name: `B5 synthetic owner ${index + 1}`, email, emailVerified: new Date(), role: "CUSTOMER" },
      select: { id: true },
    })));
    createdUserIds.push(ownerA.id, ownerB.id);

    const [pilot, control] = await Promise.all([
      prisma.terraqoWorkspace.create({
        data: {
          name: `B5 Pilot ${runId}`,
          slug: slugs[0],
          ownerUserId: ownerA.id,
          members: { create: { userId: ownerA.id, role: "OWNER", active: true, joinedAt: new Date() } },
          subscriptions: { create: { tier: "PROFESSIONAL", status: "ACTIVE", seats: 3 } },
        },
        select: { id: true },
      }),
      prisma.terraqoWorkspace.create({
        data: {
          name: `B5 Control ${runId}`,
          slug: slugs[1],
          ownerUserId: ownerB.id,
          members: { create: { userId: ownerB.id, role: "OWNER", active: true, joinedAt: new Date() } },
          subscriptions: { create: { tier: "PROFESSIONAL", status: "ACTIVE", seats: 3 } },
        },
        select: { id: true },
      }),
    ]);
    createdWorkspaceIds.push(pilot.id, control.id);
    process.env.TERRAQO_B5_PILOT_WORKSPACE_IDS = pilot.id;

    await prisma.terraqoWorkNeed.create({
      data: {
        workspaceId: control.id,
        createdById: ownerB.id,
        operationKey: randomUUID(),
        operationFingerprint: `synthetic-control-${runId}`,
      },
    });

    const [pilotEntitlement, controlEntitlement] = await Promise.all([
      entitlements.getWorkspaceProductEntitlements(ownerA.id, pilot.id),
      entitlements.getWorkspaceProductEntitlements(ownerB.id, control.id),
    ]);
    assert.equal(pilotEntitlement.plan.tier, "PROFESSIONAL");
    assert.equal(pilotEntitlement.features.find((item) => item.feature === "employer_needs")?.status, "ACTIVE");
    assert.equal(controlEntitlement.features.find((item) => item.feature === "employer_needs")?.status, "PENDING_PILOT");
    await assert.rejects(
      entitlements.requireWorkspacePilotFeature(ownerB.id, control.id, "employer_needs"),
      (error: unknown) => error instanceof entitlements.TerraqoEntitlementError && error.status === 403,
    );

    const payload = {
      title: "Control topográfico sintético",
      problem: "Validar aislamiento, idempotencia y límite sin datos reales.",
      activities: ["Replanteo de ejes"],
      context: "Fixture B5 disposable",
      locationLabel: "Ubicación sintética",
      requiredTools: ["Estación total"],
      endorsementNeeded: false,
      requirements: [{ label: "Experiencia documentada", priority: "REQUIRED" as const }],
    };
    const replayKey = randomUUID();
    const replayed = await Promise.all([
      discovery.createWorkspaceNeed({ userId: ownerA.id, workspaceId: pilot.id, operationKey: replayKey, payload, monthlyLimit: 2 }),
      discovery.createWorkspaceNeed({ userId: ownerA.id, workspaceId: pilot.id, operationKey: replayKey, payload, monthlyLimit: 2 }),
    ]);
    assert.equal(replayed[0].id, replayed[1].id, "El replay concurrente debe devolver un único recurso.");
    assert.equal(await prisma.terraqoWorkNeed.count({ where: { workspaceId: pilot.id } }), 1);

    await discovery.createWorkspaceNeed({
      userId: ownerA.id,
      workspaceId: pilot.id,
      operationKey: randomUUID(),
      payload: { ...payload, title: "Segundo registro sintético" },
      monthlyLimit: 2,
    });
    await assert.rejects(
      discovery.createWorkspaceNeed({
        userId: ownerA.id,
        workspaceId: pilot.id,
        operationKey: randomUUID(),
        payload: { ...payload, title: "Debe exceder el límite" },
        monthlyLimit: 2,
      }),
      (error: unknown) => error instanceof discovery.DiscoveryNeedsError && error.status === 429,
    );
    assert.equal(await prisma.terraqoWorkNeed.count({ where: { workspaceId: pilot.id } }), 2);

    const exhausted = await entitlements.getWorkspaceProductEntitlements(ownerA.id, pilot.id);
    assert.equal(exhausted.features.find((item) => item.feature === "employer_needs")?.status, "LIMIT_REACHED");

    await prisma.terraqoSubscription.updateMany({ where: { workspaceId: pilot.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    process.env.TERRAQO_B5_PILOT_WORKSPACE_IDS = "";
    const downgraded = await entitlements.getWorkspaceProductEntitlements(ownerA.id, pilot.id);
    assert.equal(downgraded.plan.tier, "FREE");
    assert.equal(downgraded.features.find((item) => item.feature === "employer_needs")?.status, "PENDING_PILOT");
    assert.equal((await discovery.listWorkspaceNeeds(pilot.id)).length, 2, "Retirar el piloto no debe borrar historial.");
    assert.equal((await discovery.listWorkspaceNeeds(control.id)).length, 1, "El workspace de control conserva su historial.");

    process.env.TERRAQO_DISCOVERY_NEEDS_V1 = "false";
    const disabled = await entitlements.getWorkspaceProductEntitlements(ownerA.id, pilot.id);
    assert.equal(disabled.features.find((item) => item.feature === "employer_needs")?.status, "DISABLED");
    assert.equal(await prisma.terraqoWorkNeed.count({ where: { workspaceId: pilot.id } }), 2);

    console.log("B5 multiuser gate: OK (piloto/control, replay concurrente, límite, downgrade y flags).");
  } finally {
    if (createdWorkspaceIds.length) await prisma.terraqoWorkspace.deleteMany({ where: { id: { in: createdWorkspaceIds } } });
    if (createdUserIds.length) await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
