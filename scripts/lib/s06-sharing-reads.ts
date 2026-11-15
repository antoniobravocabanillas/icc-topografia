import assert from "node:assert/strict";
import type { BrowserContext } from "playwright";
import type { SharingRecord } from "./s06-sharing-fixtures";

export type Read = (path: string) => Promise<Response>;
export function asSession(ctx: BrowserContext): Read {
  return async path => {
    const res = await ctx.request.get(path, { maxRedirects: 0, timeout: 45_000 });
    return new Response(new Uint8Array(await res.body()), { status: res.status(), headers: res.headers() });
  };
}

// Native fetch never consumes Set-Cookie. Every call uses exactly the JWT captured before withdrawal.
export async function fixedSession(ctx: BrowserContext, origin: string): Promise<Read> {
  const cookies = (await ctx.cookies(origin)).filter(c => /^(__Secure-)?authjs\.session-token(\.\d+)?$/.test(c.name));
  assert.ok(cookies.length && cookies.every(c => c.value && c.httpOnly));
  const cookie = cookies.map(c => c.name + "=" + c.value).join("; ");
  return path => {
    const url = new URL(path, origin);
    assert.equal(url.origin, origin);
    return fetch(url, { headers: { Cookie: cookie }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(45_000) });
  };
}

export async function checkSelection(read: Read, root: string, records: SharingRecord[], includePhotos = true) {
  const invited = root.startsWith("/api/v1/shared-selections/");
  const res = await read(root);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("cache-control") ?? "", /no-store/);
  const { data } = await res.json();
  if (invited) assert.deepEqual(data.capabilities, { downloadMedia: false });
  const expected = records.map(r => ({ worklogId: r.id, summary: r.summary, media: includePhotos && r.photo ?
    [{ id: r.photo.id, href: root + "/media/" + r.photo.id, ...(invited ? { downloadHref: null } : {}) }] : [] }));
  // The composer orders by revision recency. Only compare identities and authorized fields here.
  const byId = (a: { worklogId: string }, b: { worklogId: string }) => a.worklogId.localeCompare(b.worklogId);
  assert.deepEqual(data.items.sort(byId), expected.sort(byId));
  for (const { photo } of records) {
    if (!photo || !includePhotos) continue;
    const path = root + "/media/" + photo.id;
    const image = await read(path);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("content-type"), "image/webp");
    assert.match(image.headers.get("cache-control") ?? "", /no-store/);
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), photo.bytes);
    if (invited) assert.equal((await read(path + "?download=1")).status, 404);
  }
}

export async function denied(read: Read, root: string, record: SharingRecord, status = 404) {
  assert.equal((await read(root)).status, status);
  if (record.photo) assert.equal((await read(root + "/media/" + record.photo.id)).status, status);
}

export async function checkCv(ctx: BrowserContext, origin: string, username: string, listed: string[], absent: string[]) {
  const page = await ctx.newPage();
  try {
    const path = "/cv/" + username;
    const response = await page.goto(origin + path, { waitUntil: "load" });
    assert.equal(response?.status(), 200);
    assert.equal(new URL(page.url()).pathname, path);
    await page.getByRole("heading", { level: 1 }).first().waitFor();
    const anchors = await page.locator("a[href]").evaluateAll(nodes => nodes.map(node => (node as HTMLAnchorElement).href));
    for (const slug of listed) assert.ok(anchors.includes(origin + "/selecciones/" + slug), "Approved public link missing from CV");
    for (const slug of absent) assert.ok(!anchors.includes(origin + "/selecciones/" + slug), "Unlisted or withdrawn public link present in CV");
  } finally { await page.close(); }
}
