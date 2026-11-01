"use client";

import { useRef } from "react";
import { Upload, FileText, Download, Trash2, Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/lib/store";

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function FilesPane() {
  const files = useApp((s) => s.files);
  const uploadFiles = useApp((s) => s.uploadFiles);
  const deleteFile = useApp((s) => s.deleteFile);
  const downloadFile = useApp((s) => s.downloadFile);
  const online = useApp((s) => s.online);
  const inputRef = useRef<HTMLInputElement>(null);
  const list = Object.values(files).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  // min-h-0 keeps the pane capped at the flex row height so the file
  // list scrolls instead of stretching the shell
  return (
    <ScrollArea className="flex-1 min-h-0 nx-scroll">
      <div className="p-3 space-y-2">
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const selected = Array.from(e.target.files ?? []);
            if (selected.length) void uploadFiles(selected);
            e.target.value = "";
          }}
        />
        <Button
          className="w-full nx-accent-bg gap-2"
          onClick={() => inputRef.current?.click()}
          disabled={!online}
        >
          <Upload className="h-4 w-4" /> Upload files (max 3 MB)
        </Button>
        {!online && (
          <p className="text-xs text-amber-500 flex items-center gap-1.5 px-1">
            <Loader2 className="h-3 w-3" /> Uploads need a connection — notes keep working offline.
          </p>
        )}

        {list.length === 0 && (
          <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
            <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mb-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No files yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Upload attachments — they sync to your account and are encrypted end-to-end when E2E is on.
            </p>
          </div>
        )}

        {list.map((f) => (
          <div
            key={f.id}
            className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
          >
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <FileText className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{f.name}</p>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                {fmtSize(f.size)} · {new Date(f.createdAt).toLocaleDateString()}
                {f.isEncrypted && (
                  <Badge variant="secondary" className="h-4 px-1 text-[9px] gap-0.5">
                    <Lock className="h-2.5 w-2.5" /> E2E
                  </Badge>
                )}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void downloadFile(f.id)} aria-label={`Download ${f.name}`}>
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive hover:bg-destructive/10" onClick={() => void deleteFile(f.id)} aria-label={`Delete ${f.name}`}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
