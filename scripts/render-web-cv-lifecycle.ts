import { mkdirSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
mkdirSync("output/playwright/web-cv-lifecycle", { recursive: true });
buildSync({ entryPoints: ["scripts/fixtures/web-cv-lifecycle-browser.tsx"], bundle: true,
  outfile: "output/playwright/web-cv-lifecycle/browser.js", platform: "browser",
  define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" } });
const head = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/output/playwright/web-cv-review/styles.css"><style>body{--font-sans:Satoshi;--font-display:Satoshi;background:#f4f7f7;padding:24px}main{max-width:1060px;margin:auto}</style><title>Fixture sintético de ciclo CV</title></head><body>';
writeFileSync("output/playwright/web-cv-lifecycle/control.html", head + '<main id="root"></main><script src="browser.js"></script></body></html>');
writeFileSync("output/playwright/web-cv-lifecycle/entry.html", head + '<a href="control.html">Abrir control propio</a><button id="spa">Entrada SPA sintética</button><script>document.getElementById("spa").onclick=()=>{history.pushState({},"","control.html");const main=document.createElement("main");main.id="root";document.body.appendChild(main);const script=document.createElement("script");script.src="browser.js";document.body.appendChild(script)}</script></body></html>');
console.log("Hydrated CV browser fixture built with synthetic ports; no SQL, credentials or real operation endpoint.");
