"use client";

/**
 * Integrations vault (v1.3) — store API keys / webhooks for third-party
 * services (Discord, Telegram, GitHub, LLM endpoints, custom webhooks)
 * on this device, the way Obsidian stores plugin settings.
 *
 * Privacy-first guarantees:
 *  - Values NEVER sync to the NexNotes server — plain localStorage only.
 *  - When account E2E encryption is ON, values are AES-256-GCM encrypted
 *    with the account key before they touch storage.
 *  - Outbound network requests happen ONLY when the user explicitly hits
 *    "Test" or "Send to Discord".
 */

import { encryptText, decryptText } from "@/lib/crypto";

export type IntegrationKind = "discord" | "telegram" | "github" | "openai" | "webhook" | "custom";

export interface Integration {
  id: string;
  kind: IntegrationKind;
  name: string;
  value: string; // webhook URL / bot token / API key
  enabled: boolean;
  createdAt: string;
}

const STORAGE_KEY = "nx-integrations";

export const INTEGRATION_META: Record<
  IntegrationKind,
  { label: string; placeholder: string; hint: string }
> = {
  discord: {
    label: "Discord Webhook",
    placeholder: "https://discord.com/api/webhooks/…",
    hint: "Channel webhook — send notes straight to a Discord channel.",
  },
  telegram: {
    label: "Telegram Bot Token",
    placeholder: "123456789:AAE…",
    hint: "Bot token from @BotFather.",
  },
  github: {
    label: "GitHub Token",
    placeholder: "ghp_… / github_pat_…",
    hint: "Personal access token (repo or fine-grained).",
  },
  openai: {
    label: "LLM API Key",
    placeholder: "sk-…",
    hint: "OpenAI-compatible endpoint key (never sent anywhere but the provider).",
  },
  webhook: {
    label: "Generic Webhook",
    placeholder: "https://example.com/hook",
    hint: "POSTs a JSON payload {source, event, title, content}.",
  },
  custom: {
    label: "Custom API Key",
    placeholder: "any key / value",
    hint: "Kept encrypted on this device for your own scripts and tools.",
  },
};

export function newIntegration(kind: IntegrationKind, name: string, value: string): Integration {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `int-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    kind,
    name: name.trim() || INTEGRATION_META[kind].label,
    value: value.trim(),
    enabled: true,
    createdAt: new Date().toISOString(),
  };
}

/* ---------------- encrypted local storage ---------------- */

export async function loadIntegrations(encKey: CryptoKey | null): Promise<Integration[]> {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const text = await decryptText(encKey ?? (new Uint8Array(0) as unknown as CryptoKey), raw).catch(() => raw);
    // decryptText passes plaintext through when no nxenc prefix is present,
    // and we only reach here with a real key when E2E is on.
    if (encKey && raw.startsWith("nxenc:v1:") && text === raw) return [];
    const parsed = JSON.parse(text) as Integration[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveIntegrations(list: Integration[], encKey: CryptoKey | null): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const json = JSON.stringify(list);
    const payload = encKey ? await encryptText(encKey, json) : json;
    localStorage.setItem(STORAGE_KEY, payload);
  } catch {
    /* private mode / quota — keep in memory only */
  }
}

/* ---------------- outbound actions (explicit user intent only) ---------------- */

export interface TestResult {
  ok: boolean;
  message: string;
}

async function jsonOrText(r: Response): Promise<string> {
  try {
    const j = await r.json();
    return typeof JSON.stringify(j) === "string" ? JSON.stringify(j).slice(0, 160) : "ok";
  } catch {
    return (await r.text().catch(() => "")).slice(0, 160) || `HTTP ${r.status}`;
  }
}

export async function testIntegration(int: Integration): Promise<TestResult> {
  if (!int.value) return { ok: false, message: "No key/URL set" };
  try {
    switch (int.kind) {
      case "discord": {
        const r = await fetch(int.value, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "✅ **NexNotes** — webhook test successful. Your notes can now be sent here." }),
        });
        return r.ok
          ? { ok: true, message: "Message delivered to Discord ✓" }
          : { ok: false, message: `Discord said ${r.status}: ${await jsonOrText(r)}` };
      }
      case "telegram": {
        const r = await fetch(`https://api.telegram.org/bot${int.value}/getMe`);
        const ok = r.ok;
        return ok
          ? { ok: true, message: "Bot token valid ✓" }
          : { ok: false, message: `Telegram said ${r.status}: ${await jsonOrText(r)}` };
      }
      case "github": {
        const r = await fetch("https://api.github.com/user", {
          headers: { Authorization: `Bearer ${int.value}`, Accept: "application/vnd.github+json" },
        });
        if (r.ok) {
          const u = (await r.json()) as { login?: string };
          return { ok: true, message: `Authenticated as ${u.login ?? "?"} ✓` };
        }
        return { ok: false, message: `GitHub said ${r.status}: ${await jsonOrText(r)}` };
      }
      case "openai": {
        const r = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${int.value}` },
        });
        return r.ok
          ? { ok: true, message: "API key valid ✓" }
          : { ok: false, message: `Provider said ${r.status}: ${await jsonOrText(r)}` };
      }
      case "webhook":
      case "custom":
      default: {
        if (/^https?:\/\//i.test(int.value)) {
          const r = await fetch(int.value, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source: "NexNotes", event: "test", time: new Date().toISOString() }),
          });
          return r.ok
            ? { ok: true, message: `Delivered (HTTP ${r.status}) ✓` }
            : { ok: false, message: `Endpoint replied ${r.status}` };
        }
        return { ok: true, message: "Key stored locally ✓ (no endpoint to test)" };
      }
    }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Network error" };
  }
}

/** Send a note to the first enabled Discord webhook. */
export async function sendNoteToDiscord(
  list: Integration[],
  title: string,
  markdown: string
): Promise<TestResult> {
  const hook = list.find((i) => i.kind === "discord" && i.enabled && i.value);
  if (!hook) return { ok: false, message: "No Discord webhook configured — add one in Settings → Integrations." };
  // Discord hard limit: 2000 chars per message
  const body = `**${title}**\n${markdown}`.slice(0, 1990);
  try {
    const r = await fetch(hook.value, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: body }),
    });
    return r.ok
      ? { ok: true, message: `“${title}” sent to Discord ✓` }
      : { ok: false, message: `Discord said ${r.status}: ${await jsonOrText(r)}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Network error" };
  }
}
