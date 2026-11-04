# S22 workspace members

Mode: Operate. Authority: page 23 of `02-ui-ux-pantallas.pdf`, inspected 4 November 2026. Extend Terraqo's Satoshi typography and dark evidence surfaces; preserve the enclosing administrative shell.

## Direction contract

THESIS: make existing access and pending invitations readable together; keep invitation creation alongside the list rather than in a modal.

OWN-WORLD: navy surface, fine blue-gray separators, restrained blue primary action, Satoshi type, 44px minimum controls. Status includes text and does not rely on color.

STORY: find a person, distinguish membership from invitation, create or revoke a private invitation with immediate feedback.

FIRST VIEWPORT: heading and workspace context above a two-column layout. Left: member search and rows, then invitation history. Right: email, minimal role, create action and delivery status. Mobile places the form first and stacks row actions.

FORM: reference-pinned list plus inline panel. No concept tournament or modal is needed.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Scope and factual constraints

No invented Evaluator role, granular permissions, email delivery, document access or billing panels. Existing roles are displayed; role mutation is a separate unfinished S22 gate. Links are manually shared, expire per service rules and use fragments so credentials are not request URLs. Recipient acceptance uses the logged-in verified identity. This is an extension, so no global DESIGN.md replacement or shipping raster is introduced.

## Finish review

Member authority extension: `Gestionar acceso` expands an inline role/status form with explicit confirm/cancel; protected memberships remain read-only. Desktop/mobile captures checked after integration. At 390px the action occupies its own row to preserve readable identity, and selectors use the available width. Shared policy determines capabilities; presentation never authorizes mutations. No document/email/permission claims were added.

Inspected Chromium captures at 1440 and 390px from the actual components with synthetic fixtures. Composition and controls follow the pinned reference; mobile search was widened and the confirmation capture passed. Mechanical detector returned no findings. Verdict: component presentation accepted for local integration, not production certification. No global design-system changes or raster assets shipped. Full administrative shell/session and reference role controls remain acceptance gaps tracked in the S22 handoff.
