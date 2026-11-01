"use client";

/** Accent color utilities — applied as CSS variables on :root. */

export const ACCENTS = [
  { name: "Emerald", value: "#059669" },
  { name: "Blue", value: "#2563eb" },
  { name: "Violet", value: "#7c3aed" },
  { name: "Rose", value: "#e11d48" },
  { name: "Amber", value: "#d97706" },
  { name: "Cyan", value: "#0891b2" },
  { name: "Pink", value: "#db2777" },
  { name: "Lime", value: "#65a30d" },
] as const;

const KEY = "nx-accent";

export function applyAccent(hex: string) {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--primary", hex);
  document.documentElement.style.setProperty("--ring", hex);
  try {
    localStorage.setItem(KEY, hex);
  } catch { /* private mode */ }
}

export function initAccent() {
  let hex: string | null = null;
  try {
    hex = localStorage.getItem(KEY);
  } catch { /* private mode */ }
  applyAccent(hex ?? ACCENTS[0].value);
}

export function getAccent(): string {
  try {
    return localStorage.getItem(KEY) ?? ACCENTS[0].value;
  } catch {
    return ACCENTS[0].value;
  }
}
