"use client";

import { Keyboard } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useApp } from "@/lib/store";

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: "Ctrl + K", action: "Command palette" },
  { keys: "Alt + N", action: "New note" },
  { keys: "Alt + S", action: "Show / hide sidebar" },
  { keys: "Alt + L", action: "Show / hide notes list" },
  { keys: "Alt + E", action: "Cycle editor / split / preview" },
  { keys: "Ctrl + B", action: "Bold selection (in editor)" },
  { keys: "Ctrl + I", action: "Italic selection (in editor)" },
  { keys: "Ctrl + F", action: "Find in note" },
  { keys: "Ctrl + H", action: "Note history" },
  { keys: "Ctrl + S", action: "Force save + sync" },
  { keys: "Esc", action: "Exit zen mode" },
  { keys: "Ctrl + ,", action: "Settings" },
  { keys: "?", action: "This shortcut sheet" },
];

export function ShortcutsDialog() {
  const open = useApp((s) => s.shortcutsOpen);
  const setShortcuts = useApp((s) => s.setShortcuts);

  return (
    <Dialog open={open} onOpenChange={setShortcuts}>
      <DialogContent className="sm:max-w-sm w-[calc(100%-2rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" /> Keyboard shortcuts
          </DialogTitle>
          <DialogDescription>Work fast, hands on the keys.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="flex items-center justify-between rounded-lg border px-3 py-2">
              <span className="text-sm">{s.action}</span>
              <kbd className="rounded border bg-muted px-2 py-0.5 text-xs font-mono">{s.keys}</kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
