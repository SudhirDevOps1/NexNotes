"use client";

import { useEffect, useState } from "react";
import {
  History, Search, RectangleHorizontal, FileText, Eye, PenOff, KeyRound,
  Star, Pin, CopyPlus, Download, Archive, Trash2, MoreHorizontal, Lock,
  LockOpen, Check, RotateCw, Printer, ClipboardCopy, Columns2, Maximize,
  NotebookPen, ListTodo, ListChecks, Code, Type, Table2, Settings, Globe, Send,
  Share2, Link2, Unlink, PenLine, FilePlus2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useApp, type UiNote } from "@/lib/store";
import type { EditorWidth, NoteType } from "@/lib/types";
import { NOTE_TEMPLATES } from "@/lib/templates";
import { loadIntegrations, sendNoteToDiscord } from "@/lib/integrations";
import { cn } from "@/lib/utils";

const TYPE_LABELS: { value: NoteType; label: string; icon: React.ReactNode }[] = [
  { value: "markdown", label: "Markdown", icon: <NotebookPen className="h-4 w-4" /> },
  { value: "plain", label: "Plain text", icon: <Type className="h-4 w-4" /> },
  { value: "richtext", label: "Rich text (WYSIWYG)", icon: <PenLine className="h-4 w-4" /> },
  { value: "task", label: "Task list", icon: <ListTodo className="h-4 w-4" /> },
  { value: "checklist", label: "Checklist", icon: <ListChecks className="h-4 w-4" /> },
  { value: "code", label: "Code snippet", icon: <Code className="h-4 w-4" /> },
  { value: "spreadsheet", label: "Spreadsheet", icon: <Table2 className="h-4 w-4" /> },
  { value: "authenticator", label: "Authenticator (2FA)", icon: <KeyRound className="h-4 w-4" /> },
  { value: "html", label: "HTML / Web page", icon: <Globe className="h-4 w-4" /> },
];

const WIDTH_LABELS: { value: EditorWidth; label: string }[] = [
  { value: "narrow", label: "Narrow" },
  { value: "medium", label: "Medium" },
  { value: "full", label: "Full" },
];

