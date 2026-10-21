import assert from "node:assert/strict";
import {
  terraqoAccessGrantCreateSchema,
  terraqoEndorsementDecisionSchema,
  terraqoEndorsementRequestCreateSchema,
  terraqoShareCollectionCreateSchema,
} from "../lib/validations/terraqo";
import { deriveEndorsementStatus } from "../lib/terraqo/endorsement-policy";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const cuid = "cm12345678901234567890123";
assert.equal(terraqoShareCollectionCreateSchema.safeParse({
  title: "Control geométrico",
  items: [{ revisionId: cuid, allowedFields: ["title", "summary"], includeMedia: false }],
}).success, true);

assert.equal(terraqoAccessGrantCreateSchema.safeParse({
  expectedVersion: 1,
  subjectUserId: cuid,
  inviteEmail: "otro@terraqo.test",
  scopes: ["VIEW_COLLECTION"],
  expiresAt: "2027-01-01T00:00:00-05:00",
}).success, false, "Un grant no puede mezclar usuario y correo.");

assert.equal(terraqoAccessGrantCreateSchema.safeParse({
  expectedVersion: 1,
  subjectUserId: cuid,
  scopes: ["DOWNLOAD_MEDIA"],
  expiresAt: "2027-01-01T00:00:00-05:00",
}).success, false, "Descargar nunca puede concederse sin lectura de la selección.");

assert.equal(terraqoAccessGrantCreateSchema.safeParse({
  expectedVersion: 1,
  subjectUserId: cuid,
  scopes: ["VIEW_COLLECTION", "DOWNLOAD_MEDIA"],
  expiresAt: "2027-01-01T00:00:00-05:00",
}).success, true);

assert.equal(terraqoEndorsementRequestCreateSchema.safeParse({
  revisionId: cuid,
  reviewerEmail: "revisor@terraqo.test",
  relationshipLabel: "Supervisor de campo",
  requestedScope: ["summary"],
  expiresAt: "2027-01-01T00:00:00-05:00",
}).success, true);

assert.equal(terraqoEndorsementDecisionSchema.safeParse({
  expectedVersion: 1,
  responses: [{ field: "summary", decision: "CHANGES_REQUESTED" }],
}).success, false, "Pedir cambios exige comentario.");

assert.equal(deriveEndorsementStatus([]), "IN_REVIEW");
assert.equal(deriveEndorsementStatus(["CONFIRMED", "CONFIRMED"]), "CONFIRMED");
assert.equal(deriveEndorsementStatus(["UNABLE_TO_CONFIRM"]), "DECLINED");
assert.equal(deriveEndorsementStatus(["CONFIRMED", "UNABLE_TO_CONFIRM"]), "PARTIAL");
assert.equal(deriveEndorsementStatus(["CONFIRMED", "CHANGES_REQUESTED"]), "CHANGES_REQUESTED");

const root = process.cwd();
const sharingSource = readFileSync(join(root, "lib/terraqo/scoped-sharing.ts"), "utf8");
const publicMediaRoute = readFileSync(join(root, "app/api/v1/public/selections/[slug]/media/[mediaId]/route.ts"), "utf8");
const privateMediaRoute = readFileSync(join(root, "app/api/v1/shared-selections/[id]/media/[mediaId]/route.ts"), "utf8");
const migration = readFileSync(join(root, "prisma/migrations/20261020143000_share_item_media_snapshot/migration.sql"), "utf8");
assert.match(sharingSource, /mediaIds: item\.includeMedia/, "La selección debe congelar los IDs de medios al crearse.");
assert.match(sharingSource, /item\.mediaIds\.includes\(media\.id\)/, "La proyección debe enumerar solo el snapshot.");
assert.match(publicMediaRoute, /mediaIds: \{ has: mediaId \}/, "La descarga pública debe exigir membresía en el snapshot.");
assert.match(privateMediaRoute, /mediaIds: \{ has: mediaId \}/, "El grant privado debe exigir membresía en el snapshot.");
assert.match(migration, /WHERE item\."includeMedia" = true/, "El backfill solo debe congelar selecciones que autorizaron medios.");

console.log("Scoped sharing and endorsement contract checks passed.");
