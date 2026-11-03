# S22 — workspace authority safety

Implemented the first bounded S22 block locally. The complete invitation/acceptance UI and lifecycle are not implemented by this change.

## Authority mutations

- Global membership update and upsert now acquire a workspace row lock before inspecting current membership and remaining administrators. Mutation and check share an explicit READ COMMITTED transaction, so a waiter sees the preceding committed removal. Uses existing effective admin roles OWNER/ADMIN/MANAGER; it does not silently change authorization semantics.
- Staff access unlink now locks workspace then staff profile, checks membership, deactivates it and clears the staff association atomically. Rejecting the last administrator keeps both links intact. Other-workspace staff IDs fail closed.
- Professional-affiliation approval preserves the role of an existing member instead of overwriting it with PROFESSIONAL. New memberships still use PROFESSIONAL. Checkout/staff upserts inspected: their update paths do not reduce role or deactivate members.
- Last-admin rejection redirects to a visible explanatory alert in the appropriate admin page. Other errors still propagate. Global SUPER_ADMIN does not bypass the invariant.

## Validation

`node scripts/rehearse-workspace-membership-local.mjs --confirm=local-s22-only` starts a fresh password-protected loopback PostgreSQL 18 cluster, builds the current schema only there, runs synthetic service tests and stops the cluster/removes the temporary password file in finally. It does not use staging or production. The test runtime is the local bootstrap role; this is concurrency/transaction evidence, not hosted role-isolation certification.

Real PostgreSQL checks passed: two simultaneous removals yield one success and one LastWorkspaceAdministratorError; one active administrator remains; role demotion rejects and rolls back an earlier write in the transaction; another workspace's owner cannot satisfy the guard; no-op/admin-preserving transitions remain allowed; rejected staff unlink preserves association; cross-workspace unlink rejects; allowed unlink deactivates membership without deleting users. TypeScript and targeted ESLint checked separately. HTTP admin actions and visible alerts still need browser/hosted acceptance.

## Next block

Workspace invitation model and service: hashed single-use tokens, recipient's verified identity, role/expiry/workspace binding, minimal-role creation, cancellation and bounded resend, transactional acceptance. Preserve explicit mail-send authorization and do not reuse operational team invitations as workspace authority. Add local migration rehearsal and real concurrent acceptance tests before any remote schema operation. Then implement the dedicated S22 screen against reference page 23.

No schema migration, deployment, email or real customer mutation in this block.
