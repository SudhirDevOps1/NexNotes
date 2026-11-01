"use client";

/**
 * Authenticator note type — a free, privacy-first 2FA viewer (Standard Notes
 * ships this as a paid "Authenticator" app; here it is just another note).
 *
 * Accepted note body lines:
 *   Label: BASE32SECRET
 *   otpauth://totp/Label?secret=BASE32SECRET&issuer=Issuer
 * Blank lines, markdown lines and comments (#) are ignored.
 *
 * Codes are generated locally with WebCrypto (RFC 6238, SHA-1, 6 digits,
 * 30 s step) — nothing ever leaves the device.
 */

import { useEffect, useMemo, useState } from "react";
import { KeyRound, Copy, Check, RefreshCw, Plus, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

/* ---------- base32 (RFC 4648) ---------- */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input: string): Uint8Array | null {
  const clean = input.toUpperCase().replace(/[\s-]/g, "").split("=")[0];
  if (!clean.length || [...clean].some((ch) => !B32.includes(ch))) return null;
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/* ---------- RFC 6238 ---------- */

async function totp(secret: Uint8Array, step: number, time: number): Promise<string> {
  const counter = Math.floor(time / step);
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  const key = await crypto.subtle.importKey("raw", secret as unknown as BufferSource, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg as unknown as BufferSource));
  const off = sig[sig.length - 1] & 0x0f;
  const bin =
    ((sig[off] & 0x7f) << 24) | ((sig[off + 1] & 0xff) << 16) | ((sig[off + 2] & 0xff) << 8) | (sig[off + 3] & 0xff);
  return String(bin % 1_000_000).padStart(6, "0");
}

/* ---------- line parsing ---------- */

export interface TotpEntry {
  label: string;
  secret: string;
  issuer?: string;
  raw: string;
}

