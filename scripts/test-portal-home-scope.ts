import assert from "node:assert/strict";
import { resolvePortalHomeWorkspaceId } from "../lib/terraqo/portal-home-scope";

async function main() {
  let defaultWorkspaceReads = 0;
  const getDefaultWorkspaceId = async () => {
    defaultWorkspaceReads += 1;
    return "client-workspace";
  };

  assert.equal(
    await resolvePortalHomeWorkspaceId(true, getDefaultWorkspaceId),
    null,
    "A professional dashboard must not depend on the public commerce workspace.",
  );
  assert.equal(defaultWorkspaceReads, 0);

  assert.equal(
    await resolvePortalHomeWorkspaceId(false, getDefaultWorkspaceId),
    "client-workspace",
    "The legacy client portal must keep its tenant boundary.",
  );
  assert.equal(defaultWorkspaceReads, 1);

  console.log("Portal home scope: OK (professional cockpit is tenant-independent; client portal keeps its workspace boundary).");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
