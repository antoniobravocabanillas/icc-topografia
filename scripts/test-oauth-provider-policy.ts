import assert from "node:assert/strict";
import { resolveOAuthProviderAvailability } from "../lib/server/oauth-provider-policy";
import { sendTransactionalEmail } from "../lib/server/transactional-email";

const configured = {
  AUTH_GOOGLE_ID: "google-id",
  AUTH_GOOGLE_SECRET: "google-secret",
  AUTH_APPLE_ID: "apple-id",
  AUTH_APPLE_SECRET: "apple-secret",
  AUTH_MICROSOFT_ENTRA_ID_ID: "microsoft-id",
  AUTH_MICROSOFT_ENTRA_ID_SECRET: "microsoft-secret",
};

assert.deepEqual(resolveOAuthProviderAvailability(configured), {
  google: true,
  apple: true,
  microsoft: true,
});
assert.deepEqual(
  resolveOAuthProviderAvailability({
    ...configured,
    TERRAQO_OAUTH_ENABLED: "false",
  }),
  { google: false, apple: false, microsoft: false },
  "El kill switch debe ignorar credenciales heredadas o compartidas.",
);
assert.deepEqual(
  resolveOAuthProviderAvailability({ TERRAQO_OAUTH_ENABLED: "true" }),
  { google: false, apple: false, microsoft: false },
  "Un proveedor sin ambas credenciales debe permanecer deshabilitado.",
);

async function verifyEmailKillSwitch() {
  const previous = {
    enabled: process.env.TERRAQO_TRANSACTIONAL_EMAIL_ENABLED,
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.TERRAQO_EMAIL_FROM,
  };
  process.env.TERRAQO_TRANSACTIONAL_EMAIL_ENABLED = "false";
  process.env.RESEND_API_KEY = "inherited-provider-secret-must-not-be-used";
  process.env.TERRAQO_EMAIL_FROM = "Terraqo <staging@example.invalid>";
  try {
    assert.deepEqual(
      await sendTransactionalEmail({
        to: "synthetic@example.invalid",
        subject: "staging isolation",
        html: "<p>not sent</p>",
        text: "not sent",
      }),
      { delivered: false, reason: "disabled" },
    );
  } finally {
    if (previous.enabled === undefined) delete process.env.TERRAQO_TRANSACTIONAL_EMAIL_ENABLED;
    else process.env.TERRAQO_TRANSACTIONAL_EMAIL_ENABLED = previous.enabled;
    if (previous.apiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previous.apiKey;
    if (previous.from === undefined) delete process.env.TERRAQO_EMAIL_FROM;
    else process.env.TERRAQO_EMAIL_FROM = previous.from;
  }
}

verifyEmailKillSwitch()
  .then(() => console.log("External provider policy: OK (OAuth and transactional email kill switches override inherited credentials)."))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "External provider policy failed.");
    process.exitCode = 1;
  });
