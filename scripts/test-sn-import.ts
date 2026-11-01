/** Quick unit test for the Standard Notes backup parser (run with bun). */
import { parseStandardNotesBackup, looksLikeNexNotesBackup } from "../src/lib/sn-import";

// 1. decrypted .txt backup (one JSON per line, # comments)
const txt = `##
# Provisioning or backup text file
# Exported from Standard Notes on 2026.
#
# Types of items exported:
# - Notes
# - Tags
{"uuid":"aaa-1","content_type":"Note","content":{"title":"My first SN note","text":"Hello from Standard Notes.\\n\\nLine two.","references":[{"uuid":"tag-1","content_type":"Tag"}]},"created_at":"2025-01-01T10:00:00.000Z","updated_at":"2025-06-01T10:00:00.000Z"}
{"uuid":"aaa-2","content_type":"Note","content":{"title":"Second note","text":"body","references":[]},"created_at":"2025-02-01T10:00:00.000Z","updated_at":"2025-06-02T10:00:00.000Z"}
{"uuid":"tag-1","content_type":"Tag","content":{"title":"work","references":[]},"created_at":"2025-01-01T10:00:00.000Z","updated_at":"2025-01-01T10:00:00.000Z"}
{"uuid":"cmp-1","content_type":"Component","content":{"area":"editor"},"created_at":"2025-01-01T10:00:00.000Z","updated_at":"2025-01-01T10:00:00.000Z"}`;

const r1 = parseStandardNotesBackup(txt);
console.log("TXT backup:", JSON.stringify({ notes: r1.notes.length, tags: r1.notes.map((n) => n.tagNames), skipped: r1.skippedOther }, null, 1));
if (r1.notes.length !== 2 || r1.notes[0].tagNames[0] !== "work" || !r1.notes[0].content.includes("Line two")) {
  throw new Error("TXT parse failed");
}

// 2. decrypted .json backup
const json = JSON.stringify({
  items: [
    { uuid: "b-1", content_type: "Note", content: { title: "JSON note", text: "from json", references: [] }, created_at: "2025-03-01T00:00:00Z", updated_at: "2025-03-01T00:00:00Z" },
    { uuid: "tag-9", content_type: "Tag", content: { title: "life", references: [] } },
  ],
});
const r2 = parseStandardNotesBackup(json);
console.log("JSON backup:", r2.notes.length, r2.notes[0]?.title);
if (r2.notes.length !== 1 || r2.notes[0].title !== "JSON note") throw new Error("JSON parse failed");

// 3. ENCRYPTED backup (content is opaque string) → must report skipped, zero notes
const enc = JSON.stringify({
  items: [
    { uuid: "e-1", content_type: "Note", content: "000wcEncryptedOpaquePayload", created_at: "2025-03-01T00:00:00Z", updated_at: "2025-03-01T00:00:00Z" },
    { uuid: "e-2", content_type: "Tag", content: "000wcEncryptedTag", created_at: "2025-03-01T00:00:00Z", updated_at: "2025-03-01T00:00:00Z" },
  ],
});
const r3 = parseStandardNotesBackup(enc);
console.log("Encrypted backup:", r3.notes.length, "notes,", r3.skippedEncrypted, "skipped");
if (r3.notes.length !== 0 || r3.skippedEncrypted !== 2) throw new Error("Encrypted parse failed");

// 4. duplicate uuids de-duplicated
const dup = `{"uuid":"d-1","content_type":"Note","content":{"title":"A","text":"1","references":[]}}
{"uuid":"d-1","content_type":"Note","content":{"title":"A","text":"1","references":[]}}`;
const r4 = parseStandardNotesBackup(dup);
if (r4.notes.length !== 1) throw new Error("Dedupe failed");

// 5. NexNotes backup detector
if (!looksLikeNexNotesBackup(JSON.stringify({ app: "nexnotes", notes: [] }))) throw new Error("NN detector failed");
if (looksLikeNexNotesBackup(json)) throw new Error("NN detector false positive");

console.log("✅ All SN-import parser tests passed");
