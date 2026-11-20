# S17 provenance staging candidate

Runtime candidate: `7302dba68937028289eb0615e4cd5d659eb1c556`, branch `codex/s17-closure-provenance`.

Destination: Terraqo Platform Staging, Netlify site `6b8c43fb-6083-450a-9b85-46a820fb6358`, Supabase project `mghdpciewbsowjrjwmwk`. Production is excluded. New migration authorization is pending; this document is not authorization.

## Promotion order

1. Confirm the destination through the existing staging environment validator and database identity/ledger readback. Verify the deployed baseline and checksum history. Do not print credentials. Stop on drift or incomplete migration history.
2. Obtain a current staging backup and validate restoration on a disposable loopback instance. Record its path/hash without adding the dump to git. Preserve existing invitations and collaboration records.
3. Once specifically authorized, apply only the reviewed additive migration `20261120000100_closure_accepted_proposal_provenance` using the established migration workflow. Do not run `db push`, reset the remote database or resolve unrelated ledger discrepancies automatically.
4. Independently verify nullable column, index, RESTRICT relation, seven functions and six enabled guards; confirm legacy NULL rows were not backfilled and row counts/history are preserved. Confirm runtime permissions through the restricted staging role.
5. Build/deploy the exact candidate only after schema compatibility is confirmed. Keep the deployment token isolated from the build as required by the existing deploy script. Verify the served candidate marker before and after tests.
6. Run the authenticated S16/S17 controls with bounded synthetic fixtures. Assert UI proposal identity, private drafts, correction/history, exact certificate and media isolation. Capture desktop/mobile pages and inspect them. Preserve `phaseComplete:false` until the separate sharing workflow is implemented and validated.
7. Remove only fixtures/pilot/blob identifiers created by the run, using the ordered SERIALIZABLE teardown with guards enabled. Verify absence using a separate connection and strong blob readback.

## Rollback

If deployment or hosted checks fail, restore the previous application candidate only after verifying old-writer/new-schema compatibility. Keep the additive schema and any provenance history; do not drop columns, guards or certificates as a shortcut. Record the precise failing operation and observed response. At most three correction cycles for a bounded checkpoint; do not weaken privacy/authorization assertions to make a gate pass.

## Next independent implementation block

Current S06 collection items reference `TerraqoWorklogRevision`; the publication snapshot policy is explicitly a worklog projection. A collaboration certificate is not that resource. Do not insert a certificate ID into a worklog ID field, synthesize a worklog revision, toggle `privateByDefault`, or treat company acceptance of a closure as public consent.

Prepare a separately typed certificate disclosure with an immutable selected-field snapshot and digest, exact certificate/revision/proposal identity, professional confirmation, company authorization, destination (public or invited), recipient and expiry when invited, and revocation history. Legacy unbound certificates fail closed for this new disclosure path. Names are selected fields, not unconditional identity metadata. Files and referenced evidence retain separate authorization on every read.

Required acceptance matrix: private issuance has no public side effects; missing either party consent denies access; altered fields/recipient/expiry require new authorization; competing approve/revoke operations serialize; retry keys reconcile identical operations and reject different payloads; unrelated tenant, unverified invite identity, expiry and revocation deny reads and downloads; omission of a field survives DTO/render/export; certificate access never authorizes underlying attachments. UI remains in-page with a clear preview and status, not nested modals. This is a preparation contract, not implemented sharing functionality.
