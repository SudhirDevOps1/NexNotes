"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeKatex from "rehype-katex";
import dynamic from "next/dynamic";
import {
  ArrowLeft, Pin, PinOff, Archive, ArchiveRestore, Trash2, Eye, PencilLine,
  Folder as FolderIcon, Tag as TagIcon, RotateCcw, X, Check, Lock, LockOpen,
  Star, History, Search, ChevronUp, ChevronDown, Ban, ShieldCheck, Copy,
  Columns2, Maximize, Minimize, Printer, Bold, Italic, Code, Link2,
  List, ListChecks, Quote, Heading1, Heading2, BookOpen, Replace,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useApp, type UiNote } from "@/lib/store";
import { loadPrefs } from "@/lib/prefs";
import { CodeBlock, mdCodeComponents } from "./code-block";
import { NoteMenu } from "./note-menu";
import { SheetEditor, SheetPreview, sheetToMarkdown } from "./sheet-editor";
import { TotpPreview } from "./totp";
import { isLockEncrypted, isEncrypted } from "@/lib/crypto";
import { cn } from "@/lib/utils";

/** v2.0 — WYSIWYG rich-text editor (mdxeditor), client-only */
const RichTextEditor = dynamic(
  () => import("./rich-text").then((m) => m.RichTextEditor),
  { ssr: false, loading: () => <p className="text-xs text-muted-foreground p-4">Loading editor…</p> }
);

const WIDTH_CLASS: Record<string, string> = {
  narrow: "max-w-3xl",
  medium: "max-w-5xl",
  full: "max-w-none",
};

type ViewMode = "edit" | "split" | "preview";

/** rehype-sanitize schema: GitHub defaults — strips <script>, event handlers,
 *  javascript: URLs, iframes. Raw HTML in markdown renders, safely.
 *  v2.0: math elements pass through so rehype-katex can render them AFTER
 *  sanitization (KaTeX output itself is never re-sanitized → stays intact). */
const MD_HTML_SCHEMA = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "math", "inlineMath"],
} as typeof defaultSchema;

/** v2.0 — [[wiki links]] become nxwiki:// links that open (or create) the note */
const WIKI_RE = /\[\[([^\]\n]+)\]\]/g;
export function preprocessWiki(md: string): string {
  return md.replace(WIKI_RE, (_m, t) => `[${t}](nxwiki://${encodeURIComponent(String(t).trim())})`);
}

/** shared markdown renderer — sanitized inline HTML, GFM tables, KaTeX math,
 *  clickable [[wiki links]] (v2.0), Prism code blocks (v2.1).
 *  Exported for HTML export (store.ts renderToStaticMarkup). */
export function Markdown({ children, onWiki }: { children: string; onWiki?: (title: string) => void }) {
  const withWiki = useMemo(() => preprocessWiki(children), [children]);
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeRaw, [rehypeSanitize, MD_HTML_SCHEMA], rehypeKatex]}
      components={{
        ...mdCodeComponents(),
        a: ({ href, children: kids, ...props }) => {
          const wiki =
            typeof href === "string" && href.startsWith("nxwiki://")
              ? decodeURIComponent(href.slice("nxwiki://".length))
              : null;
          if (wiki) {
            return (
              <button
                type="button"
                className="nx-wiki-link"
                onClick={(e) => { e.preventDefault(); onWiki?.(wiki); }}
                title={`Open “${wiki}”`}
              >
                {kids}
              </button>
            );
          }
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
              {kids}
            </a>
          );
        },
      }}
    >
      {withWiki}
    </ReactMarkdown>
  );
}

/** full-HTML document → sandboxed iframe (no scripts, privacy-first) */
export function buildHtmlDoc(content: string): string {
  if (/<html[\s>]/i.test(content)) return content;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;margin:16px;color:#18181b;line-height:1.6}</style></head><body>${content}</body></html>`;
}

function HtmlPreview({ content }: { content: string }) {
  const doc = useMemo(() => buildHtmlDoc(content), [content]);
  return (
    <div className="space-y-2">
      <iframe
        title="HTML preview"
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        srcDoc={doc}
        className="w-full rounded-lg border bg-white min-h-[420px]"
        style={{ height: "min(62vh, 640px)" }}
      />
      <p className="text-[11px] text-muted-foreground">
        Rendered in a sandboxed frame — JavaScript is disabled for your privacy. Switch to Edit for the source.
      </p>
    </div>
  );
}

/** markdown-like notes open in the rendered view on phones (raw source is
 *  hostile on a small screen); plain/code stay in the editor. */
function defaultMode(noteType: string): ViewMode {
  if (noteType === "authenticator") return "preview"; // live codes, not raw lines
  if (noteType === "richtext") return "edit"; // WYSIWYG is its own editor
  if (noteType === "html") {
    return typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches ? "edit" : "preview";
  }
  if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) return "edit";
  if (noteType === "spreadsheet") return "edit";
  return noteType === "markdown" || noteType === "task" || noteType === "checklist" ? "preview" : "edit";
}

