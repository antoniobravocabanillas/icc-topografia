import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["app", "components", "lib", "prisma"];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".prisma", ".md"]);
const BAD_PATTERNS = [
  /\u00c3[\u0080-\u00bf]/,
  /\u00c2[\u0080-\u00bf]/,
  /p\?blic/i,
  /informaci\?/i,
  /validaci\?/i,
  /revisi\?/i,
  /aparecer\?/i,
  /aqu\?/i,
  /educaci\?/i,
  /formaci\?/i,
  /t\?cn/i,
  /bit\?cor/i,
  /\?ltim/i,
  /\bm\?s\b/i,
  /\ba\?n\b/i,
  /public\?/i,
  /ubicaci\?/i,
  /verificaci\?/i,
  /declaraci\?/i,
  /\?reas/i,
  /\banos\b/i
];

function extensionOf(file: string) {
  const dot = file.lastIndexOf(".");
  return dot >= 0 ? file.slice(dot) : "";
}

function walk(dir: string, files: string[] = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) walk(full, files);
    else if (EXTENSIONS.has(extensionOf(full))) files.push(full);
  }
  return files;
}

const offenders: string[] = [];

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const content = readFileSync(file, "utf8");
    if (BAD_PATTERNS.some((pattern) => pattern.test(content))) offenders.push(file);
  }
}

if (offenders.length) {
  console.error("Encoding guard failed. Possible mojibake or broken Spanish characters found:");
  for (const file of offenders) console.error(`- ${file}`);
  process.exit(1);
}

console.log("Encoding guard passed.");
