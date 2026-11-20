import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { captureViewportEvidence } from "./lib/viewport-evidence";

async function main() {
const dir = resolve("output/viewport-evidence-check");
await mkdir(dir, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 375, height: 700 } });
  await page.setContent(`<style>body{margin:0}header{position:sticky;top:0;height:60px;background:white}
    main{height:2200px}nav{position:fixed;bottom:0;height:50px;background:white}</style>
    <header>PRIVATE TEST IDENTITY</header><main>Content</main><nav>Navigation</nav>`);
  await page.evaluate(() => scrollTo(0, 350));
  const prefix = resolve(dir, "viewport");
  await captureViewportEvidence(page, prefix);
  assert.equal(await page.evaluate(() => scrollY), 350, "Capture must restore the journey's scroll position");
  const text = await readFile(`${prefix}-geometry.json`, "utf8");
  assert.ok(!text.includes("PRIVATE TEST IDENTITY"), "Geometry must not serialize page content");
  const positions = JSON.parse(text) as { position: string; scrollY: number; overlays: { y: number }[] }[];
  assert.equal(positions[0].scrollY, 0);
  assert.ok(positions[2].scrollY > positions[1].scrollY && positions[1].scrollY > 0);
  for (const position of positions) {
    assert.deepEqual(position.overlays.map(item => item.y), [0, 650], "Sticky and fixed overlays stay at viewport edges");
    const image = await sharp(`${prefix}-${position.position}.png`).metadata();
    assert.equal(image.width, 375); assert.equal(image.height, 700);
  }
  await assert.rejects(captureViewportEvidence(page, resolve(dir, "viewport-top.png", "capture")));
  assert.equal(await page.evaluate(() => scrollY), 350, "Failed capture must also restore scroll");
  console.log("PASS viewport evidence: native dimensions, fixed/sticky geometry, content omission and scroll restoration on success/failure");
} finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
