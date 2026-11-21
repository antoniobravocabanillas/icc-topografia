import { crc32, createInflateRaw } from "node:zlib";
import { Writable, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { SaxesParser, type SaxesTagNS } from "saxes";

export const MAX_PROFESSIONAL_OFFICE_FILE_BYTES = 10 * 1024 * 1024;
export const PROFESSIONAL_DOC_UNSUPPORTED = "El formato DOC no está soportado. Guarda el CV como DOCX o PDF.";
export const INVALID_PROFESSIONAL_DOCX = "El archivo no es un DOCX válido o utiliza una variante no soportada.";
export const PROFESSIONAL_DOCX_LIMIT_EXCEEDED = "El DOCX supera los límites de procesamiento permitidos.";
export const PROFESSIONAL_DOCX_LIMITS = Object.freeze({
  entries: 256, entryBytes: 8 * 1024 * 1024, xmlBytes: 2 * 1024 * 1024,
  totalBytes: 32 * 1024 * 1024, expansionRatio: 200, xmlDepth: 64,
  xmlElements: 200_000, attributesPerElement: 128, milliseconds: 5_000,
});

// Narrow declarations for the documented yauzl 3.4 API (which ships no types).
// No reliance on the older, transitively installed @types/yauzl or ZIP internals.
interface ZipEntry {
  fileName: string; fileNameRaw: Buffer;
  generalPurposeBitFlag: number; compressionMethod: number; crc32: number;
  compressedSize: number; uncompressedSize: number; relativeOffsetOfLocalHeader: number;
  versionNeededToExtract: number; externalFileAttributes: number;
  extraFields: Array<{ id: number }>;
}
interface LocalHeader {
  fileDataStart: number; fileName: Buffer; generalPurposeBitFlag: number;
  compressionMethod: number; crc32: number; compressedSize: number; uncompressedSize: number;
}
interface ZipFile {
  entryCount: number;
  comment: string;
  eachEntry(): AsyncIterable<ZipEntry>;
  readLocalFileHeaderPromise(entry: ZipEntry): Promise<LocalHeader>;
  openReadStreamPromise(entry: ZipEntry, options: { decodeFileData: false }): Promise<Readable>;
  close(): void;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Typed boundary for a CommonJS package without declarations.
const zipReader = require("yauzl") as {
  fromBufferPromise(bytes: Buffer, options: { strictFileNames: true; validateEntrySizes: true }): Promise<ZipFile>;
};

const CT = "[Content_Types].xml";
const ROOT_RELS = "_rels/.rels";
const CT_NS = "http://schemas.openxmlformats.org/package/2006/content-types";
const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const REL_MIME = "application/vnd.openxmlformats-package.relationships+xml";
const MAIN_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
const WORD_NS = new Set([
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  "http://purl.oclc.org/ooxml/wordprocessingml/main",
]);
const OFFICE_REL = new Set([
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
  "http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument",
]);
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
class FormatError extends Error {}
class LimitError extends Error {}
function requireFormat(condition: unknown): asserts condition {
  if (!condition) throw new FormatError();
}
function within(condition: unknown): asserts condition {
  if (!condition) throw new LimitError();
}

// Deliberately canonical package paths. Percent-encoded paths, backslashes and
// dot segments are unsupported; nothing is ever extracted to the filesystem.
function partPath(name: string): string {
  requireFormat(name.length > 0 && name.length <= 512 && name === name.normalize("NFC") &&
    !/[\x00-\x20\x7f\ufffd\\:%?#]/.test(name));
  requireFormat(name.split("/").every((part) => part && part !== "." && part !== ".." && !part.endsWith(".")));
  return name;
}
function attribute(tag: SaxesTagNS, name: string): string {
  const value = tag.attributes[name];
  requireFormat(value && value.uri === "" && value.value.length > 0);
  return value.value;
}
interface Relationship { type: string; target: string; external: boolean }
interface XmlSummary { rootName: string; rootNamespace: string; bodies: number; relationships: Relationship[] }
interface Context {
  total: number; elements: number; deadline: number; signal: AbortSignal;
  defaults: Map<string, string>; overrides: Map<string, string>;
}
function checkTime(context: Context) {
  within(!context.signal.aborted && performance.now() <= context.deadline);
}

function xmlReader(name: string, context: Context) {
  const parser = new SaxesParser({ xmlns: true });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const summary: XmlSummary = { rootName: "", rootNamespace: "", bodies: 0, relationships: [] };
  const ids = new Set<string>();
  const isTypes = name === CT;
  const isRels = name.endsWith(".rels");
  let depth = 0;
  let attributes = 0;
  let background = false;
  parser.on("error", () => { throw new FormatError(); });
  parser.on("doctype", () => { throw new FormatError(); });
  parser.on("xmldecl", (decl) => {
    requireFormat(decl.version === "1.0" && (!decl.encoding || decl.encoding.toLowerCase() === "utf-8"));
  });
  parser.on("opentagstart", () => { attributes = 0; });
  parser.on("attribute", (attr) => {
    within(++attributes <= PROFESSIONAL_DOCX_LIMITS.attributesPerElement && attr.value.length <= 16_384);
  });
  parser.on("opentag", (tag) => {
    checkTime(context);
    within(++depth <= PROFESSIONAL_DOCX_LIMITS.xmlDepth && ++context.elements <= PROFESSIONAL_DOCX_LIMITS.xmlElements);
    if (depth === 1) {
      summary.rootName = tag.local;
      summary.rootNamespace = tag.uri;
      if (isTypes) requireFormat(tag.local === "Types" && tag.uri === CT_NS);
      if (isRels) requireFormat(tag.local === "Relationships" && tag.uri === REL_NS);
    } else if (isTypes) {
      requireFormat(depth === 2 && tag.uri === CT_NS);
      const type = attribute(tag, "ContentType");
      requireFormat(/^[^\s/]+\/[^\s/]+$/.test(type));
      if (tag.local === "Default") {
        const ext = attribute(tag, "Extension").toLowerCase();
        requireFormat(/^[a-z0-9]+$/.test(ext) && !context.defaults.has(ext));
        context.defaults.set(ext, type);
      } else {
        requireFormat(tag.local === "Override");
        const path = attribute(tag, "PartName");
        requireFormat(path.startsWith("/"));
        const part = partPath(path.slice(1));
        requireFormat(!context.overrides.has(part));
        context.overrides.set(part, type);
      }
    } else if (isRels) {
      requireFormat(depth === 2 && tag.uri === REL_NS && tag.local === "Relationship");
      const id = attribute(tag, "Id");
      requireFormat(!ids.has(id));
      ids.add(id);
      const mode = tag.attributes.TargetMode?.value;
      requireFormat(mode === undefined || mode === "Internal" || mode === "External");
      summary.relationships.push({ type: attribute(tag, "Type"), target: attribute(tag, "Target"), external: mode === "External" });
    } else if (summary.rootName === "document" && WORD_NS.has(summary.rootNamespace) && depth === 2) {
      requireFormat(tag.uri === summary.rootNamespace && (tag.local === "body" || tag.local === "background"));
      if (tag.local === "body") requireFormat(++summary.bodies === 1);
      else { requireFormat(!background && summary.bodies === 0); background = true; }
    }
  });
  parser.on("closetag", () => { depth--; });
  const text = (value: string) => {
    // OPC metadata has element-only content; main document text is validated by
    // XML syntax, not a home-grown WordprocessingML schema implementation.
    if (isTypes || isRels || (summary.rootName === "document" && WORD_NS.has(summary.rootNamespace) && depth <= 2)) {
      requireFormat(value.trim() === "");
    }
  };
  parser.on("text", text);
  parser.on("cdata", text);
  return {
    write(chunk: Buffer) { parser.write(decoder.decode(chunk, { stream: true })); },
    finish() { parser.write(decoder.decode()).close(); return summary; },
  };
}

async function readPart(zip: ZipFile, entry: ZipEntry, xml: boolean, context: Context): Promise<XmlSummary | undefined> {
  const limit = xml ? PROFESSIONAL_DOCX_LIMITS.xmlBytes : PROFESSIONAL_DOCX_LIMITS.entryBytes;
  within(entry.uncompressedSize <= limit);
  const parser = xml ? xmlReader(entry.fileName, context) : undefined;
  let bytes = 0;
  let checksum = 0;
  // Read raw compressed bytes through yauzl, but own the inflater so pipeline
  // cancellation destroys every stream, including zlib, on ANY error/timeout.
  const raw = await zip.openReadStreamPromise(entry, { decodeFileData: false });
  const inflate = entry.compressionMethod === 8 ? createInflateRaw() : undefined;
  const sink = new Writable({ write(chunk: Buffer, _encoding, callback) {
    try {
      checkTime(context);
      bytes += chunk.length;
      context.total += chunk.length;
      within(bytes <= limit && context.total <= PROFESSIONAL_DOCX_LIMITS.totalBytes &&
        bytes <= Math.max(1, entry.compressedSize) * PROFESSIONAL_DOCX_LIMITS.expansionRatio);
      requireFormat(bytes <= entry.uncompressedSize);
      checksum = crc32(chunk, checksum);
      parser?.write(chunk);
      callback();
    } catch (error) { callback(error instanceof Error ? error : new FormatError()); }
  } });
  if (inflate) await pipeline(raw, inflate, sink, { signal: context.signal });
  else await pipeline(raw, sink, { signal: context.signal });
  requireFormat(bytes === entry.uncompressedSize && checksum === entry.crc32);
  if (inflate) requireFormat(inflate.bytesWritten === entry.compressedSize);
  return parser?.finish();
}

async function entries(zip: ZipFile, context: Context): Promise<Map<string, ZipEntry>> {
  // Use only yauzl's public decoded records. In particular, do not implement
  // an EOCD/ZIP64/data-descriptor parser or access undocumented reader cursors.
  // yauzl ignores data descriptors, so this profile explicitly rejects bit 3.
  requireFormat(zip.comment === "");
  within(zip.entryCount <= PROFESSIONAL_DOCX_LIMITS.entries);
  const result = new Map<string, ZipEntry>();
  const foldedNames = new Set<string>();
  const ranges: Array<[number, number]> = [];
  let declaredTotal = 0;
  for await (const entry of zip.eachEntry()) {
    checkTime(context);
    within(result.size < PROFESSIONAL_DOCX_LIMITS.entries);
    const directory = entry.fileName.endsWith("/");
    const name = partPath(directory ? entry.fileName.slice(0, -1) : entry.fileName);
    requireFormat(!foldedNames.has(name.toLowerCase()));
    foldedNames.add(name.toLowerCase());
    requireFormat(entry.versionNeededToExtract <= 20 && !entry.extraFields.some(({ id }) => id === 1 || id === 0x7075));
    requireFormat((entry.generalPurposeBitFlag & ~0x0806) === 0 && [0, 8].includes(entry.compressionMethod));
    const kind = (entry.externalFileAttributes >>> 16) & 0xf000;
    requireFormat(kind === 0 || kind === (directory ? 0x4000 : 0x8000));
    requireFormat(Number.isSafeInteger(entry.uncompressedSize) && Number.isSafeInteger(entry.compressedSize));
    declaredTotal += entry.uncompressedSize;
    within(entry.uncompressedSize <= PROFESSIONAL_DOCX_LIMITS.entryBytes && declaredTotal <= PROFESSIONAL_DOCX_LIMITS.totalBytes &&
      entry.uncompressedSize <= Math.max(1, entry.compressedSize) * PROFESSIONAL_DOCX_LIMITS.expansionRatio);
    if (directory) requireFormat(entry.uncompressedSize === 0);
    const local = await zip.readLocalFileHeaderPromise(entry);
    requireFormat(local.fileName.equals(entry.fileNameRaw) && local.generalPurposeBitFlag === entry.generalPurposeBitFlag &&
      local.compressionMethod === entry.compressionMethod);
    const dataEnd = local.fileDataStart + entry.compressedSize;
    requireFormat(local.crc32 === entry.crc32 && local.compressedSize === entry.compressedSize && local.uncompressedSize === entry.uncompressedSize);
    ranges.push([entry.relativeOffsetOfLocalHeader, dataEnd]);
    result.set(entry.fileName, entry);
  }
  requireFormat(result.size === zip.entryCount);
  let position = 0;
  for (const [start, finish] of ranges.sort((a, b) => a[0] - b[0])) {
    requireFormat(start === position && finish > start);
    position = finish;
  }
  for (const name of result.keys()) {
    const segments = name.replace(/\/$/, "").split("/");
    segments.pop();
    while (segments.length) {
      requireFormat(!result.has(segments.join("/")));
      segments.pop();
    }
  }
  return result;
}

function relationshipTarget(source: string, target: string): string {
  // Relative parent segments are legal for OPC relationships (unlike ZIP entry
  // names); resolve them without allowing escape above the package root.
  requireFormat(target.length <= 512 && !/[\x00-\x20\x7f\\:%?#]/.test(target));
  const base = target.startsWith("/") ? [] : source.split("/").slice(0, -1);
  for (const segment of target.replace(/^\//, "").split("/")) {
    if (segment === "..") { requireFormat(base.length > 0); base.pop(); }
    else if (segment !== ".") { requireFormat(segment); base.push(segment); }
  }
  return partPath(base.join("/"));
}

/**
 * Bounded DOCX container + essential Word-format validation; null means accepted.
 * DOC is explicitly unsupported. Accepts UTF-8 XML, classic ZIP stored/deflate,
 * transitional/strict Word namespaces and internal package relationships.
 * ZIP64 entries, ZIP data descriptors, archive comments, ambiguous/encoded paths and XML DTDs are
 * intentionally unsupported. Legitimate documents outside these limits fail closed.
 *
 * Reads <=10 MiB input; processes entries sequentially with actual streamed byte,
 * CRC, expansion, XML depth/element and deadline checks. The 5s deadline is
 * cooperative for JS parsing and aborts active streams; not a worker CPU sandbox.
 * No extraction, nested decompression, network, provider or database operations.
 * This is NOT full OOXML XSD validation or malware scanning. Callers retain their
 * existing authentication, multipart size bounds, quota and storage authorization.
 * saxes 6.0.0 is pinned; its upstream repository is archived (dependency upkeep).
 * Runtime: node:zlib crc32 requires Node >=22.2 (or >=20.15); repository >=22.13,
 * CI 22.13 and netlify.toml NODE_VERSION=22 satisfy this. Hosted runtime overrides
 * have not been inspected. Primary references reviewed before installation:
 * https://github.com/thejoshwolfe/yauzl/blob/master/README.md
 * https://github.com/lddubeau/saxes/tree/v6.0.0
 * https://nodejs.org/api/zlib.html#zlibcrc32data-value
 */
export async function validatePrivateProfessionalOfficeFile(file: File): Promise<string | null> {
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_PROFESSIONAL_OFFICE_FILE_BYTES) {
    return "El archivo debe contener datos y no superar 10 MiB.";
  }
  const name = file.name;
  if (!name || name.length > 200 || name !== name.trim() || /[\x00-\x1f\x7f/\\:]/.test(name)) return "Nombre de archivo no válido.";
  const dot = name.lastIndexOf(".");
  const extension = name.slice(dot + 1).toLowerCase();
  if (dot <= 0 || !((extension === "doc" && file.type === "application/msword") ||
      (extension === "docx" && file.type === DOCX_MIME))) return "El nombre y formato del archivo no coinciden.";
  if (extension === "doc") return PROFESSIONAL_DOC_UNSUPPORTED;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROFESSIONAL_DOCX_LIMITS.milliseconds);
  const context: Context = { total: 0, elements: 0, deadline: performance.now() + PROFESSIONAL_DOCX_LIMITS.milliseconds,
    signal: controller.signal, defaults: new Map(), overrides: new Map() };
  let zip: ZipFile | undefined;
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    requireFormat(bytes.length === file.size);
    checkTime(context);
    zip = await zipReader.fromBufferPromise(bytes, { strictFileNames: true, validateEntrySizes: true });
    const parts = await entries(zip, context);
    const contentTypes = parts.get(CT);
    requireFormat(contentTypes && parts.has(ROOT_RELS));
    await readPart(zip, contentTypes, true, context);
    for (const part of context.overrides.keys()) requireFormat(parts.has(part) && !part.endsWith("/"));
    const summaries = new Map<string, XmlSummary>();
    const types = new Map<string, string>();
    for (const [part, entry] of parts) {
      if (part === CT) continue;
      if (part.endsWith("/")) { await readPart(zip, entry, false, context); continue; }
      const type = context.overrides.get(part) ?? context.defaults.get(part.split(".").pop()!.toLowerCase());
      requireFormat(type);
      types.set(part, type);
      if (part.endsWith(".rels")) requireFormat(type === REL_MIME);
      const xml = type.endsWith("+xml") || type === "application/xml" || type === "text/xml" || /\.(xml|rels)$/i.test(part);
      const summary = await readPart(zip, entry, xml, context);
      if (summary) summaries.set(part, summary);
    }
    const root = summaries.get(ROOT_RELS);
    requireFormat(root);
    const mainRelations = root.relationships.filter(({ type }) => OFFICE_REL.has(type));
    requireFormat(mainRelations.length === 1 && !mainRelations[0].external);
    const main = relationshipTarget("", mainRelations[0].target);
    requireFormat(types.get(main) === MAIN_MIME && [...types.values()].filter((type) => type === MAIN_MIME).length === 1);
    const document = summaries.get(main);
    requireFormat(document && document.rootName === "document" && WORD_NS.has(document.rootNamespace) && document.bodies === 1);
    for (const [part, summary] of summaries) {
      if (!part.endsWith(".rels")) continue;
      const match = /^(.*\/)?_rels\/([^/]+)\.rels$/.exec(part);
      requireFormat(part === ROOT_RELS || match);
      const source = part === ROOT_RELS ? "" : `${match![1] ?? ""}${match![2]}`;
      if (source) requireFormat(parts.has(source));
      for (const relation of summary.relationships) {
        // External hyperlinks are valid document data, never dereferenced here.
        if (relation.external) continue;
        const target = relationshipTarget(source, relation.target);
        requireFormat(parts.has(target) && !target.endsWith("/") && target !== CT);
      }
    }
    checkTime(context);
    return null;
  } catch (error) {
    return error instanceof LimitError || controller.signal.aborted ? PROFESSIONAL_DOCX_LIMIT_EXCEEDED : INVALID_PROFESSIONAL_DOCX;
  } finally {
    clearTimeout(timer);
    zip?.close();
  }
}
