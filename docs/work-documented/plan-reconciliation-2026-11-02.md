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
| S22 | Existing company/member administration, distinct from professional identity. | Needs explicit screen-level reconciliation; do not infer full acceptance from generic team UI. |
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
