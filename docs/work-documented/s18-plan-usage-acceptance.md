# S18 loaded plan and consumption acceptance

Source candidate: `1db7bf2`. Release candidate: `350a085645e9ccdae50e65c94bca92dbd97c08bb`.

The preceding hosted run (`03b27e9b-0f0b-4612-8a18-2b3531105b98`) passed its technical assertions, but visual review found that plan screenshots preceded billing completion and that an unconfigured payment provider still loaded bank SDKs. It is not the final visual acceptance.

The new candidate loads bank scripts only when the server supplies a public key, distinguishes initial loading from retry, and displays the authenticated user's actual personal plan and usage. Storage uses the existing retained/reserved quota rules, including withdrawn versions; monthly AI and automation use the writer's UTC period. Counters preserve usage above the current plan limit. Reads do not create accounts, initialize buckets, refund storage, or contact the payment provider.

Validation completed locally:

- Full TypeScript check and changed UI/verifier ESLint passed.
- `test-billing-usage-summary.ts` passed: authenticated ownership, real entitlement resolver with mocked delegates, live/legacy semantics, retention, reservations, downgrades and zero writes.
- `verify-s18-staging.ts --self-test` rejected 25 unsafe configurations.
- Real PostgreSQL/Next/Auth.js acceptance passed at `output/playwright/s18-authenticated/terraqo-s18-authenticated-kGpu62`: PDF/DOCX replacement, withdrawal, idempotency, quota/history, access isolation/revocation and read-only billing. Owned local services stopped and cluster removed without disabling guards.
- Local mobile `plan-320.png` inspected after loaded billing; actual counters and billing section visible, no bank SDK error, no horizontal overflow. The fixed mobile navigation is captured at viewport height in a full-page image; this is not physical-device verification.

Hosted gate now waits for both the consumption region and the loaded billing heading, checks the three retained units against the isolated document owner, and rejects even attempted bank SDK reads when configuration is absent. Hosted acceptance and screenshot review for this candidate remain pending; production is unchanged.
