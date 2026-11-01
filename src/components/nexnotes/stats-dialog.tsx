"use client";

/**
 * NexNotes Statistics (v1.4) — live animated counters in the same "live
 * digits" style the Authenticator uses. Everything is computed locally from
 * the IndexedDB cache; nothing is sent anywhere. Privacy-first.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FileText, Tag, Folder, Star, ShieldCheck, Lock, Flame, Type, BarChart3, Archive,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/* ---------- activity streak (local, private) ---------- */

const DAYS_KEY = "nx-active-days";

function recordToday() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const raw = localStorage.getItem(DAYS_KEY);
    const days: string[] = raw ? JSON.parse(raw) : [];
    if (!days.includes(today)) {
      days.push(today);
      localStorage.setItem(DAYS_KEY, JSON.stringify(days.slice(-400)));
    }
  } catch { /* private mode */ }
}

function computeStreak(): number {
  try {
    const raw = localStorage.getItem(DAYS_KEY);
    const set = new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
    let streak = 0;
    const d = new Date();
    // allow the streak to be "alive" if yesterday was the last active day
    if (!set.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1);
    for (;;) {
      const key = d.toISOString().slice(0, 10);
      if (!set.has(key)) break;
      streak += 1;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  } catch {
    return 0;
  }
}

/* ---------- animated count-up digit ---------- */

function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const v = Math.round(from + (target - from) * eased);
      setValue(v);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function StatCard({
  icon, label, value, accent, suffix,
}: {
  icon: React.ReactNode; label: string; value: number; accent?: boolean; suffix?: string;
}) {
  const animated = useCountUp(value);
  return (
    <div
      className={cn(
        "rounded-xl border p-3.5 nx-grow-in flex flex-col gap-1.5",
        accent && "border-current/25",
      )}
      style={{ borderColor: accent ? "color-mix(in oklab, var(--primary) 35%, var(--border))" : undefined }}
    >
      <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </span>
      <span
        className={cn(
          "font-mono text-2xl font-bold tabular-nums leading-none",
          accent && "nx-accent-text",
        )}
      >
        {animated.toLocaleString()}
        {suffix && <span className="text-sm font-medium text-muted-foreground ml-1">{suffix}</span>}
      </span>
    </div>
  );
}

export function StatsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const notes = useApp((s) => s.notes);
  const folders = useApp((s) => s.folders);
  const tags = useApp((s) => s.tags);
  const unlockedNotes = useApp((s) => s.unlockedNotes);
  const user = useApp((s) => s.user);

  // record today's activity whenever the panel opens
  useEffect(() => {
    if (open) recordToday();
  }, [open]);

  const stats = useMemo(() => {
    const all = Object.values(notes);
    const live = all.filter((n) => !n.trashed);
    let words = 0;
    let chars = 0;
    for (const n of all) {
      const c = unlockedNotes[n.id]?.content ?? (n.locked ? "" : n.content);
      if (!c) continue;
      chars += c.length;
      words += c.trim() ? c.trim().split(/\s+/).length : 0;
    }
    return {
      notes: live.length,
      words,
      chars,
      tags: Object.keys(tags).length,
      folders: Object.keys(folders).length,
      starred: live.filter((n) => n.starred).length,
      protected: live.filter((n) => n.locked).length,
      archived: all.filter((n) => n.archived && !n.trashed).length,
      encrypted: live.filter((n) => n.isEncrypted || n.locked).length,
      streak: computeStreak(),
    };
  }, [notes, folders, tags, unlockedNotes]);

  const memberSince = user ? new Date(user.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg w-[calc(100%-2rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 nx-accent-text" /> Your statistics
          </DialogTitle>
          <DialogDescription>
            Counted live from this device — {memberSince ? `member since ${memberSince}.` : "private by design."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <StatCard icon={<FileText className="h-3 w-3" />} label="Notes" value={stats.notes} accent />
          <StatCard icon={<Type className="h-3 w-3" />} label="Words" value={stats.words} accent />
          <StatCard icon={<Flame className="h-3 w-3" />} label="Day streak" value={stats.streak} accent />
          <StatCard icon={<Star className="h-3 w-3" />} label="Starred" value={stats.starred} />
          <StatCard icon={<Tag className="h-3 w-3" />} label="Tags" value={stats.tags} />
          <StatCard icon={<Folder className="h-3 w-3" />} label="Folders" value={stats.folders} />
          <StatCard icon={<Lock className="h-3 w-3" />} label="Protected" value={stats.protected} />
          <StatCard icon={<ShieldCheck className="h-3 w-3" />} label="Encrypted" value={stats.encrypted} />
          <StatCard icon={<Archive className="h-3 w-3" />} label="Archived" value={stats.archived} />
        </div>
        <p className="text-[11px] text-muted-foreground">
          {stats.words.toLocaleString()} words · {stats.chars.toLocaleString()} characters written in total.
          {" "}Numbers animate as they count up — nothing about your notes ever leaves this device.
        </p>
      </DialogContent>
    </Dialog>
  );
}
