import assert from "node:assert/strict";
import { selectionAccessSnapshot } from "../lib/server/selection-access-snapshot";

const authorized = { title: "Selección", expiresAt: new Date("2030-01-01T12:00:00Z"), items: [{ media: [{ id: "one", href: "/authorized/one", downloadHref: "/authorized/one?download=1" }], summary: "Trabajo compartido" }] };
const snapshot = selectionAccessSnapshot(authorized);
assert.deepEqual(Object.keys(snapshot), ["fingerprint"]);
assert.match(snapshot.fingerprint, /^[a-f0-9]{64}$/);
assert.equal(snapshot.fingerprint, selectionAccessSnapshot(JSON.parse(JSON.stringify(authorized))).fingerprint, "Server Dates and JSON timestamps identify the same authorized view.");
for (const changed of [
  { ...authorized, expiresAt: new Date("2030-01-02T12:00:00Z") },
  { ...authorized, items: [{ media: [], summary: "Trabajo compartido" }] },
  { ...authorized, items: [{ media: authorized.items[0].media }] },
  { ...authorized, items: [{ media: [{ id: "one", href: "/authorized/one", downloadHref: null }], summary: "Trabajo compartido" }] },
]) assert.notEqual(snapshot.fingerprint, selectionAccessSnapshot(changed).fingerprint, "Changed scope/expiry/media must invalidate the rendered view.");
console.log("PASS: authorized snapshot JSON consistency and field/media/download/expiry invalidation.");
