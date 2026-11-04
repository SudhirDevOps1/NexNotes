/**
 * Creates the shared demo account (idempotent) with a full set of welcome
 * notes, folders, tags, starred/locked/conflict notes, version history and
 * files — so every NexNotes feature is explorable immediately after login.
 *
 * Runs on demo login (kept alive even after DB resets) and top-ups missing
 * items by fixed id, never removing user data.
 */
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

export const DEMO_EMAIL = "demo@nexnotes.app";
export const DEMO_PASSWORD = "NexNotes@2026";
export const DEMO_NOTE_LOCK_PASSWORD = "demo123";

/* ---------- server-side crypto (mirrors src/lib/crypto.ts) ---------- */

const ITERATIONS = 150_000;

function deriveNoteKeySync(noteId: string, password: string): Buffer {
  return crypto.pbkdf2Sync(password, `nexnotes:note:${noteId}`, ITERATIONS, 32, "sha256");
}

function lockEncrypt(noteId: string, password: string, text: string): string {
  const key = deriveNoteKeySync(noteId, password);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(text, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return `nxlock:v1:${iv.toString("base64")}:${ct.toString("base64")}`;
}

function sha256Hex(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function lockHash(noteId: string, password: string): string {
  return sha256Hex(`nexnotes-lock:${noteId}:${password}`);
}

/* ---------- demo content ---------- */

const WELCOME = `# Welcome to NexNotes 👋

NexNotes is a **local-first, end-to-end encrypted** notebook.
Everything you type is saved to *this device instantly* (IndexedDB) and
synced to your account when you are online.

## Why you will like it

- **Offline-first** — write without internet, sync catches up later
- **E2E encryption** — turn it on in Settings → Security
- **Markdown** with live preview
- **Note history** — every edit is versioned automatically
- **Password-protect** single notes (try the "Secret" note — password: demo123)
- **Folders + Tags**, Star, Pin, Archive, Trash
- **Command palette** — press \`Ctrl+K\`
- Export everything anytime (JSON / Markdown)

> Try it: this note is editable. Create a new one with the **+ New** button.`;

const GUIDE = `# Feature guide

## Note menu (the ⋯ button in the editor)
Everything Joplin lovers expect:
- **Note history** — browse & restore old versions
- **Editor width** — narrow / medium / full
- **Prevent editing** — read-only freeze
- **Show preview** — markdown preview toggle (Alt+E)
- **Password protect** — lock a single note (demo note password: demo123)
- **Change note type** — Markdown, Plain, Task, Checklist, Code
- **Star / Pin to top / Export / Duplicate / Archive / Move to trash**
- **Find in note** (Ctrl+F)

## Views in the sidebar
Notes · Files · Starred · Archived · Trash · Untagged · Conflicts

## Sync
- Status is shown at the bottom of the sidebar
- Edits made offline are queued and pushed automatically on reconnect
- Conflicting edits are kept as **conflict copies** — never lost

## Keyboard shortcuts
| Keys | Action |
| --- | --- |
| \`Ctrl+K\` | Command palette |
| \`Alt+N\` | New note |
| \`Alt+E\` | Toggle preview |
| \`Ctrl+F\` | Find in note |
| \`Ctrl+S\` | Force save + sync |`;

const ENCRYPTION = `# How E2E encryption works

When enabled, your notes are **encrypted in the browser** before they ever
touch the server, using AES-256-GCM with a key derived from your password
(PBKDF2, 150,000 iterations). The server only ever stores ciphertext.

1. Open **Settings → Security**
2. Flip on *End-to-end encryption*
3. Re-enter your password to derive the key

⚠️ Losing your password means losing your notes — that is the point.`;

const MD = `# Markdown playground

- *italic* **bold** ~~strike~~ \`inline code\`
- [ ] todo list item
- [x] done item

\`\`\`ts
const greeting = (name: string) => \`Hello \${name}!\`;
\`\`\`

| Feature | Status |
| --- | --- |
| Local-first | ✅ |
| E2E encrypted | ✅ |
| Note history | ✅ |
| Multi-database | ✅ SQLite · Neon Postgres |

### Quote
> "The notes you write should belong to you — no one else."`;

const INSTA_PROMPTS = `# AI prompt library

High-performing AI prompts for content work — copy-paste ready.

## Writing hooks
1. "Nobody talks about this side of \${niche}…"
2. "I tried \${trend} for 30 days — here's what happened"
3. "3 mistakes killing your \${goal} (fix #2 today)"

## Summarizer prompt
\`\`\`text
Act as a research assistant.
Summarize the article below in 5 bullets, then list 3 counter-points.
Tone: neutral, factual. Keep each bullet under 20 words.
\`\`\`

## Slide outline prompt
- Slide 1: bold claim
- Slide 2-6: breakdown with examples
- Slide 7: recap checklist
- Slide 8: CTA → "Save this 🔖"`;

const INSTA_LMARENS = `# Launch checklist

Everything needed to ship the next release — task list:

- [x] Concept board — visual language
- [x] Landing copy — first draft
- [ ] Changelog + release notes
- [ ] Smoke test on Windows and Linux
- [x] Collect review screenshots
- [ ] Publish the announcement post`;

const VICHARVERSE = `# Content calendar

Publishing plan — a 40-post bank.

| # | Theme | Status |
| --- | --- | --- |
| 01 | Deep work vs distraction | posted |
| 02 | Money mindset | posted |
| 03 | Discipline > motivation | draft |
| 04 | Reading habit | idea |

**Format:** dark background, white serif text, soft piano BGM.
**Series:** #thoughtoftheday #mindset`;

const APNA_PROJECT = `# NexNotes architecture

Clean-room build plan — like Vaultwarden is for Bitwarden.

## Stack decisions
- Next.js 16 + TypeScript + Tailwind + shadcn/ui
- Prisma: SQLite (local) ⇄ Neon Postgres (cloud)
- IndexedDB local-first + push/pull sync
- WebCrypto E2E (AES-256-GCM)

\`\`\`bash
# switch to Neon anytime
node scripts/db-switch.mjs postgres "postgresql://…neon.tech/nexnotes?sslmode=require"
\`\`\`

## Done
✅ Auth (JWT) · ✅ offline queue · ✅ E2E · ✅ note history`;

const SECRET_NOTE = `🔒 CONFIDENTIAL — demo of per-note password protection

Bank: Demo Bank • A/C ****2026
Recovery codes: NX-DEMO-1234, NX-DEMO-5678
WiFi: NexGuest / password-not-real
SSN/ID: XX-XX-XXXX (fake)

This note is encrypted a SECOND time with its own password
("demo123") — even the server never sees this plaintext.`;

const BOOK_IDEAS = `# Book ideas

1. **Local-first software** — why your data should live with you
2. "The Clean-room Method" — rebuilding tools you love, free
3. Hinglish poetry collection — *sheher aur main*

Archived for now — revisit after the NexNotes launch.`;

const OLD_DRAFT = `Old draft — remove later

Half-written ideas, keeping in trash as a demo of soft-delete.
Restore me from the Trash view 🗑️`;

const QUICK_THOUGHT = `Quick thought

No tags on purpose — this is the demo note for the **Untagged** view.
Tag it from the editor to see it move out of that view.`;

const CONFLICT_1 = `# AI prompt library (edited on phone)

Offline edit made on the phone while the laptop also changed this note.
The server kept BOTH versions — resolve from the Conflicts view.

+ added: "story poll prompt" section idea`;

const CONFLICT_2 = `NexNotes architecture — older laptop copy

Second demo conflict copy (5 total, like a real sync week).`;

const README_FILE = `NexNotes file library demo
==========================

Files live in their own view (sidebar → Files), sync to your account
and are encrypted end-to-end when E2E is enabled.

Max size: 3 MB per file (demo limits).`;

const IDEAS_FILE = `ideas.txt — quick capture
- podcast: "build in public" episode notes
- newsletter issue #1 draft
- neon postgres pricing comparison`;

const DEMO_HTML = `<section style="font-family:Georgia,'Times New Roman',serif;max-width:640px;margin:0 auto;padding:28px 24px;background:#faf7f2;border:1px solid #e5ded2;border-radius:14px;color:#2b2620">
  <p style="letter-spacing:3px;font-size:11px;text-transform:uppercase;color:#8a7f6d;margin:0 0 6px">Aurora Guest House</p>
  <h1 style="font-size:26px;margin:0 0 4px">Booking confirmation</h1>
  <p style="color:#6b6154;margin:0 0 18px">Dear Aman, your stay is confirmed. Save this note!</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <tr><td style="padding:8px 0;border-top:1px solid #e5ded2">Check-in</td><td style="text-align:right;font-weight:bold">14 Nov 2026, 2 PM</td></tr>
    <tr><td style="padding:8px 0;border-top:1px solid #e5ded2">Check-out</td><td style="text-align:right;font-weight:bold">17 Nov 2026, 11 AM</td></tr>
    <tr><td style="padding:8px 0;border-top:1px solid #e5ded2">Room</td><td style="text-align:right;font-weight:bold">Deluxe Balcony · #302</td></tr>
    <tr><td style="padding:8px 0;border-top:1px solid #e5ded2">Total</td><td style="text-align:right;font-weight:bold;color:#7c5cd6">₹ 9,450</td></tr>
  </table>
  <div style="margin-top:18px;padding:12px 14px;background:#f0e9fb;border-radius:10px;font-size:13px">
    <strong>Tip:</strong> this note is type <em>HTML / Web page</em> — the editor shows the
    source, Preview renders it in a sandboxed frame (scripts disabled).
  </div>
  <p style="font-size:12px;color:#8a7f6d;margin:16px 0 0">Reply to this note's folder “Work” · booking ref <b>NX-7788</b></p>
</section>`;

const now = () => new Date();
const daysAgo = (d: number, minutes = 0) =>
  new Date(Date.now() - d * 86400_000 - minutes * 60_000);

type NoteSeed = {
  id: string;
  title: string;
  content: string;
  starred?: boolean;
  pinned?: boolean;
  archived?: boolean;
  trashed?: boolean;
  noteType?: string;
  locked?: boolean;
  lockHash?: string;
  conflictOf?: string;
  tags?: string[];
  folderId?: string;
  ageDays?: number;
};

/* ---------- demo notes for the spreadsheet & authenticator types ---------- */

const DEMO_SHEET = "nxsheet:v1:" + JSON.stringify({
  cols: ["Item", "Budget", "Actual", "Diff"],
  rows: [
    ["Groceries", "8000", "7450", "-550"],
    ["Internet", "999", "999", "0"],
    ["Transport", "2500", "2620", "120"],
    ["Eating out", "3000", "3410", "410"],
    ["Savings", "10000", "10000", "0"],
  ],
});

const DEMO_AUTH = [
  "# 2FA codes (demo)",
  "",
  "Add one account per line as `Label: BASE32SECRET`, or paste an otpauth:// URI.",
  "Codes regenerate every 30 seconds — tap a code to copy it.",
  "",
  "Google (demo): JBSWY3DPEHPK3PXP",
  "GitHub (demo): KRSXG5CTMVRXEZLU",
  "NexNotes (demo): GEZDGNBVGY3TQOJQ",
].join("\n");

const V21_CODE_TOUR = `# Code — Prism syntax highlighting ✨

v2.1 highlights code everywhere: markdown fences, **code notes** and public share
pages — 40+ languages, line numbers, word-wrap and one-click copy. Try it:

\`\`\`prisma
model Note {
  id        String   @id @default(cuid())
  title     String
  content   String
  createdAt DateTime @updatedAt
}
\`\`\`

\`\`\`ts
// TypeScript — hover the header buttons: wrap · line numbers · copy
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`

\`\`\`python
def quicksort(xs: list[int]) -> list[int]:
    if len(xs) <= 1:
        return xs
    pivot, *rest = xs
    lo = [x for x in rest if x < pivot]
    hi = [x for x in rest if x >= pivot]
    return quicksort(lo) + [pivot] + quicksort(hi)
\`\`\`

\`\`\`bash
# self-host in one line
docker compose up -d
\`\`\`

> Unlabeled fences are **auto-detected**. Code notes get a language dropdown in
> the preview header — pick "Prisma Schema" to see this grammar light up.
`;

const V2_TOUR = `# Feature tour — every premium tool, free 🎉

Everything below ships in the box, no upgrade wall. Try each one:

## Wiki links — connect your notes
Type \`[[\` in any note to link another note. Example: see [[Feature guide]].
Open the **BookOpen (Backlinks)** button in the editor toolbar to see what links here.

## Math — KaTeX rendering
Inline: $E = mc^2$  ·  Block:

$$\\int_0^1 x^2 \\, dx = \\frac{1}{3}$$

## Rich text editor
Create a note → type **Rich text (WYSIWYG)** from the ＋ menu. Bold, lists, links, tables — stored as plain markdown underneath.

## Batch operations
Click **Select** above the note list → pick notes → Star / Move / Tag / **Merge** / Export / Trash in one go.

## Smart views
Sidebar → **Smart views → ＋**. Save a search like "contains demo + starred" — it updates itself.

## Two-factor login
Settings → Security → **Two-factor authentication**. Works with Google Authenticator, Authy, 1Password… backup codes included.

## Public share links
Note menu (⋯) → **Share → Create public read-only link**. Self-hosted, noindex, revocable anytime.

## Daily auto-backup + more themes
Settings → Data → **Daily auto-backup** (stays on your device), and Settings → Appearance for Nord, Solarized, Rosé Pine, Gruvbox & Tokyo Night.

— Everything privacy-first: E2E encryption, offline-first, open source. Enjoy!`;

const NOTES: NoteSeed[] = [
  { id: "demo-note-1", title: "Welcome to NexNotes", content: WELCOME, pinned: true, starred: true, tags: ["getting-started"], ageDays: 12 },
  { id: "demo-note-2", title: "Feature guide", content: GUIDE, tags: ["getting-started"], ageDays: 12 },
  { id: "demo-note-3", title: "How E2E encryption works", content: ENCRYPTION, folderId: "demo-folder-personal", tags: ["ideas"], ageDays: 11 },
  { id: "demo-note-4", title: "Markdown playground", content: MD, folderId: "demo-folder-work", tags: ["markdown"], ageDays: 10 },
  { id: "demo-note-5", title: "AI prompt library", content: INSTA_PROMPTS, starred: true, pinned: true, tags: ["ideas"], ageDays: 6 },
  { id: "demo-note-6", title: "Launch checklist", content: INSTA_LMARENS, starred: true, noteType: "task", tags: ["projects"], ageDays: 5 },
  { id: "demo-note-7", title: "Content calendar", content: VICHARVERSE, starred: true, tags: ["ideas"], ageDays: 4 },
  { id: "demo-note-8", title: "NexNotes architecture", content: APNA_PROJECT, pinned: true, noteType: "code", tags: ["projects"], ageDays: 3 },
  {
    id: "demo-note-9", title: "Secret — bank & passwords 🔒", content: "",
    locked: true, tags: [], ageDays: 2,
  },
  { id: "demo-note-10", title: "Book ideas", content: BOOK_IDEAS, archived: true, tags: ["ideas"], ageDays: 9 },
  { id: "demo-note-11", title: "Old draft — remove later", content: OLD_DRAFT, trashed: true, ageDays: 8 },
  { id: "demo-note-12", title: "AI prompt library (phone edit)", content: CONFLICT_1, conflictOf: "demo-note-5", ageDays: 1 },
  { id: "demo-note-17", title: "Quick thought (untagged)", content: QUICK_THOUGHT, ageDays: 0 },
  { id: "demo-note-18", title: "Budget — monthly sheet", content: DEMO_SHEET, noteType: "spreadsheet", tags: ["projects"], ageDays: 1 },
  { id: "demo-note-19", title: "2FA codes (demo)", content: DEMO_AUTH, noteType: "authenticator", tags: ["getting-started"], ageDays: 1 },
  { id: "demo-note-20", title: "HTML demo — booking card", content: DEMO_HTML, noteType: "html", tags: ["markdown"], ageDays: 0 },
  { id: "demo-note-21", title: "Feature tour — wiki, math & more", content: V2_TOUR, pinned: true, tags: ["getting-started"], ageDays: 0 },
  { id: "demo-note-22", title: "Code demo — Prism highlighting ✨", content: V21_CODE_TOUR, tags: ["getting-started"], ageDays: 0 },
];

async function linkTags(seed: NoteSeed) {
  if (!seed.tags?.length) return;
  // FK guard: the note and every tag must still exist (a user may have
  // deleted demo tags/notes — never let re-linking spam FK violations).
  const note = await db.note.findUnique({ where: { id: seed.id }, select: { id: true } }).catch(() => null);
  if (!note) return;
  for (const tagId of seed.tags) {
    const tag = await db.tag.findUnique({ where: { id: tagId }, select: { id: true } }).catch(() => null);
    if (!tag) continue;
    const link = await db.noteTag.findUnique({
      where: { noteId_tagId: { noteId: seed.id, tagId } },
      select: { noteId: true },
    }).catch(() => null);
    if (!link) {
      await db.noteTag.create({ data: { noteId: seed.id, tagId } }).catch(() => {});
    }
  }
}

async function ensureNote(userId: string, seed: NoteSeed) {
  const exists = await db.note.findUnique({ where: { id: seed.id }, select: { id: true } });
  if (exists) return;

  const createdAt = daysAgo(seed.ageDays ?? 0);
  const updatedAt = daysAgo(seed.ageDays ?? 0, 30);

  let title = seed.title;
  let content = seed.content;
  if (seed.id === "demo-note-9") {
    // the locked demo note — encrypted server-side with its own password
    title = lockEncrypt(seed.id, DEMO_NOTE_LOCK_PASSWORD, seed.title);
    content = lockEncrypt(seed.id, DEMO_NOTE_LOCK_PASSWORD, SECRET_NOTE);
  }

  await db.note
    .create({
      data: {
        id: seed.id,
        userId,
        title,
        content,
        isEncrypted: seed.id === "demo-note-9", // nxlock ciphertext is opaque too
        folderId: seed.folderId ?? null,
        starred: !!seed.starred,
        noteType: seed.noteType ?? "markdown",
        preventEdit: false,
        editorWidth: "narrow",
        locked: !!seed.locked,
        lockHash: seed.locked ? lockHash(seed.id, DEMO_NOTE_LOCK_PASSWORD) : null,
        conflictOf: seed.conflictOf ?? null,
        pinned: !!seed.pinned,
        archived: !!seed.archived,
        trashed: !!seed.trashed,
        trashedAt: seed.trashed ? updatedAt : null,
        createdAt,
        updatedAt,
      },
    })
    .catch(() => {}); // id already taken (concurrent login) — top-up only

  await linkTags(seed);
}

/* ---------- starter notes for brand-new accounts ---------- */

const STARTER_WELCOME = `# Welcome to your NexNotes 👋

This is your **local-first, end-to-end encryptable** notebook. Everything you
type is saved to this device instantly and synced to your account when online.

## Try these first

- Create a note with **＋ New ▾** — pick a type: Markdown, Plain, Task, Checklist or Code
- Press \`Ctrl+K\` for the command palette
- Open the **⋯** menu in the editor for history, password-protection, export and more
- Tag notes from the editor, organise with folders in the sidebar
- Switch light/dark from the bottom-left, pick an accent in Settings

> Coming from Standard Notes? Use **Settings → Import → Standard Notes backup**
> to bring your exported notes over in seconds.`;

const STARTER_OFFLINE = `# Works offline, syncs everywhere

Turn off your Wi-Fi and keep writing — edits queue in IndexedDB and push
automatically when you reconnect. If two devices edited the same note while
apart, both versions survive as a **conflict copy** you can resolve.

## Security options

- **Settings → Security → End-to-end encryption** — AES-256-GCM in your browser
- **⋯ menu → Password protect** — a second password on single notes
- **Note history** — every edit is versioned, restore anytime`;

const STARTER_AUTH = `GitHub (demo): JBSWY3DPEHPK3PXP
Google (demo): KRSXG5CTMVRXEZLU

↑ Tap “Add account” above to store your own 2FA secrets —
codes refresh live every 30 seconds, generated on this device only.`;

const STARTER_HTML = `<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:linear-gradient(135deg,#6366f1,#a855f7);border-radius:16px;color:#fff;text-align:center">
  <h1 style="margin:0 0 8px;font-size:24px">HTML notes are here 🎉</h1>
  <p style="margin:0;opacity:.9">Paste any HTML (email templates, cards, embeds) and hit Preview.
  Scripts stay disabled — privacy first.</p>
</div>`;

/**
 * Idempotent starter notes for freshly registered accounts, so a new user
 * never lands on an empty app. Runs once on register.
 */
export async function seedNewUserStarters(userId: string) {
  const t = new Date();
  const starters = [
    { key: "welcome", title: "Welcome to NexNotes", content: STARTER_WELCOME, pinned: true, starred: true },
    { key: "offline", title: "Works offline, syncs everywhere", content: STARTER_OFFLINE, pinned: false, starred: false },
    { key: "auth", title: "2FA codes (demo)", content: STARTER_AUTH, noteType: "authenticator" as const, pinned: false, starred: false },
    { key: "html", title: "HTML demo", content: STARTER_HTML, noteType: "html" as const, pinned: false, starred: false },
    { key: "v2tour", title: "Feature tour — wiki, math & more", content: V2_TOUR, pinned: true, starred: false },
  ];
  for (const s of starters) {
    const id = `nx-starter-${userId}-${s.key}`; // per-user id — note.id is a global PK
    const exists = await db.note.findUnique({ where: { id }, select: { id: true } }).catch(() => null);
    if (exists) continue;
    await db.note
      .create({
        data: {
          id,
          userId,
          title: s.title,
          content: s.content,
          noteType: "noteType" in s ? s.noteType : "markdown",
          pinned: s.pinned,
          starred: s.starred,
          editorWidth: "narrow",
          createdAt: t,
          updatedAt: t,
        },
      })
      .catch(() => {});
  }
}

export async function ensureDemoUser() {
  const existing = await db.user.findUnique({ where: { email: DEMO_EMAIL } });
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const user =
    existing ??
    (await db.user.create({
      data: {
        email: DEMO_EMAIL,
        passwordHash,
        notes: { create: [] },
      },
    }));

  const t = now();

  // folders + tags (idempotent by id)
  for (const f of [
    { id: "demo-folder-personal", name: "Personal" },
    { id: "demo-folder-work", name: "Work" },
  ]) {
    await db.folder.create({ data: { ...f, userId: user.id, createdAt: t, updatedAt: t } })
      .catch(() => {});
  }
  for (const tag of [
    { id: "demo-tag-start", name: "getting-started" },
    { id: "demo-tag-ideas", name: "ideas" },
    { id: "demo-tag-md", name: "markdown" },
    { id: "demo-tag-insta", name: "media" },
    { id: "demo-tag-projects", name: "projects" },
    { id: "demo-tag-work", name: "work" },
  ]) {
    await db.tag.create({ data: { ...tag, userId: user.id, createdAt: t, updatedAt: t } })
      .catch(() => {});
  }

  // cleanup: seed no longer ships these junk conflict copies (v1.3)
  await db.note.deleteMany({
    where: { userId: user.id, id: { in: ["demo-note-13", "demo-note-14", "demo-note-15", "demo-note-16"] } },
  }).catch(() => {});

  // notes (top-up by id — never removes anything)
  for (const seed of NOTES) {
    await ensureNote(user.id, seed);
    await linkTags(seed); // re-run linking even for pre-existing notes
  }

  // the demo account has its own richer welcome (demo-note-1) — the generic
  // starter notes would only duplicate it, so remove any created earlier.
  await db.note.deleteMany({ where: { id: { startsWith: `nx-starter-${user.id}-` } } }).catch(() => {});

  // version history demos
  const histCounts = await db.noteHistory.groupBy({ by: ["noteId"], where: { noteId: { in: ["demo-note-5", "demo-note-1"] } }, _count: true }).catch(() => [] as { noteId: string }[]);
  const has = (id: string) => histCounts.some((h) => h.noteId === id);
  if (!has("demo-note-5")) {
    await db.noteHistory.createMany({
      data: [
        {
          userId: user.id, noteId: "demo-note-5",
          title: "AI prompt library",
          content: INSTA_PROMPTS.replace("## Slide outline prompt", "## Story poll prompt\n- \"This or that\" template\n\n## Slide outline prompt"),
          isEncrypted: false,
          createdAt: daysAgo(6, 120),
        },
        {
          userId: user.id, noteId: "demo-note-5",
          title: "AI prompt library",
          content: INSTA_PROMPTS.split("## Summarizer prompt")[0] + "*(draft — more prompts coming)*",
          isEncrypted: false,
          createdAt: daysAgo(6, 300),
        },
      ],
    }).catch(() => {});
  }
  if (!has("demo-note-1")) {
    await db.noteHistory.create({
      data: {
        userId: user.id, noteId: "demo-note-1",
        title: "Welcome to NexNotes",
        content: WELCOME.split("## Why you will like it")[0] + "*First draft of the welcome note.*",
        isEncrypted: false,
        createdAt: daysAgo(12, 60),
      },
    }).catch(() => {});
  }

  // files demo
  const f1 = await db.fileItem.findUnique({ where: { id: "demo-file-1" }, select: { id: true } });
  if (!f1) {
    await db.fileItem.create({
      data: {
        id: "demo-file-1", userId: user.id, name: "nexnotes-readme.txt",
        mime: "text/plain", size: Buffer.byteLength(README_FILE),
        data: Buffer.from(README_FILE, "utf8").toString("base64"),
        isEncrypted: false, createdAt: daysAgo(1), updatedAt: daysAgo(1),
      },
    }).catch(() => {});
  }
  const f2 = await db.fileItem.findUnique({ where: { id: "demo-file-2" }, select: { id: true } });
  if (!f2) {
    await db.fileItem.create({
      data: {
        id: "demo-file-2", userId: user.id, name: "ideas.txt",
        mime: "text/plain", size: Buffer.byteLength(IDEAS_FILE),
        data: Buffer.from(IDEAS_FILE, "utf8").toString("base64"),
        isEncrypted: false, createdAt: daysAgo(2), updatedAt: daysAgo(2),
      },
    }).catch(() => {});
  }

  return user;
}
