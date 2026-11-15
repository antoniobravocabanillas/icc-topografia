// Disposable loopback fixture. Never loads application secrets or a database.
import { cp, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
const root = new URL("../../", import.meta.url);
const harness = new URL("output/s09-ui-fixture/", root);
await mkdir(new URL("app/cv/fixture/", harness), { recursive: true });
await cp(new URL("public/fonts/satoshi/", root), new URL("public/fonts/satoshi/", harness), { recursive: true });
await cp(new URL("public/brand/terraqo-3/", root), new URL("public/brand/terraqo-3/", harness), { recursive: true });
const files = {
  "package.json": JSON.stringify({ name: "s09-ui-fixture", private: true }),
  "tsconfig.json": JSON.stringify({ extends: "../../tsconfig.json", compilerOptions: { baseUrl: "../.." }, include: ["app/**/*.tsx", ".next/types/**/*.ts"] }),
  "postcss.config.mjs": "import {fileURLToPath} from 'node:url'; export default {plugins:{tailwindcss:{config:fileURLToPath(new URL('../../tailwind.config.ts',import.meta.url))},autoprefixer:{}}};",
  "next.config.mjs": "export default {devIndicators:false,env:{NEXT_PUBLIC_SITE_URL:'http://127.0.0.1:3199',NEXT_PUBLIC_PORTAL_URL:'http://127.0.0.1:3199',NEXT_PUBLIC_API_URL:'http://127.0.0.1:3199'}};",
  "app/layout.tsx": 'import "@/app/globals.css"; export default function Layout({children}:{children:React.ReactNode}){return <html lang="es"><body>{children}</body></html>}',
  "app/cv/fixture/page.tsx": 'import Fixture from "@/scripts/fixtures/s09-cv-preview"; export default async function Page({searchParams}:{searchParams:Promise<{scenario?:string}>}) {return <Fixture scenario={(await searchParams).scenario}/>;}',
};
for (const [path, content] of Object.entries(files)) await writeFile(new URL(path, harness), content + "\n", "utf8");
const server = spawn(process.execPath, [fileURLToPath(new URL("node_modules/next/dist/bin/next", root)), "dev", fileURLToPath(harness), "--hostname", "127.0.0.1", "-p", "3199"], { cwd: fileURLToPath(root), stdio: "inherit", windowsHide: true });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
server.on("exit", code => { process.exitCode = code ?? 1; });
