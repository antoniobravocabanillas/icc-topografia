import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { crc32, deflateRawSync } from "node:zlib";
import { Readable } from "node:stream";
import {
  MAX_PROFESSIONAL_OFFICE_FILE_BYTES as MAX_INPUT,
  PROFESSIONAL_DOC_UNSUPPORTED,
  PROFESSIONAL_DOCX_LIMITS as LIMITS,
  PROFESSIONAL_DOCX_LIMIT_EXCEEDED as LIMIT_ERROR,
  validatePrivateProfessionalOfficeFile as validate,
} from "../lib/server/professional-office-file-validation";

const MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const OFFICE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";
const MAIN_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
const DOCUMENT = `<w:document xmlns:w="${WORD_NS}"><w:body><w:p><w:r><w:t>CV: José, topografía</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`;
const TYPES = `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="bin" ContentType="application/octet-stream"/><Override PartName="/word/document.xml" ContentType="${MAIN_MIME}"/></Types>`;
const RELS = `<Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${OFFICE_REL}" Target="word/document.xml"/></Relationships>`;

interface Part {
  name: string; data: string | Buffer; stored?: boolean; size?: number; flags?: number;
  checksum?: number; localName?: string; localFlags?: number; method?: number; attributes?: number;
  descriptor?: boolean; unsignedDescriptor?: boolean; brokenDescriptor?: boolean;
  packed?: Buffer;
}
// A tiny deterministic fixture WRITER, not the production parser. It deliberately
// emits only fixed classic ZIP records and can falsify fields for negative tests.
function archive(parts: Part[]): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const part of parts) {
    const data = Buffer.isBuffer(part.data) ? part.data : Buffer.from(part.data);
    const content = part.packed ?? (part.stored ? data : deflateRawSync(data));
    const name = Buffer.from(part.name);
    const localName = Buffer.from(part.localName ?? part.name);
    const size = part.size ?? data.length;
    const checksum = part.checksum ?? crc32(data);
    const flags = part.flags ?? (0x800 | (part.descriptor ? 8 : 0));
    const method = part.method ?? (part.stored ? 0 : 8);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(part.localFlags ?? flags, 6);
    header.writeUInt16LE(method, 8);
    if (!part.descriptor) {
      header.writeUInt32LE(checksum, 14);
      header.writeUInt32LE(content.length, 18);
      header.writeUInt32LE(size, 22);
    }
    header.writeUInt16LE(localName.length, 26);
    const descriptor = Buffer.alloc(part.descriptor ? (part.unsignedDescriptor ? 12 : 16) : 0);
    if (part.descriptor) {
      const at = part.unsignedDescriptor ? 0 : 4;
      if (at) descriptor.writeUInt32LE(0x08074b50);
      descriptor.writeUInt32LE(part.brokenDescriptor ? (checksum ^ 1) >>> 0 : checksum, at);
      descriptor.writeUInt32LE(content.length, at + 4);
      descriptor.writeUInt32LE(size, at + 8);
    }
    local.push(header, localName, content, descriptor);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(0x0314, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(flags, 8);
    directory.writeUInt16LE(method, 10);
    directory.writeUInt32LE(checksum, 16);
    directory.writeUInt32LE(content.length, 20);
    directory.writeUInt32LE(size, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(part.attributes ?? 0, 38);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, name);
    offset += header.length + localName.length + content.length + descriptor.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(parts.length, 8);
  end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(central.reduce((n, b) => n + b.length, 0), 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}
function documentParts(document = DOCUMENT, types = TYPES, rels = RELS): Part[] {
  return [{ name: "[Content_Types].xml", data: types }, { name: "_rels/.rels", data: rels },
    { name: "word/document.xml", data: document }];
}
function file(bytes: Buffer, name = "cv.docx", type = MIME): File { return new File([new Uint8Array(bytes)], name, { type }); }

/** Test-only, minimal valid DOCX for real upload/handler integration tests. */
export function createValidProfessionalDocxFixture(name = "cv.docx"): File {
  return file(archive(documentParts()), name);
}

/** Test-only genuine Microsoft Word fixture, with all its original package parts. */
export function createGenuineProfessionalDocxFixture(name = "word-cv.docx"): File {
  return file(Buffer.from(WORD_FIXTURE, "base64"), name);
}
let accepted = 0;
let rejected = 0;
async function accept(label: string, bytes: Buffer) {
  assert.equal(await validate(file(bytes)), null, label);
  accepted++;
}
async function reject(label: string, bytes: Buffer, expected?: string) {
  const result = await validate(file(bytes));
  assert.ok(result, label);
  if (expected) assert.equal(result, expected, label);
  rejected++;
}
function repeatedRandom(size: number): Buffer {
  const result = Buffer.alloc(size);
  const seed = randomBytes(16_384);
  for (let start = 0; start < size; start += seed.length) seed.copy(result, start, 0, Math.min(seed.length, size - start));
  return result;
}

// Genuine Word-generated fixture, embedded verbatim; no network during tests.
// Source: python-openxml/python-docx, tests/test_files/blk-inner-content.docx
// Commit e45454602b53e8e572b179ccf1c91093ec9f4ed7 (MIT project).
// https://github.com/python-openxml/python-docx/blob/e45454602b53e8e572b179ccf1c91093ec9f4ed7/tests/test_files/blk-inner-content.docx
// SHA-256: 16243dd05f686d6d5fab331843691492ad78ae3eb4f13cc8686077b44718c0ba
/* Fixture license: The MIT License (MIT)
Copyright (c) 2013 Steve Canny, https://github.com/scanny

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/
const WORD_FIXTURE = "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";

async function main() {
  const started = performance.now();
  const genuine = Buffer.from(WORD_FIXTURE, "base64");
  assert.equal(createHash("sha256").update(genuine).digest("hex"), "16243dd05f686d6d5fab331843691492ad78ae3eb4f13cc8686077b44718c0ba");
  await accept("genuine Word document with styles/theme/settings/properties", genuine);
  const valid = archive(documentParts());
  await accept("minimal deflated DOCX with Unicode text", valid);
  await accept("stored DOCX", archive(documentParts().map((part) => ({ ...part, stored: true }))));
  await reject("signed data descriptors explicitly unsupported", archive(documentParts().map((part) => ({ ...part, descriptor: true }))));
  await reject("unsigned data descriptors explicitly unsupported", archive(documentParts().map((part) => ({ ...part, descriptor: true, unsignedDescriptor: true }))));
  await accept("strict Word namespace and relationship", archive(documentParts(
    DOCUMENT.replaceAll(WORD_NS, "http://purl.oclc.org/ooxml/wordprocessingml/main"), TYPES,
    RELS.replace(OFFICE_REL, "http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument"))));
  await accept("default namespace Word document", archive(documentParts(DOCUMENT.replaceAll("w:", "").replace("xmlns:w=", "xmlns="))));
  await accept("directory entries", archive([...documentParts(), { name: "word/media/", data: "", stored: true }]));
  await accept("relative parent relationship and external hyperlink are never fetched", archive([
    ...documentParts(), { name: "docProps/core.xml", data: "<properties/>" },
    { name: "word/_rels/document.xml.rels", data: `<Relationships xmlns="${REL_NS}"><Relationship Id="props" Type="properties" Target="../docProps/core.xml"/><Relationship Id="link" Type="hyperlink" TargetMode="External" Target="https://example.invalid/never-fetch"/></Relationships>` },
  ]));
  await accept("uppercase filename", valid);
  assert.equal(await validate(file(valid, "CV.DOCX")), null);

  // Native File metadata failures must be decided before reading its payload.
  class NoRead extends File {
    static reads = 0;
    override arrayBuffer(): Promise<ArrayBuffer> { NoRead.reads++; throw new Error("Unexpected read"); }
  }
  for (const name of ["../cv.docx", "..\\cv.docx", "C:cv.docx", "cv\u0000.docx", ".docx", "x".repeat(201), "cv.docx "]) {
    assert.ok(await validate(new NoRead(["x"], name, { type: MIME })), name); rejected++;
  }
  for (const type of ["", "application/zip", "application/msword", MIME + "; charset=utf-8"]) {
    assert.ok(await validate(file(valid, "cv.docx", type))); rejected++;
  }
  assert.equal(await validate(new NoRead(["x"], "cv.doc", { type: "application/msword" })), PROFESSIONAL_DOC_UNSUPPORTED);
  rejected++;
  await reject("empty input", Buffer.alloc(0));
  assert.ok(await validate(new NoRead([new Uint8Array(MAX_INPUT + 1)], "cv.docx", { type: MIME })));
  assert.equal(NoRead.reads, 0, "Invalid metadata and unsupported DOC must not read payloads");
  rejected++;
  // Boundary is inclusive: a genuinely valid stored package of exactly 10 MiB.
  const padding: Part[] = [...documentParts(), { name: "word/media/a.bin", data: Buffer.alloc(5 * 1024 * 1024), stored: true },
    { name: "word/media/b.bin", data: Buffer.alloc(0), stored: true }];
  padding[4].data = Buffer.alloc(MAX_INPUT - archive(padding).length);
  const maxFile = archive(padding);
  assert.equal(maxFile.length, MAX_INPUT);
  await accept("exactly 10 MiB", maxFile);

  for (const path of ["../escape.bin", "/absolute.bin", "C:/escape.bin", "word\\escape.bin", "word/../escape.bin",
    "word/./escape.bin", "word//escape.bin", "word/%2e%2e/escape.bin", "word/evil\u0000.bin", "word/evil:.bin"]) {
    await reject(`archive traversal/ambiguous path ${path}`, archive([...documentParts(), { name: path, data: "x" }]));
  }
  await reject("duplicate essential part", archive([...documentParts(), documentParts()[2]]));
  await reject("case-fold duplicate", archive([...documentParts(), { name: "WORD/DOCUMENT.XML", data: DOCUMENT }]));
  await reject("file/directory collision", archive([...documentParts(), { name: "word", data: "x" }]));
  await reject("symlink entry", archive([...documentParts(), { name: "word/link.bin", data: "x", attributes: (0xa1ff << 16) >>> 0 }]));
  for (const flags of [1, 0x40, 0x2000]) {
    await reject(`encrypted/reserved flags ${flags}`, archive(documentParts().map((part) => ({ ...part, flags }))));
  }
  await reject("local encryption flag mismatch", archive(documentParts().map((part) => ({ ...part, localFlags: 0x801 }))));
  await reject("local filename mismatch", archive(documentParts().map((part) => ({ ...part, localName: "../unsafe.xml" }))));
  await reject("unsupported compression", archive(documentParts().map((part) => ({ ...part, method: 99 }))));
  await reject("broken descriptor", archive(documentParts().map((part) => ({ ...part, descriptor: true, brokenDescriptor: true }))));
  await reject("missing descriptor", archive(documentParts().map((part) => ({ ...part, flags: 0x808 }))));
  await reject("truncated end record", valid.subarray(0, valid.length - 1));
  await reject("truncated container", valid.subarray(0, Math.floor(valid.length / 2)));
  await reject("appended bytes", Buffer.concat([valid, Buffer.from("extra")]));
  await reject("CFB encrypted Office/non-Word container", Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  const badCentral = Buffer.from(valid);
  badCentral.writeUInt32LE(0xffffffff, badCentral.length - 6);
  await reject("out-of-bounds central directory", badCentral);
  for (const i of [0, 1, 2]) {
    const parts = documentParts(); parts[i].checksum = 42;
    await reject(`CRC mismatch essential part ${i}`, archive(parts));
  }
  await reject("corrupt unrelated binary checked too", archive([...documentParts(), { name: "word/media/unused.bin", data: "binary", checksum: 42 }]));
  await reject("understated actual deflate bytes", archive([...documentParts(), { name: "word/media/hidden.bin", data: repeatedRandom(1024 * 1024), size: 10 }]));
  await reject("overstated deflate bytes", archive([...documentParts(), { name: "word/media/hidden.bin", data: "small", size: 100 }]));
  await reject("stored size mismatch", archive([...documentParts(), { name: "word/media/hidden.bin", data: "small", size: 100, stored: true }]));
  await reject("malformed deflate stream", archive([...documentParts(), { name: "word/media/bad.bin", data: "small", packed: Buffer.from([0xff, 0xff, 0xff]) }]));
  await reject("truncated deflate stream", archive([...documentParts(), { name: "word/media/bad.bin", data: "small", packed: deflateRawSync(Buffer.from("small")).subarray(0, 2) }]));
  await reject("trailing bytes inside compressed entry", archive([...documentParts(), { name: "word/media/bad.bin", data: "small", packed: Buffer.concat([deflateRawSync(Buffer.from("small")), Buffer.from("extra")]) }]));

  for (const missing of ["[Content_Types].xml", "_rels/.rels", "word/document.xml"]) {
    await reject(`missing essential part ${missing}`, archive(documentParts().filter((p) => p.name !== missing)));
  }
  for (const [label, xml] of [
    ["truncated Word XML", DOCUMENT.slice(0, -6)], ["wrong Word namespace", DOCUMENT.replace(WORD_NS, "urn:not-word")],
    ["not a Word root", "<workbook><body/></workbook>"], ["missing body", `<w:document xmlns:w="${WORD_NS}"/>`],
    ["duplicate body", DOCUMENT.replace("</w:document>", "<w:body/></w:document>")],
    ["background after body", DOCUMENT.replace("</w:document>", "<w:background/></w:document>")],
    ["text outside body", DOCUMENT.replace("<w:body>", "invalid text<w:body>")],
    ["bare text inside body", DOCUMENT.replace("<w:body>", "<w:body>invalid text")],
    ["wrong body namespace", DOCUMENT.replace("<w:body>", '<x:body xmlns:x="urn:bad">').replace("</w:body>", "</x:body>")],
    ["duplicate attribute", DOCUMENT.replace("<w:body>", '<w:body x="1" x="2">')],
    ["unbound prefix", DOCUMENT.replace(` xmlns:w="${WORD_NS}"`, "")],
    ["unknown entity", DOCUMENT.replace("CV:", "&undefined;")],
    ["DTD", '<!DOCTYPE document [<!ENTITY payload "bad">]>' + DOCUMENT],
    ["external DTD", '<!DOCTYPE document SYSTEM "https://example.invalid/never-fetch">' + DOCUMENT],
    ["second XML root", DOCUMENT + "<extra/>"], ["unsupported XML encoding", '<?xml version="1.0" encoding="UTF-16"?>' + DOCUMENT],
  ]) await reject(label, archive(documentParts(xml)));
  const invalidUtf8 = documentParts(); invalidUtf8[2].data = Buffer.concat([Buffer.from(DOCUMENT), Buffer.from([0xff])]);
  await reject("invalid UTF-8", archive(invalidUtf8));
  for (const xml of [TYPES.slice(0, -5), TYPES.replace("content-types", "wrong-types"),
    TYPES.replace("</Types>", '<Default Extension="xml" ContentType="text/xml"/></Types>'),
    TYPES.replace(MAIN_MIME, "application/vnd.ms-word.document.macroEnabled.main+xml"),
    TYPES.replace("</Types>", '<Override PartName="/absent.xml" ContentType="text/xml"/></Types>'),
    TYPES.replace("</Types>", "unwanted text</Types>")]) {
    await reject("invalid content types", archive(documentParts(DOCUMENT, xml)));
  }
  for (const xml of [RELS.slice(0, -5), RELS.replace(REL_NS, "urn:not-opc"), RELS.replace("<Relationship Id", '<Relationship TargetMode="External" Id'),
    RELS.replace("word/document.xml", "../word/document.xml"), RELS.replace("word/document.xml", "absent.xml"),
    RELS.replace(OFFICE_REL, "urn:non-word"), RELS.replace("</Relationships>", `<Relationship Id="second" Type="${OFFICE_REL}" Target="word/document.xml"/></Relationships>`),
    RELS.replace("</Relationships>", '<Relationship Id="rId1" Type="other" Target="word/document.xml"/></Relationships>')]) {
    await reject("invalid package relationship", archive(documentParts(DOCUMENT, TYPES, xml)));
  }
  await reject("dangling internal relationship", archive([...documentParts(), { name: "word/_rels/document.xml.rels",
    data: `<Relationships xmlns="${REL_NS}"><Relationship Id="x" Type="image" Target="media/missing.bin"/></Relationships>` }]));
  await reject("malformed nonessential XML", archive([...documentParts(), { name: "word/styles.xml", data: "<bad>" }]));

  await reject("too many ZIP entries", archive([...documentParts(), ...Array.from({ length: LIMITS.entries }, (_, i) => ({ name: `word/media/${i}.bin`, data: "x" }))]), LIMIT_ERROR);
  await reject("declared oversized entry", archive([...documentParts(), { name: "word/media/large.bin", data: "x", size: LIMITS.entryBytes + 1 }]), LIMIT_ERROR);
  await reject("declared expansion bomb", archive([...documentParts(), { name: "word/media/bomb.bin", data: Buffer.alloc(1024 * 1024) }]), LIMIT_ERROR);
  await reject("total expanded bytes", archive([...documentParts(), ...Array.from({ length: 5 }, (_, i) => ({ name: `word/media/large${i}.bin`, data: repeatedRandom(7 * 1024 * 1024) }))]), LIMIT_ERROR);
  await reject("XML byte limit", archive(documentParts(DOCUMENT.replace("CV:", repeatedRandom(LIMITS.xmlBytes).toString("base64")))), LIMIT_ERROR);
  await reject("XML nesting bound", archive(documentParts(DOCUMENT.replace("<w:p>", "<w:p>" + "<w:r>".repeat(65)).replace("</w:p>", "</w:r>".repeat(65) + "</w:p>"))), LIMIT_ERROR);
  await reject("XML attribute bound", archive(documentParts(DOCUMENT.replace("<w:body>", `<w:body ${Array.from({ length: 129 }, (_, i) => `a${i}="x"`).join(" ")}>`))), LIMIT_ERROR);
  await reject("XML total element bound", archive(documentParts(DOCUMENT.replace("<w:body>", "<w:body>" + "<w:p/>".repeat(LIMITS.xmlElements))).map((part) => ({ ...part, stored: true }))), LIMIT_ERROR);
  await reject("XML attribute value bound", archive(documentParts(DOCUMENT.replace("<w:body>", `<w:body value="${"x".repeat(16_385)}">`)).map((part) => ({ ...part, stored: true }))), LIMIT_ERROR);
  // 64 MiB real compressed expansion, declared as 1 KiB: header limits pass.
  // The live inflater is stopped as soon as actual output contradicts that size.
  const hiddenBomb = archive([...documentParts(), { name: "word/media/hidden-bomb.bin", data: Buffer.alloc(64 * 1024 * 1024), size: 1024 }]);
  const bombStarted = performance.now();
  for (let i = 0; i < 8; i++) await reject("understated 64 MiB bomb", hiddenBomb);
  const bombMilliseconds = Math.round(performance.now() - bombStarted);
  assert.ok(bombMilliseconds < LIMITS.milliseconds, `Bomb rejection took ${bombMilliseconds}ms`);
  await accept("healthy validation after failures/cancellations", genuine);
  const concurrent = await Promise.all(Array.from({ length: 8 }, (_, i) => validate(file(i % 2 ? genuine : hiddenBomb))));
  assert.ok(concurrent.every((result, i) => i % 2 ? result === null : result !== null));
  // Fault injection only at the documented ZIP stream API. Real parsing still
  // runs, then a stalled source proves the deadline aborts/destroys active I/O.
  // No injectable dependency or bypass is exposed by the production validator.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Test-only public API fault injection, always restored.
  const reader = require("yauzl") as { fromBufferPromise: (...args: unknown[]) => Promise<{
    openReadStreamPromise: (...args: unknown[]) => Promise<Readable>;
  }> };
  const original = reader.fromBufferPromise;
  let stalled: Readable | undefined;
  reader.fromBufferPromise = async (...args: unknown[]) => {
    const zip = await original(...args);
    zip.openReadStreamPromise = async () => {
      stalled = new Readable({ read() { /* Intentionally never produces data. */ } });
      return stalled;
    };
    return zip;
  };
  try {
    await reject("deadline cancels stalled pipeline", genuine, LIMIT_ERROR);
    assert.equal(stalled?.destroyed, true);
  } finally { reader.fromBufferPromise = original; }
  assert.equal(await validate(createValidProfessionalDocxFixture()), null);
  assert.equal(await validate(createGenuineProfessionalDocxFixture()), null);
  console.log(`PASS Office validation on ${process.version}: ${accepted} valid DOCX fixtures, ${rejected} rejected fixtures; 8 mixed concurrent calls isolated.`);
  console.log(`Understated 64 MiB bomb x8: ${bombMilliseconds}ms; suite ${Math.round(performance.now() - started)}ms.`);
  console.log("DOC remains explicitly unsupported. DOCX checks are bounded format validation, not full XSD validation or malware scanning.");
}
// Importing fixture factories must not launch the suite or mutate any modules.
if (process.argv[1] && /(?:^|[\\/])test-professional-office-file-validation\.ts$/.test(process.argv[1])) {
  const watchdog = setTimeout(() => { console.error("FAIL Office validation suite did not finish"); process.exitCode = 1; }, 20_000);
  main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));
}
