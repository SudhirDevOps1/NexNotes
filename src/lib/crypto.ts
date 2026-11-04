/**
 * End-to-end encryption (WebCrypto).
 *
 * Account key:  PBKDF2-SHA256, 150 000 iterations, salt = user email.
 * Note key:     PBKDF2-SHA256, 150 000 iterations, salt = note id (per-note passwords).
 * Cipher:       AES-256-GCM, 12-byte random IV per payload.
 * Formats:      nxenc:v1:<iv>:<ct>  (account E2E)
 *               nxlock:v1:<iv>:<ct> (note-password protection)
 */

export const PREFIX = "nxenc:v1:";
export const LOCK_PREFIX = "nxlock:v1:";
const ITERATIONS = 150_000;

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function deriveKey(email: string, password: string): Promise<CryptoKey> {
  return deriveKeyFrom(password, `nexnotes:${email}`);
}

/** Per-note protection key — derived from the note password + note id. */
export async function deriveNoteKey(noteId: string, password: string): Promise<CryptoKey> {
  return deriveKeyFrom(password, `nexnotes:note:${noteId}`);
}

async function deriveKeyFrom(password: string, salt: string): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(salt),
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export function isEncrypted(text: string): boolean {
  return typeof text === "string" && (text.startsWith(PREFIX) || text.startsWith(LOCK_PREFIX));
}

export function isLockEncrypted(text: string): boolean {
  return typeof text === "string" && text.startsWith(LOCK_PREFIX);
}

async function encryptWithPrefix(key: CryptoKey, text: string, prefix: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(text)
  );
  return `${prefix}${b64(iv)}:${b64(ct)}`;
}

export async function encryptText(key: CryptoKey, text: string): Promise<string> {
  return encryptWithPrefix(key, text, PREFIX);
}

/** Encrypt with the per-note key (password protection). */
export async function encryptNoteText(noteKey: CryptoKey, text: string): Promise<string> {
  return encryptWithPrefix(noteKey, text, LOCK_PREFIX);
}

export async function decryptText(key: CryptoKey, payload: string): Promise<string> {
  if (!payload.startsWith(PREFIX) && !payload.startsWith(LOCK_PREFIX)) return payload;
  const [, , ivB64, ctB64] = payload.split(":");
  if (!ivB64 || !ctB64) throw new Error("Malformed encrypted payload");
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(ivB64) as unknown as BufferSource },
    key,
    unb64(ctB64) as unknown as BufferSource
  );
  return new TextDecoder().decode(pt);
}

/** SHA-256 hex digest — used as the note-password verifier (lockHash). */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ---- session key caches (survive reload within the tab session) ---- */

const keyCache = new Map<string, CryptoKey>();
const noteKeyCache = new Map<string, CryptoKey>(); // noteId -> key (this session only)

export function cacheKey(userId: string, key: CryptoKey) {
  keyCache.set(userId, key);
}

export function getCachedKey(userId: string): CryptoKey | null {
  return keyCache.get(userId) ?? null;
}

export function dropCachedKey(userId: string) {
  keyCache.delete(userId);
}

export async function serializeKey(userId: string, key: CryptoKey): Promise<void> {
  try {
    const raw = await crypto.subtle.exportKey("raw", key);
    sessionStorage.setItem(`nx_key_${userId}`, b64(raw));
  } catch {
    /* non-exportable — ignore */
  }
}

export async function restoreKey(userId: string): Promise<CryptoKey | null> {
  const cached = keyCache.get(userId);
  if (cached) return cached;
  try {
    const stored = sessionStorage.getItem(`nx_key_${userId}`);
    if (!stored) return null;
    const key = await crypto.subtle.importKey(
      "raw",
      unb64(stored) as unknown as BufferSource,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
    keyCache.set(userId, key);
    return key;
  } catch {
    return null;
  }
}

export function clearStoredKey(userId: string) {
  keyCache.delete(userId);
  try {
    sessionStorage.removeItem(`nx_key_${userId}`);
  } catch {
    /* no sessionStorage (tests / exotic embeds) — nothing to clear */
  }
}

/* ---- per-note unlock session cache ---- */

export function cacheNoteKey(noteId: string, key: CryptoKey) {
  noteKeyCache.set(noteId, key);
}

export function getCachedNoteKey(noteId: string): CryptoKey | null {
  return noteKeyCache.get(noteId) ?? null;
}

export function dropCachedNoteKey(noteId: string) {
  noteKeyCache.delete(noteId);
}

export function dropAllNoteKeys() {
  noteKeyCache.clear();
}