export function NoteMenu({
  note, onFind, mode, onMode, zen, onZen, onPrint, onCopy, onInsertTemplate,
}: {
  note: UiNote;
  onFind: () => void;
  mode: "edit" | "split" | "preview";
  onMode: (m: "edit" | "split" | "preview") => void;
  zen: boolean;
  onZen: () => void;
  onPrint: () => void;
  onCopy: () => void;
  /** v2.1 — templates (undefined when the note can't be edited) */
  onInsertTemplate?: (md: string) => void;
}) {
  const setHistory = useApp((s) => s.setHistory);
  const setSettings = useApp((s) => s.setSettings);
  const setLockDialog = useApp((s) => s.setLockDialog);
  const setNoteType = useApp((s) => s.setNoteType);
  const setEditorWidth = useApp((s) => s.setEditorWidth);
  const togglePreventEdit = useApp((s) => s.togglePreventEdit);
  const toggleStar = useApp((s) => s.toggleStar);
  const updateNote = useApp((s) => s.updateNote);
  const duplicateNote = useApp((s) => s.duplicateNote);
  const exportNote = useApp((s) => s.exportNote);
  const trashNote = useApp((s) => s.trashNote);
  const restoreNote = useApp((s) => s.restoreNote);
  const relockNote = useApp((s) => s.relockNote);
  const unlocked = useApp((s) => s.unlockedNotes[note.id]);
  const encKey = useApp((s) => s.encKey);

  const isTrashed = note.trashed;

  /** v1.3 — send this note to the configured Discord webhook */
  async function sendToDiscord() {
    const list = await loadIntegrations(encKey);
    const title = unlocked?.title ?? (note.title || "Untitled");
    const body = unlocked?.content ?? note.content;
    const res = await sendNoteToDiscord(list, title, body);
    if (res.ok) toast.success(res.message);
    else toast.error(res.message);
  }

  /* v2.0 — public share links */
  const [sharedPath, setSharedPath] = useState<string | null>(null);
  useEffect(() => {
    setSharedPath(null);
    if (note.trashed) return;
    fetch(`/api/notes/${note.id}/share`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSharedPath(d?.enabled ? d.path : null))
      .catch(() => setSharedPath(null));
  }, [note.id, note.trashed]);

  async function toggleShare(on: boolean) {
    try {
      const r = await fetch(`/api/notes/${note.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: on }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Share failed");
      if (on && d.path) {
        setSharedPath(d.path);
        const url = `${window.location.origin}${d.path}`;
        const ok = await (await import("@/lib/clipboard")).copyText(url);
        toast.success("Public link created & copied", {
          description: ok ? url : "Anyone with this link can read the note — revoke anytime.",
          duration: 5000,
        });
      } else {
        setSharedPath(null);
        toast.success("Public link revoked — the page no longer exists");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Share failed");
    }
  }

  async function copyShareLink() {
    if (!sharedPath) return;
    const ok = await (await import("@/lib/clipboard")).copyText(`${window.location.origin}${sharedPath}`);
    toast[ok ? "success" : "error"](ok ? "Link copied" : "Clipboard unavailable");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Note actions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">

        <DropdownMenuItem onClick={() => setHistory(note.id)}>
          <History className="h-4 w-4" /> Note history
          <span className="ml-auto text-xs text-muted-foreground">Ctrl+H</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onFind}>
          <Search className="h-4 w-4" /> Find in note
          <span className="ml-auto text-xs text-muted-foreground">Ctrl+F</span>
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Eye className="h-4 w-4 mr-2" /> View mode
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => onMode("edit")}>
              <PenOff className="h-3.5 w-3.5" /> Editor
              <Check className={cn("ml-auto h-3.5 w-3.5", mode !== "edit" && "invisible")} />
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMode("split")}>
              <Columns2 className="h-3.5 w-3.5" /> Split view
              <Check className={cn("ml-auto h-3.5 w-3.5", mode !== "split" && "invisible")} />
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMode("preview")}>
              <Eye className="h-3.5 w-3.5" /> Preview
              <Check className={cn("ml-auto h-3.5 w-3.5", mode !== "preview" && "invisible")} />
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuItem onClick={onZen}>
          <Maximize className="h-4 w-4" /> Zen mode
          {zen && <Check className="ml-auto h-3.5 w-3.5" />}
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <RectangleHorizontal className="h-4 w-4 mr-2" /> Editor width
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {WIDTH_LABELS.map((w) => (
              <DropdownMenuItem key={w.value} onClick={() => void setEditorWidth(note.id, w.value)}>
                <Check className={cn("h-3.5 w-3.5", note.editorWidth !== w.value && "invisible")} />
                {w.label}
                {note.editorWidth === w.value && <span className="ml-auto text-[10px] text-muted-foreground">active</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <FileText className="h-4 w-4 mr-2" /> Change note type
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {TYPE_LABELS.map((t) => (
              <DropdownMenuItem key={t.value} onClick={() => void setNoteType(note.id, t.value)}>
                {t.icon}
                <span className="ml-1.5">{t.label}</span>
                {note.noteType === t.value && <Check className="ml-auto h-3.5 w-3.5" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuItem onClick={() => void updateNote(note.id, { preventEdit: !note.preventEdit })}>
          <PenOff className="h-4 w-4" /> Prevent editing
          <Check className={cn("ml-auto h-3.5 w-3.5", !note.preventEdit && "invisible")} />
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <KeyRound className="h-4 w-4 mr-2" /> Password protect
            {note.locked && <Lock className="h-3 w-3 ml-1 nx-accent-text" />}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {!note.locked ? (
              <DropdownMenuItem onClick={() => setLockDialog(note.id)}>
                <KeyRound className="h-4 w-4" /> Set password…
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem onClick={() => setLockDialog(note.id)}>
                  <RotateCw className="h-4 w-4" /> Change password…
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => relockNote(note.id)} disabled={!unlocked}>
                  <Lock className="h-4 w-4" /> Lock now
                  {!unlocked && <span className="ml-auto text-[10px] text-muted-foreground">already locked</span>}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLockDialog(note.id)}>
                  <LockOpen className="h-4 w-4" /> Remove protection…
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        {/* Settings is reachable from everywhere — the user should never
            have to hunt for it ("setting kahan dikh raha hai" fix). */}
        <DropdownMenuItem onClick={() => setSettings(true)}>
          <Settings className="h-4 w-4" /> Settings
          <span className="ml-auto text-xs text-muted-foreground">Ctrl+,</span>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => void toggleStar(note.id)}>
          <Star className={cn("h-4 w-4", note.starred && "text-amber-500")} fill={note.starred ? "currentColor" : "none"} />
          {note.starred ? "Starred" : "Star"}
          <Check className={cn("ml-auto h-3.5 w-3.5", !note.starred && "invisible")} />
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void updateNote(note.id, { pinned: !note.pinned })}>
          <Pin className={cn("h-4 w-4", note.pinned && "nx-accent-text")} />
          Pin to top
          <Check className={cn("ml-auto h-3.5 w-3.5", !note.pinned && "invisible")} />
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void duplicateNote(note.id)}>
          <CopyPlus className="h-4 w-4" /> Duplicate
        </DropdownMenuItem>

        {/* v2.1 — insert a template at the caret */}
        {onInsertTemplate && !isTrashed && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FilePlus2 className="h-4 w-4 mr-2" /> Insert template
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-60">
              {NOTE_TEMPLATES.map((t) => (
                <DropdownMenuItem key={t.id} onClick={() => onInsertTemplate(t.md)}>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="flex flex-col">
                    <span>{t.label}</span>
                    <span className="text-[10px] text-muted-foreground">{t.hint}</span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Download className="h-4 w-4 mr-2" /> Export
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => void exportNote(note.id, "md")}>Markdown (.md)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => void exportNote(note.id, "html")}>Web page (.html)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => void exportNote(note.id, "txt")}>Plain text (.txt)</DropdownMenuItem>
            <DropdownMenuItem onClick={onPrint}>
              <Printer className="h-4 w-4" /> Print / PDF…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onCopy}>
              <ClipboardCopy className="h-4 w-4" /> Copy as Markdown
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuItem onClick={() => void sendToDiscord()}>
          <Send className="h-4 w-4" /> Send to Discord…
        </DropdownMenuItem>

        {/* v2.0 — public read-only share link */}
        {!isTrashed && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Share2 className="h-4 w-4 mr-2" /> Share
              {sharedPath && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-64">
              {sharedPath ? (
                <>
                  <DropdownMenuItem onClick={() => void copyShareLink()}>
                    <Link2 className="h-4 w-4" /> Copy public link
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void toggleShare(false)} className="text-destructive focus:text-destructive">
                    <Unlink className="h-4 w-4" /> Revoke public link
                  </DropdownMenuItem>
                  <p className="px-2 py-1.5 text-[10px] text-muted-foreground">
                    Read-only page at {sharedPath} — noindex, sanitized, revocable.
                  </p>
                </>
              ) : (
                <DropdownMenuItem onClick={() => void toggleShare(true)}>
                  <Link2 className="h-4 w-4" /> Create public read-only link…
                </DropdownMenuItem>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        <DropdownMenuItem onClick={() => void updateNote(note.id, { archived: !note.archived })}>
          <Archive className="h-4 w-4" /> {note.archived ? "Unarchive" : "Archive"}
          <Check className={cn("ml-auto h-3.5 w-3.5", !note.archived && "invisible")} />
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {isTrashed ? (
          <DropdownMenuItem onClick={() => void restoreNote(note.id)}>
            <RotateCw className="h-4 w-4" /> Restore from trash
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => void trashNote(note.id)} className="text-destructive focus:text-destructive">
            <Trash2 className="h-4 w-4" /> Move to trash
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
