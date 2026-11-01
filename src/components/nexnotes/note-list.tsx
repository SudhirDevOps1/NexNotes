"use client";

import { useState } from "react";
import {
  Pin, FileText, Trash2, Archive, Folder as FolderIcon, Tag as TagIcon, Search, Menu, X, Settings,
  Star, Lock, AlertTriangle, ArrowUpDown, Check, Ban, ChevronDown,
  NotebookPen, Type, ListTodo, ListChecks, Code, Table2, KeyRound, Globe, PanelLeftClose, PanelRightClose,
  PenLine, Merge, Download, FolderInput, SquareCheck, Sparkles, Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useApp, selectVisibleNotes, noteDisplayTitle, type SortMode } from "@/lib/store";
import type { NoteType } from "@/lib/types";
import { tagColor } from "./sidebar";
import { FilesPane } from "./files-pane";
import { cn } from "@/lib/utils";

const NOTE_TYPE_META: { value: NoteType; label: string; icon: React.ReactNode }[] = [
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

const TYPE_ICON: Record<string, React.ReactNode> = {
  markdown: <NotebookPen className="h-3 w-3" />,
  plain: <Type className="h-3 w-3" />,
  richtext: <PenLine className="h-3 w-3" />,
  task: <ListTodo className="h-3 w-3" />,
  checklist: <ListChecks className="h-3 w-3" />,
  code: <Code className="h-3 w-3" />,
  spreadsheet: <Table2 className="h-3 w-3" />,
  authenticator: <KeyRound className="h-3 w-3" />,
  html: <Globe className="h-3 w-3" />,
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const SORT_LABELS: Record<SortMode["by"], string> = {
  updated: "Date updated",
  created: "Date created",
  title: "Title",
};

export function NoteList({ onOpenNav }: { onOpenNav?: () => void }) {
  const notes = useApp((s) => s.notes);
  const view = useApp((s) => s.view);
  const folders = useApp((s) => s.folders);
  const tags = useApp((s) => s.tags);
  const smartViews = useApp((s) => s.smartViews);
  const query = useApp((s) => s.query);
  const setQuery = useApp((s) => s.setQuery);
  const sort = useApp((s) => s.sort);
  const setSort = useApp((s) => s.setSort);
  const selectedNoteId = useApp((s) => s.selectedNoteId);
  const selectNote = useApp((s) => s.selectNote);
  const createNote = useApp((s) => s.createNote);
  const emptyTrash = useApp((s) => s.emptyTrash);
  const unlockedNotes = useApp((s) => s.unlockedNotes);
  const resolveConflict = useApp((s) => s.resolveConflict);
  const filesCount = useApp((s) => Object.keys(s.files).length);
  const setSettings = useApp((s) => s.setSettings);
  const sidebarCollapsed = useApp((s) => s.sidebarCollapsed);
  const toggleSidebar = useApp((s) => s.toggleSidebar);
  const listCollapsed = useApp((s) => s.listCollapsed);
  const toggleList = useApp((s) => s.toggleList);

  /* v2.0 — batch selection */
  const selection = useApp((s) => s.selection);
  const selectionMode = useApp((s) => s.selectionMode);
  const toggleSelect = useApp((s) => s.toggleSelect);
  const setSelectionMode = useApp((s) => s.setSelectionMode);
  const selectAllVisible = useApp((s) => s.selectAllVisible);
  const clearSelection = useApp((s) => s.clearSelection);
  const batchTrash = useApp((s) => s.batchTrash);
  const batchRestore = useApp((s) => s.batchRestore);
  const batchStar = useApp((s) => s.batchStar);
  const batchMove = useApp((s) => s.batchMove);
  const batchTag = useApp((s) => s.batchTag);
  const batchMerge = useApp((s) => s.batchMerge);
  const batchExport = useApp((s) => s.batchExport);
  const deleteSmartView = useApp((s) => s.deleteSmartView);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [batchTagName, setBatchTagName] = useState("");

  const visible = selectVisibleNotes({ notes, view, query, sort, unlockedNotes, smartViews });
  const activeSmart = view.kind === "smart" ? smartViews.find((v) => v.id === view.id) : undefined;
  const inTrash = view.kind === "trash";

  const viewTitle =
    view.kind === "all" ? "Notes"
    : view.kind === "starred" ? "Starred"
    : view.kind === "archive" ? "Archived"
    : view.kind === "trash" ? "Trash"
    : view.kind === "untagged" ? "Untagged"
    : view.kind === "conflicts" ? "Conflicts"
    : view.kind === "auth" ? "Authenticator"
    : view.kind === "files" ? "Files"
    : view.kind === "smart" ? activeSmart?.title ?? "Smart view"
    : view.kind === "folder" ? folders[view.id!]?.name ?? "Folder"
    : `#${tags[view.id!]?.name ?? "tag"}`;

  return (
    <div className="h-full flex flex-col border-r bg-background">
      {/* search + new */}
      <div className="p-3 space-y-2.5 border-b shrink-0">
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 md:hidden" onClick={onOpenNav} aria-label="Open menu">
            <Menu className="h-4 w-4" />
          </Button>
          {!sidebarCollapsed && (
            <Button
              variant="ghost" size="icon" className="h-9 w-9 shrink-0 hidden md:inline-flex"
              onClick={toggleSidebar} aria-label="Hide sidebar"
              title="Hide sidebar (Alt+S) — more room for notes"
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          )}
          {!listCollapsed && (
            <Button
              variant="ghost" size="icon" className="h-9 w-9 shrink-0 hidden md:inline-flex"
              onClick={toggleList} aria-label="Hide notes list"
              title="Hide notes list (Alt+L) — full-width editor"
            >
              <PanelRightClose className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost" size="icon" className="h-9 w-9 shrink-0"
            onClick={() => setSettings(true)} aria-label="Settings"
            title="Settings (Ctrl+,)"
          >
            <Settings className="h-4 w-4" />
          </Button>
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes…"
              className="pl-8 h-9 bg-muted/50"
            />
          </div>
          {view.kind !== "trash" && view.kind !== "files" && (
            <div className="flex shrink-0 rounded-md overflow-hidden nx-accent-bg">
              <Button
                className="h-9 px-3 rounded-none bg-transparent hover:bg-black/10 text-white shadow-none"
                onClick={() => void createNote()} aria-label="New note"
              >
                <span className="text-base leading-none mr-1">+</span> New
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    className="h-9 px-1.5 rounded-none bg-transparent hover:bg-black/10 text-white shadow-none border-l border-white/20"
                    aria-label="Choose a note type"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel className="text-xs">Choose a note type</DropdownMenuLabel>
                  {NOTE_TYPE_META.map((t) => (
                    <DropdownMenuItem key={t.value} onClick={() => void createNote({ noteType: t.value })}>
                      {t.icon}
                      <span className="ml-1.5">{t.label}</span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
                    Tip: change the type of any note later from the ⋯ menu.
                  </p>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            {view.kind === "conflicts" && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
            {view.kind === "smart" && <Sparkles className="h-3.5 w-3.5 nx-accent-text" />}
            {viewTitle}
            {activeSmart && (
              <button
                onClick={() => deleteSmartView(activeSmart.id)}
                className="text-[10px] font-normal text-muted-foreground hover:text-destructive"
                title="Delete this smart view"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </h2>
          <div className="flex items-center gap-1.5">
            {/* v2.0 — batch select toggle */}
            {view.kind !== "files" && visible.length > 0 && (
              <Button
                variant="ghost" size="sm"
                className={cn("h-6 px-1.5 text-[11px] gap-1", selectionMode ? "nx-accent-text" : "text-muted-foreground")}
                onClick={() => (selectionMode ? clearSelection() : setSelectionMode(true))}
                title="Multi-select (batch operations)"
              >
                <SquareCheck className="h-3 w-3" /> Select
              </Button>
            )}
            {view.kind !== "files" && !selectionMode && visible.length > 1 && (
              <Button
                variant="ghost" size="sm"
                className="h-6 px-1.5 text-[11px] text-muted-foreground gap-1"
                onClick={selectAllVisible}
                title="Select all notes in this view"
              >
                All
              </Button>
            )}
            {view.kind !== "files" && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px] text-muted-foreground gap-1">
                    <ArrowUpDown className="h-3 w-3" />
                    {SORT_LABELS[sort.by]}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel className="text-xs">Sort by</DropdownMenuLabel>
                  {(["updated", "created", "title"] as const).map((by) => (
                    <DropdownMenuItem key={by} onClick={() => void setSort({ ...sort, by })}>
                      <Check className={cn("h-3.5 w-3.5", sort.by !== by && "invisible")} /> {SORT_LABELS[by]}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => void setSort({ ...sort, dir: sort.dir === "desc" ? "asc" : "desc" })}>
                    {sort.dir === "desc" ? "↓ Newest first" : "↑ Oldest first"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <span className="text-xs text-muted-foreground">
              {view.kind === "files" ? `${filesCount} file${filesCount === 1 ? "" : "s"}` : `${visible.length} ${visible.length === 1 ? "note" : "notes"}`}
              {query && " found"}
            </span>
            {view.kind === "trash" && visible.length > 0 && (
              <Button
                variant="ghost" size="sm" className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                onClick={() => void emptyTrash()}
              >
                <X className="h-3 w-3" /> Empty trash
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* v2.0 — batch action bar */}
      {selectionMode && selection.length > 0 && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b bg-muted/40 shrink-0 flex-wrap animate-in slide-in-from-top-1 fade-in duration-200">
          <Badge className="nx-accent-bg text-white h-5 px-1.5 text-[10px] tabular-nums" variant="secondary">
            {selection.length} selected
          </Badge>
          {!inTrash && (
            <>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => void batchStar()}>
                <Star className="h-3.5 w-3.5" /> Star
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
                    <FolderInput className="h-3.5 w-3.5" /> Move
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuLabel className="text-xs">Move to folder</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => void batchMove(null)}>No folder</DropdownMenuItem>
                  {Object.values(folders).map((f) => (
                    <DropdownMenuItem key={f.id} onClick={() => void batchMove(f.id)}>
                      <FolderIcon className="h-3.5 w-3.5" /> {f.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
                    <TagIcon className="h-3.5 w-3.5" /> Tag
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-52 p-3">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!batchTagName.trim()) return;
                      void batchTag(batchTagName);
                      setBatchTagName("");
                      setTagPopoverOpen(false);
                    }}
                    className="flex gap-1.5"
                  >
                    <Input
                      value={batchTagName}
                      onChange={(e) => setBatchTagName(e.target.value)}
                      placeholder="tag name…"
                      className="h-8 text-xs"
                      autoFocus
                    />
                    <Button type="submit" size="icon" className="h-8 w-8 nx-accent-bg" aria-label="Apply tag">
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  </form>
                  <p className="text-[10px] text-muted-foreground mt-2">Adds a tag to all {selection.length} selected notes.</p>
                </PopoverContent>
              </Popover>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => void batchMerge()} title="Merge into the oldest selected note">
                <Merge className="h-3.5 w-3.5" /> Merge
              </Button>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => void batchExport()}>
                <Download className="h-3.5 w-3.5" /> Export
              </Button>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-destructive hover:text-destructive" onClick={() => void batchTrash()}>
                <Trash2 className="h-3.5 w-3.5" /> Trash
              </Button>
            </>
          )}
          {inTrash && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => void batchRestore()}>
              <Undo2 className="h-3.5 w-3.5" /> Restore
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 ml-auto text-muted-foreground" onClick={clearSelection}>
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        </div>
      )}

      {/* min-h-0: without it a long list stretches this box past the shell
       * (flex min-height:auto) and overflow-clip silently hides the tail —
       * the "can't scroll the notes list" bug */}
      {view.kind === "files" ? (
        <FilesPane />
      ) : (
        <ScrollArea className="flex-1 min-h-0 nx-scroll">
          {/* keyed by view/query/sort so the stagger entrance replays on view changes */}
          <div
            key={`${view.kind}|${view.id ?? ""}|${query}|${sort.by}|${sort.dir}`}
            className="p-2 space-y-1"
          >
            {visible.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mb-3 nx-float">
                  {query ? <Search className="h-5 w-5 text-muted-foreground" /> : <FileText className="h-5 w-5 text-muted-foreground" />}
                </div>
                <p className="text-sm font-medium">{query ? "No matching notes" : "No notes here yet"}</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">
                  {query ? "Try a different search term"
                    : view.kind === "trash" ? "Trash is empty"
                    : view.kind === "conflicts" ? "No conflicts — sync is clean ✨"
                    : view.kind === "untagged" ? "Every note has a tag"
                    : view.kind === "starred" ? "Star notes to see them here"
                    : view.kind === "smart" ? "No notes match this smart view yet"
                    : "Create your first note"}
                </p>
                {!query && !["trash", "conflicts", "starred", "untagged", "smart"].includes(view.kind) && (
                  <Button variant="outline" size="sm" onClick={() => void createNote()}>Create a note</Button>
                )}
              </div>
            )}

            {visible.map((n, i) => {
              const active = n.id === selectedNoteId;
              const checked = selection.includes(n.id);
              const title = noteDisplayTitle({ unlockedNotes }, n);
              const plainContent =
                unlockedNotes[n.id]?.content ??
                (n.locked ? "••••••••" : n.content);
              const snippet = plainContent.replace(/[#>*`~\[\]!\-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 90);
              return (
                <button
                  key={n.id}
                  onClick={() => (selectionMode ? toggleSelect(n.id) : selectNote(n.id))}
                  style={{ animationDelay: `${Math.min(i, 14) * 20}ms` }}
                  className={cn(
                    "w-full text-left rounded-lg px-3 py-2.5 nx-item-in nx-row border",
                    checked
                      ? "nx-accent-bg/10 border-current/30 nx-accent-text/80 bg-primary/5"
                      : active
                        ? "bg-muted border-transparent"
                        : "hover:bg-muted/60 border-transparent",
                  )}
                  aria-pressed={checked}
                >
                  <div className="flex items-center gap-1.5">
                    {/* v2.0 — selection checkbox */}
                    {selectionMode ? (
                      <span
                        className={cn(
                          "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                          checked ? "nx-accent-bg border-transparent text-white" : "border-input bg-background",
                        )}
                        aria-hidden
                      >
                        {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                    ) : null}
                    {!n.locked && TYPE_ICON[n.noteType] && (
                      <span className="text-muted-foreground/70 shrink-0" title={n.noteType}>
                        {TYPE_ICON[n.noteType]}
                      </span>
                    )}
                    {n.pinned && <Pin className="h-3 w-3 nx-accent-text shrink-0" fill="currentColor" />}
                    {n.starred && <Star className="h-3 w-3 text-amber-500 shrink-0" fill="currentColor" />}
                    {n.locked && <Lock className="h-3 w-3 text-muted-foreground shrink-0" />}
                    <span className={cn("text-sm font-medium truncate flex-1 min-w-0", active && !checked && "nx-accent-text")}>
                      {title || "Untitled"}
                    </span>
                    {n.conflictOf && <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />}
                    {n.trashed && <Trash2 className="h-3 w-3 text-muted-foreground shrink-0" />}
                    {!n.trashed && n.archived && <Archive className="h-3 w-3 text-muted-foreground shrink-0" />}
                    <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(n.updatedAt)}</span>
                  </div>
                  {(snippet || n.conflictOf) && (
                    <p className="text-xs text-muted-foreground truncate mt-1">{snippet || "No content"}</p>
                  )}
                  {n.conflictOf && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4.5 gap-1 font-normal text-amber-600 border-amber-500/40">
                        <AlertTriangle className="h-2.5 w-2.5" /> conflict copy
                      </Badge>
                      <span
                        className="text-[10px] text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          void resolveConflict(n.id, "keep");
                        }}
                      >
                        <Check className="h-3 w-3" /> keep both
                      </span>
                      <span
                        className="text-[10px] text-muted-foreground inline-flex items-center gap-1 hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          void resolveConflict(n.id, "discard");
                        }}
                      >
                        <Ban className="h-3 w-3" /> discard
                      </span>
                    </div>
                  )}
                  {!n.conflictOf && (n.folderId || n.tagIds.length > 0) && (
                    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                      {n.folderId && folders[n.folderId] && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4.5 gap-1 font-normal">
                          <FolderIcon className="h-2.5 w-2.5" />{folders[n.folderId].name}
                        </Badge>
                      )}
                      {n.tagIds.slice(0, 3).map((tid) =>
                        tags[tid] ? (
                          <Badge key={tid} variant="secondary" className="text-[10px] px-1.5 py-0 h-4.5 gap-1 font-normal">
                            <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: tagColor(tags[tid].name) }} />
                            {tags[tid].name}
                          </Badge>
                        ) : null
                      )}
                      {n.tagIds.length > 3 && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4.5 font-normal">
                          +{n.tagIds.length - 3}
                        </Badge>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
