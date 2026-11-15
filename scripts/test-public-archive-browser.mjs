import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
await mkdir("output/playwright", { recursive: true });
const browser = await chromium.launch();
const item = (i) => ({
  id: `record${i}`,
  title: `Trabajo documentado ${i}`,
  summary: "Avance de levantamiento y control de campo.",
  outcome: null,
  type: "FIELD_UPDATE",
  evidenceStatus: "DECLARED",
  occurredAt: "2026-10-28T15:00:00Z",
  createdAt: "2026-10-28T16:00:00Z",
  locationLabel: "Lima",
  skills: ["Topografía", "Control de campo"],
  evidenceUrls: [],
  project: { id: "project-other-page", title: "Obra autorizada" },
  workspace: null,
  media: [{id:"fixture-thumbnail",fileName:"Imagen de prueba.svg",contentType:"image/svg+xml"}],
  validations: [],
});
try {
  for (const width of [1280, 375, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    const requests = [];
    // Serve the actual bundled typeface; this isolated Next app has no public directory.
    await page.route("**/fonts/satoshi/*.woff2", async route => {
      const name = new URL(route.request().url()).pathname.split("/").pop();
      await route.fulfill({contentType:"font/woff2",body:await readFile(new URL(`../public/fonts/satoshi/${name}`, import.meta.url))});
    });
    await page.route("**/api/public/cv/fixture/worklogs/fixture-thumbnail", route => route.fulfill({contentType:"image/svg+xml",body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="#17354a"/><path d="M0 350L220 120L460 330L610 200L800 400V450H0Z" fill="#355b6d"/></svg>'}));
    await page.route("**/fixture-*.svg", route => route.fulfill({contentType:"image/svg+xml",body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="#17354a"/><text x="60" y="230" fill="white" font-size="32">Imagen de prueba</text></svg>'}));
    await page.route(
      "**/api/v1/profiles/fixture-profile/evidence**",
      async (route) => {
        const url = new URL(route.request().url());
        requests.push(url);
        assert.equal(url.searchParams.get("audience"), "public");
        assert.equal(url.searchParams.get("timezone"), "America/Lima");
        if (url.pathname.endsWith("/activity"))
          return route.fulfill({
            json: { data: { days: [{ date: "2026-10-28", count: 2 }] } },
          });
        const q = url.searchParams.get("q");
        const cursor = url.searchParams.get("cursor");
        if (q === "paginado") {
          const current = Number(cursor || 1);
          const last = width === 1280 ? 12 : 2;
          const empty = url.searchParams.get("state") === "VERIFIED";
          return route.fulfill({ json: { data: {
            items: empty ? [] : Array.from({length: 20}, (_, i) => item((current - 1) * 20 + i + 1)),
            projects: [{id:"project-other-page",title:"Obra autorizada"}],
            page: {hasMore: !empty && current < last, nextCursor: !empty && current < last ? String(current + 1) : null},
            scopeCounts: {records: empty ? 0 : last * 20},
          }}});
        }
        return route.fulfill({
          json: {
            data: {
              items: q
                ? [
                    {
                      ...item(50),
                      id: "offpage",
                      title: "Levantamiento de campo — prueba",
                    },
                  ]
                : cursor
                  ? [item(21)]
                  : Array.from({ length: 20 }, (_, i) => item(i + 1)),
              projects: [
                { id: "project-other-page", title: "Obra autorizada" },
              ],
              page: {
                hasMore: !q && !cursor,
                nextCursor: !q && !cursor ? "page2" : null,
              },
              scopeCounts: { records: q ? 1 : 21 },
            },
          },
        });
      },
    );
    await page.goto("http://localhost:3190/cv/fixture/evidencias");
    await page.evaluate(() => document.fonts.ready);
    await expect(
      page.getByRole("heading", { name: "Trabajo documentado 1", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("21 bitácoras en este resultado"),
    ).toBeVisible();
    await page.screenshot({path:`output/playwright/archive-default-${width}.png`,fullPage:false});
    await page.getByRole("button", { name: "Calendario", exact: true }).click();
    await page.getByLabel("Actividad del mes", { exact: true }).fill("2026-10");
    const end = page.getByRole("button", { name: "2026-10-28: 2 registros públicos", exact: true });
    await expect(end).toBeVisible();
    const beforeDates = page.url();
    const requestCount = requests.length;
    await end.click();
    await page.getByRole("button", { name: "2026-10-26: 0 registros públicos", exact: true }).click();
    assert.equal(page.url(), beforeDates, "Draft dates must not change the URL");
    assert.equal(requests.length, requestCount, "Draft dates must not reload activity or results");
    await page.getByRole("button", { name: "Aplicar fechas", exact: true }).click();
    await expect(page).toHaveURL(/from=2026-10-26.*to=2026-10-28/);
    await page.getByRole("button", { name: /^Quitar periodo:/ }).click();
    await expect(page).toHaveURL(beforeDates);
    await page.getByRole("button", { name: "Lista", exact: true }).click();
    const loadMore = page.getByRole("button", { name: "Cargar más bitácoras" });
    if (width < 640) {
      const clearance = await loadMore.evaluate(node => {
        node.scrollIntoView({ block: "center", behavior: "instant" });
        return innerHeight - node.getBoundingClientRect().bottom;
      });
      assert.ok(clearance >= 60, "Pagination overlaps the mobile hosting badge or safe area");
    }
    await loadMore.click();
    await expect(
      page.getByRole("heading", {
        name: "Trabajo documentado 21",
        exact: true,
      }),
    ).toBeVisible();
    await page.locator("#record-record21").click();
    await expect(
      page.getByRole("heading", {
        name: "Levantamiento de campo — prueba",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", {name:"Ver evidencia 2",exact:true}).click();
    await expect(page.getByRole("button", {name:"Ver evidencia 2",exact:true})).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("img", {name:"Levantamiento de campo — prueba, evidencia 2",exact:true})).toHaveAttribute("src", "/fixture-2.svg");
    await page.getByRole("tab", { name: "Respaldo", exact: true }).click();
    await expect(page.getByText("Este registro no tiene respaldos públicos disponibles.", {exact: false})).toBeVisible();
    await page.getByRole("tab", { name: "Historial", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Historial público" })).toBeVisible();
    await page.getByRole("tab", { name: "Evidencias", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({path: `output/playwright/archive-detail-${width}.png`, fullPage: true});
    await page.getByRole("link", { name: "Volver a las bitácoras" }).click();
    await expect(page.locator("#record-record21")).toBeVisible();
    await page
      .getByRole("textbox", { name: "Buscar en todas las bitácoras públicas" })
      .fill("levantamiento");
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Levantamiento de campo — prueba" }),
    ).toBeVisible();
    assert.equal(new URL(page.url()).searchParams.get("q"), "levantamiento");
    await page.getByRole("button", { name: "Filtros", exact: true }).click();
    if (width < 640) {
      const date = await page.getByLabel("Desde", {exact:true}).boundingBox();
      assert.ok(date && date.width > 240, "Mobile dates must have room for the complete value");
    }
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Calendario", exact: true }).click();
    await page.getByLabel("Actividad del mes", { exact: true }).fill("2026-10");
    await expect(
      page.getByRole("button", {
        name: "2026-10-28: 2 registros públicos",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByLabel("Tipo", { exact: true }).selectOption("FIELD_UPDATE");
    await page
      .getByLabel("Proyecto", { exact: true })
      .selectOption("project-other-page");
    await page
      .getByRole("button", {
        name: "2026-10-28: 2 registros públicos",
        exact: true,
      })
      .click();
    await page.screenshot({
      path: `output/playwright/archive-filters-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Aplicar filtros" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Levantamiento de campo — prueba" }),
    ).toBeVisible();
    assert.equal(new URL(page.url()).searchParams.get("from"), "2026-10-28");
    await page.locator("#record-offpage").click();
    assert.equal(new URL(page.url()).searchParams.get("q"), "levantamiento");
    await page.waitForURL("**/evidencias/offpage?**");
    await page.goBack();
    await expect(page.locator("#record-offpage")).toBeVisible();
    assert.equal(new URL(page.url()).searchParams.get("from"), "2026-10-28");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: `output/playwright/archive-list-${width}.png`,
      fullPage: true,
    });
    await page.goto("http://localhost:3190/cv/fixture/evidencias#offpage");
    await page.waitForURL("**/evidencias/offpage");
    await expect(
      page.getByRole("heading", {
        name: "Levantamiento de campo — prueba",
        exact: true,
      }),
    ).toBeVisible();
    // Restore all visited cursors, including beyond the former ten-page ceiling.
    const combined = "q=paginado&type=FIELD_UPDATE&state=DECLARED&projectId=project-other-page&from=2026-10-26&to=2026-10-28";
    await page.goto(`http://localhost:3190/cv/fixture/evidencias?${combined}`);
    await expect(page.locator("#record-record1")).toBeVisible();
    await page.getByRole("button", {name:"Filtros",exact:true}).click();
    await page.getByRole("button", {name:"Calendario",exact:true}).click();
    await page.getByLabel("Actividad del mes", {exact:true}).fill("2026-10");
    const last = width === 1280 ? 12 : 2;
    for (let i = 1; i < last; i++) {
      await page.getByRole("button", {name:"Cargar más bitácoras",exact:true}).click();
      await expect(page.locator(`#record-record${(i + 1) * 20}`)).toBeAttached();
    }
    await expect(page.getByRole("button", {name:"Cargar más bitácoras",exact:true})).toHaveCount(0);
    const record = page.locator(`#record-record${last * 20}`);
    await record.scrollIntoViewIfNeeded();
    const scroll = await page.evaluate(() => scrollY);
    const filteredUrl = page.url();
    for (const returnVia of ["Volver a las bitácoras", "Evidencias", "browser"]) {
      await record.click();
      await page.waitForURL(`**/evidencias/record${last * 20}?**`);
      assert.equal(new URL(page.url()).search.slice(1), combined);
      if (returnVia === "browser") await page.goBack();
      else await page.getByRole("link", {name:returnVia,exact:true}).click();
      await expect(page).toHaveURL(filteredUrl);
      await expect(record).toHaveAttribute("aria-current", "true");
      await expect(record).toBeFocused();
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(scroll - 4);
      await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(scroll + 4);
      await expect(page.getByRole("button", {name:"Calendario",exact:true})).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByLabel("Actividad del mes", {exact:true})).toHaveValue("2026-10");
      await expect(page.getByLabel("Estado", {exact:true})).toHaveValue("DECLARED");
    }
    await page.getByLabel("Estado", {exact:true}).selectOption("VERIFIED");
    const beforeEmpty = requests.length;
    await page.getByRole("button", {name:"Aplicar filtros",exact:true}).click();
    await expect(page.getByRole("heading", {name:"No hay bitácoras para estos filtros",exact:true})).toBeVisible();
    const emptyRead = requests.slice(beforeEmpty).find(url => !url.pathname.endsWith("/activity"));
    assert.ok(emptyRead);
    assert.equal(emptyRead.searchParams.has("cursor"), false, "Filter changes must reset pagination");
    for (const key of ["q", "type", "projectId", "from", "to"])
      assert.equal(emptyRead.searchParams.get(key), new URL(filteredUrl).searchParams.get(key));
    await page.screenshot({path:`output/playwright/archive-empty-${width}.png`,fullPage:true});
    await page.getByRole("button", {name:"Ver todas las bitácoras",exact:true}).click();
    await expect(page).toHaveURL("http://localhost:3190/cv/fixture/evidencias");
    await expect(page.locator("#record-record1")).toBeVisible();
    await expect(page.getByRole("link", {name:"CV vivo",exact:true})).toHaveAttribute("href", "/cv/fixture");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.goto(
      "http://localhost:3190/cv/fixture/evidencias?registro=experience-legacy",
    );
    await expect(
      page.getByRole("heading", {
        name: "Levantamiento de campo — prueba",
        exact: true,
      }),
    ).toBeVisible();
    console.log(
      `PASS ${width}px: server search, pagination, filters/calendar, detail, legacy links and back navigation; ${requests.length} authorized read requests`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
