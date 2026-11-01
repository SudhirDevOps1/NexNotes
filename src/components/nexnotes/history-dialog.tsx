"use client";

import { useEffect, useState } from "react";
import { History, Loader2, RotateCcw, Lock, FileText } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/lib/store";
import type { HistoryDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function HistoryDialog() {
  const noteId = useApp((s) => s.historyNoteId);
  const setHistory = useApp((s) => s.setHistory);
  const notes = useApp((s) => s.notes);

  const note = noteId ? notes[noteId] : null;

  return (
    <Dialog open={!!noteId} onOpenChange={(open) => !open && setHistory(null)}>
      <DialogContent className="sm:max-w-3xl w-[calc(100%-2rem)] max-h-[85vh] overflow-x-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" /> Note history
          </DialogTitle>
          <DialogDescription>
            Every saved edit is versioned automatically (last 25). Restoring adds the current version to history too.
          </DialogDescription>
        </DialogHeader>

        {noteId && <VersionList key={noteId} noteId={noteId} />}

        {note && (
          <p className="text-[11px] text-muted-foreground">
            Viewing history for <span className="font-medium">{(note.title || "Untitled").slice(0, 40)}</span>
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function VersionList({ noteId }: { noteId: string }) {
  const fetchHistory = useApp((s) => s.fetchHistory);
  const restoreVersion = useApp((s) => s.restoreVersion);
  const [versions, setVersions] = useState<HistoryDTO[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const v = await fetchHistory(noteId);
        if (cancelled) return;
        setVersions(v);
        setSelected(v[0]?.id ?? null);
      } catch {
        if (!cancelled) setVersions([]);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [noteId, fetchHistory]);

  const loading = versions === null;
  const list = versions ?? [];
  const current = list.find((v) => v.id === selected) ?? null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading versions…
      </div>
    );
  }

  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mb-3">
          <FileText className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">No previous versions yet</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
          Edit the note and sync — the replaced version will appear here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-4 min-h-0 flex-1">
      {/* version list */}
      <ScrollArea className="w-48 shrink-0 border rounded-lg">
        <div className="p-1.5 space-y-0.5">
          {list.map((v, i) => (
            <button
              key={v.id}
              onClick={() => setSelected(v.id)}
              className={cn(
                "w-full text-left rounded-md px-2 py-2 transition-colors",
                v.id === selected ? "bg-muted" : "hover:bg-muted/60"
              )}
            >
              <p className="text-xs font-medium truncate">{v.title || "Untitled"}</p>
              <p className="text-[10px] text-muted-foreground">
                {i === 0 ? "Latest previous · " : ""}
                {new Date(v.createdAt).toLocaleString(undefined, {
                  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </p>
            </button>
          ))}
        </div>
      </ScrollArea>

      {/* preview */}
      <ScrollArea className="flex-1 border rounded-lg nx-scroll">
        <div className="p-4">
          {current && (
            <>
              <div className="flex items-center justify-between mb-3 gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  {new Date(current.createdAt).toLocaleString()}
                </Badge>
                <Button
                  size="sm" className="h-7 text-xs gap-1.5 nx-accent-bg"
                  onClick={() => void restoreVersion(noteId, current)}
                  disabled={current.content === "__locked__" || current.content === "__undecryptable__"}
                >
                  <RotateCcw className="h-3 w-3" /> Restore this version
                </Button>
              </div>
              <h3 className="text-lg font-bold mb-2">{current.title || "Untitled"}</h3>
              {current.content === "__locked__" || current.content === "__undecryptable__" ? (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" /> This version is encrypted — unlock the note first.
                </p>
              ) : (
                <div className="md-preview text-[13.5px]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{current.content || "*Empty version*"}</ReactMarkdown>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
