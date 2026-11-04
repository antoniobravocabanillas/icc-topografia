/** Next may normalize request.url to an internal hostname. Bind browser Origin to
 * the HTTP Host authority (which browser scripts cannot override), not forwarded headers. */
export function isSameOriginMutation(request: Request) {
  try {
    const value = request.headers.get("origin");
    if (!value) return false;
    const origin = new URL(value);
    if (origin.origin !== value || !["http:", "https:"].includes(origin.protocol)) return false;
    const internal = new URL(request.url);
    const authority = request.headers.get("host") || internal.host;
    if (!authority || /[\s,/@\\?#]/.test(authority)) return false;
    const expected = new URL(`${internal.protocol}//${authority}`);
    return origin.origin === expected.origin;
  } catch { return false; }
}
