import { mkdir } from "node:fs/promises";
await mkdir("output/s01", { recursive: true });
import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch();
try {
  for (const width of [1280, 375, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    const url = "http://127.0.0.1:3218/trajectory-preview";
    await page.goto(url);
    await expect(
      page.getByRole("link", { name: "Registrar trabajo" }),
    ).toHaveAttribute("href", "/portal/bitacora#registrar-trabajo");
    await expect(
      page
        .getByRole("navigation", { name: "Trabajo documentado" })
        .getByRole("link"),
    ).toHaveCount(3);
    await page.evaluate(async () => {
      localStorage.setItem("terraqo:draft-consent:test", "1");
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open("terraqo-offline-drafts", 1);
        r.onupgradeneeded = () =>
          r.result.createObjectStore("worklog-drafts", { keyPath: "key" });
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      await new Promise((resolve) => {
        const t = db.transaction("worklog-drafts", "readwrite");
        t.objectStore("worklog-drafts").put({
          key: "professional:test:worklog",
          schemaVersion: 1,
        });
        t.oncomplete = resolve;
      });
      db.close();
    });
    await page.reload();
    await expect(
      page.getByRole("link", { name: "Continuar borrador" }),
    ).toBeVisible();
    await page.screenshot({ path: "output/s01/trajectory-" + width + ".png" });
    await page.goto(url + "?profile=another");
    await expect(
      page.getByRole("link", { name: "Registrar trabajo" }),
    ).toBeVisible();
    let signed = false;
    let accepted = 0;
    await page.route("**/api/auth/session", (r) =>
      r.fulfill({
        json: signed ? { user: { email: "test@example.invalid" } } : {},
      }),
    );
    await page.route("**/api/terraqo/workspace-invitations", (r) => {
      if (r.request().postDataJSON().token !== "x".repeat(43))
        throw Error("token");
      accepted++;
      return r.fulfill({ json: { access: "MEMBER" } });
    });
    await page.goto(url + "?invite=1#" + "x".repeat(43));
    await expect(
      page.getByRole("link", { name: "Iniciar sesión" }),
    ).toHaveAttribute("target", "_blank");
    await expect.poll(() => new URL(page.url()).hash).toBe("");
    await page.screenshot({ path: "output/s01/invitation-" + width + ".png" });
    signed = true;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByText("test@example.invalid")).toBeVisible();
    if (accepted) throw Error("auto accept");
    await page.getByRole("button", { name: "Aceptar invitación" }).click();
    await expect(
      page.getByRole("heading", { name: "Invitación aceptada" }),
    ).toBeVisible();
    if (
      accepted !== 1 ||
      (await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ))
    )
      throw Error("layout or duplicate");
    await page.close();
    console.log("PASS draft isolation and invitation return at", width);
  }
} finally {
  await browser.close();
}
