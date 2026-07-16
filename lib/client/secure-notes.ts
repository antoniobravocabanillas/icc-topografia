type SecureNotePayload = {
  version: 1;
  algorithm: "AES-GCM";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const iterations = 310_000;

function toBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function deriveKey(passphrase: string, salt: Uint8Array, keyUsages: KeyUsage[]) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    keyUsages
  );
}

export async function encryptSecureNote(passphrase: string, note: { title: string; body: string }) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(note)));
  return JSON.stringify({
    version: 1,
    algorithm: "AES-GCM",
    iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext))
  } satisfies SecureNotePayload);
}

export async function decryptSecureNote(passphrase: string, value: string) {
  const payload = JSON.parse(value) as SecureNotePayload;
  if (payload.version !== 1 || payload.algorithm !== "AES-GCM" || payload.iterations !== iterations) throw new Error("Formato de cifrado no compatible.");
  const salt = fromBase64(payload.salt);
  const iv = fromBase64(payload.iv);
  const key = await deriveKey(passphrase, salt, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, fromBase64(payload.ciphertext));
  return JSON.parse(decoder.decode(plaintext)) as { title: string; body: string };
}
