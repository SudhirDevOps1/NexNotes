"use client";

import { useEffect, useRef, useState } from "react";
import { PanelLeftOpen, PanelLeftClose, Plus, Search, NotebookPen } from "lucide-react";
import { Sidebar } from "./sidebar";
import { NoteList } from "./note-list";
import { Editor } from "./editor";
import { CommandPalette } from "./command-palette";
import { SettingsDialog } from "./settings-dialog";
import { HistoryDialog } from "./history-dialog";
import { LockDialog } from "./lock-dialog";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { useApp, selectVisibleNotes, noteDisplayTitle } from "@/lib/store";
import { cn } from "@/lib/utils";

export function AppShell() {
  const setOnline = useApp((s) => s.setOnline);
  const mobilePane = useApp((s) => s.mobilePane);
  const sidebarCollapsed = useApp((s) => s.sidebarCollapsed);
  const toggleSidebar = useApp((s) => s.toggleSidebar);
  // v1.4 — collapsible notes list
  const listCollapsed = useApp((s) => s.listCollapsed);
  const toggleList = useApp((s) => s.toggleList);
  const notes = useApp((s) => s.notes);
  const view = useApp((s) => s.view);
  const query = useApp((s) => s.query);
  const sort = useApp((s) => s.sort);
  const unlockedNotes = useApp((s) => s.unlockedNotes);
  const createNote = useApp((s) => s.createNote);
  const [navOpen, setNavOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [setOnline]);

  // v1.4 — record today for the "day streak" live counter (kept on-device)
  useEffect(() => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const raw = localStorage.getItem("nx-active-days");
      const days: string[] = raw ? JSON.parse(raw) : [];
      if (!days.includes(today)) {
        days.push(today);
        localStorage.setItem("nx-active-days", JSON.stringify(days.slice(-400)));
      }
    } catch { /* private mode */ }
  }, []);

  // Alt+S — sidebar · Alt+L — notes list (v1.3 / v1.4)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === "s") {
          e.preventDefault();
          toggleSidebar();
        } else if (k === "l") {
          e.preventDefault();
          toggleList();
        }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [toggleSidebar, toggleList]);

  const visibleCount = selectVisibleNotes({ notes, view, query, sort, unlockedNotes, smartViews: useApp.getState().smartViews }).length;

  return (
    <div
      ref={shellRef}
      /* overflow-clip (not hidden): focus()/scrollIntoView() can programmatically
       * scroll an overflow-hidden box, which used to shift the whole 3-pane
       * layout sideways/up. clip makes the shell literally unscrollable. */
      className="h-dvh flex overflow-clip"
      onScroll={(e) => {
        const el = e.currentTarget;
        if (el.scrollTop !== 0 || el.scrollLeft !== 0) el.scrollTo({ top: 0, left: 0 });
      }}
    >
      {/* desktop sidebar — collapsible (v1.4: smooth width animation, content
       * stays mounted and simply fades/clips so nothing re-flows harshly) */}
      <aside
        className={cn(
          "hidden md:block relative shrink-0 overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          sidebarCollapsed ? "w-0" : "w-60",
        )}
        aria-hidden={sidebarCollapsed}
      >
        <div
          className={cn(
            "absolute inset-y-0 left-0 w-60 border-r transition-opacity duration-200",
            sidebarCollapsed ? "opacity-0 pointer-events-none" : "opacity-100",
          )}
        >
          <Sidebar />
        </div>
      </aside>
      {sidebarCollapsed && (
        <button
          onClick={toggleSidebar}
          title="Show sidebar (Alt+S)"
          aria-label="Show sidebar"
          className="hidden md:flex fixed top-2.5 left-2.5 z-40 h-8 w-8 items-center justify-center rounded-lg border bg-background/90 backdrop-blur text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shadow-sm nx-fade"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}

      {/* mobile sidebar overlay */}
      {navOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setNavOpen(false)} />
          <div className="relative w-64 max-w-[80vw] h-full shadow-xl nx-fade">
            <Sidebar onNavigate={() => setNavOpen(false)} />
          </div>
        </div>
      )}

      {/* notes list pane — collapsible on desktop (v1.4): the wrapper animates
       * its width between the full pane and a 48px icon rail; the inner list
       * keeps a fixed width so text clips instead of re-flowing */}
      <div
        className={cn(
          "relative min-w-0 shrink-0 overflow-hidden flex-1 md:flex-none",
          "transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          mobilePane === "editor" && "hidden md:block",
          listCollapsed ? "md:w-12" : "md:w-80 lg:w-96",
          "w-full",
        )}
        aria-hidden={listCollapsed}
      >
        {/* the real list — fixed inner width on md+ so collapsing clips, not squishes */}
        <div
          className={cn(
            "absolute inset-y-0 left-0 w-full md:w-80 lg:w-96 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
            listCollapsed ? "opacity-0 -translate-x-3 pointer-events-none" : "opacity-100",
          )}
        >
          <NoteList onOpenNav={() => setNavOpen(true)} />
        </div>

        {/* slim rail shown when the list is collapsed (desktop only) */}
        <div
          className={cn(
            "hidden md:flex absolute inset-y-0 right-0 w-12 flex-col items-center gap-1 py-3 border-r bg-background transition-opacity duration-200",
            listCollapsed ? "opacity-100 nx-rail-in" : "opacity-0 pointer-events-none",
          )}
        >
          <button
            onClick={toggleList}
            title="Show notes list (Alt+L)"
            aria-label="Show notes list"
            className="h-8 w-8 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors nx-press"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
          <button
            onClick={() => void createNote()}
            title="New note (Alt+N)"
            aria-label="New note"
            className="h-8 w-8 grid place-items-center rounded-lg nx-accent-bg text-white hover:opacity-90 transition-opacity nx-press"
          >
            <Plus className="h-4 w-4" />
          </button>
          <div className="my-1 h-px w-6 bg-border" />
          <button
            onClick={toggleList}
            title={`Browse notes (${visibleCount})`}
            aria-label="Browse notes"
            className="h-8 w-8 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors nx-press"
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            onClick={toggleList}
            title="Browse notes"
            aria-label="Browse notes"
            className="h-8 w-8 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors nx-press"
          >
            <NotebookPen className="h-4 w-4" />
          </button>
          <span
            className="mt-auto text-[10px] font-mono tabular-nums text-muted-foreground select-none"
            title={`${visibleCount} notes`}
          >
            {visibleCount}
          </span>
        </div>
      </div>

      {/* editor pane */}
      <div
        className={cn(
          "flex-1 min-w-0 relative",
          mobilePane === "list" ? "hidden md:block" : "nx-slide-in md:animate-none",
        )}
      >
        <Editor onBack={() => setNavOpen(false)} />
      </div>

      <CommandPalette />
      <SettingsDialog />
      <HistoryDialog />
      <LockDialog />
      <ShortcutsDialog />
    </div>
  );
}
