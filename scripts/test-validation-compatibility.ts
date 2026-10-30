import assert from "node:assert/strict";
import { z } from "zod";
import { cvExtractionSchema, cvImportReviewSchema } from "../lib/terraqo/cv-import-schema";
import { categoryUpdateSchema, productInputSchema, productUpdateSchema } from "../lib/validations/product";
import { serviceUpdateSchema, postUpdateSchema, faqUpdateSchema } from "../lib/validations/content";
import { jsonRecordSchema } from "../lib/validations/common";

// Regression for GHSA-mrhx-c7xc-m3w5: cardinality must abort before expanding
// validation work for every attacker-controlled member of a constrained array.
let visited = 0;
const bounded = z.array(z.unknown().superRefine(() => { visited++; })).max(6);
const oversized = bounded.safeParse(new Array(10_000).fill(null));
assert.equal(oversized.success, false);
assert.equal(visited, 0);
if (!oversized.success) assert.equal(oversized.error.issues.length, 1);
bounded.parse([1, 2, 3]); assert.equal(visited, 3);

// A partial edit cannot reset inventory, publication policy or existing media.
for (const schema of [categoryUpdateSchema, productUpdateSchema, serviceUpdateSchema, postUpdateSchema, faqUpdateSchema]) {
  assert.deepEqual(schema.parse({}), {});
}
assert.deepEqual(productUpdateSchema.parse({ name: " Equipo GNSS " }), { name: "Equipo GNSS" });
assert.deepEqual(productUpdateSchema.parse({ stock: "0", requiresQuote: false, images: [], specifications: {} }), { stock: 0, requiresQuote: false, images: [], specifications: {} });
assert.deepEqual(serviceUpdateSchema.parse({ title: "Nuevo titulo" }), { title: "Nuevo titulo" });
assert.deepEqual(faqUpdateSchema.parse({ active: false, position: "0" }), { active: false, position: 0 });
assert.equal(productUpdateSchema.safeParse({ stock: -1 }).success, false);
assert.equal(productUpdateSchema.safeParse({ specifications: { invalid: 123 } }).success, false);
const product = productInputSchema.parse({ name: "GNSS", sku: "GPS-01", brand: "Marca", summary: "Equipo para campo", description: "Equipo de topografia", availability: "Disponible", categoryId: "categoria" });
assert.equal(product.stock, 0); assert.equal(product.currency, "USD");
assert.equal(product.requiresQuote, false); assert.deepEqual(product.images, []);
assert.deepEqual(product.specifications, {});

const emptyCv = cvExtractionSchema.parse({});
assert.deepEqual(emptyCv.profile, { professionalCategories: [], specialties: [], equipment: [], software: [], certifications: [] });
assert.deepEqual(emptyCv.experiences, []); assert.deepEqual(emptyCv.education, []);
assert.equal(cvExtractionSchema.safeParse({ profile: { unexpected: true } }).success, false);
assert.deepEqual(jsonRecordSchema.parse({ extra: [1, "value", null] }), { extra: [1, "value", null] });
const item = { id: "cm00000000000000000000001", decision: "ACCEPTED", normalizedData: { title: "Topografia", confidence: 0.8 } };
assert.equal(cvImportReviewSchema.safeParse({ items: [item] }).success, true);
assert.equal(cvImportReviewSchema.safeParse({ items: [{ ...item, normalizedData: [] }] }).success, false);
console.log("Validation compatibility PASS: early collection bound, sparse PATCH, typed records, nested CV defaults and strict input validation.");
