"use client";

// Dev-only harness for the per-theme environments (themeEnvironments.ts):
//   /envtest?theme=pirate            — full cosmos backdrop
//   /envtest?theme=noir&mode=stage   — the in-game overlay on a dark backdrop
// "Play music" starts the theme's battle shelf so the music sync is live.
// Not linked from anywhere.

import { useEffect, useState } from "react";
import CosmosCanvas from "@/components/three/CosmosCanvas";
import StageAtmosphere from "@/components/three/StageAtmosphere";
import { THEME_KEYS, ThemeKey } from "@/components/three/themeVisuals";
import { bgmResume, bgmSetContext, bgmSetTheme, bgmStop } from "@/lib/client/audio";
import type { AmbienceMood } from "@/lib/campaign/types";

// ?raf=timer — drive requestAnimationFrame from a timer so the scenes animate
// in a hidden/background tab (rAF is paused there). Patched at module load,
// before any child effect starts its loop.
if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("raf") === "timer") {
  window.requestAnimationFrame = (cb) => window.setTimeout(() => cb(performance.now()), 16) as unknown as number;
  window.cancelAnimationFrame = (id) => window.clearTimeout(id);
}

const MOODS: AmbienceMood[] = ["calm", "tense", "battle", "boss", "mystery", "dread", "triumph", "wonder"];

export default function EnvTest() {
  const [theme, setTheme] = useState<ThemeKey>("fantasy");
  const [mode, setMode] = useState<"cosmos" | "stage">("cosmos");
  const [mood, setMood] = useState<AmbienceMood>("battle");
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("theme") as ThemeKey | null;
    if (t && THEME_KEYS.includes(t)) setTheme(t);
    if (params.get("mode") === "stage") setMode("stage");
    return () => bgmStop();
  }, []);

  useEffect(() => {
    if (!playing) return;
    bgmSetTheme(theme === "none" ? null : theme);
    bgmSetContext(mood);
  }, [playing, theme, mood]);

  return (
    <div style={{ position: "fixed", inset: 0, background: mode === "stage" ? "linear-gradient(#1a1c24, #07080c)" : "#030409" }}>
      {mode === "cosmos" ? <CosmosCanvas key={theme} theme={theme} drama={0.85} /> : <StageAtmosphere key={theme} mood={mood} intensity={0.8} theme={theme} />}
      <div style={{ position: "absolute", top: 12, left: 12, display: "flex", gap: 6, flexWrap: "wrap", maxWidth: "70vw", zIndex: 5 }}>
        {THEME_KEYS.map((key) => (
          <button key={key} className={`chip-toggle tiny ${key === theme ? "selected" : ""}`} onClick={() => setTheme(key)}>{key}</button>
        ))}
      </div>
      <div style={{ position: "absolute", bottom: 12, left: 12, display: "flex", gap: 6, flexWrap: "wrap", zIndex: 5 }}>
        <button className="chip-toggle tiny" onClick={() => setMode(mode === "cosmos" ? "stage" : "cosmos")}>mode: {mode}</button>
        <button className={`chip-toggle tiny ${playing ? "selected" : ""}`} onClick={() => { setPlaying(true); bgmResume(); }}>{playing ? "music on" : "Play music"}</button>
        {MOODS.map((m) => (
          <button key={m} className={`chip-toggle tiny ${m === mood ? "selected" : ""}`} onClick={() => setMood(m)}>{m}</button>
        ))}
      </div>
    </div>
  );
}
