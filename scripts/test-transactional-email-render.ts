import assert from "node:assert/strict";
import { renderProfileCompletionEmail, renderVerificationCodeEmail, renderVerificationLinkEmail } from "../emails/terraqo-transactional";

async function main() {
  const recipientName = "Ana <script>alert(1)</script> & Díaz";
  const verificationUrl = "https://terraqo-platform-staging.netlify.app/verificar?token=synthetic-token&flow=registration";
  const link = await renderVerificationLinkEmail({ recipientName, verificationUrl });
  assert.ok(link.html.includes(verificationUrl.replaceAll("&", "&amp;")));
  assert.ok(link.text.includes(verificationUrl), "Plain text must preserve the complete verification link.");
  const code = await renderVerificationCodeEmail({ recipientName, code: "094061" });
  assert.ok(code.html.includes("094061") && code.text.includes("094061"), "Codes must preserve leading zeros.");
  const pending = await renderProfileCompletionEmail({ recipientName, profileUrl: verificationUrl, emailVerified: false, hasUsername: false });
  const verified = await renderProfileCompletionEmail({ recipientName, profileUrl: verificationUrl, emailVerified: true, hasUsername: true, customMessage: "<img src=x onerror=alert(1)>" });
  assert.match(pending.text, /Verifica tu correo/);
  assert.match(verified.text, /Tu correo ya está verificado/);
  assert.match(verified.text, /Completar mi perfil/);
  assert.doesNotMatch(verified.html, /<img src=x/);
  for (const message of [link, code, pending, verified]) {
    assert.match(message.html, /<html[^>]*lang="es"/);
    assert.match(message.html, /&lt;script&gt;/);
    assert.doesNotMatch(message.html, /<script\b/i);
    assert.ok(message.text.includes("Díaz") && message.text.includes("Seguridad Terraqo"));
    assert.doesNotMatch(message.text, /<html\b|<table\b|<body\b/i);
  }
  console.log("Transactional email render PASS: HTML escaping, intact plain-text links, leading-zero codes and correct verified state. No messages sent.");
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
