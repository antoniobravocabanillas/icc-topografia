import { writeFile } from "node:fs/promises";
import type { Page } from "@playwright/test";

/** Full-page stitching can place sticky bars inside the document. Keep actual
 * viewport evidence separately, without hiding overlays or altering product CSS. */
export async function captureViewportEvidence(page: Page, prefix: string) {
  const original = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  const measurements = [];
  try {
    for (const [position, fraction] of [["top", 0], ["middle", 0.5], ["bottom", 1]] as const) {
      await page.evaluate(factor => window.scrollTo({ top: Math.max(0,
        document.documentElement.scrollHeight - innerHeight) * factor, behavior: "instant" }), fraction);
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      measurements.push(await page.evaluate(label => ({
        position: label, scrollY, width: innerWidth, height: innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        // Geometry only: never serialize customer text, attributes or session data.
        overlays: Array.from(document.querySelectorAll("header, nav, [role=navigation]"))
          .filter(element => ["sticky", "fixed"].includes(getComputedStyle(element).position))
          .map(element => {
            const rect = element.getBoundingClientRect();
            return { tag: element.tagName, position: getComputedStyle(element).position,
              x: rect.x, y: rect.y, width: rect.width, height: rect.height };
          }),
      }), position));
      await page.screenshot({ path: `${prefix}-${position}.png`, fullPage: false });
    }
    await writeFile(`${prefix}-geometry.json`, JSON.stringify(measurements, null, 2));
  } finally {
    await page.evaluate(point => window.scrollTo({ left: point.x, top: point.y, behavior: "instant" }), original);
  }
}
