"use client";

import { useEffect, useState } from "react";
import type { AmbienceAcoustic, AmbienceSound, DiceOutcome, EndingKind, StageEffectKind, SfxCue } from "@/lib/campaign/types";
import { AMBIENCE_ACOUSTICS, AMBIENCE_SOUNDS, EFFECT_KINDS, SFX_CUES } from "@/lib/campaign/stageCatalog";
import { MUSIC_THEMES } from "@/lib/campaign/musicTheme";
import { loadAmbienceManifest } from "@/lib/client/audio";
import { playSfx, sfxSources, type SfxSource } from "@/lib/client/sfx";
import type { ThemeKey } from "@/components/three/themeVisuals";

export type DebugScene = "cosmos" | "loom" | "forge-lobby";
export type DebugBeat = "narration" | "dialogue" | "playerAction" | "system";
const ENDINGS: EndingKind[] = ["victory", "defeat", "bittersweet", "escape", "draw", "cliffhanger"];
const MOODS = ["calm", "tense", "adrenaline", "battle", "boss", "mystery", "dread", "triumph", "wonder", "somber", "outro", ...ENDINGS.map((kind) => `outro-${kind}`)];
const OUTCOMES: DiceOutcome[] = ["critical-success", "strong-success", "success", "partial-success", "failure", "hard-failure", "critical-failure"];
const TABS = ["Scenes", "Stage", "Audio", "Dice"] as const;

