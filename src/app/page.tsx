"use client";

import { useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import { useApp } from "@/lib/store";
import { initAccent } from "@/lib/accent";
import { applyThemePreset, getThemePresetId } from "@/lib/themes";
import { loadPrefs, applyPrefs } from "@/lib/prefs";
import { AuthScreen } from "@/components/nexnotes/auth-screen";
import { AppShell } from "@/components/nexnotes/app-shell";
import { UnlockScreen } from "@/components/nexnotes/unlock-dialog";

function Splash() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <div className="h-14 w-14 rounded-2xl nx-accent-bg flex items-center justify-center animate-pulse">
        <ShieldCheck className="h-8 w-8 text-white" strokeWidth={2.2} />
      </div>
      <p className="text-sm text-muted-foreground">Loading NexNotes…</p>
    </div>
  );
}

export default function Page() {
  const status = useApp((s) => s.status);
  const boot = useApp((s) => s.boot);

  useEffect(() => {
    initAccent();
    applyPrefs(loadPrefs());
    applyThemePreset(getThemePresetId(), undefined);
    void boot();
    // PWA: register the shell cache only in production builds
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, [boot]);

  if (status === "boot") return <Splash />;
  if (status === "anon") return <AuthScreen />;
  if (status === "locked") return <UnlockScreen />;
  return <AppShell />;
}
