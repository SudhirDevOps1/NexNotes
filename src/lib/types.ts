/** Shared wire/local shapes between API routes and the client store. */

export type NoteType =
  | "markdown" | "plain" | "task" | "checklist" | "code" | "spreadsheet"
  | "authenticator" | "html" | "richtext";
export type EditorWidth = "narrow" | "medium" | "full";

export interface UserDTO {
  id: string;
  email: string;
  encryptionEnabled: boolean;
  createdAt: string;
  /** v2.0 — account two-factor status (from /api/auth/me) */
  twofaEnabled?: boolean;
}

export interface NoteDTO {
  id: string;
  title: string;
  content: string; // plaintext | nxenc:v1 (E2E) | nxlock:v1 (note password)
  isEncrypted: boolean;
  folderId: string | null;
  tagIds: string[];
  starred: boolean;
  noteType: NoteType;
  preventEdit: boolean;
  editorWidth: EditorWidth;
  locked: boolean;
  lockHash: string | null;
  conflictOf: string | null;
  pinned: boolean;
  archived: boolean;
  trashed: boolean;
  trashedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HistoryDTO {
  id: string;
  noteId: string;
  title: string;
  content: string;
  isEncrypted: boolean;
  createdAt: string;
}

export interface FileDTO {
  id: string;
  name: string;
  mime: string;
  size: number;
  isEncrypted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FolderDTO {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface TagDTO {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export type Change =
  | { type: "note"; op: "upsert"; data: NoteDTO }
  | { type: "note"; op: "delete"; id: string }
  | { type: "folder"; op: "upsert"; data: FolderDTO }
  | { type: "folder"; op: "delete"; id: string }
  | { type: "tag"; op: "upsert"; data: TagDTO }
  | { type: "tag"; op: "delete"; id: string };

export interface SyncRequest {
  since: string | null;
  changes: Change[];
}

export interface SyncResponse {
  serverTime: string;
  notes: NoteDTO[];
  folders: FolderDTO[];
  tags: TagDTO[];
  deletions: { itemType: "note" | "folder" | "tag"; itemId: string }[];
  applied: number;
  conflictsCreated: number;
}
