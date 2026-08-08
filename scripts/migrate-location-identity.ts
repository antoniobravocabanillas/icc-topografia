import { PrismaClient } from "@prisma/client";
import { slugify } from "../lib/server/api";

const prisma = new PrismaClient();

function normalizeDocument(value?: string | null) {
  const normalized = value?.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  return normalized || null;
}

async function ensureColumn(table: string, column: string, ddl: string) {
  await prisma.$executeRawUnsafe(`ALTER TABLE "icc"."${table}" ADD COLUMN IF NOT EXISTS "${column}" ${ddl}`);
}

async function ensureIndex(name: string, sql: string) {
  await prisma.$executeRawUnsafe(sql.replace("CREATE INDEX", "CREATE INDEX IF NOT EXISTS"));
}

async function ensureUniqueIndex(name: string, table: string, columns: string[], where: string) {
  const columnSql = columns.map((column) => `"${column}"`).join(", ");
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "${name}" ON "icc"."${table}" (${columnSql}) WHERE ${where}`);
}

async function addColumns() {
  await ensureColumn("Company", "publicSlug", "TEXT");
  await ensureColumn("Company", "region", "TEXT");
  await ensureColumn("Company", "country", "TEXT NOT NULL DEFAULT 'PE'");
  await ensureColumn("Company", "locationSubdivisionCode", "TEXT");
  await ensureColumn("Company", "locationCity", "TEXT");

  await ensureColumn("Client", "country", "TEXT NOT NULL DEFAULT 'PE'");
  await ensureColumn("Client", "region", "TEXT");
  await ensureColumn("Client", "locationSubdivisionCode", "TEXT");
  await ensureColumn("Client", "locationCity", "TEXT");

  await ensureColumn("Address", "subdivisionCode", "TEXT");

  await ensureColumn("TerraqoWorkspace", "publicSlug", "TEXT");
  await ensureColumn("TerraqoWorkspace", "country", "TEXT NOT NULL DEFAULT 'PE'");
  await ensureColumn("TerraqoWorkspace", "region", "TEXT");
  await ensureColumn("TerraqoWorkspace", "locationSubdivisionCode", "TEXT");
  await ensureColumn("TerraqoWorkspace", "locationCity", "TEXT");

  await ensureColumn("TerraqoProfessionalProfile", "region", "TEXT");
  await ensureColumn("TerraqoProfessionalProfile", "locationSubdivisionCode", "TEXT");
  await ensureColumn("TerraqoProfessionalProfile", "locationCity", "TEXT");
}

async function backfill() {
  const companies = await prisma.company.findMany({
    select: { id: true, terraqoWorkspaceId: true, tradeName: true, legalName: true, document: true, city: true, publicSlug: true },
    orderBy: { createdAt: "asc" },
  });

  const companySlugCounts = new Map<string, number>();
  for (const company of companies) {
    const baseSlug = slugify(company.publicSlug || company.tradeName || company.legalName || company.document || company.id) || company.id;
    const keyBase = `${company.terraqoWorkspaceId}:${baseSlug}`;
    const nextCount = (companySlugCounts.get(keyBase) || 0) + 1;
    companySlugCounts.set(keyBase, nextCount);
    await prisma.company.update({
      where: { id: company.id },
      data: {
        publicSlug: company.publicSlug || (nextCount === 1 ? baseSlug : `${baseSlug}-${nextCount}`),
        document: normalizeDocument(company.document),
        locationCity: company.city || null,
        country: "PE",
      },
    });
  }

  const clients = await prisma.client.findMany({
    select: { id: true, document: true, address: true },
  });
  for (const client of clients) {
    await prisma.client.update({
      where: { id: client.id },
      data: {
        document: normalizeDocument(client.document),
        country: "PE",
      },
    });
  }

  const workspaces = await prisma.terraqoWorkspace.findMany({
    select: { id: true, slug: true, publicSlug: true },
  });
  for (const workspace of workspaces) {
    await prisma.terraqoWorkspace.update({
      where: { id: workspace.id },
      data: {
        publicSlug: workspace.publicSlug || workspace.slug,
        country: "PE",
      },
    });
  }

  await prisma.$executeRawUnsafe(`
    UPDATE "icc"."TerraqoProfessionalProfile"
    SET "locationCity" = COALESCE("locationCity", "city"),
        "country" = COALESCE("country", 'PE')
  `);
}

async function neutralizeDuplicateDocuments(table: "Company" | "Client") {
  await prisma.$executeRawUnsafe(`
    WITH ranked AS (
      SELECT
        "id",
        ROW_NUMBER() OVER (
          PARTITION BY "terraqoWorkspaceId", "document"
          ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" ASC
        ) AS rn
      FROM "icc"."${table}"
      WHERE "document" IS NOT NULL AND trim("document") <> ''
    )
    UPDATE "icc"."${table}" target
    SET "document" = target."document" || '-DUP-' || target."id"
    FROM ranked
    WHERE target."id" = ranked."id" AND ranked.rn > 1
  `);
}

async function indexes() {
  await neutralizeDuplicateDocuments("Company");
  await neutralizeDuplicateDocuments("Client");

  await ensureUniqueIndex(
    "Company_terraqoWorkspaceId_publicSlug_key",
    "Company",
    ["terraqoWorkspaceId", "publicSlug"],
    `"publicSlug" IS NOT NULL AND "deletedAt" IS NULL`,
  );
  await ensureUniqueIndex(
    "Company_terraqoWorkspaceId_document_key",
    "Company",
    ["terraqoWorkspaceId", "document"],
    `"document" IS NOT NULL AND trim("document") <> '' AND "deletedAt" IS NULL`,
  );
  await ensureUniqueIndex(
    "Client_terraqoWorkspaceId_document_key",
    "Client",
    ["terraqoWorkspaceId", "document"],
    `"document" IS NOT NULL AND trim("document") <> '' AND "deletedAt" IS NULL`,
  );
  await ensureUniqueIndex(
    "TerraqoWorkspace_publicSlug_key",
    "TerraqoWorkspace",
    ["publicSlug"],
    `"publicSlug" IS NOT NULL AND "deletedAt" IS NULL`,
  );

  await ensureIndex("Company_location_idx", `CREATE INDEX "Company_location_idx" ON "icc"."Company" ("country", "locationSubdivisionCode", "locationCity")`);
  await ensureIndex("Client_location_idx", `CREATE INDEX "Client_location_idx" ON "icc"."Client" ("country", "locationSubdivisionCode", "locationCity")`);
  await ensureIndex("TerraqoWorkspace_location_idx", `CREATE INDEX "TerraqoWorkspace_location_idx" ON "icc"."TerraqoWorkspace" ("country", "locationSubdivisionCode", "locationCity")`);
  await ensureIndex("TerraqoProfessionalProfile_location_idx", `CREATE INDEX "TerraqoProfessionalProfile_location_idx" ON "icc"."TerraqoProfessionalProfile" ("country", "locationSubdivisionCode", "locationCity")`);
}

async function main() {
  await addColumns();
  await backfill();
  await indexes();
  console.log("Location and identity migration completed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
