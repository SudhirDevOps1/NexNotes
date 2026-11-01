"use client";

import { useEffect } from "react";
import {
  FileText, Plus, Settings, Trash2, Archive, StickyNote, RefreshCw,
  Download, Moon, Sun, Command, Star, Paperclip, AlertTriangle, Tag as TagIcon,
  History, KeyRound, CopyPlus, Keyboard, PenOff, FileInput,
  NotebookPen, Type, ListTodo, ListChecks, Code,
} from "lucide-react";
import { useTheme } from "next-themes";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useApp, selectVisibleNotes, noteDisplayTitle } from "@/lib/store";

export function CommandPalette() {
  const open = useApp((s) => s.paletteOpen);
  const setPalette = useApp((s) => s.setPalette);
  const notes = useApp((s) => s.notes);
  const selectedNoteId = useApp((s) => s.selectedNoteId);
  const selectNote = useApp((s) => s.selectNote);
  const createNote = useApp((s) => s.createNote);
  const setView = useApp((s) => s.setView);
  const setSettings = useApp((s) => s.setSettings);
  const setShortcuts = useApp((s) => s.setShortcuts);
  const setHistory = useApp((s) => s.setHistory);
  const setLockDialog = useApp((s) => s.setLockDialog);
  const sync = useApp((s) => s.sync);
  const exportJson = useApp((s) => s.exportJson);
  const toggleStar = useApp((s) => s.toggleStar);
  const duplicateNote = useApp((s) => s.duplicateNote);
  const togglePreventEdit = useApp((s) => s.togglePreventEdit);
  const { resolvedTheme, setTheme } = useTheme();

  // global shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(!useApp.getState().paletteOpen);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        setSettings(true);
      }
      if (e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        void createNote();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void sync();
      }
      if (e.key === "?" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        setShortcuts(true);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [setPalette, setSettings, createNote, sync, setShortcuts]);

  const recent = selectVisibleNotes({ notes, view: { kind: "all" }, query: "", sort: { by: "updated", dir: "desc" }, unlockedNotes: useApp.getState().unlockedNotes, smartViews: useApp.getState().smartViews }).slice(0, 8);
  const selected = selectedNoteId ? notes[selectedNoteId] : null;

  const run = (fn: () => void) => {
    fn();
    setPalette(false);
  };

  const unlocked = useApp((s) => s.unlockedNotes);

  return (
    <CommandDialog open={open} onOpenChange={setPalette}>
      <CommandInput placeholder="Search notes or run a command…" />
      <CommandList className="nx-scroll">
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Notes">
          <CommandItem onSelect={() => run(() => void createNote())}>
            <Plus className="h-4 w-4" /> New note <span className="ml-auto text-xs text-muted-foreground">Alt+N</span>
          </CommandItem>
          <CommandItem onSelect={() => run(() => void createNote({ noteType: "plain" }))}>
            <Type className="h-4 w-4" /> New plain-text note
          </CommandItem>
          <CommandItem onSelect={() => run(() => void createNote({ noteType: "task" }))}>
            <ListTodo className="h-4 w-4" /> New task list
          </CommandItem>
          <CommandItem onSelect={() => run(() => void createNote({ noteType: "checklist" }))}>
            <ListChecks className="h-4 w-4" /> New checklist
          </CommandItem>
          <CommandItem onSelect={() => run(() => void createNote({ noteType: "code" }))}>
            <Code className="h-4 w-4" /> New code snippet
          </CommandItem>
          <CommandItem onSelect={() => run(() => void createNote({ noteType: "markdown" }))}>
            <NotebookPen className="h-4 w-4" /> New markdown note
          </CommandItem>
          {recent.map((n) => {
            const title = noteDisplayTitle({ unlockedNotes: unlocked }, n);
            return (
              <CommandItem key={n.id} onSelect={() => run(() => selectNote(n.id))}>
                <FileText className="h-4 w-4" />
                <span className="truncate">{title || "Untitled"}</span>
                <span className="ml-auto text-xs text-muted-foreground truncate max-w-[40%]">
                  {unlocked[n.id]?.content ?? (n.locked ? "••••••••" : n.content.replace(/[#>*`]/g, "")).slice(0, 30)}
                </span>
              </CommandItem>
            );
          })}
        </CommandGroup>

        {selected && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Current note">
              <CommandItem onSelect={() => run(() => setHistory(selected.id))}>
                <History className="h-4 w-4" /> Note history <span className="ml-auto text-xs text-muted-foreground">Ctrl+H</span>
              </CommandItem>
              <CommandItem onSelect={() => run(() => void toggleStar(selected.id))}>
                <Star className="h-4 w-4" /> {selected.starred ? "Unstar" : "Star"}
              </CommandItem>
              <CommandItem onSelect={() => run(() => void duplicateNote(selected.id))}>
                <CopyPlus className="h-4 w-4" /> Duplicate
              </CommandItem>
              <CommandItem onSelect={() => run(() => void togglePreventEdit(selected.id))}>
                <PenOff className="h-4 w-4" /> {selected.preventEdit ? "Allow editing" : "Prevent editing"}
              </CommandItem>
              <CommandItem onSelect={() => run(() => setLockDialog(selected.id))}>
                <KeyRound className="h-4 w-4" /> Password protect…
              </CommandItem>
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => run(() => setView({ kind: "all" }))}>
            <StickyNote className="h-4 w-4" /> Notes
          </CommandItem>
          <CommandItem onSelect={() => run(() => setView({ kind: "files" }))}>
            <Paperclip className="h-4 w-4" /> Files
          </CommandItem>
          <CommandItem onSelect={() => run(() => setView({ kind: "starred" }))}>
            <Star className="h-4 w-4" /> Starred
          </CommandItem>
          <CommandItem onSelect={() => run(() => setView({ kind: "untagged" }))}>
            <TagIcon className="h-4 w-4" /> Untagged
          </CommandItem>
          <CommandItem onSelect={() => run(() => setView({ kind: "archive" }))}>
            <Archive className="h-4 w-4" /> Archived
          </CommandItem>
          <CommandItem onSelect={() => run(() => setView({ kind: "trash" }))}>
            <Trash2 className="h-4 w-4" /> Trash
          </CommandItem>
          <CommandItem onSelect={() => run(() => setView({ kind: "conflicts" }))}>
            <AlertTriangle className="h-4 w-4" /> Conflicts
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => run(() => void sync())}>
            <RefreshCw className="h-4 w-4" /> Sync now <span className="ml-auto text-xs text-muted-foreground">Ctrl+S</span>
          </CommandItem>
          <CommandItem onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))}>
            {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            Toggle theme
          </CommandItem>
          <CommandItem onSelect={() => run(() => void exportJson())}>
            <Download className="h-4 w-4" /> Export backup (JSON)
          </CommandItem>
          <CommandItem onSelect={() => run(() => { setPalette(false); setSettings(true); })}>
            <FileInput className="h-4 w-4" /> Import from Standard Notes…
          </CommandItem>
          <CommandItem onSelect={() => run(() => setShortcuts(true))}>
            <Keyboard className="h-4 w-4" /> Keyboard shortcuts <span className="ml-auto text-xs text-muted-foreground">?</span>
          </CommandItem>
          <CommandItem onSelect={() => run(() => setSettings(true))}>
            <Settings className="h-4 w-4" /> Settings <span className="ml-auto text-xs text-muted-foreground">Ctrl+,</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
      <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground flex items-center gap-1">
        <Command className="h-3 w-3" /> NexNotes command palette
      </div>
    </CommandDialog>
  );
}
