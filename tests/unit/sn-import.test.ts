import { describe, expect, it } from "vitest";
import { NOTE_TEMPLATES } from "@/lib/templates";
import { parseStandardNotesBackup, looksLikeNexNotesBackup } from "@/lib/sn-import";

describe("note templates", () => {
  it("ships every documented template with sane content", () => {
    const ids = NOTE_TEMPLATES.map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining(["daily", "meeting"]));
    expect(new Set(ids).size).toBe(ids.length); // ids are unique — menu keyed by id

    for (const t of NOTE_TEMPLATES) {
      expect(t.label.trim()).toBeTruthy();
      expect(t.hint.trim()).toBeTruthy();
      expect(t.md.startsWith("# ")).toBe(true); // every template opens with a title
      expect(t.md.length).toBeGreaterThan(40);
    }
  });
});

describe("Standard Notes import", () => {
  it("parses a decrypted JSON backup: notes, tags, dedup, skips", () => {
    const backup = JSON.stringify({
      items: [
        {
          uuid: "11111111-1111-1111-1111-111111111111",
          content_type: "Note",
          content: { title: "First note", text: "hello from SN", references: [] },
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-02T00:00:00Z",
        },
        // duplicate uuid — exports repeat items across revisions, keep first only
        {
          uuid: "11111111-1111-1111-1111-111111111111",
          content_type: "Note",
          content: { title: "First note (old)", text: "old revision" },
        },
        {
          uuid: "22222222-2222-2222-2222-222222222222",
          content_type: "Tag",
          content: { title: "work", references: [] },
        },
        {
          uuid: "33333333-3333-3333-3333-333333333333",
          content_type: "Note",
          content: "004:YTEyMzQ1Njc4OWFiY2RlZg==", // encrypted payload — skip
        },
        {
          uuid: "44444444-4444-4444-4444-444444444444",
          content_type: "Extension", // unknown to us — skip
          content: { foo: "bar" },
        },
      ],
    });

    const result = parseStandardNotesBackup(backup);
    expect(result.notes).toHaveLength(1);
    expect(result.totalItems).toBe(5);
    expect(result.skippedEncrypted).toBe(1);
    expect(result.skippedOther).toBe(1);
    expect(result.notes[0].title).toBe("First note");
    expect(result.notes[0].content).toBe("hello from SN");
    expect(result.notes[0].trashed).toBe(false);
  });

  it("respects deleted (trashed) notes and one-item-per-line .txt backups", () => {
    const txt = [
      "# Standard Notes Export", // header line — ignored
      JSON.stringify({
        uuid: "aaaa-1",
        content_type: "Note",
        deleted: true, // SN marks trashed items at the item level
        content: { title: "Trashed", text: "gone" },
      }),
      JSON.stringify({
        uuid: "aaaa-2",
        content_type: "Note",
        content: { title: "Kept", text: "stays" },
      }),
    ].join("\n");

    const result = parseStandardNotesBackup(txt);
    expect(result.notes).toHaveLength(2);
    const trashed = result.notes.find((n) => n.title === "Trashed");
    expect(trashed?.trashed).toBe(true);
  });

  it("flags NexNotes' own backup format for transparent import", () => {
    expect(
      looksLikeNexNotesBackup(JSON.stringify({ app: "nexnotes", notes: [{ title: "x" }] }))
    ).toBe(true);
    expect(looksLikeNexNotesBackup(JSON.stringify({ notes: [{ title: "x" }] }))).toBe(false);
    expect(looksLikeNexNotesBackup("just some text")).toBe(false);
  });
});