export function Editor({ onBack }: { onBack: () => void }) {
  const note = useApp((s) => (s.selectedNoteId ? s.notes[s.selectedNoteId] : null));
  const mobilePane = useApp((s) => s.mobilePane);

  if (!note) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-8 bg-background">
        <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <PencilLine className="h-7 w-7 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-1">Select or create a note</h3>
        <p className="text-sm text-muted-foreground max-w-xs mb-5">
          Notes save to this device instantly and sync when you are online.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <kbd className="pointer-events-none rounded border bg-muted px-2 py-1 text-xs font-mono text-muted-foreground">Alt+N — new note</kbd>
          <kbd className="pointer-events-none rounded border bg-muted px-2 py-1 text-xs font-mono text-muted-foreground">Ctrl+K — palette</kbd>
        </div>
      </div>
    );
  }

  // key forces a fresh editor state per note (no effect-based syncing)
  return (
    <div className={cn("h-full", mobilePane === "list" && "hidden md:block")}>
      <EditorBody key={note.id} note={note} onBack={onBack} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function EditorBody({ note, onBack }: { note: UiNote; onBack: () => void }) {
  const folders = useApp((s) => s.folders);
  const tags = useApp((s) => s.tags);
  const user = useApp((s) => s.user);
  const online = useApp((s) => s.online);
  const unlocked = useApp((s) => s.unlockedNotes[note.id]);
  const updateNote = useApp((s) => s.updateNote);
  const trashNote = useApp((s) => s.trashNote);
  const restoreNote = useApp((s) => s.restoreNote);
  const deleteForever = useApp((s) => s.deleteForever);
  const ensureTag = useApp((s) => s.ensureTag);
  const setMobilePane = useApp((s) => s.setMobilePane);
  const setHistory = useApp((s) => s.setHistory);
  const unlockNote = useApp((s) => s.unlockNote);
  const unlockVault = useApp((s) => s.unlockVault);
  const copyNoteMarkdown = useApp((s) => s.copyNoteMarkdown);
  /* v2.0 — wiki links + backlinks */
  const selectNote = useApp((s) => s.selectNote);
  const createNote = useApp((s) => s.createNote);
  const notesAll = useApp((s) => s.notes);

  const isLockedHidden = note.locked && !unlocked;
  const title = unlocked ? unlocked.title : note.title;
  const content = unlocked ? unlocked.content : note.content;
  // v2.2 — the body is still account ciphertext (nxenc) in memory: vault locked
  // for this session or the key failed to decrypt it. Never render raw
  // ciphertext — gate it the same way note-password locks are gated.
  const vaultHidden = !note.locked && !unlocked && isEncrypted(content);
  const readOnly = note.preventEdit || isLockedHidden || note.trashed;

  const [titleDraft, setTitleDraft] = useState(title);
  const [contentDraft, setContentDraft] = useState(content);
  const [mode, setMode] = useState<ViewMode>(() => defaultMode(note.noteType));
  const [zen, setZen] = useState(false);
  // v1.4 — reading progress + copy-note morph feedback
  const [readPct, setReadPct] = useState(0);
  const [copiedNote, setCopiedNote] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findIdx, setFindIdx] = useState(0);
  const [printDoc, setPrintDoc] = useState<{ title: string; content: string } | null>(null);
  /* v2.0 — backlinks + [[wiki-link autocomplete */
  const [showBacklinks, setShowBacklinks] = useState(false);
  const [wikiSug, setWikiSug] = useState<{ query: string; start: number; end: number; sel: number } | null>(null);
  /* v2.1 — find & replace + spelling preference */
  const [replaceText, setReplaceText] = useState("");
  const [spell, setSpell] = useState(true);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const noteRef = useRef(note);
  const titleRef = useRef(titleDraft);
  const contentRef = useRef(contentDraft);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { noteRef.current = note; }, [note]);
  useEffect(() => { titleRef.current = titleDraft; }, [titleDraft]);
  useEffect(() => { contentRef.current = contentDraft; }, [contentDraft]);

  // sync drafts when the underlying note changes (unlock, sync pull, restore)
  useEffect(() => {
    setTitleDraft(title);
    setContentDraft(content);
  }, [title, content]);

  // debounced autosave
  useEffect(() => {
    const n = noteRef.current;
    if (!n || isLockedHidden) return;
    if (titleDraft === title && contentDraft === content) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void updateNote(n.id, { title: titleRef.current, content: contentRef.current });
    }, 450);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [titleDraft, contentDraft, title, content, updateNote, isLockedHidden]);

  // flush pending edits on unmount (note switch / app close)
  useEffect(() => {
    return () => {
      const n = noteRef.current;
      if (!n) return;
      if (titleRef.current !== n.title || contentRef.current !== n.content) {
        void updateNote(n.id, { title: titleRef.current, content: contentRef.current });
      }
    };
  }, [updateNote]);

  // shortcuts: Alt+E cycle modes, Ctrl+F find, Ctrl+H history, Esc exits zen
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        setMode((m) => (m === "edit" ? "preview" : m === "preview" ? "split" : "edit"));
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f" && !isLockedHidden) {
        e.preventDefault();
        setFindOpen(true);
        setTimeout(() => document.getElementById("nx-find-input")?.focus(), 50);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "h" && !isLockedHidden) {
        e.preventDefault();
        setHistory(note.id);
      }
      if (e.key === "Escape" && zen) setZen(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [setHistory, note.id, isLockedHidden, zen]);

  // clear print document after the dialog closes
  useEffect(() => {
    if (!printDoc) return;
    const done = () => setTimeout(() => setPrintDoc(null), 300);
    window.addEventListener("afterprint", done, { once: true });
    return () => window.removeEventListener("afterprint", done);
  }, [printDoc]);

  // v2.1 — spelling preference follows Settings → Appearance live
  useEffect(() => {
    const sync = () => setSpell(loadPrefs().spell !== false);
    sync();
    window.addEventListener("nx-prefs-changed", sync);
    return () => window.removeEventListener("nx-prefs-changed", sync);
  }, []);

  const matches = useMemo(() => {
    if (!findQuery) return 0;
    const hay = contentDraft.toLowerCase();
    const needle = findQuery.toLowerCase();
    let count = 0, i = hay.indexOf(needle);
    while (i !== -1) { count++; i = hay.indexOf(needle, i + needle.length); }
    return count;
  }, [contentDraft, findQuery]);

  function jumpToMatch(dir: 1 | -1) {
    if (!matches || !textareaRef.current) return;
    const next = (findIdx + dir + matches) % matches;
    setFindIdx(next);
    const hay = contentDraft.toLowerCase();
    const needle = findQuery.toLowerCase();
    let pos = -1, k = 0, i = hay.indexOf(needle);
    while (i !== -1) {
      if (k === next) { pos = i; break; }
      k++; i = hay.indexOf(needle, i + needle.length);
    }
    if (pos >= 0 && textareaRef.current) {
      setMode("edit");
      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.focus({ preventScroll: true });
        ta.setSelectionRange(pos, pos + needle.length);
        // scroll the match into view approximately
        const before = contentDraft.slice(0, pos);
        const line = before.split("\n").length;
        ta.scrollTop = Math.max(0, (line - 6) * 24);
      });
    }
  }

  /* -------- markdown formatting helpers (format toolbar + Ctrl+B/I) -------- */

  const applyWrap = useCallback((before: string, after: string, placeholder: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const sel = contentRef.current.slice(s, e) || placeholder;
    const next = contentRef.current.slice(0, s) + before + sel + after + contentRef.current.slice(e);
    setContentDraft(next);
    requestAnimationFrame(() => {
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(s + before.length, s + before.length + sel.length);
    });
  }, []);

  const applyLinePrefix = useCallback((fn: (line: string) => string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const val = contentRef.current;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const start = val.lastIndexOf("\n", s - 1) + 1;
    const endIdx = val.indexOf("\n", e);
    const blockEnd = endIdx === -1 ? val.length : endIdx;
    const block = val.slice(start, blockEnd) || "";
    const transformed = block.split("\n").map(fn).join("\n");
    const next = val.slice(0, start) + transformed + val.slice(blockEnd);
    setContentDraft(next);
    requestAnimationFrame(() => {
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(start, start + transformed.length);
    });
  }, []);

  type FmtKind = "bold" | "italic" | "code" | "link" | "h1" | "h2" | "ul" | "todo" | "quote";

  const applyFormat = useCallback((kind: FmtKind) => {
    switch (kind) {
      case "bold": return applyWrap("**", "**", "bold text");
      case "italic": return applyWrap("*", "*", "italic text");
      case "code": {
        const ta = textareaRef.current;
        const sel = ta ? contentRef.current.slice(ta.selectionStart, ta.selectionEnd) : "";
        if (sel.includes("\n")) return applyWrap("\n```\n", "\n```\n", "");
        return applyWrap("`", "`", "code");
      }
      case "link": return applyWrap("[", "](https://)", "link text");
      case "h1": return applyLinePrefix((l) => `# ${l.replace(/^#+\s*/, "")}`);
      case "h2": return applyLinePrefix((l) => `## ${l.replace(/^#+\s*/, "")}`);
      case "ul": return applyLinePrefix((l) => (l.startsWith("- ") ? l.slice(2) : `- ${l}`));
      case "todo": return applyLinePrefix((l) => (/^\s*- \[ \]\s?/.test(l) ? l.replace(/^(\s*)- \[ \]\s?/, "$1") : `- [ ] ${l}`));
      case "quote": return applyLinePrefix((l) => (l.startsWith("> ") ? l.slice(2) : `> ${l}`));
    }
  }, [applyWrap, applyLinePrefix]);

  function replaceOne() {
    if (!findQuery || !matches) return;
    const hay = contentDraft.toLowerCase();
    const needle = findQuery.toLowerCase();
    let pos = -1, k = 0, i = hay.indexOf(needle);
    while (i !== -1) {
      if (k === findIdx) { pos = i; break; }
      k++; i = hay.indexOf(needle, i + needle.length);
    }
    if (pos < 0) { setFindIdx(0); return; }
    setContentDraft(
      contentDraft.slice(0, pos) + replaceText + contentDraft.slice(pos + findQuery.length),
    );
  }

  function replaceAll() {
    if (!findQuery) return;
    const re = new RegExp(findQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    setContentDraft(contentDraft.replace(re, replaceText));
  }

  /* -------- v2.1 — Tab / Shift+Tab indent inside code & HTML notes -------- */
  function indentCode(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const ta = textareaRef.current;
    if (!ta) return;
    e.preventDefault();
    const val = contentRef.current;
    const s = ta.selectionStart, en = ta.selectionEnd;
    const start = val.lastIndexOf("\n", s - 1) + 1;
    const multi = val.slice(s, en).includes("\n");
    const endIdx = val.indexOf("\n", en);
    const blockEnd = endIdx === -1 ? val.length : endIdx;
    if (e.shiftKey) {
      const ded = val.slice(start, blockEnd).replace(/^[ \t]{1,2}/gm, "");
      const caret = Math.max(start, s - (val.slice(start, s).length - val.slice(start, s).replace(/^[ \t]{1,2}/gm, "").length));
      setContentDraft(val.slice(0, start) + ded + val.slice(blockEnd));
      requestAnimationFrame(() => { ta.focus({ preventScroll: true }); ta.setSelectionRange(caret, caret); });
    } else if (multi) {
      const ind = val.slice(start, blockEnd).replace(/^/gm, "  ");
      setContentDraft(val.slice(0, start) + ind + val.slice(blockEnd));
      const lines = val.slice(start, en).split("\n").length;
      requestAnimationFrame(() => { ta.focus({ preventScroll: true }); ta.setSelectionRange(s + 2, en + 2 * lines); });
    } else {
      setContentDraft(val.slice(0, s) + "  " + val.slice(en));
      requestAnimationFrame(() => { ta.focus({ preventScroll: true }); ta.setSelectionRange(s + 2, s + 2); });
    }
  }

  function onContentKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    /* v2.0 — wiki autocomplete keys */
    if (wikiSug && wikiOptions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setWikiSug({ ...wikiSug, sel: (wikiSug.sel + 1) % wikiOptions.length });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setWikiSug({ ...wikiSug, sel: (wikiSug.sel - 1 + wikiOptions.length) % wikiOptions.length });
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertWiki(wikiOptions[wikiSug.sel] ?? wikiSug.query);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setWikiSug(null);
        return;
      }
    }
    /* v2.1 — Tab/Shift+Tab indents code & HTML notes (wiki autocomplete wins first) */
    if (e.key === "Tab" && (note.noteType === "code" || note.noteType === "html")) {
      indentCode(e);
      return;
    }
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === "b") { e.preventDefault(); applyFormat("bold"); }
    if (k === "i") { e.preventDefault(); applyFormat("italic"); }
  }

  const isTrashed = note.trashed;
  const words = contentDraft.trim() ? contentDraft.trim().split(/\s+/).length : 0;
  const readMin = Math.max(1, Math.round(words / 200));
  const showFormatBar = ["markdown", "task", "checklist"].includes(note.noteType) && (mode === "edit" || mode === "split");

  /* -------- v2.0 — wiki links + backlinks -------- */

  const backlinks = useMemo(() => {
    const t = note.title.trim().toLowerCase();
    if (!t) return [];
    return Object.values(notesAll).filter(
      (n) => n.id !== note.id && !n.trashed && !isLockEncrypted(n.content) &&
        n.content.toLowerCase().includes(`[[${t}]]`)
    );
  }, [notesAll, note.id, note.title]);

  const wikiOptions = useMemo(() => {
    if (!wikiSug) return [];
    const q = wikiSug.query.trim().toLowerCase();
    const out: string[] = [];
    for (const n of Object.values(notesAll)) {
      if (n.id === note.id || n.trashed) continue;
      const t = (unlocked[n.id]?.title ?? n.title).trim();
      if (!t || out.includes(t)) continue;
      if (!q || t.toLowerCase().includes(q)) out.push(t);
      if (out.length >= 7) break;
    }
    return out;
  }, [wikiSug, notesAll, unlocked, note.id]);

  async function openWikiLink(raw: string) {
    const title = raw.trim();
    if (!title) return;
    const st = useApp.getState();
    const found = Object.values(st.notes).find(
      (n) => !n.trashed && (st.unlockedNotes[n.id]?.title ?? n.title).trim().toLowerCase() === title.toLowerCase()
    );
    if (found) {
      selectNote(found.id);
    } else {
      const id = await createNote();
      await updateNote(id, { title });
      selectNote(id);
    }
  }

  /** track `[[…` right before the caret to show the link autocomplete */
  function updateWikiQuery(text: string, caret: number) {
    const before = text.slice(0, caret);
    const m = /\[\[([^\]\n]{0,60})$/.exec(before);
    if (m) setWikiSug({ query: m[1], start: caret - m[1].length, end: caret, sel: 0 });
    else setWikiSug(null);
  }

  function insertWiki(title: string) {
    if (!wikiSug) return;
    const { start, end } = wikiSug;
    const next = contentDraft.slice(0, start) + title + "]]" + contentDraft.slice(end);
    const pos = start + title.length + 2;
    setContentDraft(next);
    setWikiSug(null);
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.focus({ preventScroll: true });
        ta.setSelectionRange(pos, pos);
      }
    });
  }

  function onEditContent(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setContentDraft(e.target.value);
    updateWikiQuery(e.target.value, e.target.selectionStart ?? e.target.value.length);
  }

  async function addTag() {
    const name = tagInput.trim();
    if (!name) return;
    const id = await ensureTag(name);
    const cur = noteRef.current;
    if (id && cur && !cur.tagIds.includes(id)) {
      void updateNote(cur.id, { tagIds: [...cur.tagIds, id] });
    }
    setTagInput("");
  }

  function toggleTag(id: string) {
    const cur = noteRef.current;
    if (!cur) return;
    const has = cur.tagIds.includes(id);
    void updateNote(cur.id, {
      tagIds: has ? cur.tagIds.filter((t) => t !== id) : [...cur.tagIds, id],
    });
  }

  /* -------- v2.1 — insert a template at the caret (or append) -------- */
  function insertTemplate(md: string) {
    const ta = textareaRef.current;
    if (ta && mode !== "preview") {
      const s = ta.selectionStart ?? contentDraft.length;
      const e = ta.selectionEnd ?? s;
      const sep = s > 0 && contentDraft[s - 1] !== "\n" ? "\n" : "";
      const next = contentDraft.slice(0, s) + sep + md + contentDraft.slice(e);
      setContentDraft(next);
      const caret = s + sep.length + md.length;
      requestAnimationFrame(() => { ta.focus({ preventScroll: true }); ta.setSelectionRange(caret, caret); });
    } else {
      setContentDraft(contentDraft ? `${contentDraft}\n\n${md}` : md);
      setMode("edit");
    }
  }

  function doPrint() {
    setPrintDoc({ title: titleDraft || "Untitled", content: contentDraft });
    setTimeout(() => window.print(), 120);
  }

  /* -------- locked gate -------- */
  if (isLockedHidden) {
    return <LockGate note={note} onBack={onBack} unlockNote={unlockNote} setMobilePane={setMobilePane} />;
  }
  if (vaultHidden) {
    return <VaultGate onBack={onBack} unlockVault={unlockVault} setMobilePane={setMobilePane} />;
  }

  const bodyArea = (
    <div className={cn("w-full mx-auto px-4 md:px-10 py-5 md:py-6", WIDTH_CLASS[note.editorWidth] ?? WIDTH_CLASS.narrow)}>
      <input
        value={titleDraft}
        onChange={(e) => setTitleDraft(e.target.value)}
        placeholder="Untitled"
        disabled={readOnly}
        className="w-full bg-transparent text-[1.55rem] md:text-3xl font-bold outline-none placeholder:text-muted-foreground/50 mb-3 md:mb-4 disabled:opacity-60 leading-snug"
        style={{ fontFamily: "var(--nx-editor-font)" }}
      />

      {mode === "preview" ? (
        <TypePreview
          note={note} content={contentDraft} onToggleTask={toggleTaskInDraft}
          onAddAuthLine={handleAddAuthLine} readOnly={readOnly} onWiki={openWikiLink}
        />
      ) : note.noteType === "richtext" ? (
        <RichTextEditor value={contentDraft} onChange={(md) => setContentDraft(md)} readOnly={readOnly} />
      ) : note.noteType === "spreadsheet" ? (
        <SheetEditor content={contentDraft} onChange={setContentDraft} readOnly={readOnly} />
      ) : note.noteType === "html" ? (
        <Textarea
          ref={textareaRef}
          value={contentDraft}
          onChange={(e) => setContentDraft(e.target.value)}
          onKeyDown={onContentKeyDown}
          placeholder={"<h1>Hello</h1>\n<p>Write HTML here — it renders in Preview.</p>"}
          disabled={readOnly}
          spellCheck={false}
          className="nx-editor min-h-[52vh] resize-none border-none shadow-none p-0 focus-visible:ring-0 bg-transparent font-mono text-[13.5px]"
        />
      ) : note.noteType === "code" ? (
        <Textarea
          ref={textareaRef}
          value={contentDraft}
          onChange={(e) => setContentDraft(e.target.value)}
          onKeyDown={onContentKeyDown}
          placeholder="// code snippet… — Tab indents, Shift+Tab dedents"
          disabled={readOnly}
          spellCheck={false}
          className="nx-editor min-h-[52vh] resize-none border-none shadow-none p-0 focus-visible:ring-0 bg-transparent font-mono"
        />
      ) : (
        <div className="relative">
          <Textarea
            ref={textareaRef}
            value={contentDraft}
            onChange={onEditContent}
            onKeyDown={onContentKeyDown}
            placeholder={note.noteType === "plain" ? "Start writing…" : "Start writing… (Markdown supported — or use the toolbar). Type [[ to link a note."}
            disabled={readOnly}
            spellCheck={spell}
            className="nx-editor min-h-[52vh] resize-none border-none shadow-none p-0 focus-visible:ring-0 bg-transparent"
          />
          {/* v2.0 — [[wiki-link autocomplete */}
          {wikiSug && wikiOptions.length > 0 && (
            <div className="absolute z-30 top-1 right-1 w-60 rounded-lg border bg-popover text-popover-foreground shadow-md p-1 animate-in fade-in zoom-in-95 duration-150">
              <p className="text-[10px] text-muted-foreground px-2 py-1">Link a note — ↑↓ + Enter</p>
              {wikiOptions.map((t, i) => (
                <button
                  key={t}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); insertWiki(t); }}
                  className={cn(
                    "w-full text-left text-xs rounded px-2 py-1.5 truncate flex items-center gap-1.5",
                    i === wikiSug.sel ? "bg-muted" : "hover:bg-muted/60"
                  )}
                >
                  <Link2 className="h-3 w-3 text-muted-foreground shrink-0" /> {t}
                </button>
              ))}
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); insertWiki(wikiSug.query.trim() || "Untitled"); }}
                className="w-full text-left text-xs rounded px-2 py-1.5 nx-accent-text border-t mt-0.5"
              >
                ＋ Create “{wikiSug.query.trim() || "Untitled"}”
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn("h-full flex flex-col bg-background nx-fade relative", zen && "nx-zen")}
        /* v1.4 reading progress — capture scrolls from any inner pane (edit / split / preview) */
        onScrollCapture={(e) => {
          const t = e.target as HTMLElement;
          if (!t || t.tagName !== "DIV" || !t.classList.contains("overflow-y-auto")) return;
          const max = t.scrollHeight - t.clientHeight;
          setReadPct(max > 4 ? Math.min(100, Math.max(0, (t.scrollTop / max) * 100)) : 0);
        }}
      >
        {/* reading progress bar (v1.4) */}
        <div className="nx-progress-track">
          <div className="nx-progress-bar" style={{ width: `${readPct}%` }} />
        </div>
        {/* toolbar — hidden in zen mode; horizontally scrollable on phones */}
        {!zen && (
          <div className="flex items-center gap-1 p-2 border-b shrink-0 overflow-x-auto nx-no-scrollbar">
            <Button
              variant="ghost" size="icon" className="h-8 w-8 md:hidden shrink-0"
              onClick={() => { onBack(); setMobilePane("list"); }} aria-label="Back to list"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>

            {!isTrashed && (
              <>
                <Select
                  value={note.folderId ?? "none"}
                  onValueChange={(v) => void updateNote(note.id, { folderId: v === "none" ? null : v })}
                >
                  <SelectTrigger className="h-8 w-[124px] shrink-0 text-xs border-none shadow-none bg-muted/50 gap-1">
                    <FolderIcon className="h-3.5 w-3.5 shrink-0" />
                    <SelectValue placeholder="No folder" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No folder</SelectItem>
                    {Object.values(folders).map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Popover open={tagPickerOpen} onOpenChange={setTagPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 shrink-0 text-xs bg-muted/50 gap-1.5">
                      <TagIcon className="h-3.5 w-3.5" /> Tags
                      {note.tagIds.length > 0 && (
                        <Badge variant="secondary" className="h-4 px-1 text-[10px]">{note.tagIds.length}</Badge>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-64 p-3">
                    <form
                      onSubmit={(e) => { e.preventDefault(); void addTag(); }}
                      className="flex gap-1.5 mb-2"
                    >
                      <Input
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        placeholder="New tag name…"
                        className="h-8 text-xs"
                      />
                      <Button type="submit" size="icon" className="h-8 w-8 nx-accent-bg" aria-label="Add tag">
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    </form>
                    <div className="max-h-48 overflow-y-auto nx-scroll space-y-0.5">
                      {Object.values(tags).length === 0 && (
                        <p className="text-xs text-muted-foreground py-2">Type above to create your first tag</p>
                      )}
                      {Object.values(tags)
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((t) => {
                          const on = note.tagIds.includes(t.id);
                          return (
                            <button
                              key={t.id}
                              onClick={() => toggleTag(t.id)}
                              className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted text-left"
                            >
                              <span className={cn(
                                "h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0",
                                on ? "nx-accent-bg border-transparent text-white" : "border-input"
                              )}>
                                {on && <Check className="h-2.5 w-2.5" />}
                              </span>
                              <TagIcon className="h-3 w-3 text-muted-foreground" />
                              <span className="truncate">{t.name}</span>
                            </button>
                          );
                        })}
                    </div>
                  </PopoverContent>
                </Popover>

                <div className="flex-1 min-w-2" />

                <ToolbarBtn onClick={() => void updateNote(note.id, { starred: !note.starred })} label={note.starred ? "Unstar" : "Star"}>
                  <Star className={cn("h-4 w-4", note.starred && "text-amber-500")} fill={note.starred ? "currentColor" : "none"} />
                </ToolbarBtn>
                <ToolbarBtn onClick={() => void updateNote(note.id, { pinned: !note.pinned })} label={note.pinned ? "Unpin" : "Pin to top"}>
                  {note.pinned ? <PinOff className="h-4 w-4 nx-accent-text" /> : <Pin className="h-4 w-4" />}
                </ToolbarBtn>
                <ToolbarBtn onClick={() => setHistory(note.id)} label="Note history (Ctrl+H)" className="hidden sm:inline-flex">
                  <History className="h-4 w-4" />
                </ToolbarBtn>
                {/* copy note (v1.4) — morphs to a green check */}
                <ToolbarBtn
                  onClick={() => {
                    void copyNoteMarkdown(note.id);
                    setCopiedNote(true);
                    setTimeout(() => setCopiedNote(false), 1400);
                  }}
                  label="Copy note as Markdown"
                  className="hidden sm:inline-flex"
                >
                  {copiedNote ? <Check className="h-4 w-4 nx-accent-text nx-pop" /> : <Copy className="h-4 w-4" />}
                </ToolbarBtn>
                {note.locked && (
                  <Badge variant="outline" className="h-6 px-2 text-[10px] gap-1 shrink-0 nx-accent-text border-current/30">
                    <Lock className="h-3 w-3" /> protected
                  </Badge>
                )}
                {/* mode segmented control — desktop & tablets */}
                <div className="flex items-center rounded-lg border bg-muted/50 p-0.5 shrink-0" role="tablist" aria-label="Editor view mode">
                  <ModeBtn active={mode === "edit"} onClick={() => setMode("edit")} label="Edit (Alt+E)"><PencilLine className="h-4 w-3.5 md:h-3.5" /></ModeBtn>
                  <ModeBtn active={mode === "split"} onClick={() => setMode("split")} label="Split view (Alt+E)"><Columns2 className="h-3.5 w-3.5" /></ModeBtn>
                  <ModeBtn active={mode === "preview"} onClick={() => setMode("preview")} label="Preview (Alt+E)"><Eye className="h-3.5 w-3.5" /></ModeBtn>
                </div>
                <ToolbarBtn onClick={() => setFindOpen(true)} label="Find in note (Ctrl+F)" active={findOpen} className="hidden sm:inline-flex">
                  <Search className="h-4 w-4" />
                </ToolbarBtn>
                {/* v2.0 — backlinks */}
                <ToolbarBtn onClick={() => setShowBacklinks((v) => !v)} label="Backlinks — notes linking here" active={showBacklinks} className="hidden sm:inline-flex">
                  <BookOpen className="h-4 w-4" />
                </ToolbarBtn>
                <ToolbarBtn onClick={() => void updateNote(note.id, { archived: !note.archived })} label={note.archived ? "Unarchive" : "Archive"} className="hidden sm:inline-flex">
                  {note.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                </ToolbarBtn>
                <ToolbarBtn onClick={() => setZen(true)} label="Zen mode" className="hidden md:inline-flex">
                  <Maximize className="h-4 w-4" />
                </ToolbarBtn>
                <NoteMenu
                  note={note}
                  onFind={() => setFindOpen(true)}
                  mode={mode}
                  onMode={setMode}
                  zen={zen}
                  onZen={() => setZen(true)}
                  onPrint={doPrint}
                  onCopy={() => void copyNoteMarkdown(note.id)}
                  onInsertTemplate={insertTemplate}
                />
              </>
            )}

            {isTrashed && (
              <>
                <span className="text-xs text-muted-foreground px-2 py-1 rounded bg-muted shrink-0">This note is in the trash</span>
                <div className="flex-1 min-w-2" />
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 shrink-0" onClick={() => void restoreNote(note.id)}>
                  <RotateCcw className="h-3.5 w-3.5" /> Restore
                </Button>
                <Button variant="destructive" size="sm" className="h-8 text-xs gap-1.5 shrink-0" onClick={() => void deleteForever(note.id)}>
                  <X className="h-3.5 w-3.5" /> Delete forever
                </Button>
              </>
            )}
          </div>
        )}

        {/* zen exit button */}
        {zen && (
          <Button
            variant="ghost" size="sm"
            className="absolute top-3 right-3 z-20 h-8 text-xs text-muted-foreground hover:text-foreground gap-1.5"
            onClick={() => setZen(false)}
            aria-label="Exit zen mode (Esc)"
          >
            <Minimize className="h-3.5 w-3.5" /> Exit zen
          </Button>
        )}

        {/* find & replace bar (v2.1 — replace row added) */}
        {findOpen && mode !== "preview" && !zen && (
          <div className="border-b bg-muted/40 shrink-0">
            <div className="flex items-center gap-2 px-3 py-1.5">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <Input
                id="nx-find-input"
                value={findQuery}
                onChange={(e) => { setFindQuery(e.target.value); setFindIdx(0); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); jumpToMatch(e.shiftKey ? -1 : 1); }
                  if (e.key === "Escape") { setFindOpen(false); setFindQuery(""); }
                }}
                placeholder="Find in note…"
                className="h-7 text-xs bg-background"
              />
              <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
                {findQuery ? `${matches ? findIdx + 1 : 0}/${matches}` : ""}
              </span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => jumpToMatch(-1)} disabled={!matches} aria-label="Previous match">
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => jumpToMatch(1)} disabled={!matches} aria-label="Next match">
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setFindOpen(false); setFindQuery(""); }} aria-label="Close find bar">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            {findQuery && (
              <div className="flex items-center gap-2 px-3 pb-1.5 animate-in slide-in-from-top-1 fade-in duration-150">
                <Replace className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <Input
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); replaceOne(); } }}
                  placeholder="Replace with…"
                  className="h-7 text-xs bg-background"
                />
                <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={replaceOne} disabled={!matches}>
                  Replace
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={replaceAll} disabled={!matches}>
                  All ({matches})
                </Button>
              </div>
            )}
          </div>
        )}

        {/* markdown format toolbar */}
        {showFormatBar && !zen && (
          <div className="flex items-center gap-0.5 px-2 py-1 border-b bg-muted/30 shrink-0 overflow-x-auto nx-no-scrollbar">
            <FmtBtn onClick={() => applyFormat("bold")} label="Bold (Ctrl+B)"><Bold className="h-4 w-4" /></FmtBtn>
            <FmtBtn onClick={() => applyFormat("italic")} label="Italic (Ctrl+I)"><Italic className="h-4 w-4" /></FmtBtn>
            <span className="h-5 w-px bg-border mx-1 shrink-0" />
            <FmtBtn onClick={() => applyFormat("h1")} label="Heading 1"><Heading1 className="h-4 w-4" /></FmtBtn>
            <FmtBtn onClick={() => applyFormat("h2")} label="Heading 2"><Heading2 className="h-4 w-4" /></FmtBtn>
            <span className="h-5 w-px bg-border mx-1 shrink-0" />
            <FmtBtn onClick={() => applyFormat("ul")} label="Bullet list"><List className="h-4 w-4" /></FmtBtn>
            <FmtBtn onClick={() => applyFormat("todo")} label="Checklist"><ListChecks className="h-4 w-4" /></FmtBtn>
            <FmtBtn onClick={() => applyFormat("quote")} label="Quote"><Quote className="h-4 w-4" /></FmtBtn>
            <span className="h-5 w-px bg-border mx-1 shrink-0" />
            <FmtBtn onClick={() => applyFormat("code")} label="Code"><Code className="h-4 w-4" /></FmtBtn>
            <FmtBtn onClick={() => applyFormat("link")} label="Link"><Link2 className="h-4 w-4" /></FmtBtn>
          </div>
        )}

        {/* editing prevented banner */}
        {note.preventEdit && !isTrashed && (
          <div className="flex items-center gap-2 px-4 py-1.5 border-b bg-amber-500/10 text-amber-600 dark:text-amber-500 text-xs shrink-0">
            <Ban className="h-3.5 w-3.5" /> Editing is prevented for this note — enable it from the ⋯ menu.
          </div>
        )}

        {/* v2.0 — backlinks strip */}
        {showBacklinks && !zen && (
          <div className="px-4 md:px-10 py-2 border-b bg-muted/30 text-xs shrink-0 animate-in slide-in-from-top-1 fade-in duration-200 max-h-32 overflow-y-auto nx-scroll">
            <p className="text-[11px] font-medium mb-1.5 flex items-center gap-1.5">
              <BookOpen className="h-3 w-3 nx-accent-text" />
              {backlinks.length} note{backlinks.length === 1 ? "" : "s"} link here
            </p>
            <div className="flex flex-wrap gap-1.5">
              {backlinks.length === 0 && (
                <span className="text-muted-foreground">Type <code className="text-[10px] bg-muted px-1 rounded">[[…]]</code> in any note to link to this one.</span>
              )}
              {backlinks.map((b) => (
                <button
                  key={b.id}
                  onClick={() => selectNote(b.id)}
                  className="rounded-full border px-2.5 py-0.5 hover:bg-muted truncate max-w-[220px] transition-colors"
                  title="Open note"
                >
                  {(unlocked[b.id]?.title ?? b.title) || "Untitled"}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* title + content (split = editor left, preview right) */}
        {mode === "split" ? (
          <div className="flex-1 min-h-0 flex">
            <div className="flex-1 overflow-y-auto nx-scroll border-r min-w-0">{bodyArea}</div>
            <div className="flex-1 overflow-y-auto nx-scroll min-w-0">
              <div className={cn("w-full mx-auto px-4 md:px-10 py-5 md:py-6", WIDTH_CLASS[note.editorWidth] ?? WIDTH_CLASS.narrow)}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Preview</p>
                <TypePreview note={note} content={contentDraft} onToggleTask={toggleTaskInDraft} onWiki={openWikiLink} />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto nx-scroll">{bodyArea}</div>
        )}

{/* status bar */}
        {!zen && (
          <div className="flex items-center gap-3 md:gap-4 px-4 md:px-10 h-8 border-t text-[11px] text-muted-foreground shrink-0 pb-[env(safe-area-inset-bottom)]">
            <span className="tabular-nums">{words} words · {contentDraft.length} chars · ~{readMin} min read</span>
            <span className="flex items-center gap-1.5">
              <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", online ? "nx-accent-bg nx-pulse-soft" : "bg-amber-500 nx-pulse-soft")} />
              <span className="hidden sm:inline">Saved locally {online ? "· syncing" : "· offline — queued"}</span>
            </span>
            {user?.encryptionEnabled && (
              <span className="hidden sm:flex items-center gap-1 nx-accent-text">
                <ShieldCheck className="h-3 w-3" /> E2E
              </span>
            )}
            {note.locked && (
              <span className="hidden sm:flex items-center gap-1 nx-accent-text">
                <Lock className="h-3 w-3" /> protected
              </span>
            )}
            <span className="ml-auto hidden md:inline capitalize">{note.noteType} · {note.editorWidth} · autosave</span>
          </div>
        )}
      </div>

      {/* print-only document */}
      {printDoc && (
        <div id="nx-print-root" className="nx-print-only">
          <h1>{printDoc.title}</h1>
          <div className="md-preview">
            <Markdown>{printDoc.content}</Markdown>
          </div>
        </div>
      )}
    </TooltipProvider>
  );

  /* task checkbox toggle → edit the draft content in place */
  function toggleTaskInDraft(lineIndex: number, mode2: "task" | "checklist") {
    const lines = contentDraft.split("\n");
    const line = lines[lineIndex];
    if (line === undefined) return;
    if (mode2 === "task") {
      if (/\[[xX]\]/.test(line)) lines[lineIndex] = line.replace(/\[[xX]\]/, "[ ]");
      else lines[lineIndex] = line.replace(/\[\s?\]/, "[x]");
    } else {
      if (/^\s*\[[xX]\]\s?/.test(line)) lines[lineIndex] = line.replace(/^\s*\[[xX]\]\s?/, "");
      else if (/^\s*\[\s?\]\s?/.test(line)) lines[lineIndex] = line.replace(/^\s*\[\s?\]\s?/, "[x] ");
      else lines[lineIndex] = `[x] ${line}`;
    }
    setContentDraft(lines.join("\n"));
  }

  /** authenticator "Add account" → append the line to the note draft */
  function handleAddAuthLine(nextContent: string) {
    setContentDraft(nextContent);
  }
}

/* ------------------------------------------------------------------ */
/* per-type preview                                                    */
/* ------------------------------------------------------------------ */

const TASK_RE = /^(\s*)[-*]?\s*\[( |x|X)\]\s+(.*)$/;

function TypePreview({
  note, content, onToggleTask, onAddAuthLine, readOnly, onWiki,
}: {
  note: UiNote;
  content: string;
  onToggleTask: (lineIndex: number, mode: "task" | "checklist") => void;
  onAddAuthLine?: (next: string) => void;
  readOnly?: boolean;
  onWiki?: (title: string) => void;
}) {
  if (note.noteType === "code") {
    return (
      <CodeBlock
        code={content || "// nothing here yet"}
        noteId={note.id}
        showPicker
        maxHeight="min(70vh, 720px)"
      />
    );
  }
  if (note.noteType === "spreadsheet") {
    return <SheetPreview content={content} />;
  }
  if (note.noteType === "authenticator") {
    return <TotpPreview content={content} onAddLine={onAddAuthLine} readOnly={readOnly} />;
  }
  if (note.noteType === "html") {
    return <HtmlPreview content={content} />;
  }
  if (note.noteType === "plain") {
    return <div className="min-h-[300px] text-[15px] whitespace-pre-wrap">{content || "*Nothing to preview yet.*"}</div>;
  }
  if (note.noteType === "task" || note.noteType === "checklist") {
    const lines = content.split("\n");
    const blocks: { type: "md" | "task" | "checklist"; lines: { text: string; idx: number }[] }[] = [];
    let cur: (typeof blocks)[number] | null = null;
    lines.forEach((line, idx) => {
      const isTask = TASK_RE.test(line);
      const isChecklistLine = note.noteType === "checklist" && line.trim().length > 0;
      if (isTask || isChecklistLine) {
        const mode = isTask ? "task" : "checklist";
        if (!cur || cur.type !== mode) {
          cur = { type: mode, lines: [] };
          blocks.push(cur);
        }
        cur.lines.push({ text: line, idx });
      } else {
        cur = { type: "md", lines: [{ text: line, idx }] };
        blocks.push(cur);
      }
    });
    return (
      <div className="min-h-[300px] text-[15px]">
        {blocks.map((b, bi) =>
          b.type === "md" ? (
            <div key={bi} className="md-preview">
              <Markdown onWiki={onWiki}>
                {b.lines.map((l) => l.text).join("\n")}
              </Markdown>
            </div>
          ) : (
            <div key={bi} className="space-y-0.5 my-1">
              {b.lines.map((l) => {
                const m = TASK_RE.exec(l.text);
                const checked = m ? m[2].toLowerCase() === "x" : false;
                const text = m ? m[3] : l.text;
                return (
                  <button
                    key={l.idx}
                    onClick={() => onToggleTask(l.idx, b.type as "task" | "checklist")}
                    className="flex items-start gap-2.5 w-full text-left rounded px-1.5 py-1 hover:bg-muted/60 transition-colors"
                  >
                    <span className={cn(
                      "mt-0.5 h-5 w-5 shrink-0 rounded border flex items-center justify-center transition-colors",
                      checked ? "nx-accent-bg border-transparent" : "border-input bg-background"
                    )}>
                      {checked && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                    </span>
                    <span className={cn(checked && "line-through text-muted-foreground")}>{text}</span>
                  </button>
                );
              })}
            </div>
          )
        )}
        {content.trim() === "" && <p className="text-muted-foreground italic">*Nothing to preview yet.*</p>}
      </div>
    );
  }
  return (
    <div className="md-preview min-h-[300px]">
      <Markdown onWiki={onWiki}>{content || "*Nothing to preview yet.*"}</Markdown>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* locked note gate                                                    */
/* ------------------------------------------------------------------ */

function LockGate({
  note, onBack, unlockNote, setMobilePane,
}: {
  note: UiNote;
  onBack: () => void;
  unlockNote: (id: string, password: string) => Promise<void>;
  setMobilePane: (p: "list" | "editor") => void;
}) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pw) return;
    setBusy(true);
    setError(null);
    try {
      await unlockNote(note.id, pw);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unlock failed");
    } finally {
      setBusy(false);
      setPw("");
    }
  }

  return (
    <div className={cn("h-full flex flex-col items-center justify-center bg-background px-6 nx-fade")}>
      <form onSubmit={submit} className="w-full max-w-xs rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col items-center text-center mb-5">
          <div className="h-12 w-12 rounded-2xl nx-accent-bg flex items-center justify-center mb-3">
            <Lock className="h-6 w-6 text-white" />
          </div>
          <h3 className="font-semibold">This note is protected</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Enter the note password to decrypt it for this session.
          </p>
        </div>
        <Input
          type="password" value={pw} onChange={(e) => setPw(e.target.value)}
          placeholder="Note password" autoFocus autoComplete="off"
        />
        {error && <p className="text-xs text-destructive mt-2">{error}</p>}
        <Button type="submit" className="w-full mt-3 nx-accent-bg" disabled={busy || !pw}>
          {busy ? <RotateCcw className="h-4 w-4 animate-spin" /> : <LockOpen className="h-4 w-4" />}
          Unlock note
        </Button>
        <div className="flex items-center justify-between mt-3">
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground"
            onClick={() => { onBack(); setMobilePane("list"); }}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Button>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Trash2 className="h-3 w-3" /> trash actions stay available
          </span>
        </div>
      </form>
      <p className="text-[11px] text-muted-foreground mt-4 max-w-xs text-center">
        Wrong password? The note keeps its previous version — try again or check Note history after unlocking.
      </p>
    </div>
  );
}

/** v2.2 — gate for notes whose body is still account ciphertext (nxenc) in
 *  memory: the vault is locked for this session, or the key failed to decrypt
 *  that note. Replaces the raw-ciphertext textarea that made encrypted notes
 *  look corrupted — and invited exactly one wrong keystroke too many. */
function VaultGate({
  onBack, unlockVault, setMobilePane,
}: {
  onBack: () => void;
  unlockVault: (password: string) => Promise<void>;
  setMobilePane: (p: "list" | "editor") => void;
}) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pw) return;
    setBusy(true);
    setError(null);
    try {
      await unlockVault(pw); // success decrypts every note in memory
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unlock failed");
    } finally {
      setBusy(false);
      setPw("");
    }
  }

  return (
    <div className={cn("h-full flex flex-col items-center justify-center bg-background px-6 nx-fade")}>
      <form onSubmit={submit} className="w-full max-w-xs rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col items-center text-center mb-5">
          <div className="h-12 w-12 rounded-2xl nx-accent-bg flex items-center justify-center mb-3">
            <Lock className="h-6 w-6 text-white" />
          </div>
          <h3 className="font-semibold">Vault locked</h3>
          <p className="text-xs text-muted-foreground mt-1">
            This note is end-to-end encrypted. Enter your account password to decrypt it for this session.
          </p>
        </div>
        <Input
          type="password" value={pw} onChange={(e) => setPw(e.target.value)}
          placeholder="Account password" autoFocus autoComplete="current-password"
        />
        {error && <p className="text-xs text-destructive mt-2">{error}</p>}
        <Button type="submit" className="w-full mt-3 nx-accent-bg" disabled={busy || !pw}>
          {busy ? <RotateCcw className="h-4 w-4 animate-spin" /> : <LockOpen className="h-4 w-4" />}
          Unlock vault
        </Button>
        <div className="mt-3">
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground"
            onClick={() => { onBack(); setMobilePane("list"); }}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Button>
        </div>
      </form>
      <p className="text-[11px] text-muted-foreground mt-4 max-w-xs text-center">
        Nothing was lost — the note stays safely encrypted until the vault unlocks.
      </p>
    </div>
  );
}

function ToolbarBtn({
  children, onClick, label, danger, active, className,
}: {
  children: React.ReactNode; onClick: () => void; label: string; danger?: boolean; active?: boolean; className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost" size="icon"
          className={cn("h-8 w-8 shrink-0", danger && "hover:text-destructive hover:bg-destructive/10", active && "bg-muted", className)}
          onClick={onClick} aria-label={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function ModeBtn({
  children, onClick, label, active,
}: {
  children: React.ReactNode; onClick: () => void; label: string; active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 h-7 text-xs font-medium transition-colors",
        active ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function FmtBtn({
  children, onClick, label,
}: {
  children: React.ReactNode; onClick: () => void; label: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost" size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={onClick} aria-label={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
