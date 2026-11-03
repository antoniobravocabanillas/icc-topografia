# Public archive visual correction — 2026-11-02

User rejected the deployed archive/detail against 02-ui-ux-pantallas.pdf and explicitly requested removal of modal-driven navigation. This correction takes precedence over the previous modal fixture acceptance.

## Visual source actually inspected

- PDF page 11, S10 Archivo y calendario: broad archive surface, image-led bordered rows, status/skills, direct Abrir action, list/calendar controls.
- PDF page 12, S11 Registro y trazabilidad: title and metadata above a large primary image/thumbnail gallery, right-hand summary and Evidencias/Respaldo/Historial tabs.
- Rendered with Poppler, inspected at output/ux-reference-11.png and output/ux-reference-12.png. Screens are conceptual; existing data/privacy rules remain authoritative. User explicitly overrides the calendar overlay with in-page controls.

## Implemented locally

- Replaced filter dialog with in-page controls. Calendar day click applies a day immediately; filter edits and date ranges remain explicit. No opening/closing modal cycle.
- Context navigation CV vivo/Evidencias, wider content area, bordered archive rows with larger thumbnails, real skill labels and direct Abrir affordance.
- Detail uses main image and selectable thumbnails without a modal, summary beside images on desktop, stacked mobile layout. Tabs expose public evidence, actual validations and creation metadata; absent information is labelled rather than invented.
- Preserved public API audience, search/pagination, URL filters, old links, return scroll restoration, authorized media URLs, download links and public-field selection. No API/database permission broadening.

## Validation and limits

- TypeScript and component ESLint PASS; whitespace check PASS; Impeccable detector returned no findings.
- Existing browser regression updated and PASS at 1280/375: search beyond initial page, pagination, date/type/project filters, calendar, detail/return/back, legacy links, no dialog and no overflow.
- Added gallery selection, tab content and no-modal assertions. Synthetic media served only by Playwright route fixtures.
- Batched list/filter and detail screenshots inspected. Screenshots are a local fixture without the global production header; no claim of production visual verification.
- No deployment in this continuation. Previous S24 staging acceptance remains separate. Must review deployed candidate with representative public images before public release.
- This closes the first implementation correction for S10/S11, not a visual audit of all screens. S09 CV and remaining PDF screens still need source-to-implementation comparison; do not count the entire update visually complete.

## Tooling note

An attempted PyMuPDF installation used the default Python environment; pip reported a protobuf compatibility conflict with Streamlit and PyMuPDF did not run. PDF rendering used existing Poppler instead. Do not use that attempted installation as a project dependency or alter the user's unrelated Python packages without a separate verified repair plan.
