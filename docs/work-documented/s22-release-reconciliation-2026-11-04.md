# S22 release reconciliation — 4 November 2026

## Candidate and scope

Isolated branch: `codex/s22-workspace-admin-20261104`. S22 implementation checkpoint: `d8c8601`. Reconciled with customer-attention release `285b20ad45f79e80e0410967f399f561f0a64781`, using common base `c623ec8e70d27c04babc3cb0ac6c594b00bc4cfc`.

The sole textual conflict was the import block of `lib/server/admin-actions.ts`. Both the last-administrator/atomic staff unlink guard and the incoming customer-chat mutation service are retained. Navigation retains the invitations feature flag and the released permission-gated floating attention shortcut. The schema retains both invitation and attention follow-up fields. This is a combined platform candidate: earlier S23/S24 changes are also present, not an S22-only production patch.

## Local validation

- Disposable PostgreSQL S22 suites: PASS, including last-admin concurrency, atomic unlink, invitation lifecycle, tenant isolation, stale updates, hierarchy, idempotency and HTTP boundaries.
- Real Next.js/Auth.js/PostgreSQL/Chromium S22: PASS, including persisted role changes, verified recipient acceptance, revoked permissions with existing cookies, notification 403 and stopped polling. Desktop/mobile screenshots inspected; no horizontal overflow or runtime/hydration errors.
- Customer attention disposable PostgreSQL and authenticated browser suite: PASS, including published contact rules, concurrent replay, routing, tenant isolation, assignment/reply, private notes, revoked authority, mobile context and fixture cleanup.
- Recovery links, request origin, attention objectives and staging-target contracts: PASS.
- Targeted ESLint: zero errors; existing unused `existingUserId` warning in admin-actions remains.
- TypeScript `--noEmit --incremental false` and staged whitespace/conflict checks: PASS after removing archived generated caches from source discovery.

The first two S22 browser attempts failed because attention's database rehearsal also launches Next.js internally and both suites wrote the same `.next` directory. The third S22 attempt, run alone with fresh artifacts, passed. **Run these two rehearsals sequentially**, even without attention's `--build-verify` argument. Old generated caches were moved outside the source tree to OS temp; do not include generated archived TypeScript in compilation. No product error suppression was introduced.

## Schema delta against attention release

| Migration absent from release branch | Readiness |
| --- | --- |
| `20261101000100_enterprise_publication_review` | Earlier S23 work; refresh hosted ledger/checksums before any application. |
| `20261102000100_selection_access_requests` | Earlier S24 work; refresh hosted ledger/checksums before any application. |
| `20261104000100_workspace_invitations` | S22, rehearsed only on disposable local PostgreSQL. |

`20261104000200_customer_attention_followup` is present in the incoming release. Never blindly replay migrations or infer provider state from Git history.

## Next executable gate

1. Prepare a dedicated hosted S22 verifier: exact staging site/project/role checks, explicit synthetic fixture ownership, session login, invitation lifecycle, permission revocation, cleanup and zero-fixture readback. The current Netlify plugin dispatches platform or customer-attention runners; neither certifies S22.
2. Add `TERRAQO_WORKSPACE_INVITATIONS_V1` to the reviewed staging variable/flag procedure before enabling it. It is not yet forwarded by `deploy-platform-staging.ps1`. Keep disabled elsewhere until migration and hosted acceptance are complete.
3. Refresh isolated staging migration ledger and backup/restore evidence before proposing the additive S22 migration. Prior S23/S24 staging evidence does not certify this combined candidate.
4. Complete reference Evaluator/granular permission semantics and invitation email integration. Current UI honestly creates a private shareable link; it does not claim email delivery. Actual mailbox receipt needs an authorized recipient test.
5. Run combined build and hosted navigation/security acceptance, then review the complete candidate diff and rollback before release.

No remote migration, deploy, customer mutation, payment or email was performed during reconciliation. Local acceptance is not production readiness.
