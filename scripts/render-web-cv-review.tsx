import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdirSync, writeFileSync } from "node:fs";
import { CvPublicationView } from "../components/portal/cv-publication-view";
import type { WebCvSnapshot } from "../lib/terraqo/cv-publication-controller";
const current = { version: "2026-10-07T12:00:00.000Z", published: false, username: "perfil-demostracion", url: null };
const command = { action: "PUBLISH" as const, consent: true as const, version: current.version, operationKey: "a".repeat(32) };
const base: WebCvSnapshot = { phase: "idle", page: { schemaVersion: 1, workspaceSlug: "icc-topografia", current, receipt: null }, pending: null, review: null, failure: null };
const variants: Record<string, WebCvSnapshot> = {
  withdrawn: base,
  review: { ...base, phase: "review", review: command },
  uncertain: { ...base, phase: "uncertain", pending: command, failure: "uncertain" },
  historical: { ...base, page: { ...base.page!, current: { ...current, version: "2026-10-07T12:00:00.002Z" }, receipt: {
    ...command, published: true, username: current.username, version: "2026-10-07T12:00:00.001Z", confirmedAt: "2026-10-07T12:00:00.001Z",
  } } },
};
mkdirSync("output/playwright/web-cv-review", { recursive: true });
for (const [name, state] of Object.entries(variants)) {
  const markup = renderToStaticMarkup(<CvPublicationView state={state} consent={false} onConsent={() => {}} onPrepare={() => {}}
    onCancel={() => {}} onConfirm={() => {}} onCheck={() => {}} onResend={() => {}} onReload={() => {}} />);
  writeFileSync(`output/playwright/web-cv-review/${name}.html`, `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/output/playwright/web-cv-review/styles.css"><style>body{--font-sans:Satoshi;--font-display:Satoshi;background:#f4f7f7;padding:24px}main{max-width:1060px;margin:auto}@media(max-width:500px){body{padding:16px}}</style><title>Revisión sintética de CV</title></head><body><main>${markup}</main></body></html>`);
}
console.log("Four synthetic view states rendered from real component; no API or session.");
