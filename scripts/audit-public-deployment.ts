import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const origin = "https://terraqoglobal.com";
const routes = ["/", "/plataforma", "/producto", "/automatizacion", "/membresias", "/red", "/contacto"];

async function main() {
  const previews = new Set<string>();
  for (const path of routes) {
    const response = await fetch(origin + path, { signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 200, `${path}: HTTP`);
    const html = await response.text();
    assert(html.includes('rel="canonical"'), `${path}: canonical missing`);
    assert(html.includes(`${origin}${path === "/" ? "" : path}`), `${path}: public URL missing`);
    assert(!/href="https?:\/\/localhost[^\"]*"/.test(html), `${path}: localhost link`);
    assert(html.includes('name="twitter:card" content="summary_large_image"'), `${path}: Twitter card`);
    assert(html.includes('property="og:image"'), `${path}: Open Graph image`);
    const preview = await fetch(`${origin}/api/og?path=${encodeURIComponent(path)}`, { signal: AbortSignal.timeout(30000) });
    assert.equal(preview.status, 200, `${path}: preview HTTP`);
    assert(preview.headers.get("content-type")?.includes("image/png"), `${path}: preview MIME`);
    const png = Buffer.from(await preview.arrayBuffer());
    assert.equal(png.readUInt32BE(16), 1200, `${path}: preview width`);
    assert.equal(png.readUInt32BE(20), 630, `${path}: preview height`);
    const digest = createHash("sha256").update(png).digest("hex");
    assert(!previews.has(digest), `${path}: CDN reused another section preview`);
    previews.add(digest);
    console.log(`PASS ${path}: HTML, public URLs, social metadata, PNG 1200x630`);
  }
  const rejected = await fetch(`${origin}/api/og?path=${encodeURIComponent("https://127.0.0.1/private")}`);
  assert.equal(rejected.status, 404, "Unknown preview must be rejected");
  const sitemap = await fetch(`${origin}/sitemap.xml`);
  assert.equal(sitemap.status, 200);
  const xml = await sitemap.text();
  assert(!xml.includes("localhost"), "Sitemap includes localhost");
  assert(!xml.includes("/registro</loc>"), "Registration page in sitemap");
  console.log("PASS: unknown preview rejected; sitemap excludes localhost and registration.");
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Public audit failed"); process.exitCode = 1; });
