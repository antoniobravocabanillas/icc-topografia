# S19 mobile archive — acceptance preparation

Status: reference reviewed while S18 hosted acceptance is running. No S19 completion or new hosted test claim.

Reference: `C:/Users/Binv/Downloads/02-ui-ux-pantallas.pdf`, physical page20 (visual) and S19 textual specification. Render inspected at `output/pdf-reference/s19.png`.

The user subsequently requested navigation without modals and unnecessary open/close clicks. Preserve the existing inline calendar/filter treatment rather than restoring the reference's modal bottom sheet. The reference's essential outcomes still apply: one-column records, recognizable bounded image, immediate title/status, full-width mobile search, usable controls below it, full-route detail, and stable return to filters/list/position.

Existing evidence to reuse, not mislabel as a new run: `scripts/lib/s10-archive-browser.ts` covers1440/375/320 widths, pagination, focused scroll return within4px, actual full detail routes, combined filters/date range with explicit apply, back navigation preserving state, empty/reset and confidential canary exclusion. `archiveReads` covers authorized lists, calendar counts, pagination and hidden-record denial. These assertions do not certify final visual fidelity, touch interaction, short landscape screens or a physical device.

Source gap identified before implementation: `components/terraqo/public-cv-activity-explorer.tsx` archive card currently remains horizontal on small widths, gives its image only96px square and hides the explicit detail CTA below `sm` (around lines964–1021). The S19 reference instead stacks a recognizable wide image above title/state and a visible detail action. Existing no-overflow checks alone would miss this difference. Verify the actual rendering, then adjust the bounded mobile card without changing desktop policy, authorization or route/return behavior.

Next executable block after S18 acceptance:

1. Inspect current archive/card/calendar components against the rendered reference; retain the user's inline-navigation choice.
2. Exercise viewport375 and320 plus short landscape with touch emulation: full-width search, control hit targets, bounded media, title/state and reachable Apply/clear actions without overflow or overlay obstruction.
3. Verify full-route detail and browser/UI return after pagination and filters, including gallery focus/navigation and unauthorized media exclusion.
4. Use existing isolated staging fixture infrastructure, never public real-user mutations. Compare screenshots and retain a receipt for the exact served candidate. Label physical-device validation separately if unavailable.
5. Close only observed criteria, then proceed to S20 recovery (offline/session/conflict preservation) and S21 proposal reference reconciliation. Production remains behind the consolidated release gate.
