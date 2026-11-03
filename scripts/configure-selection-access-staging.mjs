import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
const require = createRequire(
  new URL("../node_modules/netlify-cli/package.json", import.meta.url),
);
const { getAPIToken } = await import(
  pathToFileURL(require.resolve("@netlify/dev-utils")).href
);
const { NetlifyAPI } = await import(
  pathToFileURL(require.resolve("@netlify/api")).href
);
const api = new NetlifyAPI(await getAPIToken());
const candidate = process.argv[2];
assert.match(candidate || "", /^[a-f0-9]{40}$/);
const expected = {
  PLATFORM_STAGING_CANDIDATE_SHA: candidate,
  PLATFORM_STAGING_CLOUD_PHASE: "s23",
  PLATFORM_STAGING_CLOUD_CONFIRM: "mghdpciewbsowjrjwmwk:s23:synthetic-only",
  TERRAQO_WORKSPACE_PUBLICATION_V1: "false",
  TERRAQO_SELECTION_ACCESS_REQUESTS_V1: "true",
};
const site = await api.getSite({
  site_id: "6b8c43fb-6083-450a-9b85-46a820fb6358",
});
assert.equal(site.name, "terraqo-platform-staging");
assert.equal(site.ssl_url, "https://terraqo-platform-staging.netlify.app");
let entries = await api.getEnvVars({
  accountId: site.account_slug,
  siteId: site.id,
});
for (const [key, value] of Object.entries(expected)) {
  const params = { accountId: site.account_slug, siteId: site.id, key };
  if (entries.some((e) => e.key === key))
    await api.setEnvVarValue({
      ...params,
      body: { context: "production", value },
    });
  else
    await api.createEnvVars({
      ...params,
      body: [
        {
          key,
          scopes: ["builds", "functions", "post_processing", "runtime"],
          values: [{ context: "production", value }],
        },
      ],
    });
}
entries = await api.getEnvVars({
  accountId: site.account_slug,
  siteId: site.id,
});
for (const [key, value] of Object.entries(expected))
  assert.equal(
    entries
      .find((e) => e.key === key)
      ?.values.find((v) => v.context === "production")?.value,
    value,
  );
console.log(
  "All five settings verified on staging through explicit siteId API calls.",
);
console.log(
  "Configuration only: trigger the staging build separately after verifying its candidate.",
);
