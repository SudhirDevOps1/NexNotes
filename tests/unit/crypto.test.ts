import { describe, expect, it } from "vitest";
import {
  deriveKey,
  deriveNoteKey,
  encryptNoteText,
  encryptText,
  decryptText,
  isEncrypted,
  sha256Hex,
  PREFIX,
  LOCK_PREFIX,
} from "@/lib/crypto";

/**
 * The E2E model is: the server must never see plaintext. These tests pin the
 * wire format (nxenc/nxlock v1) and prove the AES-GCM round-trip — including
 * that a key derived from the *wrong* password cannot decrypt anything.
 */

const GOOD = "correct horse battery staple";

describe("sha256Hex", () => {
  it("matches known digests", async () => {
    expect(await sha256Hex("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    );
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });
});

describe("account E2E (nxenc:v1)", () => {
  it("encrypts and decrypts back to the original text", async () => {
    const key = await deriveKey("demo@nexnotes.app", GOOD);
    const payload = await encryptText(key, "Top secret meeting notes 🔒");
    expect(payload.startsWith(PREFIX)).toBe(true);
    expect(isEncrypted(payload)).toBe(true);
    expect(payload).not.toContain("secret"); // ciphertext only
    expect(await decryptText(key, payload)).toBe("Top secret meeting notes 🔒");
  });

  it("produces a fresh IV per call (no repeated ciphertext)", async () => {
    const key = await deriveKey("demo@nexnotes.app", GOOD);
    const a = await encryptText(key, "same input");
    const b = await encryptText(key, "same input");
    expect(a).not.toBe(b);
  });

  it("cannot be decrypted with a different password", async () => {
    const key = await deriveKey("demo@nexnotes.app", GOOD);
    const other = await deriveKey("demo@nexnotes.app", "wrong password");
    const payload = await encryptText(key, "classified");
    await expect(decryptText(other, payload)).rejects.toThrow();
  });

  it("binds the key to the account email (different salt)", async () => {
    const keyA = await deriveKey("alice@nexnotes.app", GOOD);
    const keyB = await deriveKey("bob@nexnotes.app", GOOD);
    const payload = await encryptText(keyA, "for alice only");
    await expect(decryptText(keyB, payload)).rejects.toThrow();
  });
});

describe("per-note protection (nxlock:v1)", () => {
  it("round-trips a note locked with its own password", async () => {
    const noteKey = await deriveNoteKey("note_123", "demo123");
    const payload = await encryptNoteText(noteKey, "private journal entry");
    expect(payload.startsWith(LOCK_PREFIX)).toBe(true);
    expect(await decryptText(noteKey, payload)).toBe("private journal entry");
  });

  it("keys are scoped per note id", async () => {
    const k1 = await deriveNoteKey("note_123", "demo123");
    const k2 = await deriveNoteKey("note_999", "demo123");
    const payload = await encryptNoteText(k1, "locked");
    await expect(decryptText(k2, payload)).rejects.toThrow();
  });
});
