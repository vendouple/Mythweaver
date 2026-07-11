"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AmbienceMood, Campaign, DiceOutcome, DisplayEvent, Player, StageEffectKind, StoryCharacter } from "@/lib/campaign/types";
import { api, accentColor } from "@/lib/client/api";
import { bgmDuck, bgmIsMuted, subscribeBgm } from "@/lib/client/audio";
import { playSfx } from "@/lib/client/sfx";
import { parseInline, plainText, renderInline, renderTokens } from "@/lib/client/markup";
import { ACCENT_THEMES, applyAccent, currentAccent, initAccent } from "@/lib/client/theme";
import StageAtmosphere, { AtmosphereHandle } from "@/components/three/StageAtmosphere";
import DiceTheater, { DiceRollData } from "@/components/three/DiceTheater";
import { themeVisual, ThemeKey } from "@/components/three/themeVisuals";

const MOOD_GRADES: Record<string, string> = {
  calm: "linear-gradient(180deg, rgba(30,24,10,0.12), rgba(5,7,13,0.55))",
  tense: "linear-gradient(180deg, rgba(10,20,28,0.3), rgba(4,6,10,0.68))",
  battle: "linear-gradient(180deg, rgba(48,10,4,0.3), rgba(10,3,2,0.62))",
  mystery: "linear-gradient(180deg, rgba(22,12,48,0.32), rgba(6,4,16,0.66))",
  dread: "linear-gradient(180deg, rgba(6,8,12,0.5), rgba(2,3,5,0.8))",
  triumph: "linear-gradient(180deg, rgba(48,34,6,0.18), rgba(8,6,2,0.5))",
  wonder: "linear-gradient(180deg, rgba(6,34,38,0.26), rgba(3,8,12,0.58))",
  somber: "linear-gradient(180deg, rgba(14,18,28,0.4), rgba(4,6,10,0.72))",
  outro: "linear-gradient(180deg, rgba(48,36,12,0.28), rgba(8,6,4,0.7))"
};

const DEBUG_THEMES: ThemeKey[] = ["none", "fantasy", "scifi", "horror", "noir", "modern", "western"];
const DEBUG_MOODS: AmbienceMood[] = ["calm", "tense", "battle", "mystery", "dread", "triumph", "wonder", "somber", "outro"];
const DEBUG_EFFECTS: StageEffectKind[] = ["shake", "flash", "embers", "fog", "rain", "snow", "darkness", "heartbeat"];
const DEBUG_OUTCOMES: DiceOutcome[] = [
  "critical-success",
  "strong-success",
  "success",
  "partial-success",
  "failure",
  "hard-failure",
  "critical-failure"
];

type Beat = DisplayEvent;

/**
 * How long a fully-revealed beat stays on screen. Paced by *words* at a
 * comfortable couch reading speed (~170 wpm ≈ 350ms/word) rather than a
 * tight character cap, so long paragraphs no longer vanish mid-read.
 */
function beatHold(plain: string) {
  const words = plain.split(/\s+/).filter(Boolean).length;
  return Math.max(3200, Math.min(2400 + words * 350, 32000));
}

/**
 * The living stage: painted scene, mood atmosphere, letterboxed chronicle
 * that performs story beats one at a time, hero rails, dice cinematics, and
 * a hidden director's drawer for the human host.
 */
