import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceRoots = ["app", "components"];
const extensions = new Set([".tsx", ".ts"]);

async function walk(relative: string): Promise<string[]> {
  const absolute = path.join(root, relative);
  const entries = await readdir(absolute, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await walk(child));
    else if (extensions.has(path.extname(entry.name))) files.push(child.replaceAll("\\", "/"));
  }
  return files;
}

function csv(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""').replaceAll(/\r?\n/g, " ")}"`;
}

function lineAt(content: string, index: number) {
  return content.slice(0, index).split("\n").length;
}

function attribute(tag: string, name: string) {
  return tag.match(new RegExp(`${name}\\s*=\\s*["'{]([^"'}]+)`))?.[1] || "";
}

function visibleLabel(content: string, end: number) {
  return content.slice(end, end + 220).replace(/<[^>]+>/g, " ").replace(/\{[^}]+\}/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

async function main() {
  const files = (await Promise.all(sourceRoots.map(walk))).flat().sort();
  const controls: string[][] = [];
  const routes: string[][] = [];

  for (const file of files) {
    const content = await readFile(path.join(root, file), "utf8");
    const routeKind = file.endsWith("/page.tsx") ? "page" : file.endsWith("/route.ts") ? "api" : "";
    if (routeKind) routes.push([routeKind, file]);

    const pattern = /<(button|Link|a|form|input|select|textarea)\b[^>]*>/g;
    for (const match of content.matchAll(pattern)) {
      const tag = match[0];
      const index = match.index || 0;
      const kind = match[1];
      const label = attribute(tag, "aria-label") || attribute(tag, "placeholder") || attribute(tag, "name") || visibleLabel(content, index + tag.length);
      const destination = attribute(tag, "href") || attribute(tag, "action") || attribute(tag, "onClick");
      controls.push([file, String(lineAt(content, index)), kind, label, destination, attribute(tag, "type"), attribute(tag, "name")]);
    }
  }

  const output = path.join(root, "docs", "audits");
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "interface-controls.csv"), [
    ["file", "line", "control", "label", "destination_or_action", "type", "name"].map(csv).join(","),
    ...controls.map((row) => row.map(csv).join(","))
  ].join("\n") + "\n", "utf8");
  await writeFile(path.join(output, "routes.csv"), [
    ["kind", "file"].map(csv).join(","),
    ...routes.map((row) => row.map(csv).join(","))
  ].join("\n") + "\n", "utf8");

  console.log(JSON.stringify({ files: files.length, controls: controls.length, routes: routes.length, output }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
