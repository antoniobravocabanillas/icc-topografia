import assert from "node:assert/strict";
import { validatePrivateProfessionalFile } from "../lib/server/professional-file-validation";
async function main() {
  for (const [name, mime, bytes] of [
    ["a.pdf", "application/pdf", [37,80,68,70,45]], ["a.png", "image/png", [137,80,78,71,13,10,26,10]],
    ["a.jpeg", "image/jpeg", [255,216,255]], ["a.webp", "image/webp", [82,73,70,70,0,0,0,0,87,69,66,80]],
  ] as const) {
    assert.equal(await validatePrivateProfessionalFile(new File([new Uint8Array(bytes)], name, {type: mime})), null);
    assert.ok(await validatePrivateProfessionalFile(new File(["<html>"], name, {type: mime})));
    assert.ok(await validatePrivateProfessionalFile(new File([new Uint8Array(bytes)], "a.exe", {type: mime})));
    assert.ok(await validatePrivateProfessionalFile(new File([new Uint8Array(bytes)], "../"+name, {type: mime})));
  }
  console.log("PASS professional file format/name/signature validation (not malware scanning).");
}
main().catch(() => { console.error("FAIL professional file validation"); process.exitCode=1; });
