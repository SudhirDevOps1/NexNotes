/**
 * Standard Notes backup importer — the "switch from Standard Notes" path.
 *
 * Parses the two official export formats of the Standard Notes web/desktop app:
 *
 * 1. Decrypted .txt backup ("SN-BACKUP-FILE"): comment lines start with "#",
 *    every item is one JSON object per line.
 *    Encrypted .txt backups mark each line with "** Encrypted Item **" and
 *    store opaque content — we count those as skipped.
 *
 * 2. Decrypted .json backup: { "items": [ { uuid, content_type, content, ... } ] }
 *    where content is either an object ({ title, text, references, ... }) for
 *    decrypted exports, or a string/array payload for encrypted ones.
 *
 * Content types we consume: Note (1) and Tag (2). Everything else (folders,
 * components, smart views…) is ignored. Returns clean NexNotes drafts.
 */

export interface SnNoteDraft {
  externalId: string;
  title: string;
  content: string;
  createdAt?: string;
  updatedAt?: string;
  tagNames: string[];
  trashed?: boolean;
  archived?: boolean;
}

export interface SnImportResult {
  notes: SnNoteDraft[];
  totalItems: number;
  skippedEncrypted: number;
  skippedOther: number;
}

interface SnItem {
  uuid?: string;
  content_type?: string | number;
  content?: unknown;
  created_at?: string;
  updated_at?: string;
  /** newer payloads keep deleted state here */
  deleted?: boolean;
}

const CT_NOTE = new Set(["Note", "1", 1]);
const CT_TAG = new Set(["Tag", "2", 2]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseSnItem(raw: unknown): { note?: SnNoteDraft; tag?: { id: string; name: string }; encrypted: boolean; known: boolean } {
  if (!isRecord(raw)) return { encrypted: false, known: false };
  const item = raw as SnItem;
  const ct = item.content_type;

  if (typeof item.content === "string") {
    // encrypted payload (opaque) — only meaningful if the type is known
    return { encrypted: CT_NOTE.has(ct as string | number) || CT_TAG.has(ct as string | number), known: true };
  }
  if (!isRecord(item.content)) return { encrypted: false, known: false };

  const content = item.content as Record<string, unknown>;
  const uuid = typeof item.uuid === "string" ? item.uuid : "";

  if (CT_TAG.has(ct as string | number)) {
    const name = typeof content.title === "string" ? content.title.trim() : "";
    if (name && uuid) return { tag: { id: uuid, name }, known: true, encrypted: false };
    return { known: true, encrypted: false };
  }

  if (CT_NOTE.has(ct as string | number)) {
    const title = typeof content.title === "string" ? content.title : "";
    const text = typeof content.text === "string" ? content.text : "";
    const tagNames: string[] = [];
    if (Array.isArray(content.references)) {
      for (const ref of content.references) {
        if (isRecord(ref) && (ref.content_type === "Tag" || ref.content_type === 2 || ref.content_type === "2") && typeof ref.uuid === "string") {
          tagNames.push(ref.uuid); // resolved to names by the caller via tag map
        }
      }
    }
    const note: SnNoteDraft = {
      externalId: uuid || `sn-${Math.random().toString(36).slice(2, 12)}`,
      title: title.slice(0, 500),
      content: text.slice(0, 2_000_000),
      createdAt: typeof item.created_at === "string" ? item.created_at : undefined,
      updatedAt: typeof item.updated_at === "string" ? item.updated_at : undefined,
      tagNames,
      trashed: item.deleted === true,
      archived: false,
    };
    return { note, known: true, encrypted: false };
  }

  return { known: false, encrypted: false };
}

function decodeLine(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

/** Extract SN item objects from a decrypted .txt backup (one JSON per line). */
function parseTxtBackup(text: string): { items: unknown[]; encryptedLines: number } {
  const items: unknown[] = [];
  let encryptedLines = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("**")) continue;
    const parsed = decodeLine(line);
    if (!parsed) continue;
    if (isRecord(parsed) && typeof (parsed as SnItem).content === "string") {
      const probe = parseSnItem(parsed);
      if (probe.encrypted) encryptedLines++;
      continue;
    }
    items.push(parsed);
  }
  return { items, encryptedLines };
}

export function parseStandardNotesBackup(text: string): SnImportResult {
  let items: unknown[] = [];
  let skippedEncrypted = 0;

  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    const json = decodeLine(trimmed) as { items?: unknown[] } | null;
    if (json && Array.isArray(json.items)) {
      items = json.items;
    } else {
      // maybe a single item object
      const single = decodeLine(trimmed);
      if (single) items = [single];
    }
  }
  // fallback: one JSON item per line (.txt backups, with or without a header)
  if (!items.length) {
    const txt = parseTxtBackup(text);
    items = txt.items;
    skippedEncrypted += txt.encryptedLines;
  }

  // first pass: tag id → name map
  const tagMap = new Map<string, string>();
  const noteDrafts: SnNoteDraft[] = [];
  let skippedOther = 0;

  for (const raw of items) {
    const res = parseSnItem(raw);
    if (!res.known) {
      if (res.encrypted) skippedEncrypted++;
      else if (isRecord(raw)) skippedOther++;
      continue;
    }
    if (res.encrypted) {
      skippedEncrypted++;
      continue;
    }
    if (res.tag) tagMap.set(res.tag.id, res.tag.name);
    if (res.note) noteDrafts.push(res.note);
  }

  // second pass: resolve tag references to names
  for (const n of noteDrafts) {
    n.tagNames = n.tagNames
      .map((id) => tagMap.get(id) ?? (tagMap.size === 0 ? "" : ""))
      .filter((v): v is string => !!v);
  }

  // de-duplicate by uuid (exports can repeat items across revisions)
  const seen = new Set<string>();
  const notes = noteDrafts.filter((n) => {
    if (seen.has(n.externalId)) return false;
    seen.add(n.externalId);
    return true;
  });

  return { notes, totalItems: items.length, skippedEncrypted, skippedOther };
}

/** Also accept NexNotes' own backups transparently (notes[] array). */
export function looksLikeNexNotesBackup(text: string): boolean {
  try {
    const json = JSON.parse(text) as { app?: string; notes?: unknown[] };
    return json.app === "nexnotes" && Array.isArray(json.notes);
  } catch {
    return false;
  }
}
