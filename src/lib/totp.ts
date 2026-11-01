import crypto from "node:crypto";

/**
 * NexNotes v2.0 — server-side TOTP (RFC 6238) for account two-factor auth.
 *
 * - Secrets are base32 (RFC 4648, no padding), 20 random bytes by default.
 * - 30-second step, 6 digits, SHA-1 HMAC (compatible with Google Authenticator,
 *   Authy, 1Password, Aegis, etc.).
 * - Verification accepts the previous/current/next step (±1) to tolerate clock drift.
 * - Backup codes: 8 single-use codes, stored only as bcrypt hashes (never plaintext).
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateBase32Secret(bytes = 20): string {
  const buf = crypto.randomBytes(bytes);
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s-]/g, "").replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter % 2 ** 32, 4);
  const hmac = crypto.createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (code % 10 ** digits).toString().padStart(digits, "0");
}

export function totpNow(base32Secret: string, atMs = Date.now(), step = 30): string {
  return hotp(base32Decode(base32Secret), Math.floor(atMs / 1000 / step));
}

/** Verify with ±1 step drift. Returns true for the current or adjacent window. */
export function verifyTotp(base32Secret: string, code: string, atMs = Date.now(), step = 30): boolean {
  const clean = (code || "").replace(/\D/g, "");
  if (clean.length !== 6) return false;
  const counter = Math.floor(atMs / 1000 / step);
  const secret = base32Decode(base32Secret);
  for (const drift of [-1, 0, 1]) {
    if (hotp(secret, counter + drift) === clean) return true;
  }
  return false;
}

export function otpauthUri(secret: string, email: string, issuer = "NexNotes"): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** 8 backup codes like `7K2M-9QX1`. Plaintext returned once; caller stores bcrypt hashes. */
export function generateBackupCodes(count = 8): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const a = crypto.randomBytes(2).toString("hex").toUpperCase().slice(0, 4);
    const b = crypto.randomBytes(2).toString("hex").toUpperCase().slice(0, 4);
    out.push(`${a}-${b}`);
  }
  return out;
}

export function normalizeBackupCode(code: string): string {
  return (code || "").trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidBackupCodeFormat(code: string): boolean {
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalizeBackupCode(code));
}
