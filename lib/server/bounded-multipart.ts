const CRLF = Buffer.from("\r\n");
const HEADER_END = Buffer.from("\r\n\r\n");

function multipartBoundary(contentType: string) {
  if (contentType.length > 8192) throw new Error("Invalid multipart boundary");
  const mediaType = /^multipart\/form-data[\t ]*/i.exec(contentType);
  if (!mediaType) throw new Error("Invalid multipart boundary");
  const parameter = /;[\t ]*([!#$%&'*+.^_`|~0-9a-z-]+)[\t ]*=[\t ]*(?:"((?:[^"\\\r\n]|\\[\t\x20-\x7e])*)"|([!#$%&'*+.^_`|~0-9a-z-]+))[\t ]*/iy;
  let offset = mediaType[0].length;
  let boundary: string | undefined;
  let count = 0;
  while (offset < contentType.length) {
    parameter.lastIndex = offset;
    const part = parameter.exec(contentType);
    if (!part || ++count > 32) throw new Error("Invalid multipart parameters");
    if (part[1].toLowerCase() === "boundary") {
      if (boundary !== undefined) throw new Error("Duplicate multipart boundary");
      boundary = part[2] === undefined ? part[3] : part[2].replace(/\\(.)/g, "$1");
    }
    offset = parameter.lastIndex;
  }
  if (!boundary || !/^[0-9A-Za-z'()+_,.\/:=? -]{1,70}$/.test(boundary) || boundary.endsWith(" "))
    throw new Error("Invalid multipart boundary");
  return boundary;
}

/** Preflight bounded bytes before FormData allocates one object per part. */
export function assertMultipartPartLimits(
  bytes: Uint8Array,
  contentType: string,
  maxParts: number,
  maxHeaderBytes = 8192,
) {
  if (!Number.isSafeInteger(maxParts) || maxParts < 1 ||
      !Number.isSafeInteger(maxHeaderBytes) || maxHeaderBytes < 1)
    throw new TypeError("Multipart limits must be positive safe integers");
  // Parse MIME parameters without choosing between duplicate boundary values.
  const boundary = multipartBoundary(contentType);
  const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const first = Buffer.from(`--${boundary}`);
  const delimiter = Buffer.from(`\r\n--${boundary}`);
  let opening = data.indexOf(first);
  while (opening >= 0) {
    const suffix = opening + first.length;
    const atLineStart = opening === 0 || (data[opening - 2] === 13 && data[opening - 1] === 10);
    if (atLineStart && ((data[suffix] === 13 && data[suffix + 1] === 10) ||
        (data[suffix] === 45 && data[suffix + 1] === 45))) break;
    opening = data.indexOf(first, suffix);
  }
  if (opening < 0) throw new Error("Invalid multipart opening");
  let offset = opening + first.length;
  let parts = 0;
  while (true) {
    if (data[offset] === 45 && data[offset + 1] === 45) {
      const tail = data.subarray(offset + 2);
      if (tail.length && !tail.subarray(0, CRLF.length).equals(CRLF)) throw new Error("Invalid multipart ending");
      return parts;
    }
    if (data[offset] !== 13 || data[offset + 1] !== 10) throw new Error("Invalid multipart delimiter");
    if (++parts > maxParts) throw new Error("Too many multipart parts");
    const headerStart = offset + 2;
    const headerLength = data.subarray(headerStart, headerStart + maxHeaderBytes + HEADER_END.length).indexOf(HEADER_END);
    if (headerLength < 0 || headerLength > maxHeaderBytes) throw new Error("Multipart headers exceed limit");
    let next = data.indexOf(delimiter, headerStart + headerLength + HEADER_END.length);
    // Boundary-like binary data is not a delimiter unless its suffix is valid.
    while (next >= 0) {
      const suffix = next + delimiter.length;
      if ((data[suffix] === 13 && data[suffix + 1] === 10) ||
          (data[suffix] === 45 && data[suffix + 1] === 45)) break;
      next = data.indexOf(delimiter, suffix);
    }
    if (next < 0) throw new Error("Missing multipart closing delimiter");
    offset = next + delimiter.length;
  }
}
