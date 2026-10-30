import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fail } from "@/lib/server/api";
import {
  BoundedRequestBodyError,
  readBoundedJson,
} from "@/lib/server/bounded-request-body";

const root = process.cwd();

async function source(path: string) {
  return readFile(join(root, path), "utf8");
}

async function main() {
  const response = fail("Dependencia temporalmente no disponible.", 503, {
    code: "EVIDENCE_PROVIDER_TIMEOUT",
    retryable: true,
  });
  const body = await response.json() as {
    error: { code: string; message: string; retryable: boolean; requestId: string };
  };
  const requestId = response.headers.get("x-request-id");

  assert.equal(response.status, 503);
  assert.equal(body.error.code, "EVIDENCE_PROVIDER_TIMEOUT");
  assert.equal(body.error.retryable, true);
  assert.match(body.error.requestId, /^[0-9a-f-]{36}$/i);
  assert.equal(body.error.requestId, requestId, "El cuerpo y la cabecera deben compartir la misma correlación.");

  const telemetry = await source("app/api/telemetry/client-error/route.ts");
  assert.match(telemetry, /messageFingerprint/);
  assert.match(telemetry, /stackFingerprint/);
  assert.match(telemetry, /readBoundedJson\(request, 8_192\)/);
  assert.doesNotMatch(telemetry, /content-length|request\.json\(\)/i);
  assert.doesNotMatch(telemetry, /parsed\.data\.(message|stack|digest)\b/, "El servidor no debe recibir ni registrar texto crudo del error.");

  const lyingBody = new Request("https://example.invalid/telemetry", {
    method: "POST",
    headers: { "content-length": "2" },
    body: JSON.stringify({ value: "x".repeat(8_192) }),
  });
  await assert.rejects(
    readBoundedJson(lyingBody, 8_192),
    (error: unknown) => error instanceof BoundedRequestBodyError && error.status === 413,
  );
  const chunkedBody = new Request("https://example.invalid/telemetry", {
    method: "POST",
    body: JSON.stringify({ source: "boundary" }),
  });
  assert.deepEqual(await readBoundedJson(chunkedBody, 8_192), { source: "boundary" });

  const boundary = await source("components/errors/client-feature-boundary.tsx");
  assert.match(boundary, /crypto\.subtle\.digest/);
  assert.doesNotMatch(boundary, /message:\s*error\.message|stack:\s*`/, "El reporte no debe serializar mensaje o stack crudos.");
  assert.match(boundary, /role="alert"/);
  assert.match(boundary, /tabIndex=\{-1\}/);
  assert.match(boundary, /min-h-11/);
  assert.match(boundary, /Reintentar/);
  assert.match(boundary, /Actualizar página/);

  const consoleSource = await source("components/admin/discovery-needs-console.tsx");
  assert.match(consoleSource, /message\.type === "error" \? "alert" : "status"/);
  assert.match(consoleSource, /motion-reduce:animate-none/);
  assert.match(consoleSource, /aria-live="polite"/);

  for (const panelPath of [
    "components/terraqo/conversation-requests-panel.tsx",
    "components/terraqo/collaboration-panel.tsx",
    "components/terraqo/closure-panel.tsx",
  ]) {
    const panel = await source(panelPath);
    assert.match(panel, /aria-busy=/, `${panelPath} debe exponer el estado de operación.`);
    assert.match(panel, /role="status"/, `${panelPath} debe anunciar la carga sin mover el foco.`);
    assert.match(panel, /catch \{/, `${panelPath} debe recuperar fallos de red sin dejar controles bloqueados.`);
    assert.match(panel, /finally \{/, `${panelPath} debe liberar el estado ocupado incluso si fetch falla.`);
  }

  for (const panelPath of [
    "components/terraqo/collaboration-panel.tsx",
    "components/terraqo/closure-panel.tsx",
  ]) {
    const panel = await source(panelPath);
    assert.match(
      panel,
      /role=\{message\.kind === "error" \? "alert" : "status"\}/,
      `${panelPath} debe distinguir errores urgentes de confirmaciones informativas.`,
    );
    assert.match(panel, /aria-atomic="true"/);
  }

  const requestsPanel = await source("components/terraqo/conversation-requests-panel.tsx");
  assert.match(requestsPanel, /conversation-request-reason-/);
  assert.match(requestsPanel, /\?\.focus\(\)/, "La validación del motivo debe devolver el foco al campo afectado.");
  assert.match(requestsPanel, /min-h-11/, "El campo táctil debe conservar al menos 44 px de alto.");

  const operational = await source("lib/server/terraqo-observability.ts");
  const properties = operational.match(/type OperationalProperties = \{([\s\S]*?)\n\};/)?.[1] ?? "";
  assert.ok(properties, "Debe existir una allowlist explícita para propiedades operativas.");
  assert.doesNotMatch(properties, /\b(text|message|email|name|location|output)\b/i);

  console.log("T19 recovery and observability contract: OK");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
