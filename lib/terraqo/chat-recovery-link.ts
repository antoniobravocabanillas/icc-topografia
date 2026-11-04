export const chatRecoveryPrefix = "#terraqo-chat=";
export type ChatRecovery = { v: 1; id: string; token: string };
function validate(value: unknown): ChatRecovery {
  const v = value as Partial<ChatRecovery> | null;
  if (!v || v.v !== 1 || typeof v.id !== "string" || !/^visitor2_[A-Za-z0-9_-]{1,151}$/.test(v.id) || typeof v.token !== "string" || !/^[A-Za-z0-9_.-]{1,1600}$/.test(v.token)) throw new Error("El enlace privado no es válido.");
  return { v: 1, id: v.id, token: v.token };
}
/** The fragment is never sent in an HTTP request. Never log the returned URL. */
export function createChatRecoveryLink(id: string, token: string, base: string) {
  const value = validate({ v: 1, id, token });
  const url = new URL(base); url.search = ""; url.hash = chatRecoveryPrefix + value.id + "." + value.token;
  return url.toString();
}
export function parseChatRecovery(input: string, origin: string): ChatRecovery {
  const text = input.trim();
  if (!text || text.length > 4000) throw new Error("Revisa el enlace privado.");
  try {
    // Existing copied JSON remains valid during the transition.
    if (text.startsWith("{")) return validate(JSON.parse(text));
    const url = new URL(text, origin);
    if (url.origin !== origin || !url.hash.startsWith(chatRecoveryPrefix)) throw new Error();
    const payload = decodeURIComponent(url.hash.slice(chatRecoveryPrefix.length));
    const separator = payload.indexOf(".");
    return validate({ v: 1, id: payload.slice(0, separator), token: payload.slice(separator + 1) });
  } catch { throw new Error("El enlace no es válido para este sitio. Ábrelo en el sitio donde se creó."); }
}
