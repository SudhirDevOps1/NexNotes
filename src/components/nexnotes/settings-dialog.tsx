"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Settings as SettingsIcon, Palette, ShieldCheck, Database, Download, Upload,
  User as UserIcon, Info, Loader2, Check, LogOut, HardDrive, Lock, LockOpen,
  KeyRound, TriangleAlert, Server, Type, FileInput, MonitorDown, History, Save,
} from "lucide-react";
import { useTheme } from "next-themes";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useApp } from "@/lib/store";
import { ACCENTS, applyAccent, getAccent } from "@/lib/accent";
import { THEME_PRESETS, applyThemePreset, getThemePresetId } from "@/lib/themes";
import {
  listBackups, saveBackup, maybeAutoBackup, autoBackupLastRun, type BackupSnapshot,
} from "@/lib/backup";
import { ApiSection, IntegrationsSection } from "./api-integrations";
import { TwoFactorCard } from "./two-factor-card";
import {
  loadPrefs, savePrefs, applyPrefs, type EditorPrefs, type FontChoice, type SizeChoice, type SpacingChoice,
} from "@/lib/prefs";
import { cn } from "@/lib/utils";

interface Health {
  driver: string;
  driverLabel: string;
  counts: { notes: number; users: number; files: number };
  version: string;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

export function SettingsDialog() {
  const open = useApp((s) => s.settingsOpen);
  const setSettings = useApp((s) => s.setSettings);
  const user = useApp((s) => s.user);
  const online = useApp((s) => s.online);
  const lastSyncAt = useApp((s) => s.lastSyncAt);
  const notesCount = useApp((s) => Object.keys(s.notes).length);
  const exportJson = useApp((s) => s.exportJson);
  const exportMarkdown = useApp((s) => s.exportMarkdown);
  const importJson = useApp((s) => s.importJson);
  const importFiles = useApp((s) => s.importFiles);
  const importStandardNotes = useApp((s) => s.importStandardNotes);
  const enableEncryption = useApp((s) => s.enableEncryption);
  const disableEncryption = useApp((s) => s.disableEncryption);
  const changePassword = useApp((s) => s.changePassword);
  const deleteAccount = useApp((s) => s.deleteAccount);
  const signOut = useApp((s) => s.signOut);

  const [pw, setPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMode, setPwMode] = useState<"off" | "enable" | "disable">("off");
  const [accent, setAccentState] = useState<string>(() => getAccent());

  // change password
  const [showChangePw, setShowChangePw] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [cpBusy, setCpBusy] = useState(false);
  const [snBusy, setSnBusy] = useState(false);

  // driver info
  const [health, setHealth] = useState<Health | null>(null);

  // editor typography
  const [prefs, setPrefs] = useState<EditorPrefs>(() => loadPrefs());

  // PWA install
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);

  /* v2.0 — theme presets */
  const { resolvedTheme } = useTheme();
  const [themeId, setThemeId] = useState("default");
  useEffect(() => {
    setThemeId(getThemePresetId());
  }, []);

  /* v2.0 — auto-backup (device-local snapshots) */
  const buildExportPayload = useApp((s) => s.buildExportPayload);
  const importJsonAction = useApp((s) => s.importJson);
  const [autoBk, setAutoBk] = useState(false);
  const [bkList, setBkList] = useState<BackupSnapshot[]>([]);
  useEffect(() => {
    let auto = false;
    try { auto = localStorage.getItem("nx-autobackup-enabled") === "1"; } catch { /* private mode */ }
    setAutoBk(auto);
    void listBackups().then(setBkList);
    if (auto) {
      void maybeAutoBackup(true, async () => {
        const payload = await buildExportPayload();
        try {
          const parsed = JSON.parse(payload) as { notes?: unknown[] };
          return { payload, count: parsed.notes?.length ?? 0 };
        } catch {
          return null;
        }
      });
    }
  }, [buildExportPayload]);

