"use client";

/** Editor typography preferences — persisted in localStorage, applied as CSS
 *  variables on :root so the editor (and preview) pick them up globally. */

export type FontChoice = "sans" | "serif" | "mono";
export type SizeChoice = "s" | "m" | "l";
export type SpacingChoice = "compact" | "cozy";

export interface EditorPrefs {
  font: FontChoice;
  size: SizeChoice;
  spacing: SpacingChoice;
}

const KEY = "nx-editor-prefs";

const DEFAULTS: EditorPrefs = { font: "sans", size: "m", spacing: "cozy" };

const FONT_VARS: Record<FontChoice, string> = {
  sans: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
  serif: "ui-serif, Georgia, Cambria, 'Times New Roman', serif",
  mono: "var(--font-geist-mono), ui-monospace, SFMono-Regular, monospace",
};

const SIZE_VARS: Record<SizeChoice, string> = { s: "14px", m: "15.5px", l: "17.5px" };

const SPACING_VARS: Record<SpacingChoice, string> = { compact: "1.55", cozy: "1.8" };

export function loadPrefs(): EditorPrefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<EditorPrefs>;
    return {
      font: parsed.font === "serif" || parsed.font === "mono" ? parsed.font : "sans",
      size: parsed.size === "s" || parsed.size === "l" ? parsed.size : "m",
      spacing: parsed.spacing === "compact" ? "compact" : "cozy",
    };
  } catch {
    return DEFAULTS;
  }
}

export function savePrefs(prefs: EditorPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch { /* private mode */ }
}

export function applyPrefs(prefs: EditorPrefs) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--nx-editor-font", FONT_VARS[prefs.font]);
  root.style.setProperty("--nx-editor-size", SIZE_VARS[prefs.size]);
  root.style.setProperty("--nx-editor-leading", SPACING_VARS[prefs.spacing]);
}
