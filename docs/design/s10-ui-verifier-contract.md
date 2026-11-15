# S10 archive UI contract for gate

Scope: `components/terraqo/public-cv-activity-explorer.tsx`, browser regression and isolated archive harness configuration. Reference: `output/s10/ref-11.png` (PDF page 11) and S10 rules in `output/s06-ux.txt`. Preserve the existing in-page calendar/filter design; no modal, backend permission changes, commit or deployment.

## Read and navigation contracts

- List and activity reads use `audience=public`, `timezone=America/Lima`. Search/type/state/project/date filters combine on the server. List requests use `limit=20`; no client-side full-archive filtering.
- Filter application creates a fresh history entry and restarts with no cursor. Draft calendar dates leave URL and list reads unchanged until explicit application. Reverse endpoints normalize to an ascending range; removing its chip clears both dates.
- Only a returned next cursor exposes “Cargar más bitácoras”. Detail links carry the canonical filter query. Canonical sharing remains independent of archive return state.
- Return through “Volver a las bitácoras”, “Evidencias”, or browser Back restores the visited cursor depth, selected record/focus, calendar visibility/month, filter-panel visibility and scroll. Restoration is scoped to profile, canonical query and history entry. It revalidates visited pages against the public API rather than caching evidence or fetching unvisited pages. No ten-page truncation.
- Selection is observable on `#record-{id}` with `aria-current=true`; focus uses `preventScroll`. A stale asynchronous restoration cannot scroll a newer filter entry.
- Empty combined results retain filters and offer “Ver todas las bitácoras”. CV navigation remains `/cv/{username}`. Historical fragment and synthetic-record links remain supported.

## Local verification

Run the isolated server from repository root:

```powershell
npx next dev scripts/fixtures/public-archive --port 3190
node scripts/test-public-archive-browser.mjs
npx eslint components/terraqo/public-cv-activity-explorer.tsx scripts/test-public-archive-browser.mjs
npx tsx scripts/test-public-archive-navigation.ts
```

The browser regression uses synthetic public API/media responses and actual bundled Satoshi fonts, without database access. It covers 1280/375/320 px, 12 visited pages at desktop and two at mobile, all three return paths with exact query, selection/focus and scroll tolerance under 4 px, combined-filter cursor reset, empty recovery, explicit/reversed calendar selection, gallery/tabs, historical links and horizontal overflow. Images and screenshots are fixtures, not production evidence. Screenshots: `output/playwright/archive-{default,list,filters,detail,empty}-{width}.png`.

Fixture startup fixes: TypeScript base and Tailwind config resolve three levels up to repository root, rather than two. The browser serves fixture fonts/media; no production service is contacted by these mocked archive reads.

## Gate integration and boundaries

Local browser regression, scoped ESLint, navigation contract and Impeccable detector passed. Visual inspection found clipped native date values at 320 px; mobile filters now use one column, with a browser assertion requiring date inputs wider than 240 px. The global typecheck initially reported unrelated/in-progress failures: `app/(commerce)/portal/bitacora/page.tsx:131` expects a second argument; `scripts/run-workspace-administration-staging.ts:90` imported the then-absent `./verify-s10-archive`. Gate owner must rerun typecheck after its concurrent integration is complete.

Hosted acceptance remains separate: seed authorized representative public records, include a record after the first cursor, apply all filter categories, open that later record and verify all three return paths. Capture monthly activity HTTP/counts as well as rendered dates. Confirm revoked or unavailable records do not regain access during page replay. Local fixture success does not certify hosted API authorization or production deployment.
