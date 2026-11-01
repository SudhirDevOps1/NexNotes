"use client";

import { useState } from "react";
import {
  ShieldCheck, StickyNote, Archive, Trash2, FolderPlus, Folder, Tag as TagIcon,
  Settings, LogOut, RefreshCw, CloudOff, Check, Plus, X, Moon, Sun, Wifi, WifiOff,
  Star, Paperclip, Tag as UntaggedIcon, AlertTriangle, Pencil, Keyboard, KeyRound, PanelLeftClose, BarChart3,
  Sparkles,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useApp, type View, type SmartView } from "@/lib/store";
import type { NoteType } from "@/lib/types";
import { StatsDialog } from "./stats-dialog";
import { cn } from "@/lib/utils";

/** deterministic hue per tag name — stable colors without extra state */
const TAG_HUES = [158, 210, 262, 330, 30, 180, 285, 95, 15, 240];
export function tagHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TAG_HUES[h % TAG_HUES.length];
}
export function tagColor(name: string): string {
  return `hsl(${tagHue(name)} 62% 52%)`;
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const notes = useApp((s) => s.notes);
  const folders = useApp((s) => s.folders);
  const tags = useApp((s) => s.tags);
  const files = useApp((s) => s.files);
  const view = useApp((s) => s.view);
  const setView = useApp((s) => s.setView);
  const createFolder = useApp((s) => s.createFolder);
  const renameFolder = useApp((s) => s.renameFolder);
  const deleteFolder = useApp((s) => s.deleteFolder);
  const deleteTag = useApp((s) => s.deleteTag);
  const user = useApp((s) => s.user);
  const online = useApp((s) => s.online);
  const syncing = useApp((s) => s.syncing);
  const sync = useApp((s) => s.sync);
  const signOut = useApp((s) => s.signOut);
  const setSettings = useApp((s) => s.setSettings);
  const settingsOpen = useApp((s) => s.settingsOpen);
  const setShortcuts = useApp((s) => s.setShortcuts);
  const toggleSidebar = useApp((s) => s.toggleSidebar);
  const [statsOpen, setStatsOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolder, setNewFolder] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");

  /* v2.0 — Smart Views */
  const smartViews = useApp((s) => s.smartViews);
  const addSmartView = useApp((s) => s.addSmartView);
  const deleteSmartView = useApp((s) => s.deleteSmartView);
  const [smartOpen, setSmartOpen] = useState(false);
  const [svTitle, setSvTitle] = useState("");
  const [svQuery, setSvQuery] = useState("");
  const [svType, setSvType] = useState<string>("any");
  const [svStarred, setSvStarred] = useState(false);
  const [svTagId, setSvTagId] = useState<string>("any");
  const [svFolderId, setSvFolderId] = useState<string>("any");

  function submitSmartView(e: React.FormEvent) {
    e.preventDefault();
    if (!svTitle.trim()) return;
    const sv: Omit<SmartView, "id"> = {
      title: svTitle.trim().slice(0, 60),
      query: svQuery.trim().slice(0, 200),
      noteType: svType === "any" ? undefined : svType,
      starredOnly: svStarred || undefined,
      tagId: svTagId === "any" ? null : svTagId,
      folderId: svFolderId === "any" ? null : svFolderId,
    };
    addSmartView(sv);
    setSmartOpen(false);
    setSvTitle(""); setSvQuery(""); setSvType("any"); setSvStarred(false); setSvTagId("any"); setSvFolderId("any");
  }

  const counts = {
    all: Object.values(notes).filter((n) => !n.trashed && !n.archived && !n.conflictOf).length,
    starred: Object.values(notes).filter((n) => n.starred && !n.trashed && !n.archived).length,
    archive: Object.values(notes).filter((n) => n.archived && !n.trashed).length,
    trash: Object.values(notes).filter((n) => n.trashed).length,
    untagged: Object.values(notes).filter((n) => n.tagIds.length === 0 && !n.trashed && !n.archived && !n.conflictOf).length,
    conflicts: Object.values(notes).filter((n) => n.conflictOf && !n.trashed).length,
    auth: Object.values(notes).filter((n) => n.noteType === "authenticator" && !n.trashed && !n.archived).length,
    files: Object.keys(files).length,
    folder: (id: string) => Object.values(notes).filter((n) => n.folderId === id && !n.trashed && !n.archived).length,
    tag: (id: string) => Object.values(notes).filter((n) => n.tagIds.includes(id) && !n.trashed && !n.archived).length,
  };

  function go(v: View) {
    setView(v);
    onNavigate?.();
  }

  async function submitFolder(e: React.FormEvent) {
    e.preventDefault();
    if (newFolder.trim()) {
      await createFolder(newFolder);
      setNewFolder("");
      setAddingFolder(false);
    }
  }

  async function submitRename(e: React.FormEvent) {
    e.preventDefault();
    if (renamingId && renameVal.trim()) await renameFolder(renamingId, renameVal);
    setRenamingId(null);
    setRenameVal("");
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="h-full flex flex-col bg-sidebar text-sidebar-foreground">
        {/* brand */}
        <div className="flex items-center gap-2.5 px-4 h-14 border-b shrink-0">
          <div className="h-7 w-7 rounded-lg nx-accent-bg flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5 text-white" strokeWidth={2.4} />
          </div>
          <span className="font-bold text-[15px] tracking-tight">NexNotes</span>
          <span className="text-[10px] text-muted-foreground border rounded px-1.5 py-0.5">v2.0</span>
          <Button
            variant="ghost" size="icon" className="ml-auto h-7 w-7 hidden md:inline-flex"
            onClick={toggleSidebar} aria-label="Hide sidebar"
            title="Hide sidebar (Alt+S) — more room for notes"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        </div>

        {/* min-h-0 is critical: without it the scroll area grows with its
            content and pushes the footer (Settings / sign-out) off-screen
            on short viewports — the "Settings kahan hai?" bug. */}
        <ScrollArea className="flex-1 min-h-0 nx-scroll">
          <div className="px-2 py-3 space-y-4">
            {/* main views */}
            <NavGroup>
              <NavItem
                icon={<StickyNote className="h-4 w-4" />} label="Notes" count={counts.all}
                active={view.kind === "all"} onClick={() => go({ kind: "all" })}
              />
              <NavItem
                icon={<Paperclip className="h-4 w-4" />} label="Files" count={counts.files}
                active={view.kind === "files"} onClick={() => go({ kind: "files" })}
              />
              <NavItem
                icon={<Star className="h-4 w-4" />} label="Starred" count={counts.starred}
                active={view.kind === "starred"} onClick={() => go({ kind: "starred" })}
              />
              <NavItem
                icon={<Archive className="h-4 w-4" />} label="Archived" count={counts.archive}
                active={view.kind === "archive"} onClick={() => go({ kind: "archive" })}
              />
              <NavItem
                icon={<Trash2 className="h-4 w-4" />} label="Trash" count={counts.trash}
                active={view.kind === "trash"} onClick={() => go({ kind: "trash" })}
              />
              <NavItem
                icon={<UntaggedIcon className="h-4 w-4" />} label="Untagged" count={counts.untagged}
                active={view.kind === "untagged"} onClick={() => go({ kind: "untagged" })}
              />
              <NavItem
                icon={<KeyRound className="h-4 w-4" />} label="Authenticator" count={counts.auth}
                active={view.kind === "auth"} onClick={() => go({ kind: "auth" })}
              />
              <NavItem
                icon={<AlertTriangle className="h-4 w-4" />} label="Conflicts" count={counts.conflicts}
                active={view.kind === "conflicts"} onClick={() => go({ kind: "conflicts" })}
              />
            </NavGroup>

            {/* folders */}
            <div>
              <div className="flex items-center justify-between px-2 mb-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Folders
                </span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAddingFolder(true)} aria-label="New folder">
                  <FolderPlus className="h-3.5 w-3.5" />
                </Button>
              </div>
              <NavGroup>
                {addingFolder && (
                  <form onSubmit={submitFolder} className="px-2 py-1">
                    <div className="flex gap-1">
                      <Input
                        autoFocus value={newFolder} onChange={(e) => setNewFolder(e.target.value)}
                        placeholder="Folder name" className="h-7 text-xs"
                        onBlur={() => { if (!newFolder.trim()) setAddingFolder(false); }}
                      />
                      <Button type="submit" size="icon" className="h-7 w-7 shrink-0" variant="ghost" aria-label="Create folder">
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </form>
                )}
                {Object.values(folders).length === 0 && !addingFolder && (
                  <p className="px-2 py-1 text-xs text-muted-foreground">No folders yet</p>
                )}
                {Object.values(folders)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((f) =>
                    renamingId === f.id ? (
                      <form key={f.id} onSubmit={submitRename} className="px-2 py-1">
                        <div className="flex gap-1">
                          <Input
                            autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)}
                            className="h-7 text-xs" aria-label="Rename folder"
                            onBlur={() => setRenamingId(null)}
                          />
                          <Button type="submit" size="icon" className="h-7 w-7 shrink-0" variant="ghost" aria-label="Save name">
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <NavItem
                        key={f.id}
                        icon={<Folder className="h-4 w-4" />}
                        label={f.name}
                        count={counts.folder(f.id)}
                        active={view.kind === "folder" && view.id === f.id}
                        onClick={() => go({ kind: "folder", id: f.id })}
                        onEdit={() => { setRenamingId(f.id); setRenameVal(f.name); }}
                        onDelete={() => deleteFolder(f.id)}
                      />
                    )
                  )}
              </NavGroup>
            </div>

            {/* tags */}
            <div>
              <span className="block px-2 mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Tags
              </span>
              <NavGroup>
                {Object.values(tags).length === 0 && (
                  <p className="px-2 py-1 text-xs text-muted-foreground">Tags you add appear here</p>
                )}
                {Object.values(tags)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((t) => (
                    <NavItem
                      key={t.id}
                      icon={<span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: tagColor(t.name) }} />}
                      label={t.name}
                      count={counts.tag(t.id)}
                      active={view.kind === "tag" && view.id === t.id}
                      onClick={() => go({ kind: "tag", id: t.id })}
                      onDelete={() => deleteTag(t.id)}
                    />
                  ))}
              </NavGroup>
            </div>

            {/* smart views (v2.0) */}
            <div>
              <div className="flex items-center justify-between px-2 mb-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Smart views
                </span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSmartOpen(true)} aria-label="New smart view" title="Create a smart view (saved search)">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              <NavGroup>
                {smartViews.length === 0 && (
                  <p className="px-2 py-1 text-xs text-muted-foreground">Saved searches appear here</p>
                )}
                {smartViews.map((sv) => (
                  <NavItem
                    key={sv.id}
                    icon={<Sparkles className="h-4 w-4" />}
                    label={sv.title}
                    active={view.kind === "smart" && view.id === sv.id}
                    onClick={() => go({ kind: "smart", id: sv.id })}
                    onDelete={() => deleteSmartView(sv.id)}
                  />
                ))}
              </NavGroup>
            </div>

            {/* app */}
            <div>
              <span className="block px-2 mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                App
              </span>
              <NavGroup>
                <NavItem
                  icon={<Settings className="h-4 w-4" />} label="Settings"
                  active={settingsOpen}
                  onClick={() => { setSettings(true); onNavigate?.(); }}
                />
                <NavItem
                  icon={<Keyboard className="h-4 w-4" />} label="Shortcuts"
                  onClick={() => { setShortcuts(true); onNavigate?.(); }}
                />
              </NavGroup>
            </div>
          </div>
        </ScrollArea>

        {/* footer */}
        <div className="border-t px-3 py-2.5 space-y-1.5 shrink-0 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <button
              className="flex items-center gap-1.5 hover:text-foreground transition-colors"
              onClick={() => void sync()}
              title="Sync now"
            >
              {online ? (
                syncing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <WifiOff className="h-3.5 w-3.5 text-amber-500" />
              )}
              {online ? (syncing ? "Syncing…" : "Synced") : "Offline — changes queued"}
            </button>
            <div className="ml-auto flex items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                    aria-label="Toggle theme">
                    {resolvedTheme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Light / dark</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setStatsOpen(true)} aria-label="Statistics">
                    <BarChart3 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Statistics — live counters</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSettings(true)} aria-label="Settings">
                    <Settings className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Settings (Ctrl+,)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void signOut()} aria-label="Sign out">
                    <LogOut className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Sign out</TooltipContent>
              </Tooltip>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground truncate" title={user?.email}>{user?.email}</p>
        </div>
      </div>
      <StatsDialog open={statsOpen} onOpenChange={setStatsOpen} />

      {/* v2.0 — create smart view dialog */}
      <Dialog open={smartOpen} onOpenChange={setSmartOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 nx-accent-text" /> New smart view
            </DialogTitle>
            <DialogDescription>
              A saved search — notes that match appear here automatically. Stored on this device only.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitSmartView} className="space-y-3">
            <Input value={svTitle} onChange={(e) => setSvTitle(e.target.value)} placeholder="Name — e.g. “Weekly review”" autoFocus />
            <Input value={svQuery} onChange={(e) => setSvQuery(e.target.value)} placeholder="Contains text… (optional)" />
            <div className="grid grid-cols-2 gap-2">
              <Select value={svType} onValueChange={setSvType}>
                <SelectTrigger size="sm" className="text-xs"><SelectValue placeholder="Any type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any type</SelectItem>
                  {(["markdown", "richtext", "plain", "task", "checklist", "code", "spreadsheet", "authenticator", "html"] as NoteType[]).map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={svTagId} onValueChange={setSvTagId}>
                <SelectTrigger size="sm" className="text-xs"><SelectValue placeholder="Any tag" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any tag</SelectItem>
                  {Object.values(tags).map((t) => (
                    <SelectItem key={t.id} value={t.id}>#{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={svFolderId} onValueChange={setSvFolderId}>
                <SelectTrigger size="sm" className="text-xs"><SelectValue placeholder="Any folder" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any folder</SelectItem>
                  {Object.values(folders).map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="flex items-center gap-2 text-xs px-3 h-9 rounded-md border cursor-pointer select-none">
                <input type="checkbox" checked={svStarred} onChange={(e) => setSvStarred(e.target.checked)} className="accent-current" />
                Starred only
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setSmartOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" className="nx-accent-bg" disabled={!svTitle.trim()}>
                <Plus className="h-3.5 w-3.5" /> Create view
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

function NavGroup({ children }: { children: React.ReactNode }) {
  return <div className="space-y-0.5">{children}</div>;
}

function NavItem({
  icon, label, count, active, onClick, onDelete, onEdit,
}: {
  icon: React.ReactNode; label: string; count?: number; active?: boolean;
  onClick: () => void; onDelete?: () => void; onEdit?: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer transition-colors",
        active ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "hover:bg-sidebar-accent/60"
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      <span className={cn("shrink-0 flex items-center", active && "nx-accent-text")}>{icon}</span>
      <span className="truncate flex-1">{label}</span>
      {typeof count === "number" && count > 0 && (
        <span className="text-[11px] text-muted-foreground tabular-nums">{count}</span>
      )}
      {onEdit && (
        <button
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          aria-label={`Rename ${label}`}
          title="Rename"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      {onDelete && (
        <button
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          aria-label={`Delete ${label}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export { Plus };
