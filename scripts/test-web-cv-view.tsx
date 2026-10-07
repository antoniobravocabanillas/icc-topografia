import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CvPublicationView, type CvPublicationViewProps } from "../components/portal/cv-publication-view";
import { freezeWebCvCommand, readWebCvPage } from "../lib/terraqo/cv-publication-client";
import type { WebCvSnapshot } from "../lib/terraqo/cv-publication-controller";

const version = "2026-10-07T12:00:00.000Z", next = "2026-10-07T12:00:00.001Z";
const command = freezeWebCvCommand({ action: "PUBLISH", version, operationKey: "a".repeat(32), consent: true });
const page = (published: boolean, historical = false) => readWebCvPage({ schemaVersion: 1, workspaceSlug: "icc-topografia",
  current: { version: historical ? next : version, published, username: "synthetic-owner", url: published ? "https://terraqoglobal.com/cv/synthetic-owner" : null },
  receipt: historical ? { operationKey: command.operationKey, action: "PUBLISH", version: next, confirmedAt: next, published: true, username: "synthetic-owner" } : null,
}, "icc-topografia", historical ? command.operationKey : undefined);
const noop = () => { throw new Error("Rendering must not call an action."); };
function render(patch: Partial<WebCvSnapshot>, consent = false) {
  const state: WebCvSnapshot = { phase: "idle", page: page(false), review: null, pending: null, failure: null, ...patch };
  const props: CvPublicationViewProps = { state, consent, onConsent: noop, onPrepare: noop, onCancel: noop,
    onConfirm: noop, onCheck: noop, onResend: noop, onReload: noop };
  return renderToStaticMarkup(<CvPublicationView {...props} />);
}
const withdrawn = render({});
assert.match(withdrawn, /CV sin publicar/);
assert.match(withdrawn, /type="checkbox"/);
assert.doesNotMatch(withdrawn, /checked=""/);
assert.match(withdrawn, /disabled=""[^>]*>Revisar publicación/);
assert.doesNotMatch(render({}, true), /disabled=""[^>]*>Revisar publicación/);
const review = render({ phase: "review", review: command });
assert.match(review, /Confirmar publicación/); assert.match(review, />Cancelar</);
assert.doesNotMatch(review, /type="checkbox"/);
const uncertain = render({ phase: "uncertain", pending: command, failure: "uncertain" });
assert.match(uncertain, /Publicación por comprobar/); assert.match(uncertain, /Consultar recibo/);
assert.match(uncertain, /Reenviar misma solicitud/); assert.match(uncertain, /resultado sigue pendiente/);
assert.doesNotMatch(uncertain, /CV sin publicar|CV publicado|Ver CV público|type="checkbox"/);
assert.match(render({ phase: "sending", pending: command }), /disabled=""[^>]*>Consultar recibo/);
const historic = render({ page: page(false, true) });
assert.match(historic, /CV sin publicar/); assert.match(historic, /operación anterior/);
assert.doesNotMatch(historic, /Ver CV público/);
const published = render({ page: page(true) });
assert.match(published, /rel="noopener noreferrer"/); assert.match(published, /Retirar publicación/);
assert.doesNotMatch(published, /type="checkbox"/);
assert.match(render({ phase: "invalid", page: null, failure: "credentials" }), /Vuelve a iniciar sesión/);
assert.doesNotMatch(render({ phase: "invalid", page: null, failure: "credentials" }), /synthetic-owner/);
assert.match(render({ phase: "idle", page: null, failure: "conflict" }), /El perfil cambió/);
console.log("PASS synthetic web CV markup: explicit consent/review, no render writes, pending state never claims visibility, historical receipt distinct, private context hidden on invalidation. Browser interaction and visual review remain required.");
