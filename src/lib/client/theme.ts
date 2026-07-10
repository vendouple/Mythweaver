"use client";

/**
 * Table accent themes. Each theme swaps the design system's accent CSS
 * variables via a data attribute on <html>, so the whole grimoire — borders,
 * labels, buttons, glows — re-tints in place. Persisted per device.
 */

export type AccentTheme = { key: string; label: string; swatch: string };

export const ACCENT_THEMES: AccentTheme[] = [
  { key: "gold", label: "Candle Gold", swatch: "#c9a35c" },
  { key: "ember", label: "Ember", swatch: "#ff9a3c" },
  { key: "arcane", label: "Arcane", swatch: "#8d7fff" },
  { key: "verdant", label: "Verdant", swatch: "#7fbf7a" },
  { key: "crimson", label: "Crimson", swatch: "#d96459" },
  { key: "azure", label: "Azure", swatch: "#5fa8c9" }
];

const STORAGE_KEY = "mythweaver-accent";

export function applyAccent(key: string) {
  if (typeof document === "undefined") return;
  if (key === "gold") document.documentElement.removeAttribute("data-accent");
  else document.documentElement.setAttribute("data-accent", key);
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // Private browsing — the theme simply won't persist.
  }
}

/** Restore the saved accent (call once from any top-level client screen). */
export function initAccent(): string {
  if (typeof document === "undefined") return "gold";
  let key = "gold";
  try {
    key = localStorage.getItem(STORAGE_KEY) || "gold";
  } catch {
    // ignore
  }
  if (key !== "gold") document.documentElement.setAttribute("data-accent", key);
  return key;
}

export function currentAccent(): string {
  if (typeof document === "undefined") return "gold";
  return document.documentElement.getAttribute("data-accent") || "gold";
}