export function parseTotpEntries(content: string): TotpEntry[] {
  const entries: TotpEntry[] = [];
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("<")) continue;
    if (line.startsWith("otpauth://")) {
      try {
        const url = new URL(line.replace(/^otpauth:\/\//, "https://"));
        const secret = url.searchParams.get("secret") ?? "";
        const label = decodeURIComponent(url.pathname.replace(/^\//, "")) || "Account";
        const issuer = url.searchParams.get("issuer") ?? undefined;
        if (secret) entries.push({ label, secret, issuer, raw: rawLine });
      } catch { /* malformed uri */ }
      continue;
    }
    const m = line.match(/^([^:]{1,64}):\s*([A-Za-z2-7\s-]{8,})$/);
    if (m) {
      const secret = m[2].replace(/\s+/g, "");
      entries.push({ label: m[1].trim(), secret, raw: rawLine });
    }
  }
  return entries;
}

/* ---------- live code row (v1.4: animated digits + dedicated copy button) ---------- */

function RollingCode({ code, urgent }: { code: string | null; urgent: boolean }) {
  if (!code) {
    return <span className="font-mono text-xl font-bold tracking-[0.18em] tabular-nums text-muted-foreground">······</span>;
  }
  return (
    <span
      className={cn(
        "font-mono text-xl font-bold tracking-[0.18em] tabular-nums",
        urgent ? "text-amber-500 nx-pulse-fast" : "text-foreground",
      )}
    >
      {code.split("").map((d, i) => (
        <span key={`${code}-${i}`} className="nx-digit">{d}</span>
      ))}
    </span>
  );
}

function CodeRow({ entry, epoch }: { entry: TotpEntry; epoch: number }) {
  const [code, setCode] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const [copied, setCopied] = useState(false);
  const remaining = 30 - (epoch % 30);

  useEffect(() => {
    let alive = true;
    const key = base32Decode(entry.secret);
    if (!key || key.length < 4) {
      const t = setTimeout(() => setBad(true), 0);
      return () => clearTimeout(t);
    }
    void totp(key, 30, epoch).then((c) => {
      if (alive) setCode(c);
    });
    return () => {
      alive = false;
    };
  }, [entry.secret, epoch]);

  const pct = (remaining / 30) * 100;

  async function doCopy() {
    if (!code) return;
    const ok = await copyText(code);
    if (ok) {
      setCopied(true);
      toast.success(`Copied ${entry.label}`, { description: `${code} — valid for ${remaining}s` });
      setTimeout(() => setCopied(false), 1400);
    } else {
      toast.error("Could not copy", { description: "Select the code manually and copy it." });
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => void doCopy()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && void doCopy()}
      className={cn(
        "w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left cursor-pointer nx-row select-none",
        copied && "nx-flash-ok",
        "hover:bg-muted/60",
      )}
    >
      <span className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
        <KeyRound className="h-4 w-4 text-muted-foreground" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium truncate">{entry.label}</span>
        <span className="block text-[11px] text-muted-foreground font-mono truncate">
          {bad ? "invalid secret" : "••• " + entry.secret.slice(-4)}
        </span>
      </span>
      <span className="flex items-center gap-2.5 shrink-0">
        {bad ? (
          <span className="font-mono text-xl font-bold tracking-[0.18em] text-muted-foreground text-sm">—</span>
        ) : (
          <RollingCode code={code} urgent={remaining <= 5} />
        )}
        <span className="relative h-7 w-7 rounded-full grid place-items-center" title={`${remaining}s left`}>
          <svg viewBox="0 0 28 28" className="h-7 w-7 -rotate-90">
            <circle cx="14" cy="14" r="11" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-muted opacity-30" />
            <circle
              cx="14" cy="14" r="11" fill="none" strokeWidth="2.5" strokeLinecap="round"
              strokeDasharray={`${(pct / 100) * 69.1} 69.1`}
              className={cn(remaining <= 5 ? "text-amber-500" : "text-[var(--primary)]")}
              stroke="currentColor"
            />
          </svg>
        </span>
        {/* dedicated copy button (v1.4) — morphs to a green check on success */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            void doCopy();
          }}
          aria-label={`Copy ${entry.label} code`}
          title="Copy code"
          className={cn(
            "h-7 w-7 grid place-items-center rounded-md border transition-all duration-150 nx-press",
            copied
              ? "border-transparent nx-accent-bg text-white nx-pop"
              : "text-muted-foreground hover:text-foreground hover:bg-muted",
          )}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </span>
    </div>
  );
}

/* ---------- preview ---------- */

export function TotpPreview({
  content, onAddLine, readOnly = false,
}: {
  content: string;
  onAddLine?: (line: string) => void;
  readOnly?: boolean;
}) {
  const [epoch, setEpoch] = useState(() => Math.floor(Date.now() / 1000));
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setEpoch(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const entries = useMemo(() => parseTotpEntries(content), [content]);

  function append(line: string) {
    const next = content.trimEnd() + (content.trim() ? "\n" : "") + line + "\n";
    onAddLine?.(next);
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground space-y-2">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <KeyRound className="h-4 w-4" /> No accounts yet
        </p>
        <p>Add your first 2FA account — codes appear live and refresh every 30 seconds:</p>
        <pre className="rounded bg-muted/60 p-3 text-xs font-mono overflow-x-auto">
{`GitHub: JBSWY3DPEHPK3PXP
Google: KRSXG5CTMVRXEZLU
otpauth://totp/Alice?secret=GEZDGNBVGY3TQOJQ&issuer=NexNotes`}
        </pre>
        {!readOnly && onAddLine && (
          <Button size="sm" className="nx-accent-bg gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add account
          </Button>
        )}
        <AddAccountDialog
          open={addOpen} onOpenChange={setAddOpen} onAppend={append}
        />
        <p className="text-[11px]">Codes are generated on this device only — never synced in readable form.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {entries.length} account{entries.length === 1 ? "" : "s"} · tap to copy
        </span>
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <RefreshCw className="h-3 w-3" /> {30 - (epoch % 30)}s
          </span>
          <Button
            variant="ghost" size="sm" className="h-6 px-2 text-[11px] gap-1"
            title="Copy every code on this note"
            onClick={async () => {
              const lines = await Promise.all(
                entries.map(async (e) => {
                  const key = base32Decode(e.secret);
                  return `${e.label}: ${key ? await totp(key, 30, epoch) : "invalid"}`;
                }),
              );
              const ok = await copyText(lines.join("\n"));
              if (ok) toast.success(`Copied ${entries.length} codes`);
              else toast.error("Could not copy");
            }}
          >
            <ClipboardList className="h-3 w-3" /> Copy all
          </Button>
          {!readOnly && onAddLine && (
            <Button variant="outline" size="sm" className="h-6 px-2 text-[11px] gap-1" onClick={() => setAddOpen(true)}>
              <Plus className="h-3 w-3" /> Add account
            </Button>
          )}
        </span>
      </div>
      {entries.map((e, i) => (
        <CodeRow key={`${e.label}-${i}`} entry={e} epoch={epoch} />
      ))}
      <AddAccountDialog
        open={addOpen} onOpenChange={setAddOpen} onAppend={append}
      />
    </div>
  );
}

/* ---------- add account dialog (v1.3) ---------- */

function AddAccountDialog({
  open, onOpenChange, onAppend,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAppend: (line: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [secret, setSecret] = useState("");
  const [pasteUri, setPasteUri] = useState("");

  function reset() {
    setLabel(""); setSecret(""); setPasteUri("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // 1) pasted otpauth:// URI wins
    const uri = pasteUri.trim();
    if (uri) {
      if (!uri.startsWith("otpauth://totp")) {
        toast.error("That does not look like an otpauth://totp URI");
        return;
      }
      onAppend(uri);
      toast.success("Account added", { description: "Live code is generating below." });
      reset();
      onOpenChange(false);
      return;
    }
    const sec = secret.replace(/[\s-]/g, "").toUpperCase();
    if (!/^[A-Z2-7]{8,}$/.test(sec)) {
      toast.error("Invalid secret", { description: "Base32 secret must be letters A–Z and digits 2–7 (min 8 chars)." });
      return;
    }
    onAppend(`${label.trim() || "Account"}: ${sec}`);
    toast.success("Account added", { description: "Live code is generating below." });
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm w-[calc(100%-2rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 nx-accent-text" /> Add 2FA account
          </DialogTitle>
          <DialogDescription>
            The secret stays on this device — codes are generated locally (RFC 6238).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Paste otpauth:// URI (from Google Authenticator export, etc.)</Label>
            <Input
              value={pasteUri} onChange={(e) => setPasteUri(e.target.value)}
              placeholder="otpauth://totp/Alice?secret=…&issuer=NexNotes"
              className="text-xs font-mono" spellCheck={false}
            />
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or enter manually <span className="h-px flex-1 bg-border" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Label</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="GitHub" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Base32 secret</Label>
              <Input
                value={secret} onChange={(e) => setSecret(e.target.value)}
                placeholder="JBSWY3DPEHPK3PXP" className="font-mono" spellCheck={false}
              />
            </div>
          </div>
          <Button type="submit" className="w-full nx-accent-bg">Add account</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
