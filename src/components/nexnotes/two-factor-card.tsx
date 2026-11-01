"use client";

/**
 * NexNotes v2.0 — account two-factor authentication (TOTP).
 * Setup: password → QR/secret → live code → backup codes (shown once).
 * Compatible with Google Authenticator, Authy, 1Password, Aegis, etc.
 */

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { KeyRound, Loader2, ShieldCheck, Copy, Check, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/lib/store";
import type { UserDTO } from "@/lib/types";
import { copyText } from "@/lib/clipboard";

export function TwoFactorCard({ user }: { user: UserDTO | null }) {
  const [enabled, setEnabled] = useState<boolean | null>(user?.twofaEnabled ?? null);
  const [stage, setStage] = useState<"idle" | "setup" | "codes">("idle");
  const [password, setPassword] = useState("");
  const [uri, setUri] = useState("");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [disablePw, setDisablePw] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (enabled !== null) return;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setEnabled(!!d?.user?.twofaEnabled))
      .catch(() => setEnabled(false));
  }, [enabled]);

  function patchStore(v: boolean) {
    setEnabled(v);
    const u = useApp.getState().user;
    if (u) useApp.setState({ user: { ...u, twofaEnabled: v } });
  }

  async function startSetup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/2fa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Setup failed");
      setUri(data.otpauthUri);
      setSecret(data.secret);
      setQr(await QRCode.toDataURL(data.otpauthUri, { margin: 1, width: 176 }));
      setStage("setup");
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/2fa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Enable failed");
      setCodes(data.backupCodes ?? []);
      setStage("codes");
      setCode("");
      patchStore(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enable failed");
    } finally {
      setBusy(false);
    }
  }

  async function disable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: disablePw, code: disableCode }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Disable failed");
      patchStore(false);
      setStage("idle");
      setDisableCode("");
      setDisablePw("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disable failed");
    } finally {
      setBusy(false);
    }
  }

  async function copySecret() {
    const ok = await copyText(secret);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }
  }

  return (
    <div className="rounded-lg border p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <KeyRound className="h-3.5 w-3.5" /> Two-factor authentication
          {enabled !== null && (
            <Badge variant={enabled ? "default" : "secondary"} className="h-4.5 px-1.5 text-[10px] font-normal gap-1">
              {enabled ? "ON" : "OFF"}
            </Badge>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Time-based codes (RFC 6238) required at every login, plus single-use backup codes.
      </p>

      {/* stage: disabled → start */}
      {enabled === false && stage === "idle" && (
        <form onSubmit={startSetup} className="space-y-2">
          <Input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Confirm your account password" autoComplete="current-password"
          />
          <Button type="submit" size="sm" className="nx-accent-bg" disabled={busy || !password}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Set up 2FA
          </Button>
        </form>
      )}

      {/* stage: scan + verify */}
      {enabled === false && stage === "setup" && (
        <form onSubmit={confirmEnable} className="space-y-3 animate-in slide-in-from-top-2 fade-in duration-200">
          <div className="flex flex-col sm:flex-row gap-3 items-start">
            {qr && (
               
              <img src={qr} alt="2FA QR code" className="rounded-lg border bg-white p-1.5 h-[152px] w-[152px]" />
            )}
            <div className="space-y-1.5 flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">
                Scan with your authenticator app, or paste this key:
              </p>
              <div className="flex items-center gap-1.5">
                <code className="text-[11px] bg-muted rounded px-2 py-1 font-mono break-all flex-1 min-w-0">{secret}</code>
                <Button type="button" variant="outline" size="icon" className="h-7 w-7 shrink-0" onClick={() => void copySecret()} aria-label="Copy secret">
                  {copied ? <Check className="h-3.5 w-3.5 nx-accent-text" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground break-all">{uri}</p>
            </div>
          </div>
          <Input
            inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)}
            placeholder="Enter the 6-digit code" autoComplete="one-time-code"
            className="font-mono tracking-[0.3em]"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" className="nx-accent-bg" disabled={busy || code.trim().length < 6}>
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Verify & enable
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setStage("idle"); setError(null); }}>Cancel</Button>
          </div>
        </form>
      )}

      {/* stage: backup codes (once) */}
      {stage === "codes" && (
        <div className="space-y-2 animate-in slide-in-from-top-2 fade-in duration-200">
          <p className="text-xs font-medium flex items-center gap-1.5 nx-accent-text">
            <ShieldCheck className="h-3.5 w-3.5" /> 2FA is on! Save these backup codes now — they are shown only once:
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {codes.map((c) => (
              <code key={c} className="text-[11px] bg-muted rounded px-1.5 py-1 font-mono text-center">{c}</code>
            ))}
          </div>
          <p className="text-[11px] text-amber-600 dark:text-amber-500 flex items-center gap-1">
            <TriangleAlert className="h-3 w-3" /> Each code works exactly once if you lose your authenticator.
          </p>
          <Button size="sm" variant="outline" onClick={() => setStage("idle")}>I saved them</Button>
        </div>
      )}

      {/* stage: enabled → disable */}
      {enabled === true && stage === "idle" && (
        <form onSubmit={disable} className="space-y-2 border-t pt-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Input
              type="password" value={disablePw} onChange={(e) => setDisablePw(e.target.value)}
              placeholder="Account password" autoComplete="current-password"
            />
            <Input
              inputMode="numeric" value={disableCode} onChange={(e) => setDisableCode(e.target.value)}
              placeholder="Authenticator code" autoComplete="one-time-code"
              className="font-mono"
            />
          </div>
          <Button type="submit" size="sm" variant="outline" className="text-destructive hover:text-destructive" disabled={busy || !disablePw || !disableCode}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Turn off 2FA
          </Button>
        </form>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
      {!user && <p className="text-xs text-muted-foreground">Sign in to manage two-factor auth.</p>}
    </div>
  );
}
