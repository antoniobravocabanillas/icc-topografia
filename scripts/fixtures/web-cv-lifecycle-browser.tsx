import React from "react";
import { createRoot } from "react-dom/client";
import { CvPublicationSurface } from "../../components/portal/cv-publication-screen";
import { readWebCvPage, WebCvRequestError, type WebCvCommand } from "../../lib/terraqo/cv-publication-client";
const proof = { owner: "synthetic-owner", failSession: false, uncertain: true, writes: [] as WebCvCommand[], checks: 0, operations: 0 };
Object.assign(window, { cvProof: proof });
const initial = "2026-10-07T12:00:00.000Z", next = "2026-10-07T12:00:00.001Z";
let receipt: WebCvCommand | null = null;
function page() { return readWebCvPage({ schemaVersion: 1, workspaceSlug: "icc-topografia", current: {
  version: receipt ? next : initial, username: "synthetic-owner", published: !!receipt, url: receipt ? "https://terraqoglobal.com/cv/synthetic-owner" : null,
}, receipt: receipt ? { operationKey: receipt.operationKey, action: receipt.action, published: true, username: "synthetic-owner", version: next, confirmedAt: next } : null }, "icc-topografia", receipt?.operationKey); }
const port = { load: async () => page(), reconcile: async () => { proof.checks++; return page(); }, submit: async (command: WebCvCommand) => {
  proof.writes.push(command); if (proof.uncertain) throw new WebCvRequestError("uncertain");
  if (!receipt) { receipt = command; proof.operations++; } return page();
} };
const createPort = () => port;
const readOwner = async () => { if (proof.failSession) throw Error(); return proof.owner; };
createRoot(document.getElementById("root")!).render(<React.StrictMode><CvPublicationSurface ownerId="synthetic-owner" workspaceSlug="icc-topografia" createPort={createPort} readOwner={readOwner} /></React.StrictMode>);