export default function HostStage({
  campaign,
  onExit,
  theme,
  debugMode = false
}: {
  campaign: Campaign;
  onExit: () => void;
  theme?: ThemeKey | string | null;
  debugMode?: boolean;
}) {
  const [debugOpen, setDebugOpen] = useState(debugMode);
  const [debugTheme, setDebugTheme] = useState<ThemeKey | null>(null);
  const [debugMood, setDebugMood] = useState<AmbienceMood | null>(null);
  const [debugOutro, setDebugOutro] = useState(false);
  const visual = themeVisual(debugTheme || theme);
  /* ------------------------------------------------------------------ */
  /* Backdrop crossfade                                                  */
  /* ------------------------------------------------------------------ */
  const [layers, setLayers] = useState<Array<{ url: string; key: number }>>(() =>
    campaign.currentImageUrl ? [{ url: campaign.currentImageUrl, key: 0 }] : []
  );
  useEffect(() => {
    const url = campaign.currentImageUrl;
    if (!url) return;
    setLayers((prev) => {
      if (prev.length && prev[prev.length - 1].url === url) return prev;
      const next = [...prev, { url, key: (prev[prev.length - 1]?.key ?? 0) + 1 }];
      return next.slice(-2);
    });
  }, [campaign.currentImageUrl]);

  /* ------------------------------------------------------------------ */
  /* Chronicle playback                                                  */
  /* ------------------------------------------------------------------ */
  const seenRef = useRef<Set<string> | null>(null);
  const queueRef = useRef<Beat[]>([]);
  const [currentBeat, setCurrentBeat] = useState<Beat | null>(null);
  const [shownChars, setShownChars] = useState(0);
  const [holdMs, setHoldMs] = useState(0);
  const [activeDice, setActiveDice] = useState<DiceRollData | null>(null);
  const [tomeOpen, setTomeOpen] = useState(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pump, setPump] = useState(0);

  // Parse the beat's inline markdown once; the typewriter walks visible
  // characters only, so *marks* never flash on screen mid-reveal.
  const beatTokens = useMemo(() => parseInline(currentBeat?.content || ""), [currentBeat]);
  const beatPlain = useMemo(() => plainText(beatTokens), [beatTokens]);

  // Ingest new display events into the playback queue (never replay history).
  useEffect(() => {
    if (!seenRef.current) {
      seenRef.current = new Set(campaign.displayEvents.map((event) => event.id));
      const recap = [...campaign.displayEvents].reverse().find(
        (event) => event.type === "narration" || event.type === "dialogue"
      );
      if (recap) {
        setCurrentBeat(recap);
        setShownChars(plainText(parseInline(recap.content || "")).length);
      }
      return;
    }
    const seen = seenRef.current;
    let added = false;
    for (const event of campaign.displayEvents) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      queueRef.current.push(event);
      added = true;
    }
    if (added) setPump((n) => n + 1);
  }, [campaign.displayEvents]);

  const playersById = useMemo(() => {
    const map = new Map<string, Player>();
    for (const player of campaign.players) map.set(player.id, player);
    return map;
  }, [campaign.players]);

  const advance = useCallback(() => {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
    setCurrentBeat(null);
    setHoldMs(0);
    setPump((n) => n + 1);
  }, []);

  // Take the next beat when idle.
  useEffect(() => {
    if (currentBeat || activeDice) return;
    const next = queueRef.current.shift();
    if (!next) return;
    if (next.type === "dice" && next.dice) {
      const roller = next.playerId ? playersById.get(next.playerId) : undefined;
      setActiveDice({
        id: next.id,
        notation: next.dice.notation,
        reason: next.dice.reason || next.content || "Fate decides",
        rolls: next.dice.rolls,
        modifier: next.dice.modifier,
        total: next.dice.total,
        d20Mode: next.dice.d20Mode,
        dc: next.dice.dc,
        outcome: next.dice.outcome,
        speaker: next.speaker !== "Dice" ? next.speaker : undefined,
        isNpc: next.dice.isNpc,
        color: roller ? accentColor(roller.color) : (next.dice.isNpc ? "#c48a8a" : undefined)
      });
      return;
    }
    setCurrentBeat(next);
    setShownChars(0);
    setHoldMs(0);
    playSfx("beat");
  }, [pump, currentBeat, activeDice, playersById]);

  // Typewriter + auto-advance (paced over visible characters only).
  useEffect(() => {
    if (!currentBeat) return;
    if (shownChars >= beatPlain.length) {
      const hold = beatHold(beatPlain);
      setHoldMs(hold);
      advanceTimer.current = setTimeout(advance, hold);
      return () => {
        if (advanceTimer.current) clearTimeout(advanceTimer.current);
      };
    }
    const step = beatPlain.length > 420 ? 4 : 2;
    const timer = setTimeout(() => setShownChars((n) => Math.min(n + step, beatPlain.length)), 24);
    return () => clearTimeout(timer);
  }, [currentBeat, beatPlain, shownChars, advance]);

  // Space / click skips typing, then skips the hold.
  const skip = useCallback(() => {
    if (!currentBeat) return;
    if (shownChars < beatPlain.length) {
      setShownChars(beatPlain.length);
    } else {
      advance();
    }
  }, [currentBeat, beatPlain, shownChars, advance]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = (target.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea" || target.isContentEditable) return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        skip();
      }
      if (event.key === "d" || event.key === "D") setDrawerOpen((open) => !open);
      if (event.key === "t" || event.key === "T") setTomeOpen((open) => !open);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [skip]);

  /* ------------------------------------------------------------------ */
  /* Ambience + stage effects                                            */
  /* ------------------------------------------------------------------ */
  const atmosphereRef = useRef<AtmosphereHandle>(null);
  const fxSeenRef = useRef<Set<string> | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [shaking, setShaking] = useState(false);
  const [flashKey, setFlashKey] = useState(0);

  useEffect(() => {
    if (!shakeKey) return;
    setShaking(true);
    const timer = setTimeout(() => setShaking(false), 800);
    return () => clearTimeout(timer);
  }, [shakeKey]);
  const [darkUntil, setDarkUntil] = useState(0);
  const [pulseUntil, setPulseUntil] = useState(0);

  useEffect(() => {
    const effects = campaign.effects || [];
    if (!fxSeenRef.current) {
      fxSeenRef.current = new Set(effects.map((fx) => fx.id));
      return;
    }
    const seen = fxSeenRef.current;
    for (const fx of effects) {
      if (seen.has(fx.id)) continue;
      seen.add(fx.id);
      const times = Math.max(1, Math.min(8, Number(fx.repeat) || 1));
      const gap = Math.max(0, Math.min(5000, Number(fx.delayMs) || 0));
      const fire = () => {
        switch (fx.kind) {
          case "shake": setShakeKey((k) => k + 1); playSfx("rumble", fx.strength); break;
          case "flash": setFlashKey((k) => k + 1); playSfx("flash", fx.strength); break;
          case "darkness": setDarkUntil(Date.now() + 4500); playSfx("darkness"); break;
          case "heartbeat": setPulseUntil(Date.now() + 5200); playSfx("heartbeat"); break;
          default: atmosphereRef.current?.burst(fx.kind, fx.strength);
        }
      };
      for (let i = 0; i < times; i += 1) {
        if (i === 0 || gap === 0) fire();
        else setTimeout(fire, gap * i);
      }
    }
  }, [campaign.effects]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (darkUntil <= now && pulseUntil <= now) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [darkUntil, pulseUntil, now]);

  const mood = debugMood || campaign.ambience?.mood || "calm";
  const intensity = campaign.ambience?.intensity ?? 0.5;

  /* ------------------------------------------------------------------ */
  /* Music — the shared bard (HostExperience picks the score by mood);   */
  /* here we only duck under dice, mute, and unblock autoplay.           */
  /* ------------------------------------------------------------------ */
  // Muting is owned by the floating MusicWidget now; we only mirror the shared
  // bard state so the dice cinematic can silence its own foley when muted.
  const [muted, setMuted] = useState(() => bgmIsMuted());

  useEffect(() => subscribeBgm(({ muted: isMuted }) => setMuted(isMuted)), []);

  useEffect(() => {
    bgmDuck(!!activeDice);
  }, [activeDice]);

  /* ------------------------------------------------------------------ */
  /* Director drawer                                                     */
  /* ------------------------------------------------------------------ */
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accent, setAccent] = useState("gold");
  useEffect(() => {
    setAccent(initAccent() || currentAccent());
  }, []);
  const [sway, setSway] = useState("");
  const [swayBusy, setSwayBusy] = useState(false);
  const [paintPrompt, setPaintPrompt] = useState("");
  const [paintBusy, setPaintBusy] = useState(false);

  const sendSway = async () => {
    if (!sway.trim()) return;
    setSwayBusy(true);
    try {
      await api.party({ campaignId: campaign.id, action: "sway", guidance: sway.trim() });
      setSway("");
    } catch {
      // The drawer shows dmStatus; a failed sway simply leaves the text in place.
    } finally {
      setSwayBusy(false);
    }
  };

  const paintScene = async () => {
    if (!paintPrompt.trim()) return;
    setPaintBusy(true);
    try {
      await api.generateSceneImage(campaign.id, paintPrompt.trim());
      setPaintPrompt("");
    } catch {
      // ignore; host can retry
    } finally {
      setPaintBusy(false);
    }
  };

  const toggleSetting = (key: string, value: boolean) => {
    api.party({ campaignId: campaign.id, action: "updateSettings", [key]: value }).catch(() => undefined);
  };

  const previewEffect = (kind: StageEffectKind) => {
    switch (kind) {
      case "shake": setShakeKey((key) => key + 1); playSfx("rumble", 0.8); break;
      case "flash": setFlashKey((key) => key + 1); playSfx("flash", 0.8); break;
      case "darkness": setDarkUntil(Date.now() + 4500); playSfx("darkness"); break;
      case "heartbeat": setPulseUntil(Date.now() + 5200); playSfx("heartbeat"); break;
      default: atmosphereRef.current?.burst(kind, 0.85);
    }
  };

  const previewDice = (outcome: DiceOutcome, isNpc = false) => {
    const total = outcome === "critical-success" ? 20 : outcome === "critical-failure" ? 1 : outcome.includes("failure") ? 8 : 18;
    setActiveDice({
      id: `debug-${outcome}-${Date.now()}`,
      notation: "1d20+3",
      reason: `Debug preview: ${outcome.replaceAll("-", " ")}`,
      rolls: [Math.max(1, total - 3)],
      modifier: 3,
      total,
      d20Mode: "normal",
      dc: 15,
      outcome,
      speaker: isNpc ? "The Adversary" : "UI Preview Hero",
      isNpc,
      color: isNpc ? "#c48a8a" : visual.accentBright
    });
  };

  const closeDebug = () => {
    setDebugOpen(false);
    setDebugTheme(null);
    setDebugMood(null);
    setDebugOutro(false);
  };

  /* ------------------------------------------------------------------ */
  /* Derived                                                             */
  /* ------------------------------------------------------------------ */
  const npcsOnStage = useMemo(
    () =>
      campaign.storyCharacters
        .filter((npc) => npc.portraitUrl && npc.status !== "Future NPC")
        .slice(-4),
    [campaign.storyCharacters]
  );

  const questLine = useMemo(() => {
    if (!campaign.showQuestOnTV || !campaign.questLog) return null;
    const line = campaign.questLog
      .split(/\r?\n/)
      .map((entry) =>
        entry
          .replace(/^#+\s*/, "")
          .replace(/^[-*]\s*/, "")
          .replace(/\*\*|\*|__|`/g, "")
          .trim()
      )
      .filter(Boolean);
    return line.slice(0, 2).join(" · ") || null;
  }, [campaign.showQuestOnTV, campaign.questLog]);

  const playerBySpeaker = (beat: Beat): Player | undefined => {
    if (beat.playerId) return playersById.get(beat.playerId);
    if (!beat.speaker) return undefined;
    const lower = beat.speaker.toLowerCase();
    return campaign.players.find((p) => (p.characterName || p.name).toLowerCase() === lower);
  };

  const speakerColor = (beat: Beat): string | undefined => {
    const player = playerBySpeaker(beat);
    if (player?.color) return accentColor(player.color);
    const npc = campaign.storyCharacters.find((item) => item.name === beat.speaker);
    if (npc?.color) return accentColor(npc.color);
    return undefined;
  };

  const speakerPortrait = (beat: Beat): string | undefined => {
    const player = playerBySpeaker(beat);
    if (player?.portraitUrl) return player.portraitUrl;
    return campaign.storyCharacters.find((item) => item.name === beat.speaker)?.portraitUrl;
  };

  const isNarrator = (beat: Beat) =>
    !beat.speaker || beat.speaker.toUpperCase() === "NARRATOR" || beat.type === "system" || beat.type === "scene";

  const dark = darkUntil > now;
  const pulsing = pulseUntil > now;

  return (
    <div
      className={`stage screen ${shaking ? "stage-shake" : ""} ${pulsing ? "stage-pulse" : ""} ${campaign.status === "completed" ? "stage-completed" : ""}`}
      data-music-theme={visual.key}
      onClick={skip}
    >
      {/* Painted backdrop with Ken Burns crossfade */}
      <div className="stage-backdrop">
        {layers.map((layer, index) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={layer.key}
            src={layer.url}
            alt=""
            className={`backdrop-layer ${index === layers.length - 1 ? "front" : "back"} kenburns-${layer.key % 2}`}
          />
        ))}
        <div className="stage-grade" style={{ background: MOOD_GRADES[mood] || MOOD_GRADES.calm }} />
      </div>

      <StageAtmosphere ref={atmosphereRef} mood={mood} intensity={intensity} theme={visual.key} />

      <div className="stage-grain" aria-hidden />
      <div className={`stage-darkness ${dark ? "on" : ""}`} aria-hidden />
      {flashKey ? <div key={`flash-${flashKey}`} className="stage-flash" aria-hidden /> : null}
      <div className="stage-vignette" aria-hidden />

      {/* Top chrome */}
      <header className="stage-mast">
        <div className="stage-title-block">
          <span className="stage-title">{campaign.title}</span>
          {questLine ? <span className="stage-quest">⟡ {questLine}</span> : null}
        </div>
        {campaign.ambience?.note ? <span className="stage-ambience-note">{campaign.ambience.note}</span> : null}
      </header>

      {/* Hero rail (players, left) */}
      <aside className="stage-rail left">
        {campaign.players.map((player) => {
          const color = accentColor(player.color);
          const hp = player.stats.find((stat) => stat.name.toUpperCase() === "HP");
          const speaking = currentBeat?.playerId === player.id;
          return (
            <div key={player.id} className={`rail-card ${speaking ? "speaking" : ""}`} style={{ borderColor: `${color}` }}>
              <div className="rail-portrait">
                {player.portraitUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={player.portraitUrl} alt={player.characterName || player.name} />
                ) : (
                  <span className="forge-circle small" aria-hidden />
                )}
              </div>
              <div className="rail-info">
                <span className="rail-name" style={{ color }}>{player.characterName || player.name}</span>
                {hp ? (
                  <span className="rail-hp">
                    <span className="rail-hp-fill" style={{ width: `${Math.max(0, Math.min(100, (hp.value / Math.max(hp.maxValue, 1)) * 100))}%` }} />
                    <span className="rail-hp-text">{hp.value}/{hp.maxValue}</span>
                  </span>
                ) : null}
                {player.status ? <span className="rail-status">{player.status}</span> : null}
              </div>
            </div>
          );
        })}
      </aside>

      {/* NPC rail (right) */}
      <aside className="stage-rail right">
        {npcsOnStage.map((npc: StoryCharacter) => {
          const color = accentColor(npc.color, "#9aa4c0");
          const speaking = currentBeat?.speaker === npc.name;
          return (
            <div key={npc.id} className={`rail-card npc ${speaking ? "speaking" : ""}`} style={{ borderColor: color }}>
              <div className="rail-portrait">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={npc.portraitUrl!} alt={npc.name} />
              </div>
              <div className="rail-info">
                <span className="rail-name" style={{ color }}>{npc.name}</span>
                {npc.status ? <span className="rail-status">{npc.status}</span> : null}
              </div>
            </div>
          );
        })}
      </aside>

      {/* The Chronicle — one beat at a time */}
      <section className="chronicle">
        {currentBeat ? (
          <div className={`beat beat-${currentBeat.type} ${isNarrator(currentBeat) ? "beat-narrator" : "beat-voiced"}`}>
            {!isNarrator(currentBeat) ? (
              <div className="beat-plate">
                {speakerPortrait(currentBeat) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="beat-face" src={speakerPortrait(currentBeat)} alt="" />
                ) : null}
                <span className="beat-speaker" style={{ color: speakerColor(currentBeat) }}>
                  {currentBeat.speaker}
                </span>
                {currentBeat.type === "playerAction" ? <span className="beat-tag">acts</span> : null}
                {currentBeat.itemUsed ? <span className="beat-tag item">✦ {currentBeat.itemUsed}</span> : null}
                {currentBeat.abilityUsed ? <span className="beat-tag ability">✧ {currentBeat.abilityUsed}</span> : null}
              </div>
            ) : null}
            <p className={`beat-text ${currentBeat.type === "system" ? "system" : ""}`}>
              {renderTokens(beatTokens, shownChars)}
              {shownChars < beatPlain.length ? <span className="beat-caret" aria-hidden>❘</span> : null}
            </p>
            {holdMs > 0 && shownChars >= beatPlain.length ? (
              <span
                key={`hold-${currentBeat.id}`}
                className="beat-hold"
                style={{ animationDuration: `${holdMs}ms` }}
                aria-hidden
              />
            ) : null}
          </div>
        ) : campaign.dmStatus ? null : (
          <p className="chronicle-idle">{campaign.overview}</p>
        )}
        {queueRef.current.length > 0 && currentBeat ? (
          <span className="chronicle-more" aria-hidden>⌄ {queueRef.current.length} more</span>
        ) : null}
      </section>

      {/* Oracle sigil — the DM is weaving */}
      {campaign.dmStatus ? (
        <div className="oracle-sigil" role="status">
          <span className="sigil-ring" aria-hidden />
          <span className="sigil-text">{campaign.dmStatus}</span>
        </div>
      ) : null}

      {/* Dice cinematic */}
      
      {(campaign.status === "completed" && campaign.ending) || debugOutro ? (
        <div className="credits-reel" onClick={(e) => e.stopPropagation()}>
          <div className={`credits-kind kind-${campaign.ending?.kind || "victory"}`}>{campaign.ending?.kind || "victory"}</div>
          <h2 className="credits-title">{campaign.ending?.title || "The Weaver Rests"}</h2>
          <p className="credits-summary">{campaign.ending?.summary || "A debug epilogue unfurls without advancing the campaign. The table fades, the final threads gleam, and every visual remains available for inspection."}</p>
          {(campaign.ending?.highlights?.length || debugOutro) ? (
            <ul className="credits-highlights">
              {(campaign.ending?.highlights || ["The final roll was cast", "The party changed the world", "The story remains in the archive"]).map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          ) : null}
          <div className="credits-cast">
            {campaign.players.map((p) => (
              <span key={p.id} className="credits-cast-name">{p.characterName || p.name}</span>
            ))}
          </div>
        </div>
      ) : null}

      {activeDice ? (
        <DiceTheater key={activeDice.id} roll={activeDice} muted={muted} onDone={() => setActiveDice(null)} />
      ) : null}

      {/* Utility chrome */}
      <div className="stage-tools" onClick={(event) => event.stopPropagation()}>
        <button className="tool-chip" onClick={() => setTomeOpen((open) => !open)}>Tome</button>
        <button className="tool-chip" onClick={() => setDrawerOpen((open) => !open)}>Director</button>
        {debugMode ? <button className={`tool-chip ${debugOpen ? "attention" : ""}`} onClick={() => setDebugOpen((open) => !open)}>Gallery</button> : null}
      </div>

      {debugMode && debugOpen ? (
        <aside className="debug-menu panel" onClick={(event) => event.stopPropagation()}>
          <div className="tome-head">
            <h3 className="panel-subtitle">UI Debug Gallery</h3>
            <span className="debug-menu-actions">
              <button className="ghost-button" onClick={closeDebug}>Hide</button>
              <button className="ghost-button" onClick={onExit}>Title screen</button>
            </span>
          </div>

          <label className="director-label">Menus</label>
          <div className="debug-grid menus">
            <button className="chip-toggle tiny" onClick={() => setTomeOpen(true)}>Tome</button>
            <button className="chip-toggle tiny" onClick={() => setDrawerOpen(true)}>Director</button>
            <button className={`chip-toggle tiny ${debugOutro ? "selected" : ""}`} onClick={() => { setDebugOutro((shown) => !shown); setDebugMood("outro"); }}>Three.js Outro</button>
          </div>

          <label className="director-label">Themes</label>
          <div className="debug-grid">
            {DEBUG_THEMES.map((themeKey) => (
              <button key={themeKey} className={`chip-toggle tiny ${visual.key === themeKey ? "selected" : ""}`} onClick={() => setDebugTheme(themeKey)}>
                {themeKey}
              </button>
            ))}
          </div>

          <label className="director-label">Atmosphere moods</label>
          <div className="debug-grid">
            {DEBUG_MOODS.map((moodKey) => (
              <button key={moodKey} className={`chip-toggle tiny ${mood === moodKey ? "selected" : ""}`} onClick={() => setDebugMood(moodKey)}>
                {moodKey}
              </button>
            ))}
          </div>

          <label className="director-label">Stage effects</label>
          <div className="debug-grid">
            {DEBUG_EFFECTS.map((effect) => <button key={effect} className="chip-toggle tiny" onClick={() => previewEffect(effect)}>{effect}</button>)}
          </div>

          <label className="director-label">Dice outcomes</label>
          <div className="debug-grid">
            {DEBUG_OUTCOMES.map((outcome) => <button key={outcome} className="chip-toggle tiny" onClick={() => previewDice(outcome)}>{outcome.replaceAll("-", " ")}</button>)}
            <button className="chip-toggle tiny" onClick={() => previewDice("hard-failure", true)}>NPC roll</button>
          </div>
        </aside>
      ) : null}

      {/* The Tome — scrollback */}
      {tomeOpen ? (
        <aside className="tome panel" onClick={(event) => event.stopPropagation()}>
          <div className="tome-head">
            <h3 className="panel-subtitle">The Tome</h3>
            <button className="ghost-button" onClick={() => setTomeOpen(false)}>✕</button>
          </div>
          <div className="tome-scroll">
            {campaign.displayEvents.slice(-40).map((event) => (
              <div key={event.id} className={`tome-entry type-${event.type}`}>
                <span className="tome-speaker" style={{ color: speakerColor(event) }}>
                  {event.type === "dice" && event.dice
                    ? `⚄ ${event.speaker || "Dice"} — ${event.dice.total}`
                    : event.speaker || "—"}
                </span>
                <span className="tome-content">{event.content ? renderInline(event.content) : null}</span>
              </div>
            ))}
          </div>
        </aside>
      ) : null}

      {/* Director's drawer */}
      {drawerOpen ? (
        <aside className="director panel" onClick={(event) => event.stopPropagation()}>
          <div className="tome-head">
            <h3 className="panel-subtitle">Director&apos;s Drawer</h3>
            <button className="ghost-button" onClick={() => setDrawerOpen(false)}>✕</button>
          </div>

          <label className="director-label">Whisper to the Weaver</label>
          <textarea
            className="field textarea slim"
            rows={3}
            placeholder="Sway the story: “introduce a rival crew”, “raise the stakes”, “wrap this scene soon”…"
            value={sway}
            onChange={(event) => setSway(event.target.value)}
          />
          <button className="oracle-button" disabled={swayBusy || !sway.trim()} onClick={sendSway}>
            {swayBusy ? "Whispering…" : "✦ Whisper"}
          </button>

          <label className="director-label">Paint a new backdrop</label>
          <textarea
            className="field textarea slim"
            rows={2}
            placeholder="Describe the vista to paint…"
            value={paintPrompt}
            onChange={(event) => setPaintPrompt(event.target.value)}
          />
          <button className="oracle-button" disabled={paintBusy || !paintPrompt.trim()} onClick={paintScene}>
            {paintBusy ? "Painting…" : "🎨 Paint"}
          </button>

          {campaign.images.length ? (
            <>
              <label className="director-label">Recall a painted scene</label>
              <div className="gallery">
                {campaign.images.slice(-8).map((image) => (
                  <button
                    key={image.id}
                    className={`gallery-thumb ${campaign.currentImageUrl === image.url ? "current" : ""}`}
                    title={image.prompt}
                    onClick={() => api.party({ campaignId: campaign.id, action: "setBackground", url: image.url }).catch(() => undefined)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.url} alt={image.prompt.slice(0, 60)} />
                  </button>
                ))}
              </div>
            </>
          ) : null}

          <label className="director-label">Table colors</label>
          <div className="accent-row">
            {ACCENT_THEMES.map((themeOption) => (
              <button
                key={themeOption.key}
                className={`accent-swatch ${accent === themeOption.key ? "current" : ""}`}
                style={{ background: themeOption.swatch }}
                title={themeOption.label}
                aria-label={themeOption.label}
                onClick={() => { applyAccent(themeOption.key); setAccent(themeOption.key); }}
              />
            ))}
          </div>

          <label className="director-label">Table settings</label>
          <div className="director-toggles">
            {([
              ["showQuestOnTV", "Quest on the TV", campaign.showQuestOnTV],
              ["showQuestOnController", "Quest on phones", campaign.showQuestOnController],
              ["showPartyInventories", "Party sees inventories", campaign.showPartyInventories],
              ["showPartyAbilities", "Party sees abilities", campaign.showPartyAbilities]
            ] as Array<[string, string, boolean | undefined]>).map(([key, label, value]) => (
              <button key={key} className={`chip-toggle tiny ${value ? "selected" : ""}`} onClick={() => toggleSetting(key, !value)}>
                {label}
              </button>
            ))}
          </div>

          <button className="ghost-button leave" onClick={onExit}>Leave the table (keeps the saga)</button>
        </aside>
      ) : null}
    </div>
  );
}
