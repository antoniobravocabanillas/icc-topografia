import assert from "node:assert/strict";
import { createChatRecoveryLink, parseChatRecovery } from "../lib/terraqo/chat-recovery-link";
const value = { v: 1 as const, id: "visitor2_synthetic", token: "synthetic.signature" };
const link = createChatRecoveryLink(value.id, value.token, "https://example.invalid/atencion/test?tracking=drop");
assert.equal(new URL(link).search, "");
assert.deepEqual(parseChatRecovery(link, "https://example.invalid"), value);
assert.deepEqual(parseChatRecovery(JSON.stringify(value), "https://example.invalid"), value);
for (const bad of ["https://foreign.invalid" + new URL(link).hash, "javascript:alert(1)", "#terraqo-chat=broken", "x".repeat(4001), JSON.stringify({ ...value, token: "invalid secret" })]) assert.throws(() => parseChatRecovery(bad, "https://example.invalid"));
console.log("PASS recovery link roundtrip, legacy code, foreign origin and malformed inputs.");
