"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2, Lock, LockOpen, ShieldCheck } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useApp } from "@/lib/store";

export function LockDialog() {
  const noteId = useApp((s) => s.lockNoteId);
  const setLockDialog = useApp((s) => s.setLockDialog);
  const notes = useApp((s) => s.notes);
  const unlocked = useApp((s) => (noteId ? s.unlockedNotes[noteId] : undefined));
  const lockNote = useApp((s) => s.lockNote);
  const removeLock = useApp((s) => s.removeLock);
  const relockNote = useApp((s) => s.relockNote);

  const note = noteId ? notes[noteId] : null;
  const locked = !!note?.locked;

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentPw(""); setNewPw(""); setConfirmPw(""); setError(null);
  }, [noteId]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setLockDialog(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    !locked
      ? newPw.length >= 4 && newPw === confirmPw
      : currentPw.length > 0 && (newPw === "" || (newPw.length >= 4 && newPw === confirmPw));

  return (
    <Dialog open={!!noteId} onOpenChange={(open) => !open && setLockDialog(null)}>
      <DialogContent className="sm:max-w-md w-[calc(100%-2rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" /> {locked ? "Password protection" : "Protect this note"}
          </DialogTitle>
          <DialogDescription>
            {locked
              ? "Change or remove the per-note password. The note is encrypted with its own key on device and server."
              : "The note content will be encrypted a second time with its own password — even the server can't read it."}
          </DialogDescription>
        </DialogHeader>

        {locked ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-xs">
              <Lock className="h-4 w-4 nx-accent-text shrink-0" />
              <span>
                This note is protected{unlocked ? " and unlocked for this session" : ""}.
                Wrong password attempts can't decrypt it.
              </span>
            </div>
            <div className="space-y-1.5">
              <Label>Current note password</Label>
              <Input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} autoComplete="off" placeholder="••••••••" />
            </div>
            <Separator />
            <div className="space-y-1.5">
              <Label>New password (leave empty to only remove protection)</Label>
              <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" placeholder="new note password (min 4)" />
              <Input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" placeholder="confirm new password" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <Button
                className="nx-accent-bg gap-1.5"
                disabled={busy || !canSubmit}
                onClick={() => run(async () => {
                  await removeLock(noteId!, currentPw);
                  if (newPw) await lockNote(noteId!, newPw);
                })}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {newPw ? <><ShieldCheck className="h-4 w-4" /> Change password</> : <><LockOpen className="h-4 w-4" /> Remove protection</>}
              </Button>
              {unlocked && (
                <Button variant="outline" className="gap-1.5" onClick={() => { relockNote(noteId!); setLockDialog(null); }}>
                  <Lock className="h-4 w-4" /> Lock now
                </Button>
              )}
              <Button variant="ghost" onClick={() => setLockDialog(null)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Note password (min 4 chars)</Label>
              <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoFocus autoComplete="new-password" placeholder="••••••••" />
            </div>
            <div className="space-y-1.5">
              <Label>Confirm password</Label>
              <Input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" placeholder="••••••••" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <p className="text-[11px] text-amber-600 dark:text-amber-500">
              ⚠️ If you forget this note password, its content cannot be recovered — not even by the server.
            </p>
            <div className="flex gap-2">
              <Button className="nx-accent-bg gap-1.5" disabled={busy || !canSubmit}
                onClick={() => run(() => lockNote(noteId!, newPw))}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                Protect note
              </Button>
              <Button variant="ghost" onClick={() => setLockDialog(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
