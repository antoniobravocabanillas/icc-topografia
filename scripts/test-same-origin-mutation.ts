import assert from "node:assert/strict";
import { isSameOriginMutation } from "../lib/server/same-origin-mutation";
const request = (origin: string, host: string, forwarded = "") => new Request("http://localhost:3100/api/example", { headers: { origin, host, "x-forwarded-host": forwarded } });
assert.equal(isSameOriginMutation(request("http://127.0.0.1:3100", "127.0.0.1:3100")), true);
assert.equal(isSameOriginMutation(request("http://evil.invalid", "127.0.0.1:3100", "evil.invalid")), false);
for (const origin of ["", "null", "http://127.0.0.1:3101", "https://127.0.0.1:3100", "http://127.0.0.1:3100/path"]) assert.equal(isSameOriginMutation(request(origin, "127.0.0.1:3100")), false);
for (const host of ["user@127.0.0.1:3100", "127.0.0.1:3100,evil.invalid", "127.0.0.1:3100/path"]) assert.equal(isSameOriginMutation(request("http://127.0.0.1:3100", host)), false);
assert.equal(isSameOriginMutation(new Request("https://admin.terraqoglobal.com/api/example", { headers: { origin: "https://admin.terraqoglobal.com", host: "admin.terraqoglobal.com" } })), true);
console.log("PASS same-origin: normalized internal hostname, host binding, protocol/port mismatch and forged forwarding rejected.");
