# Plan reconciliation — 2026-11-02

Sources: 01-plan-tecnico.pdf and 02-ui-ux-pantallas.pdf (15 Oct 2026), read from the supplied Downloads files. Text extraction is retained under ignored output/*-audit.txt. This report supersedes historical claims that every UI requirement was complete merely because B1–B5 flags were published.

## Evidence and gaps

| Plan | Implementation and verification | Current disposition |
|---|---|---|
| T01 / B0 | Repository ownership audit and ADRs exist. | Preserve existing identity/workspace/payment infrastructure. |
| T02–T05 / S09–S11, S19 | Existing policy, cursor, FTS and calendar APIs. Public UI previously filtered loaded records and embedded detail beside the list. | Corrected in this phase; test results below. |
| T06–T09 / S03–S05 | Secure image normalization, draft recovery, immutable revisions, idempotency, work-case organizer. | Existing implementation; media/revision/create-operation contracts rerun successfully. |
| T10–T12 / S06–S08, S18, S23 | Field-scoped collections, revocable grants, public projection, scoped endorsements. | Contract suite PASS; enterprise material remains deliberately blocked pending S24. |
| T13–T17 / S12–S17, S21 | Need discovery, private dossier, contextual messaging, versioned collaboration and closure. | All five contract suites PASS. Prior real staging evidence is in b4-closure.md; not represented as a new live customer test. |
| T18–T20 / S20 | Evidence analysis, recovery, entitlements. | Three contract suites PASS. Runtime deployment and live provider evidence remain separate from unit contracts. |
| S01 | Verification recovery published in prior phase; authorized email delivered. | Do not bypass verification or resend without user intent. |
| S22 | Existing company/member administration, distinct from professional identity. | CONFIRMED GAP: existing /admin/equipo is staff/operational access; no complete workspace invitation lifecycle or last-administrator guard was found. Operational team invitations are a separate feature. |
| S24 | scoped-sharing.ts explicitly rejects enterprise material because authorization is absent. | CONFIRMED IMPLEMENTATION GAP. Must implement version/media-specific request, review, revocation and exact preview before lifting the deny rule. |

## Public archive correction

- Dedicated list and canonical detail, rather than a long split column.
- Search, type, status, project and date range sent to authorized server queries. First page 20; pagination uses server cursor; filtered counts use identical permissions.
- Project options derive from the authorized full scope, not the first loaded page.
- Public-only policy explicitly prevents an authenticated owner/member from expanding the public page to private evidence.
- Monthly counts, direct month/year selection, day selection and explicit date-range apply in a native modal with focus containment/Escape.
- Filters travel in the URL; page count, focus and scroll are restored per history entry. Historical fragment/query links resolve canonical records outside the first page; synthetic historical entries retain compatibility without inflating the bitacora count.
- Public CV route loading remains separate from the archive's initial 21-row server window; homepage counters were not changed.
- Tests: browser fixture at 1280 and 375 px (server-response fixtures, no database mutation), two pages, filtered off-page result, calendar, canonical detail, browser back, explicit return and legacy links. Screenshots inspected. URL/policy regression verifies logged-in owner public-only behavior.
- Existing regression suites: permalink, cursor/timezone, evidence policy, media security, revision hash, create idempotency, scoped sharing, discovery, contextual messaging, collaboration, closure, analysis, recovery and entitlements PASS.

## Remaining acceptance boundaries

- Human screen-reader/device testing is not certified by browser automation.
- Three historical missing blobs require originals/external copies; references are not recoverable file bytes.
- S24 is real pending development, not a deployment flag to turn on.
- No payroll/payment marketplace, RENIEC, legal biometric signature or automatic hiring: the supplied technical plan explicitly excludes these.
- Do not label the complete PDF 100% until the outstanding screen-level reconciliation and S24 are closed with evidence.

## Reproducing the browser gate
Copy scripts/fixtures/public-archive into output/archive-ui-fixture, run `node node_modules/next/dist/bin/next dev output/archive-ui-fixture -p 3190`, then `node scripts/test-public-archive-browser.mjs`. The fixture imports production components/styles. API responses are intercepted with synthetic public data; no real users, mail, provider calls or database writes. The fixture is not an application route and is never deployed.

## Published archive gate

- Application commit: `c623ec8e70d27c04babc3cb0ac6c594b00bc4cfc`.
- Production deploy: `6ae7ec06e99b195a657aa8be`; released and unlocked after smoke.
- 20/20 read-only HTTP/auth boundary checks PASS.
- Real public CV browser at 390 px: list, search response rendered, calendar, canonical detail, explicit return, no horizontal overflow and no page errors PASS. Screenshot inspected at `output/public-archive-production-mobile.png`.
- No new database migrations, real customer changes, mail or financial operations performed in this phase.
- S24 foundation is local only; see `s24-preparation-2026-11-02.md`. S22 and public WorkCase coverage remain separate acceptance work.

S24 continuation: authenticated bounded API, private media preview, company review UI and professional request/status UI are implemented locally and fixture-tested. Publication/derived-consumer integration and PostgreSQL/staging acceptance remain open. Runtime flag remains off. See s24-preparation-2026-11-02.md.

Latest S24 continuation: approval-gated immutable publication and public/discovery/dossier/analysis readers integrated locally. Committed additive migration and concurrent decision/revocation flow passed disposable PostgreSQL 18 with synthetic data. Hosted staging E2E and release gate remain pending; no production rollout in this phase.
