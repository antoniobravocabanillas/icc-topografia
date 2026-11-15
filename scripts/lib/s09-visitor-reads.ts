import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import type { BrowserContext } from "playwright";
import type { Read } from "./s06-sharing-reads";
import type { SharingRecord } from "./s06-sharing-fixtures";

export async function anonymousSession(ctx: BrowserContext) {
  const response = await ctx.request.get("/api/auth/session", { maxRedirects: 0 });
  assert.equal(response.status(), 200);
  const session = await response.json();
  assert.ok(session === null || (session && typeof session === "object" && Object.keys(session).length === 0));
  assert.ok(!(await ctx.cookies()).some(cookie => /(?:authjs|next-auth)\.session-token/i.test(cookie.name)));
}

export function excludes(body: string, hidden: string[]) {
  for (const value of hidden) assert.ok(value && !body.includes(value), "Unauthorized fixture field in response");
}

export async function exactImage(read: Read, path: string, bytes: Buffer) {
  const response = await read(path);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /\bno-store\b/i);
  assert.equal(response.headers.get("content-type"), "image/webp");
  assert.ok(bytes.equals(Buffer.from(await response.arrayBuffer())), "Media bytes did not match the manifest");
}

export async function checkPdf(bytes: Buffer, name: string) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  assert.ok(doc.getPageCount() > 0);
  assert.equal(doc.getAuthor(), name);
  assert.equal(doc.getTitle(), name + " | Curriculum vitae");
}

export async function publicSurface(read: Read, username: string, profileId: string,
  visible: SharingRecord[], denied: SharingRecord[], hidden: string[]) {
  const cv = "/cv/" + username, archive = cv + "/evidencias";
  const media = "/api/public/cv/" + username + "/worklogs/";
  const forbidden = [...hidden, ...denied.flatMap(row => [row.title, row.summary, row.id, ...(row.photo ? [row.photo.id] : [])])];
  for (const path of [cv, archive]) {
    const response = await read(path);
    assert.equal(response.status, 200);
    excludes(await response.text(), forbidden);
  }
  const response = await read("/api/v1/profiles/" + profileId + "/evidence?audience=public&period=all&limit=20");
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(data.audience, "PUBLIC");
  assert.equal(data.scopeCounts.records, visible.length);
  assert.deepEqual(data.items.map((item: { id: string }) => item.id).sort(), visible.map(row => row.id).sort());
  excludes(JSON.stringify(data), forbidden);
  for (const row of visible) {
    const res = await read("/api/v1/evidence/" + row.id);
    assert.equal(res.status, 200);
    const detail = (await res.json()).data;
    assert.equal(detail.audience, "PUBLIC");
    assert.equal(detail.item.id, row.id);
    assert.equal(detail.item.summary, row.summary);
    assert.deepEqual(detail.item.capabilities, { view: true, edit: false, viewPreciseLocation: false });
    assert.deepEqual(Object.keys(detail.item.location), ["label"]);
    excludes(JSON.stringify(detail), forbidden);
    if (row.photo) await exactImage(read, media + row.photo.id, row.photo.bytes);
  }
  for (const row of denied) {
    for (const path of [archive + "/" + row.id, "/api/v1/evidence/" + row.id, ...(row.photo ? [media + row.photo.id] : [])]) {
      const res = await read(path);
      assert.equal(res.status, 404);
      excludes(await res.text(), [row.title, row.summary]);
    }
  }
}
