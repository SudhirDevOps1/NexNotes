"use client";

/**
 * NexNotes v2.0 — full theme presets (Standard Notes' premium themes, free).
 * Each preset overrides core CSS variables for light and dark mode.
 * Applied device-locally; "Default" restores the built-in palette.
 */

export interface ThemeVars {
  background: string;
  foreground: string;
  card: string;
  muted: string;
  border: string;
  sidebar: string;
  secondary: string;
  accentSoft: string;
}

export interface ThemePreset {
  id: string;
  name: string;
  light: ThemeVars;
  dark: ThemeVars;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "default",
    name: "Default",
    light: {} as unknown as ThemeVars,
    dark: {} as unknown as ThemeVars,
  },
  {
    id: "nord",
    name: "Nord",
    light: {
      background: "#f5f6f7", foreground: "#2e3440", card: "#ffffff", muted: "#e3e6ea",
      border: "#d5dae1", sidebar: "#eceff3", secondary: "#dfe4ea", accentSoft: "#5e81ac",
    },
    dark: {
      background: "#2e3440", foreground: "#eceff4", card: "#3b4252", muted: "#434c5e",
      border: "#4c566a", sidebar: "#333a47", secondary: "#434c5e", accentSoft: "#88c0d0",
    },
  },
  {
    id: "solarized-light",
    name: "Solarized Light",
    light: {
      background: "#fdf6e3", foreground: "#073642", card: "#fffbf0", muted: "#eee8d5",
      border: "#e2dcc6", sidebar: "#f5eedb", secondary: "#eee8d5", accentSoft: "#268bd2",
    },
    dark: {
      background: "#002b36", foreground: "#eee8d5", card: "#073642", muted: "#0a4450",
      border: "#12586a", sidebar: "#02333d", secondary: "#0a4450", accentSoft: "#2aa198",
    },
  },
  {
    id: "rose-pine",
    name: "Rosé Pine",
    light: {
      background: "#faf4ed", foreground: "#575279", card: "#fffaf3", muted: "#f2e9e1",
      border: "#e5ded2", sidebar: "#f5ede3", secondary: "#f2e9e1", accentSoft: "#907aa9",
    },
    dark: {
      background: "#191724", foreground: "#e0def4", card: "#1f1d2e", muted: "#26233a",
      border: "#312e48", sidebar: "#1c1a29", secondary: "#26233a", accentSoft: "#c4a7e7",
    },
  },
  {
    id: "gruvbox",
    name: "Gruvbox",
    light: {
      background: "#fbf1c7", foreground: "#3c3836", card: "#fff5d4", muted: "#ebdbb2",
      border: "#ddd6ad", sidebar: "#f2e5bc", secondary: "#ebdbb2", accentSoft: "#b57614",
    },
    dark: {
      background: "#282828", foreground: "#ebdbb2", card: "#32302f", muted: "#3c3836",
      border: "#504945", sidebar: "#2c2c2c", secondary: "#3c3836", accentSoft: "#fabd2f",
    },
  },
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    light: {
      background: "#e8eaf0", foreground: "#1a1b26", card: "#f5f6fa", muted: "#d5dae6",
      border: "#c3cadd", sidebar: "#e2e5ee", secondary: "#d5dae6", accentSoft: "#296fd9",
    },
    dark: {
      background: "#1a1b26", foreground: "#c0caf5", card: "#24283b", muted: "#2f334d",
      border: "#3b4261", sidebar: "#1f2233", secondary: "#2f334d", accentSoft: "#7aa2f7",
    },
  },
];

const VAR_MAP: Record<keyof ThemeVars, string> = {
  background: "--background",
  foreground: "--foreground",
  card: "--card",
  muted: "--muted",
  border: "--border",
  sidebar: "--sidebar",
  secondary: "--secondary",
  accentSoft: "--nx-theme-accent-soft",
};

const KEY = "nx-theme-preset";

export function getThemePresetId(): string {
  try {
    return localStorage.getItem(KEY) ?? "default";
  } catch {
    return "default";
  }
}

export function applyThemePreset(id: string, resolvedTheme: "light" | "dark" | undefined) {
  if (typeof document === "undefined") return;
  const preset = THEME_PRESETS.find((p) => p.id === id);
  const root = document.documentElement;
  try { localStorage.setItem(KEY, id); } catch { /* private mode */ }
  if (!preset || id === "default") {
    for (const v of Object.values(VAR_MAP)) root.style.removeProperty(v);
    return;
  }
  const vars = resolvedTheme === "dark" ? preset.dark : preset.light;
  for (const [k, cssVar] of Object.entries(VAR_MAP) as [keyof ThemeVars, string][]) {
    const val = vars[k];
    if (val) root.style.setProperty(cssVar, val);
  }
}