  function toggleAutoBackup(on: boolean) {
    setAutoBk(on);
    try { localStorage.setItem("nx-autobackup-enabled", on ? "1" : "0"); } catch { /* private mode */ }
    toast.success(on ? "Daily auto-backup enabled — snapshots stay on this device" : "Auto-backup disabled", { duration: 1600 });
  }

  async function backupNow() {
    try {
      const payload = await buildExportPayload();
      let count = 0;
      try { count = (JSON.parse(payload) as { notes?: unknown[] }).notes?.length ?? 0; } catch { /* ignore */ }
      await saveBackup(payload, count);
      setBkList(await listBackups());
      toast.success(`Snapshot saved — ${count} notes`, { duration: 1600 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Backup failed");
    }
  }

  function downloadLatest() {
    const latest = bkList[0];
    if (!latest) return;
    const url = URL.createObjectURL(new Blob([latest.payload], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `nexnotes-snapshot-${latest.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function restoreLatest() {
    const latest = bkList[0];
    if (!latest) return;
    try {
      const f = new File([latest.payload], "restore.json", { type: "application/json" });
      await importJsonAction(f);
      toast.success("Snapshot restored into your notes");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restore failed");
    }
  }

  useEffect(() => {
    const h = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);

  function updatePrefs(next: EditorPrefs) {
    setPrefs(next);
    savePrefs(next);
    applyPrefs(next);
  }

  async function onSnImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSnBusy(true);
    try {
      const { imported, skippedEncrypted } = await importStandardNotes(file);
      if (imported === 0 && skippedEncrypted === 0) {
        toast.info("No notes found in that backup", { description: "Make sure it is a Standard Notes export (.txt or .json)." });
      } else {
        toast.success(`Imported ${imported} note${imported === 1 ? "" : "s"} from Standard Notes`, {
          description: skippedEncrypted > 0
            ? `${skippedEncrypted} encrypted item${skippedEncrypted === 1 ? " was" : "s were"} skipped — export a DECRYPTED backup to include them.`
            : "Tags were brought over too.",
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setSnBusy(false);
      e.target.value = "";
    }
  }

  useEffect(() => {
    if (!open) return;
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : null))
      .then((h) => setHealth(h))
      .catch(() => setHealth(null));
  }, [open]);

  function pickAccent(hex: string) {
    applyAccent(hex);
    setAccentState(hex);
  }

  function pickTheme(id: string) {
    setThemeId(id);
    applyThemePreset(id, resolvedTheme === "dark" ? "dark" : resolvedTheme === "light" ? "light" : undefined);
  }

  async function toggleEncryption(target: boolean) {
    setPwMode(target ? "enable" : "disable");
    setPw("");
  }

  async function submitPw(e: React.FormEvent) {
    e.preventDefault();
    if (!pw) return;
    setPwBusy(true);
    try {
      if (pwMode === "enable") {
        await enableEncryption(pw);
        toast.success("End-to-end encryption enabled", {
          description: "All notes are now encrypted in your browser before sync.",
        });
      } else {
        await disableEncryption(pw);
        toast.success("Encryption disabled");
      }
      setPwMode("off");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPwBusy(false);
      setPw("");
    }
  }

  async function submitChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPw.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (newPw !== confirmPw) {
      toast.error("New passwords do not match");
      return;
    }
    setCpBusy(true);
    try {
      await changePassword(currentPw, newPw);
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      setShowChangePw(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change password");
    } finally {
      setCpBusy(false);
    }
  }

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    try {
      const json = files.find((f) => f.name.endsWith(".json"));
      if (json) {
        await importJson(json);
        toast.success("Backup imported", { description: "Merged into your notes." });
      }
      const rest = files.filter((f) => /\.(md|markdown|txt)$/i.test(f.name));
      if (rest.length) {
        await importFiles(rest);
        toast.success(`Imported ${rest.length} file${rest.length > 1 ? "s" : ""}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      e.target.value = "";
    }
  }

  return (
    <Dialog open={open} onOpenChange={setSettings}>
      <DialogContent className="sm:max-w-lg w-[calc(100%-2rem)] max-h-[85vh] overflow-y-auto overflow-x-hidden nx-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5" /> Settings
          </DialogTitle>
          <DialogDescription>Preferences, security and your data.</DialogDescription>
        </DialogHeader>

        {/* appearance */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Palette className="h-4 w-4" /> Appearance
          </h3>
          <div className="flex items-center gap-3 flex-wrap">
            {ACCENTS.map((a) => (
              <button
                key={a.value}
                onClick={() => pickAccent(a.value)}
                className={cn(
                  "h-8 w-8 rounded-full border-2 flex items-center justify-center transition-transform hover:scale-105",
                  accent === a.value ? "border-foreground" : "border-transparent"
                )}
                style={{ backgroundColor: a.value }}
                title={a.name}
                aria-label={`Accent ${a.name}`}
              >
                {accent === a.value && <Check className="h-4 w-4 text-white" />}
              </button>
            ))}
            <span className="text-xs text-muted-foreground">Accent color</span>
          </div>
          {/* v2.0 — theme presets */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {THEME_PRESETS.map((t) => (
              <button
                key={t.id}
                onClick={() => pickTheme(t.id)}
                className={cn(
                  "rounded-lg border p-2 text-left text-xs transition-colors hover:bg-muted/60",
                  themeId === t.id && "border-current ring-1 ring-current"
                )}
              >
                <span className="flex items-center gap-1.5 mb-1">
                  {t.id === "default" ? (
                    <span className="h-4 w-4 rounded-full border bg-gradient-to-r from-emerald-500 to-zinc-400" />
                  ) : (
                    <>
                      <span className="h-4 w-4 rounded-full border" style={{ backgroundColor: t.light.background }} />
                      <span className="h-4 w-4 rounded-full border" style={{ backgroundColor: t.dark.background }} />
                    </>
                  )}
                  <span className="truncate">{t.name}</span>
                  {themeId === t.id && <Check className="h-3 w-3 ml-auto nx-accent-text" />}
                </span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">Full palettes — free versions of Standard Notes’ premium themes. Saved on this device.</p>
        </section>

        <Separator />

        {/* typography */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Type className="h-4 w-4" /> Editor typography
          </h3>
          <div className="grid gap-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground w-20 shrink-0">Font</span>
              <div className="flex rounded-lg border p-0.5">
                {(["sans", "serif", "mono"] as FontChoice[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => updatePrefs({ ...prefs, font: f })}
                    className={cn(
                      "rounded-md px-3 h-7 text-xs capitalize transition-colors",
                      prefs.font === f ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {f === "sans" ? "Sans" : f === "serif" ? "Serif" : "Mono"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground w-20 shrink-0">Size</span>
              <div className="flex rounded-lg border p-0.5">
                {(["s", "m", "l"] as SizeChoice[]).map((sz) => (
                  <button
                    key={sz}
                    onClick={() => updatePrefs({ ...prefs, size: sz })}
                    className={cn(
                      "rounded-md px-3 h-7 text-xs transition-colors",
                      prefs.size === sz ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {sz === "s" ? "Small" : sz === "m" ? "Medium" : "Large"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground w-20 shrink-0">Spacing</span>
              <div className="flex rounded-lg border p-0.5">
                {(["compact", "cozy"] as SpacingChoice[]).map((sp) => (
                  <button
                    key={sp}
                    onClick={() => updatePrefs({ ...prefs, spacing: sp })}
                    className={cn(
                      "rounded-md px-3 h-7 text-xs capitalize transition-colors",
                      prefs.spacing === sp ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {sp}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">Applies to the editor and preview on every note, saved on this device.</p>
          </div>
        </section>

        <Separator />

        {/* security */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Security
          </h3>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5 pr-3">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                {user?.encryptionEnabled ? <Lock className="h-3.5 w-3.5 nx-accent-text" /> : <LockOpen className="h-3.5 w-3.5 text-muted-foreground" />}
                End-to-end encryption
              </div>
              <p className="text-xs text-muted-foreground">
                AES-256-GCM · key derived from your password (PBKDF2). The server stores only ciphertext.
              </p>
            </div>
            <Switch
              checked={!!user?.encryptionEnabled}
              onCheckedChange={(v) => void toggleEncryption(v)}
              disabled={!user}
            />
          </div>

          {pwMode !== "off" && (
            <form onSubmit={submitPw} className="rounded-lg border border-dashed p-3 space-y-2.5 bg-muted/40">
              <Label className="text-xs">
                {pwMode === "enable"
                  ? "Confirm your password to derive the encryption key"
                  : "Enter your password to decrypt and disable"}
              </Label>
              <Input
                type="password" value={pw} onChange={(e) => setPw(e.target.value)}
                placeholder="Your account password" autoFocus autoComplete="current-password"
              />
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={pwBusy || !pw} className="nx-accent-bg">
                  {pwBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {pwMode === "enable" ? "Enable" : "Disable"}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setPwMode("off")}>Cancel</Button>
              </div>
              {pwMode === "enable" && (
                <p className="text-[11px] text-amber-600 dark:text-amber-500">
                  ⚠️ If you forget this password your notes cannot be recovered.
                </p>
              )}
            </form>
          )}

          {/* change password */}
          <div className="rounded-lg border p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <KeyRound className="h-3.5 w-3.5" /> Account password
              </div>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowChangePw((v) => !v)}>
                {showChangePw ? "Cancel" : "Change…"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Rotates your login password. With E2E on, every cached note is re-encrypted automatically.
            </p>
            {showChangePw && (
              <form onSubmit={submitChangePassword} className="space-y-2">
                <Input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)}
                  placeholder="Current password" autoComplete="current-password" />
                <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)}
                  placeholder="New password (min 6)" autoComplete="new-password" />
                <Input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)}
                  placeholder="Confirm new password" autoComplete="new-password" />
                <Button type="submit" size="sm" className="nx-accent-bg" disabled={cpBusy || !currentPw || !newPw}>
                  {cpBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Update password
                </Button>
              </form>
            )}
          </div>

          {/* v2.0 — account two-factor authentication */}
          <TwoFactorCard user={user} />
        </section>

        <Separator />

        {/* data */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Database className="h-4 w-4" /> Data
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={() => void exportJson()} className="justify-start gap-2">
              <Download className="h-3.5 w-3.5" /> Export JSON
            </Button>
            <Button variant="outline" size="sm" onClick={() => void exportMarkdown()} className="justify-start gap-2">
              <Download className="h-3.5 w-3.5" /> Export Markdown
            </Button>
            <label className="">
              <input type="file" accept=".txt,.json" className="hidden" onChange={onSnImport} disabled={snBusy} />
              <span className="inline-flex items-center justify-start gap-2 rounded-md border px-3 h-8 text-sm font-medium w-full cursor-pointer hover:bg-muted">
                {snBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileInput className="h-3.5 w-3.5 nx-accent-text" />}
                Import from Standard Notes
              </span>
            </label>
            <label className="">
              <input type="file" accept=".json,.md,.markdown,.txt" multiple className="hidden" onChange={onImport} />
              <span className="inline-flex items-center justify-start gap-2 rounded-md border px-3 h-8 text-sm font-medium w-full cursor-pointer hover:bg-muted">
                <Upload className="h-3.5 w-3.5" /> NexNotes backup / .md / .txt
              </span>
            </label>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Standard Notes import accepts the decrypted backup (.txt or .json from Account → Export). Notes and tags arrive
            as markdown — encrypted exports must be re-exported decrypted first.
          </p>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
            <HardDrive className="h-3 w-3 shrink-0" />
            {notesCount} notes cached on this device · {online ? "online" : "offline (queued)"}
            {lastSyncAt && ` · last sync ${new Date(lastSyncAt).toLocaleTimeString()}`}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Notes in the Trash are permanently deleted automatically after 30 days.
          </p>
          {installEvt && (
            <Button
              variant="outline" size="sm" className="w-full gap-2"
              onClick={() => {
                void installEvt.prompt();
                setInstallEvt(null);
              }}
            >
              <MonitorDown className="h-3.5 w-3.5 nx-accent-text" /> Install NexNotes as an app
            </Button>
          )}

          {/* v2.0 — automatic local backups */}
          <div className="rounded-lg border p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <History className="h-3.5 w-3.5" /> Daily auto-backup
              </div>
              <Switch checked={autoBk} onCheckedChange={toggleAutoBackup} />
            </div>
            <p className="text-xs text-muted-foreground">
              A decrypted snapshot of every note is saved on this device daily (last 7 kept). Never uploaded.
            </p>
            <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-muted-foreground">
              <Save className="h-3 w-3 shrink-0" />
              {bkList.length > 0
                ? `${bkList.length} snapshot${bkList.length === 1 ? "" : "s"} · latest ${new Date(bkList[0].createdAt).toLocaleString()}`
                : autoBackupLastRun()
                  ? `Last run ${new Date(autoBackupLastRun()!).toLocaleString()}`
                  : "No snapshots yet"}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => void backupNow()}>
                <Save className="h-3 w-3" /> Backup now
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={downloadLatest} disabled={bkList.length === 0}>
                <Download className="h-3 w-3" /> Download latest
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" disabled={bkList.length === 0}>
                    <Upload className="h-3 w-3" /> Restore latest
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Restore the latest snapshot?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Notes from the snapshot are merged back (newer versions win). Your current notes are not deleted.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction className="nx-accent-bg" onClick={() => void restoreLatest()}>
                      Restore snapshot
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </section>

        <Separator />

        {/* api + integrations (v1.3) */}
        <ApiSection />

        <Separator />

        <IntegrationsSection />

        <Separator />

        {/* account */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <UserIcon className="h-4 w-4" /> Account
          </h3>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium truncate">{user?.email}</p>
              <p className="text-xs text-muted-foreground">Signed in · JWT session (30 days)</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void signOut()} className="gap-1.5 shrink-0">
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </Button>
          </div>

          {/* danger zone */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="w-full gap-1.5 text-destructive hover:text-destructive border-destructive/30">
                <TriangleAlert className="h-3.5 w-3.5" /> Delete account & wipe all data
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes your account with every note, file, tag and version on the server.
                  Local cached data is wiped too. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep my account</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-white hover:bg-destructive/90"
                  onClick={() => void deleteAccount().catch((e) => toast.error(e.message))}
                >
                  Delete everything
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>

        <Separator />

        {/* about */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Info className="h-4 w-4" /> About
          </h3>
          <div className="rounded-lg border p-3 text-xs text-muted-foreground space-y-1.5">
            <p className="font-medium text-foreground text-sm">
              NexNotes v{health?.version ?? "2.0"}
              {health && (
                <Badge variant="secondary" className="ml-2 h-4.5 px-1.5 text-[10px] gap-1 font-normal">
                  <Server className="h-2.5 w-2.5" /> {health.driverLabel}
                </Badge>
              )}
            </p>
            <p>Free, open-source, local-first notes. Clean-room codebase — no third-party app code.</p>
            {health && (
              <p>
                <span className="font-medium text-foreground">Server storage:</span> {health.counts.notes} notes ·{" "}
                {health.counts.files} files · {health.counts.users} accounts
              </p>
            )}
            <p>
              <span className="font-medium text-foreground">Multi-database:</span> SQLite (default) · Neon Postgres —{" "}
              <code>node scripts/db-switch.mjs postgres &quot;postgresql://…neon.tech/nexnotes?sslmode=require&quot;</code>
            </p>
            <p>
              <span className="font-medium text-foreground">Sync:</span> push/pull with last-write-wins; conflicting
              edits are kept as conflict copies; offline edits queue in IndexedDB and flush on reconnect.
            </p>
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}
