"use client";

import { useEffect } from "react";

/**
 * Campaign UI skins. A screen that knows its world calls useThemeSkin(theme)
 * and <html data-skin="…"> re-dresses the whole interface for that genre —
 * fonts, panel frames, button shapes, palette and screen texture (see
 * src/app/themes.css). Applied to <html> rather than the screen element so
 * fixed overlays (music widget, drawers, dice theater) are dressed too.
 *
 * Skins stack: the stage pushes its theme, a pause card or lobby mounted on
 * top can push its own, and unmounting pops back to whatever is underneath.
 * "none" (or no theme) is the neutral Astral grimoire.
 */
const stack: Array<{ id: number; theme: string }> = [];
let nextId = 1;

function apply() {
  if (typeof document === "undefined") return;
  const top = stack[stack.length - 1]?.theme;
  if (top && top !== "none") document.documentElement.setAttribute("data-skin", top);
  else document.documentElement.removeAttribute("data-skin");
}

export function useThemeSkin(theme: string | null | undefined) {
  useEffect(() => {
    const entry = { id: nextId++, theme: theme || "none" };
    stack.push(entry);
    apply();
    return () => {
      const index = stack.findIndex((item) => item.id === entry.id);
      if (index >= 0) stack.splice(index, 1);
      apply();
    };
  }, [theme]);
}
