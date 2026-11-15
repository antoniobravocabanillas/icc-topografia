import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { sanitizeWorklogClip } from "../lib/server/worklog-clip";
import { verifyClipPlayback } from "./lib/worklog-clip-playback";

async function main() {
  const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 900 } });
    await page.goto("http://127.0.0.1:3218/captura");
    const form = page.locator("#registrar-trabajo");
    for (const kind of ["audio", "video"] as const) {
      await form.getByRole("button", { name: "Grabar " + kind }).click();
      const stop = form.getByRole("button", { name: "Detener grabación" });
      await expect(stop).toBeVisible();
      await expect(form.getByRole("button", { name: "Continuar", exact: true })).toBeDisabled();
      await page.waitForTimeout(1100); // Capture enough actual samples to decode.
      await stop.click();
      const preview = form.locator(`section[data-step="1"] ${kind}[controls]`);
      await expect(preview).toBeVisible();
      const src = await preview.getAttribute("src");
      assert.ok(src);
      await verifyClipPlayback(page, kind, src);
      const bytes = await page.evaluate(async url => Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer())), src);
      const clean = await sanitizeWorklogClip(Uint8Array.from(bytes).buffer, kind + "/webm", kind + ".webm");
      const derivative = await page.evaluate(({ data, type }) => URL.createObjectURL(new Blob([new Uint8Array(data)], { type })),
        { data: [...clean.bytes], type: clean.contentType });
      await verifyClipPlayback(page, kind, derivative);
      console.log(`PASS recorded ${kind}, preview and sanitized playback (${clean.bytes.length} bytes)`);
    }
    await form.locator("[name=title]").fill("Control de campo con audio y video");
    await form.locator("[name=summary]").fill("Grabación sintética de la inspección de un eje de control.");
    await form.getByRole("button", { name: "Continuar", exact: true }).click();
    await expect(form.locator('section[data-step="2"] audio[controls]')).toBeVisible();
    await form.getByRole("button", { name: "Ver clip 2" }).click();
    await expect(form.locator('section[data-step="2"] video[controls]')).toBeVisible();
    await page.route("**/fixture-clips/*", async route => {
      const kind = new URL(route.request().url()).pathname.split("/").pop();
      assert.ok(kind === "audio" || kind === "video");
      await route.fulfill({ contentType: kind + "/webm", body: await readFile(`scripts/fixtures/worklog-clips/${kind}.webm`) });
    });
    await page.goto("http://127.0.0.1:3218/cv/fixture/evidencias/clip-gallery");
    const gallery = page.getByRole("region", { name: "Galería de evidencias" });
    for (const [i, kind] of (["audio", "video"] as const).entries()) {
      await gallery.getByRole("button", { name: "Ver evidencia " + (i + 1) }).click();
      const player = gallery.locator(kind + "[controls]");
      await expect(player).toBeVisible();
      assert.equal(await player.evaluate(async el => {
        const media = el as HTMLMediaElement; media.muted = true; await media.play();
        return media.paused;
      }), false);
    }
    console.log("PASS public CV detail plays audio and video in the visible gallery");
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
