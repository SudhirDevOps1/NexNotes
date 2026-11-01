"use client";

/**
 * Settings sections for v1.3: personal REST API tokens + the Integrations
 * vault (Discord / Telegram / GitHub / LLM / webhook keys, Obsidian-style,
 * stored device-local and encrypted when E2E is on).
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { copyText } from "@/lib/clipboard";
import {
  Plug, Play, Trash2, Copy, Plus, KeyRound, Loader2, RefreshCw, EyeOff, Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useApp } from "@/lib/store";
import {
  INTEGRATION_META, loadIntegrations, saveIntegrations, newIntegration,
  testIntegration, type Integration, type IntegrationKind,
} from "@/lib/integrations";

/* ================================ API ================================ */

interface TokenRow {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export function ApiSection() {
  const user = useApp((s) => s.user);
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/tokens");
      if (r.ok) setTokens(((await r.json()) as { tokens: TokenRow[] }).tokens);
    } catch { /* offline */ }
  }, []);

  useEffect(() => {
    if (user) void refresh();
  }, [user, refresh]);

  async function create() {
    setBusy(true);
    try {
      const r = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not create token");
      setFresh(j.token as string);
      setName("");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Token creation failed");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    await fetch(`/api/tokens?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined);
    await refresh();
    toast.success("Token revoked");
  }

  if (!user) return null;

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Plug className="h-4 w-4" /> API access <Badge variant="secondary" className="text-[10px] h-4.5">v1</Badge>
      </h3>
      <p className="text-xs text-muted-foreground">
        Personal REST API — read & write your notes from scripts, Obsidian, IFTTT, anything that speaks HTTP.
        Tokens are stored server-side as SHA-256 hashes only and shown once.
      </p>

      <div className="flex gap-2">
        <Input
          value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Token name (e.g. Obsidian)" className="h-8 text-xs"
          onKeyDown={(e) => e.key === "Enter" && void create()}
        />
        <Button size="sm" className="h-8 nx-accent-bg gap-1.5 shrink-0" onClick={() => void create()} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Generate
        </Button>
      </div>

      {fresh && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
          <p className="text-xs font-medium flex items-center gap-1.5">
            <KeyRound className="h-3.5 w-3.5 text-amber-500" /> Copy this token now — it will never be shown again
          </p>
          <div className="flex gap-1.5">
            <code className="flex-1 text-[11px] font-mono bg-background/70 rounded px-2 py-1.5 break-all select-all">{fresh}</code>
            <Button
              size="icon" variant="outline" className="h-8 w-8 shrink-0"
              onClick={async () => {
                const ok = await copyText(fresh);
                if (ok) toast.success("Token copied");
                else toast.error("Clipboard unavailable");
              }}
              aria-label="Copy token"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {tokens.length > 0 && (
        <div className="space-y-1.5">
          {tokens.map((t) => (
            <div key={t.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs">
              <KeyRound className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{t.name}</p>
                <p className="text-[10px] text-muted-foreground font-mono">
                  {t.prefix}… · created {new Date(t.createdAt).toLocaleDateString()}
                  {t.lastUsedAt && ` · used ${new Date(t.lastUsedAt).toLocaleDateString()}`}
                </p>
              </div>
              {t.revokedAt ? (
                <Badge variant="outline" className="text-[10px] h-4.5 text-muted-foreground">revoked</Badge>
              ) : (
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 shrink-0 hover:text-destructive"
                  onClick={() => void revoke(t.id)} aria-label={`Revoke ${t.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <details className="rounded-lg border p-3 text-xs">
        <summary className="cursor-pointer font-medium flex items-center gap-1.5 select-none">
          <RefreshCw className="h-3 w-3" /> Example requests (click to expand)
        </summary>
        <div className="mt-2 space-y-2 font-mono text-[10.5px] leading-relaxed overflow-x-auto">
          <p className="text-muted-foreground"># List notes</p>
          <pre className="bg-muted/60 rounded p-2 whitespace-pre-wrap">{`curl "$HOST/api/v1/notes" \\
  -H "Authorization: Bearer nx_YOUR_TOKEN"`}</pre>
          <p className="text-muted-foreground"># Create a note</p>
          <pre className="bg-muted/60 rounded p-2 whitespace-pre-wrap">{`curl -X POST "$HOST/api/v1/notes" \\
  -H "Authorization: Bearer nx_YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"From curl","content":"Hello from the API","noteType":"markdown"}'`}</pre>
          <p className="text-muted-foreground"># Update / trash / search</p>
          <pre className="bg-muted/60 rounded p-2 whitespace-pre-wrap">{`curl -X PATCH "$HOST/api/v1/notes/ID" -H "Authorization: Bearer nx_YOUR_TOKEN" \\
  -H "Content-Type: application/json" -d '{"starred":true}'
curl "$HOST/api/v1/notes?q=meeting"
curl -X DELETE "$HOST/api/v1/notes/ID"   # soft-delete to trash`}</pre>
          <p className="text-[10px] text-muted-foreground font-sans">
            Endpoints: <code>GET /api/v1/me</code>, <code>GET·POST /api/v1/notes</code>,{" "}
            <code>GET·PATCH·DELETE /api/v1/notes/:id</code>. With E2E encryption on, content is returned
            as ciphertext (zero-knowledge by design).
          </p>
        </div>
      </details>
    </section>
  );
}

/* =========================== Integrations =========================== */

const KIND_ORDER: IntegrationKind[] = ["discord", "telegram", "github", "openai", "webhook", "custom"];

function KindIcon({ kind }: { kind: IntegrationKind }) {
  if (kind === "discord") return <Bot className="h-4 w-4 text-indigo-400" />;
  if (kind === "telegram") return <Bot className="h-4 w-4 text-sky-400" />;
  return <Plug className="h-4 w-4 text-muted-foreground" />;
}

export function IntegrationsSection() {
  const encKey = useApp((s) => s.encKey);
  const e2eOn = useApp((s) => !!s.user?.encryptionEnabled);
  const [list, setList] = useState<Integration[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<Integration | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});

  useEffect(() => {
    void loadIntegrations(encKey).then((l) => {
      setList(l);
      setLoaded(true);
    });
  }, [encKey]);

  const persist = useCallback(
    (next: Integration[]) => {
      setList(next);
      void saveIntegrations(next, encKey);
    },
    [encKey]
  );

  async function runTest(int: Integration) {
    setTesting(int.id);
    try {
      const res = await testIntegration(int);
      setResults((r) => ({ ...r, [int.id]: res.message }));
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    } finally {
      setTesting(null);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Plug className="h-4 w-4" /> Integrations
        </h3>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setAddOpen(true)}>
          <Plus className="h-3 w-3" /> Add key
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Store API keys for Discord, Telegram, GitHub and more — like Obsidian plugin settings.{" "}
        {e2eOn ? (
          <span className="text-emerald-600 dark:text-emerald-500 font-medium">Encrypted on this device (E2E key).</span>
        ) : (
          <span>Stored on this device only — never synced. Enable E2E encryption to encrypt them at rest.</span>
        )}
      </p>

      {!loaded ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading…
        </p>
      ) : list.length === 0 ? (
        <p className="text-xs text-muted-foreground rounded-lg border border-dashed p-3">
          No integrations yet. Add a Discord webhook to send notes straight to a channel.
        </p>
      ) : (
        <div className="space-y-1.5">
          {list.map((int) => (
            <div key={int.id} className="rounded-lg border px-3 py-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <KindIcon kind={int.kind} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">
                    {int.name} <span className="text-[10px] text-muted-foreground font-normal">· {INTEGRATION_META[int.kind].label}</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono truncate">
                    {int.kind === "discord" || int.kind === "webhook"
                      ? int.value.replace(/^https?:\/\/[^/]+/, "https://…")
                      : `••••••••${int.value.slice(-4)}`}
                  </p>
                </div>
                <Switch
                  checked={int.enabled}
                  onCheckedChange={(v) => persist(list.map((i) => (i.id === int.id ? { ...i, enabled: v } : i)))}
                  aria-label={`Toggle ${int.name}`}
                />
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                  onClick={() => void runTest(int)} disabled={testing === int.id}
                  title="Test this integration"
                  aria-label={`Test ${int.name}`}
                >
                  {testing === int.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                  onClick={() => setEditItem(int)} aria-label={`Edit ${int.name}`}
                >
                  <KeyRound className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 shrink-0 hover:text-destructive"
                  onClick={() => persist(list.filter((i) => i.id !== int.id))}
                  aria-label={`Delete ${int.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              {results[int.id] && (
                <p className={`text-[10px] ${results[int.id].includes("✓") ? "text-emerald-600 dark:text-emerald-500" : "text-amber-600 dark:text-amber-500"}`}>
                  {results[int.id]}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <IntegrationForm
        open={addOpen} onOpenChange={setAddOpen}
        onSubmit={(kind, name2, value) => {
          const item = newIntegration(kind, name2, value);
          if (!item.value) {
            toast.error("Key/URL is required");
            return;
          }
          persist([...list, item]);
          toast.success("Integration added", { description: "Hit ▶ to test it." });
        }}
      />

      <IntegrationForm
        open={!!editItem} onOpenChange={(v) => (!v && setEditItem(null))}
        initial={editItem ?? undefined}
        onSubmit={(kind, name2, value) => {
          if (!editItem) return;
          persist(list.map((i) => (i.id === editItem.id ? { ...i, kind, name: name2 || i.name, value } : i)));
          setEditItem(null);
          toast.success("Integration updated");
        }}
      />

      <div className="rounded-lg border border-dashed p-2.5 text-[11px] text-muted-foreground">
        <p className="flex items-center gap-1.5">
          <EyeOff className="h-3 w-3 shrink-0" /> Keys never leave this browser except when you press Test or send a note.
        </p>
      </div>
    </section>
  );
}

function IntegrationForm({
  open, onOpenChange, onSubmit, initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (kind: IntegrationKind, name: string, value: string) => void;
  initial?: Integration;
}) {
  const [kind, setKind] = useState<IntegrationKind>("discord");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setKind(initial?.kind ?? "discord");
      setName(initial?.name ?? "");
      setValue(initial?.value ?? "");
    }, 0);
    return () => clearTimeout(t);
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm w-[calc(100%-2rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plug className="h-4 w-4 nx-accent-text" /> {initial ? "Edit integration" : "Add integration"}
          </DialogTitle>
          <DialogDescription>Stored only in this browser — encrypted when E2E is on.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(kind, name, value.trim());
            if (!initial) { setName(""); setValue(""); }
            if (!initial) onOpenChange(false);
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label className="text-xs">Service</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as IntegrationKind)}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {KIND_ORDER.map((k) => (
                  <SelectItem key={k} value={k}>{INTEGRATION_META[k].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">{INTEGRATION_META[kind].hint}</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Display name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={INTEGRATION_META[kind].label} className="h-9 text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{INTEGRATION_META[kind].label === "Discord Webhook" ? "Webhook URL" : "Key / token"}</Label>
            <Input
              value={value} onChange={(e) => setValue(e.target.value)}
              placeholder={INTEGRATION_META[kind].placeholder}
              className="h-9 text-xs font-mono" spellCheck={false} autoComplete="off"
            />
          </div>
          <Button type="submit" className="w-full nx-accent-bg">
            {initial ? "Save changes" : "Add integration"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
