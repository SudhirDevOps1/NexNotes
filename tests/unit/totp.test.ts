import { describe, expect, it } from "vitest";
import {
  base32Decode,
  generateBackupCodes,
  generateBase32Secret,
  hotp,
  isValidBackupCodeFormat,
  normalizeBackupCode,
  otpauthUri,
  verifyTotp,
} from "@/lib/totp";

/**
 * Checked against the official RFC vectors — these are the same test values
 * every TOTP library (Google Authenticator, Authy, otplib…) validates with,
 * so any regression here breaks real authenticator apps, not just tests.
 */

// RFC 4226 Appendix D — HOTP, secret "12345678901234567890", 6 digits
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const HOTP_VECTORS = [
  755224, 287082, 359152, 969429, 338314, 254676, 287922, 162583, 399871, 520489,
];

// RFC 6238 Appendix B — TOTP, SHA-1, 8 digits (counter = T / 30)
const TOTP_VECTORS: Array<[number, string]> = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
  [20000000000, "65353130"],
];

describe("TOTP (RFC 6238)", () => {
  it("matches every RFC 4226 HOTP vector", () => {
    const secret = base32Decode(RFC_SECRET);
    HOTP_VECTORS.forEach((expected, counter) => {
      expect(hotp(secret, counter)).toBe(String(expected));
    });
  });

  it("matches every RFC 6238 SHA-1 vector (8 digits)", () => {
    const secret = base32Decode(RFC_SECRET);
    for (const [tSeconds, expected] of TOTP_VECTORS) {
      expect(hotp(secret, Math.floor(tSeconds / 30), 8)).toBe(expected);
    }
  });

  it("verifies the current window and tolerates ±1 step drift", () => {
    const t = 59_000; // RFC vector window
    const current = hotp(base32Decode(RFC_SECRET), Math.floor(t / 1000 / 30));
    expect(verifyTotp(RFC_SECRET, current, t)).toBe(true);
    expect(verifyTotp(RFC_SECRET, current, t + 25_000)).toBe(true); // next step
    expect(verifyTotp(RFC_SECRET, current, t - 25_000)).toBe(true); // previous step
    expect(verifyTotp(RFC_SECRET, current, t + 91_000)).toBe(false); // too far
  });

  it("rejects malformed codes without throwing", () => {
    expect(verifyTotp(RFC_SECRET, "", 59_000)).toBe(false);
    expect(verifyTotp(RFC_SECRET, "12ab", 59_000)).toBe(false); // wrong length
    expect(verifyTotp(RFC_SECRET, "abcdef", 59_000)).toBe(false); // non-digits
  });
});

describe("base32 helpers", () => {
  it("round-trips generateBase32Secret → base32Decode", () => {
    for (let i = 0; i < 25; i++) {
      const secret = generateBase32Secret();
      expect(secret).toMatch(/^[A-Z2-7]+$/); // RFC 4648 alphabet, no padding
      expect(secret).toHaveLength(32); // 20 bytes → 32 chars
      expect(base32Decode(secret)).toHaveLength(20);
    }
  });

  it("ignores padding, spaces and lowercase input", () => {
    expect(base32Decode(RFC_SECRET.toLowerCase())).toEqual(base32Decode(RFC_SECRET));
    expect(base32Decode("GEZD GNBV=====")).toEqual(base32Decode("GEZDGNBV"));
  });
});

describe("backup codes", () => {
  it("formats, normalizes and validates 4-4 codes", () => {
    expect(normalizeBackupCode("  7k2m-9qx1 \n")).toBe("7K2M-9QX1");
    expect(isValidBackupCodeFormat("7K2M-9QX1")).toBe(true);
    expect(isValidBackupCodeFormat("7k2m-9qx1")).toBe(true); // case-insensitive
    expect(isValidBackupCodeFormat("7K2M9QX1")).toBe(false); // dash required
    expect(isValidBackupCodeFormat("7K2M-9QX")).toBe(false); // must be 4-4
    expect(isValidBackupCodeFormat("nope")).toBe(false);
  });

  it("generates the documented number of unique codes", () => {
    const codes = new Set([...generateBackupCodes(), ...generateBackupCodes()]);
    expect(codes.size).toBe(16);
    for (const code of codes) expect(isValidBackupCodeFormat(code)).toBe(true);
  });
});

describe("otpauth URI", () => {
  it("carries the params authenticator apps need", () => {
    const uri = otpauthUri("JBSWY3DPEHPK3PXP", "demo@nexnotes.app");
    expect(uri).toBe(
      "otpauth://totp/NexNotes%3Ademo%40nexnotes.app?secret=JBSWY3DPEHPK3PXP&issuer=NexNotes&algorithm=SHA1&digits=6&period=30"
    );
  });
});
