// Call only after the route has authorized this exact media row and worklog.
export function worklogMediaResponse(entry: { data: ArrayBuffer; etag?: string },
  media: { contentType: string; fileName: string }, request?: Request) {
  const { data } = entry;
  const size = data.byteLength;
  const download = request && new URL(request.url).searchParams.get("download") === "1";
  const name = media.fileName.replace(/[^A-Za-z0-9._ -]/g, "-");
  const headers = new Headers({
    "Content-Type": media.contentType, "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
    "Cache-Control": "private, no-store, no-transform", "X-Content-Type-Options": "nosniff",
    "Content-Length": String(size), "Accept-Ranges": "bytes",
  });
  if (entry.etag) headers.set("ETag", entry.etag);
  const range = request?.headers.get("range");
  const ifRange = request?.headers.get("if-range");
  if (!range || (ifRange && ifRange !== entry.etag)) return new Response(data, { headers });
  const parts = /^bytes=(\d*)-(\d*)$/i.exec(range);
  const start = parts?.[1] ? Number(parts[1]) : Math.max(0, size - Number(parts?.[2]));
  const end = parts?.[1] && parts[2] ? Math.min(size - 1, Number(parts[2])) : size - 1;
  if (!parts || !(parts[1] || parts[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
      start > end || start >= size) {
    headers.set("Content-Range", `bytes */${size}`);
    headers.set("Content-Length", "0");
    return new Response(null, { status: 416, headers });
  }
  headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  headers.set("Content-Length", String(end - start + 1));
  return new Response(data.slice(start, end + 1), { status: 206, headers });
}
