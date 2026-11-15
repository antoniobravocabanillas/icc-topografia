import assert from "node:assert/strict";
import type { Page } from "playwright";

export async function verifyClipPlayback(page: Page, kind: "audio" | "video", src: string) {
  const result = await page.evaluate(async ({ kind, src }) => {
    const player = document.createElement(kind) as HTMLMediaElement;
    player.muted = true;
    player.controls = true;
    document.body.append(player);
    try {
      return await new Promise<{ time: number; width: number }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Playback timed out")), 15000);
        player.onerror = () => { clearTimeout(timer); reject(new Error("Media decode failed")); };
        player.onended = () => {
          clearTimeout(timer);
          resolve({ time: player.currentTime, width: player instanceof HTMLVideoElement ? player.videoWidth : 0 });
        };
        player.src = src;
        void player.play().catch(error => { clearTimeout(timer); reject(error); });
      });
    } finally { player.removeAttribute("src"); player.load(); player.remove(); }
  }, { kind, src });
  assert.ok(result.time > 0 && (kind !== "video" || result.width > 0));
  return result;
}
