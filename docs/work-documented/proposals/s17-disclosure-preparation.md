# S17 disclosure preparation — local, not published

## Current continuation — supersedes the implementation-pending paragraphs below

The separate persistence, transaction service, APIs and in-page dual-consent UI now exist locally with proposed migration50. The original snapshot helper is now called by that service; it remains neither a credential nor an authorization decision by itself. Current validation status and staging prerequisites are tracked in [s17-disclosure-release-gate.md](s17-disclosure-release-gate.md). A complete hosted sharing gate is still required; no migration50 authorization or application is implied by this implementation.

## 20 November continuation

The local authenticated PostgreSQL/Next/Chromium journey passed with six provenance guards enabled: run `fecc2cf7-268f-4de6-a85a-5ccd325f7622`, based on `1dcfc13514a0340c0610ee84f2b2e41905d6c17a` plus the viewport-capture changes. Correction, exact resubmission, historical scope, private certificate, cancellation/replay and anonymous/tenant isolation all passed. Cleanup used independent readback; the local server and disposable database were stopped by the harness. No hosted mutation/deployment was performed in this continuation.

## Viewport evidence

Added `captureViewportEvidence` to the existing journey for the company reference and professional private certificate states at 1440, 375 and 320 pixels. Each captures top/middle/bottom in native viewport dimensions, leaves all overlays visible, records geometry without DOM text, and restores scroll in a finally block. The browser test verifies fixed/sticky geometry, PNG dimensions, no text in geometry, and restoration after successful and failed writes.

Evidence: `output/playwright/s16/fecc2cf7-268f-4de6-a85a-5ccd325f7622/*-viewport-*.png` and corresponding geometry JSON. Inspected company desktop middle/bottom, professional mobile top/bottom. The company header remains y=0 and mobile bottom navigation remains at the viewport edge. Content at the bottom can be reached without being hidden under navigation. No horizontal overflow at the three tested widths. The bar across the prior full-document capture is not reproduced in these local viewport views. Do not alter product CSS to compensate for stitching. The hosted Netlify badge is absent locally: its hosted placement remains unverified. This is not a global PDF or accessibility approval.

## Disclosure boundary implemented

`lib/terraqo/certificate-disclosure-snapshot.ts` prepares an immutable canonical snapshot and SHA256 digest of explicitly selected certificate fields, exact certificate/closure/proposal identity, and audience. Public and invited inputs are disjoint; invited proposals bind resolved recipient user ID and future expiry. Names are opt-in fields, not implicit metadata. Unbound legacy certificates and inconsistent revision numbers fail closed. Equivalent field ordering and equivalent timestamp offsets canonicalize identically. Changed selected content, proposal, audience, recipient or expiry changes the digest. Snapshot arrays and nested objects are frozen so prepared content cannot drift after hashing.

This helper is NOT an access decision and is not wired into an API. It accepts an internal database-loaded certificate and binding, never a client-asserted certificate. The digest is NOT a bearer credential. It does not alter the certificate, create a grant, publish data, send mail or authorize files.

## Next executable phase

Implement persistence and transactional service for separately typed certificate disclosures. Reuse established actor/module/tenant checks; lock the collaboration and disclosure, load exact accepted source from the database and prepare the snapshot server-side. Store both parties' explicit approval of the exact digest, idempotency fingerprint and revocation history. Deny reads until both approvals exist; recheck current authority, recipient verified identity, expiry and revocation. A certificate grant never authorizes underlying reference attachments. No unconditional names in DTO/render/export.

Prepare schema changes and validate on disposable local PostgreSQL before requesting authorization for any NEW hosted migration. Migration49 authorization does not cover another schema change. Then implement in-page preview/selection/consent UI and authenticated public/invited/denied E2E matrix. S17 remains open; S18 not promoted. Existing staging runtime `ab8b64f` and diagnostic safety setup remain unchanged.