export default function StageDebugPanel(props: {
  theme: ThemeKey; mood: string; scene: DebugScene | null; outro: EndingKind | null; sigil: boolean;
  onTheme: (theme: ThemeKey) => void; onMood: (mood: string) => void;
  onScene: (scene: DebugScene) => void; onOutro: (kind: EndingKind) => void;
  onEffect: (kind: StageEffectKind | undefined, strength?: number, repeat?: number, delay?: number, cues?: SfxCue[]) => void;
  onDice: (outcome: DiceOutcome, npc?: boolean) => void; onBeat: (beat: DebugBeat) => void;
  onAmbience: (sound: AmbienceSound, acoustics: AmbienceAcoustic[]) => void;
  onBackdrop: () => void; onSigil: () => void; onTome: () => void;
  onStop: () => void; onReset: () => void; onHide: () => void; onExit: () => void;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Scenes");
  const [query, setQuery] = useState("");
  const [sources, setSources] = useState<Record<string, SfxSource>>({});
  const [beds, setBeds] = useState<Record<string, string[]> | null>(null);
  const [sound, setSound] = useState<AmbienceSound>("water");
  const [acoustic, setAcoustic] = useState<AmbienceAcoustic>("outdoors");
  const [strength, setStrength] = useState(0.7);
  const [lastCue, setLastCue] = useState("");
  useEffect(() => {
    let cancelled = false;
    void sfxSources(SFX_CUES).then((value) => { if (!cancelled) setSources(value); });
    void loadAmbienceManifest().then((value) => { if (!cancelled) setBeds(value); }).catch(() => { if (!cancelled) setBeds({}); });
    return () => { cancelled = true; };
  }, []);
  const matches = (name: string) => name.replaceAll("-", " ").includes(query.trim().toLowerCase().replaceAll("-", " "));
  const cues = SFX_CUES.filter(matches);
  return (
    <aside className="debug-menu panel" aria-label="Stage preview lab" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <div className="debug-head">
        <div><span className="eyebrow">Local sandbox</span><h3 className="panel-subtitle">Stage Preview Lab</h3></div>
        <button className="ghost-button" onClick={props.onHide}>Hide</button>
      </div>
      <p className="debug-note">Sample scenes only. No model calls or campaign changes.</p>
      <label className="debug-select">World theme
        <select className="field" value={props.theme} onChange={(event) => props.onTheme(event.target.value as ThemeKey)}>
          {["none", ...MUSIC_THEMES].map((theme) => <option key={theme} value={theme}>{theme}</option>)}
        </select>
      </label>
      <div className="debug-tabs" role="tablist" aria-label="Preview category">
        {TABS.map((name, index) => <button key={name} id={`debug-tab-${name}`} role="tab" aria-selected={tab === name} aria-controls={`debug-panel-${name}`} tabIndex={tab === name ? 0 : -1}
          onClick={() => setTab(name)} onKeyDown={(event) => {
            const next = event.key === "ArrowRight" ? (index + 1) % TABS.length : event.key === "ArrowLeft" ? (index + TABS.length - 1) % TABS.length : event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : -1;
            if (next < 0) return;
            event.preventDefault(); setTab(TABS[next]); document.getElementById(`debug-tab-${TABS[next]}`)?.focus();
          }}>{name}</button>)}
      </div>
      <div className="debug-body" role="tabpanel" id={`debug-panel-${tab}`} aria-labelledby={`debug-tab-${tab}`} tabIndex={0}>
        {tab === "Scenes" ? <>
          <h4 className="director-label">Opening sequence</h4>
          <p className="debug-note">The real Worldforge intro builds to completion, holds its finale, then returns to the stage. Select again to replay.</p>
          <div className="debug-grid">
            <button className="chip-toggle" aria-pressed={props.scene === "loom"} onClick={() => props.onScene("loom")}>Play intro</button>
            <button className="chip-toggle" aria-pressed={props.scene === "forge-lobby"} onClick={() => props.onScene("forge-lobby")}>Forge lobby</button>
            <button className="chip-toggle" aria-pressed={props.scene === "cosmos"} onClick={() => props.onScene("cosmos")}>Cosmos</button>
          </div>
          <h4 className="director-label">Ending finales</h4>
          <div className="debug-grid">{ENDINGS.map((kind) => <button key={kind} className="chip-toggle" aria-pressed={props.outro === kind} onClick={() => props.onOutro(kind)}>{kind}</button>)}</div>
          <p className="debug-note">All six endings use their real animation and score. Hide this panel for an unobstructed preview; Escape stops it.</p>
        </> : null}
        {tab === "Stage" ? <>
          <label className="debug-select">Effect strength <input type="range" min="0.1" max="1" step="0.1" value={strength} onChange={(event) => setStrength(Number(event.target.value))} /></label>
          <h4 className="director-label">On-screen effects</h4>
          <div className="debug-grid">{EFFECT_KINDS.map((kind) => <button key={kind} className="chip-toggle" onClick={() => props.onEffect(kind, strength)}>{kind}</button>)}</div>
          <h4 className="director-label">Paired cues</h4>
          <div className="debug-grid">
            <button className="chip-toggle" onClick={() => props.onEffect("shockwave", strength, 1, 0, ["explosion", "debris"])}>Impact</button>
            <button className="chip-toggle" onClick={() => props.onEffect("heal", strength, 1, 0, ["heal"])}>Restoration</button>
            <button className="chip-toggle" onClick={() => props.onEffect("glitch", strength, 3, 700, ["glitch", "radio-static"])}>Signal loss</button>
            <button className="chip-toggle" onClick={() => props.onEffect("spotlight", strength, 1, 0, ["discovery"])}>Discovery</button>
            <button className="chip-toggle" onClick={() => props.onEffect(undefined, strength, 3, 600, ["knock"])}>Three knocks</button>
            <button className="chip-toggle" onClick={props.onBackdrop}>Backdrop fade</button>
          </div>
          <h4 className="director-label">Chronicle and overlays</h4>
          <div className="debug-grid">{(["narration", "dialogue", "playerAction", "system"] as const).map((beat) => <button key={beat} className="chip-toggle" onClick={() => props.onBeat(beat)}>{beat === "playerAction" ? "Player action" : beat}</button>)}
            <button className="chip-toggle" aria-pressed={props.sigil} onClick={props.onSigil}>Oracle sigil</button>
            <button className="chip-toggle" onClick={props.onTome}>Tome</button>
          </div>
        </> : null}
        {tab === "Audio" ? <>
          <label className="debug-select">Score / mood<select className="field" value={props.mood} onChange={(event) => props.onMood(event.target.value)}>{MOODS.map((mood) => <option key={mood}>{mood}</option>)}</select></label>
          <button className="ghost-button" onClick={() => props.onMood(props.mood)}>Play selected score</button>
          <label className="debug-select">Find a sound<input className="field" type="search" value={query} placeholder="Door, spell, footsteps..." onChange={(event) => setQuery(event.target.value)} /></label>
          <p className="debug-note">Recorded = file available; synthesized = built-in fallback; missing = safely silent. Refresh after adding files. Playback follows the mixer and browser autoplay rules.</p>
          <h4 className="director-label">One-shot cues ({cues.length})</h4>
          <div className="debug-grid">{cues.map((cue) => <button key={cue} className="chip-toggle debug-cue" onClick={() => { setLastCue(`${cue}: ${sources[cue] || "loading"}`); playSfx(cue); }}><span>{cue}</span><small data-source={sources[cue]}>{sources[cue] || "loading"}</small></button>)}</div>
          {!cues.length ? <p className="debug-note">No matching cues.</p> : null}
          <p className="debug-note" role="status">{lastCue || "Choose a cue to audition."}</p>
          <h4 className="director-label">Environmental loops</h4>
          <label className="debug-select">Acoustics<select className="field" value={acoustic} onChange={(event) => { const next = event.target.value as AmbienceAcoustic; setAcoustic(next); props.onAmbience(sound, [next]); }}>{AMBIENCE_ACOUSTICS.map((item) => <option key={item}>{item}</option>)}</select></label>
          <div className="debug-grid">{AMBIENCE_SOUNDS.filter(matches).map((bed) => <button key={bed} className="chip-toggle debug-cue" onClick={() => { setSound(bed); props.onAmbience(bed, [acoustic]); }}><span>{bed}</span><small>{bed === "none" ? "silence" : !beds ? "loading" : beds[bed]?.length ? "recorded" : "missing"}</small></button>)}</div>
        </> : null}
        {tab === "Dice" ? <>
          <h4 className="director-label">Fate outcomes</h4>
          <div className="debug-grid">{OUTCOMES.map((outcome) => <button key={outcome} className="chip-toggle" onClick={() => props.onDice(outcome)}>{outcome.replaceAll("-", " ")}</button>)}
            <button className="chip-toggle" onClick={() => props.onDice("hard-failure", true)}>NPC roll</button>
          </div>
        </> : null}
      </div>
      <footer className="debug-footer">
        <button className="ghost-button" onClick={props.onStop}>Stop preview</button>
        <button className="ghost-button" onClick={() => { setLastCue(""); props.onReset(); }}>Reset all</button>
        <button className="ghost-button" onClick={props.onExit}>Title screen</button>
      </footer>
    </aside>
  );
}
