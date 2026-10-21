"use client";

import { useEffect, useRef, useState } from "react";
import { api, CampaignSummary } from "@/lib/client/api";
import { bgmResume, bgmSetContext, bgmSetTheme, bgmStop } from "@/lib/client/audio";
import { useThemeSkin } from "@/lib/client/skin";
import CosmosCanvas from "@/components/three/CosmosCanvas";
import { THEME_SHOWCASE } from "@/components/three/themeVisuals";

type ReelTheme = keyof typeof THEME_SHOWCASE;
const REEL = Object.keys(THEME_SHOWCASE) as ReelTheme[];
const REEL_MS = 16_000;
/** Scene crossfade length; the UI dims and swaps skin at its midpoint. */
const CROSSFADE_MS = 1800;
const SOUND_KEY = "mythweaver.portalSound";

/**
 * The front door, as a world reel. Behind the doors the portal dreams through
 * every campaign world in turn — its live environment, its music (when sound
 * is on) and the whole interface re-dressed in that world's skin — until a
 * guest picks one to linger on. Three ways in: forge a new legend, reopen a
 * saga, or step through to the phone controller.
 */
export default function Portal({
  onCreate,
  onResume,
  onJoin,
  onDebug
}: {
  onCreate: (voiceServer?: { host: string; port: number; voiceId?: string }) => void;
  onResume: (campaignId: string) => void;
  onJoin: () => void;
  onDebug: () => void;
}) {
  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);
  const [sagasOpen, setSagasOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ttsHost, setTtsHost] = useState("127.0.0.1");
  const [ttsPort, setTtsPort] = useState("5123");
  const [voices, setVoices] = useState<Array<{ id: string }>>([]);
  const [voiceId, setVoiceId] = useState("");

  // World reel ----------------------------------------------------------
  const [world, setWorld] = useState<ReelTheme>(() => REEL[Math.floor(Math.random() * REEL.length)]);
  // Live 3D scenes. During a transition there are two: the outgoing world
  // and the incoming one mounted beneath it, so the change is a true
  // crossfade between two running environments rather than a cut to black.
  const [scenes, setScenes] = useState<Array<{ id: number; theme: ReelTheme }>>(() => [{ id: 0, theme: world }]);
  const [frontId, setFrontId] = useState(0);
  const frontRef = useRef(0);
  const [swapping, setSwapping] = useState(false);
  const [paused, setPaused] = useState(false);
  const [sound, setSound] = useState(false);
  const sceneSeq = useRef(1);
  const timers = useRef<number[]>([]);
  const target = useRef<ReelTheme>(world);
  useThemeSkin(world);

  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };
  const later = (ms: number, run: () => void) => {
    timers.current.push(window.setTimeout(run, ms));
  };

  const showWorld = (next: ReelTheme) => {
    if (next === target.current) return;
    target.current = next;
    clearTimers();
    const id = sceneSeq.current++;
    // Keep only the scene currently in front (a rapid second pick drops the
    // half-faded one) and mount the newcomer beneath it at zero opacity.
    const keep = frontRef.current;
    setScenes((current) => [...current.filter((scene) => scene.id === keep), { id, theme: next }]);
    // Give the new environment a beat to build its first frames, then fade.
    later(150, () => {
      frontRef.current = id;
      setFrontId(id);
    });
    // The interface dims, re-skins at the visual midpoint, and comes back.
    later(CROSSFADE_MS * 0.3, () => setSwapping(true));
    later(CROSSFADE_MS * 0.5, () => setWorld(next));
    later(CROSSFADE_MS * 0.5 + 260, () => setSwapping(false));
    later(CROSSFADE_MS + 250, () => setScenes((current) => current.filter((scene) => scene.id === id)));
  };

  useEffect(() => () => clearTimers(), []);

  useEffect(() => {
    // Reduced motion: no auto-advance; the guest steps through by hand.
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (paused || still || sagasOpen) return;
    const id = window.setTimeout(() => showWorld(REEL[(REEL.indexOf(world) + 1) % REEL.length]), REEL_MS);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, paused, sagasOpen]);

  // Optional score: each world plays its own calm shelf, so the environment's
  // music sync has something to dance to. Off by default (autoplay rules, and
  // a quiet front door); remembered per device once switched on.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(SOUND_KEY) === "1") setSound(true);
    } catch {
      // Storage blocked — sound simply starts off.
    }
  }, []);

  useEffect(() => {
    if (!sound) return;
    bgmSetTheme(world);
    bgmSetContext("wonder");
  }, [sound, world]);

  useEffect(() => {
    if (!sound) return;
    // A remembered "on" still needs a gesture before the browser lets it play.
    const kick = () => bgmResume();
    window.addEventListener("pointerdown", kick, { once: true });
    window.addEventListener("keydown", kick, { once: true });
    return () => {
      window.removeEventListener("pointerdown", kick);
      window.removeEventListener("keydown", kick);
    };
  }, [sound]);

  useEffect(() => () => bgmStop(), []);

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    try {
      window.localStorage.setItem(SOUND_KEY, next ? "1" : "0");
    } catch {
      // Not persisted.
    }
    if (next) {
      bgmSetTheme(world);
      bgmSetContext("wonder");
      bgmResume();
    } else {
      bgmStop();
    }
  };

  // Archive & voice settings --------------------------------------------
  useEffect(() => {
    let cancelled = false;
    api.listCampaigns()
      .then(({ campaigns: list }) => {
        if (!cancelled) setCampaigns(list);
      })
      .catch(() => {
        if (!cancelled) setCampaigns([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const storedHost = window.localStorage.getItem("mythweaver.ttsHost");
    const storedPort = window.localStorage.getItem("mythweaver.ttsPort");
    if (storedHost) setTtsHost(storedHost);
    if (storedPort) setTtsPort(storedPort);
  }, []);

  useEffect(() => {
    const port = Number(ttsPort);
    if (!ttsHost.trim() || !Number.isInteger(port) || port < 1 || port > 65535) {
      setVoices([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/tts?action=voices&host=${encodeURIComponent(ttsHost.trim())}&port=${port}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : { voices: [] })
      .then((data) => { if (!cancelled) setVoices(Array.isArray(data.voices) ? data.voices : []); })
      .catch(() => { if (!cancelled) setVoices([]); });
    return () => { cancelled = true; };
  }, [ttsHost, ttsPort]);

  const forgeWithVoiceServer = () => {
    const port = Number(ttsPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return;
    window.localStorage.setItem("mythweaver.ttsHost", ttsHost.trim());
    window.localStorage.setItem("mythweaver.ttsPort", String(port));
    onCreate({ host: ttsHost.trim(), port, voiceId: voiceId || undefined });
  };

  const removeCampaign = async (id: string) => {
    setConfirmDelete(null);
    setCampaigns((prev) => (prev ? prev.filter((item) => item.id !== id) : prev));
    try {
      await api.deleteCampaign(id);
    } catch {
      const { campaigns: list } = await api.listCampaigns().catch(() => ({ campaigns: [] as CampaignSummary[] }));
      setCampaigns(list);
    }
  };

  const sagas = campaigns || [];
  const show = THEME_SHOWCASE[world];

  return (
    <div className={`portal screen ${swapping ? "swapping" : ""}`} data-music-theme={world}>
      {scenes.map((scene) => (
        <div key={scene.id} className={`portal-scene ${scene.id > frontId ? "entering" : ""}`} aria-hidden>
          <CosmosCanvas theme={scene.theme} drama={sagasOpen ? 0.35 : 0.8} />
        </div>
      ))}
      <div className="portal-veil" />

      <nav className="portal-topbar" aria-label="Table tools">
        <button
          className="portal-top-chip"
          onClick={() => setSettingsOpen((open) => !open)}
          aria-expanded={settingsOpen}
          aria-controls="portal-settings"
        >
          ⚙ Settings
        </button>
        <span className="portal-topbar-spacer" />
        <button className={`portal-top-chip ${sound ? "on" : ""}`} onClick={toggleSound} aria-pressed={sound} title="Play each world's music">
          {sound ? "♪ Sound on" : "♪ Sound off"}
        </button>
        <button className="portal-top-chip" onClick={onDebug} title="Open the UI and theme showcase">
          Debug UI
        </button>
      </nav>

      {settingsOpen ? (
        <aside id="portal-settings" className="portal-settings panel" aria-label="Mythweaver settings">
          <div className="portal-settings-head">
            <span className="director-label">Voice narration</span>
            <button className="music-x" onClick={() => setSettingsOpen(false)} aria-label="Close settings">×</button>
          </div>
          <div className="portal-voice-fields">
            <input className="field slim" value={ttsHost} onChange={(event) => setTtsHost(event.target.value)} placeholder="Voice server host" aria-label="Voice server host" />
            <input className="field slim" type="number" min="1" max="65535" value={ttsPort} onChange={(event) => setTtsPort(event.target.value)} aria-label="Voice server port" />
          </div>
          <select className="field slim" value={voiceId} disabled={!voices.length} onChange={(event) => setVoiceId(event.target.value)}>
            <option value="">{voices.length ? "Default voice" : "No voices available"}</option>
            {voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.id}</option>)}
          </select>
          <p className="panel-hint small">Voices are loaded dynamically from this server and apply to new tables.</p>
        </aside>
      ) : null}

      <header className="portal-mast">
        <div className="brand-sigil" aria-hidden>{show.glyph}</div>
        <h1 className="brand-title">Mythweaver</h1>
        <p className="brand-sub">An AI game master for the living room. The screen is the stage; your phones are the hands of fate.</p>
      </header>

      {!sagasOpen ? (
        <>
          <section className="portal-world" aria-live="polite">
            <span className="portal-world-kicker">Now dreaming · {show.genre}</span>
            <h2 className="portal-world-name">{show.name}</h2>
            <p className="portal-world-line">{show.line}</p>
          </section>

          <main className="portal-choices">
            <button className="portal-card" onClick={forgeWithVoiceServer}>
              <span className="portal-card-rune" aria-hidden>⟡</span>
              <span className="portal-card-title">Forge a New Legend</span>
              <span className="portal-card-sub">Shape a world, gather the party, and let the Weaver narrate.</span>
            </button>
            <button
              className="portal-card"
              onClick={() => setSagasOpen(true)}
              disabled={campaigns !== null && sagas.length === 0}
            >
              <span className="portal-card-rune" aria-hidden>❖</span>
              <span className="portal-card-title">Reopen a Saga</span>
              <span className="portal-card-sub">
                {campaigns === null
                  ? "Consulting the archive…"
                  : sagas.length === 0
                    ? "The archive is empty. Forge your first legend."
                    : `${sagas.length} ${sagas.length === 1 ? "tale waits" : "tales wait"} in the archive.`}
              </span>
            </button>
            <button className="portal-card portal-card-join" onClick={onJoin}>
              <span className="portal-card-rune" aria-hidden>➶</span>
              <span className="portal-card-title">Join a Table</span>
              <span className="portal-card-sub">On a phone? Enter a table code and take your seat.</span>
            </button>
          </main>
        </>
      ) : (
        <main className="portal-archive">
          <div className="archive-head">
            <h2 className="panel-title">The Archive</h2>
            <button className="ghost-button" onClick={() => setSagasOpen(false)}>← Back</button>
          </div>
          <div className="archive-list">
            {sagas.map((saga) => (
              <div key={saga.id} className="archive-row">
                <button className="archive-open" onClick={() => onResume(saga.id)}>
                  <span className="archive-title">{saga.title}</span>
                  <span className="archive-meta">
                    <span className={`archive-status status-${saga.status}`}>
                      {saga.status === "active"
                        ? "In progress"
                        : saga.status === "completed"
                          ? saga.endingKind
                            ? `Ended — ${saga.endingKind}`
                            : "Ended"
                          : "Gathering"}
                    </span>
                    <span>{saga.playerCount} {saga.playerCount === 1 ? "hero" : "heroes"}</span>
                    <span>{saga.campaignType === "dnd" ? "D&D" : "Story RPG"}</span>
                    <span className="archive-code">Code {saga.joinCode}</span>
                  </span>
                </button>
                {confirmDelete === saga.id ? (
                  <span className="archive-confirm">
                    <button className="danger-button" onClick={() => removeCampaign(saga.id)}>Burn it</button>
                    <button className="ghost-button" onClick={() => setConfirmDelete(null)}>Keep</button>
                  </span>
                ) : (
                  <button className="archive-delete" title="Delete campaign" aria-label={`Delete ${saga.title}`} onClick={() => setConfirmDelete(saga.id)}>✕</button>
                )}
              </div>
            ))}
          </div>
        </main>
      )}

      <footer className="portal-foot">
        <div className="portal-reel" role="group" aria-label="Preview a world">
          <button
            className="portal-reel-play"
            onClick={() => setPaused((value) => !value)}
            aria-label={paused ? "Resume the world reel" : "Pause the world reel"}
            title={paused ? "Resume" : "Pause"}
          >
            {paused ? "▶" : "❚❚"}
          </button>
          {REEL.map((key) => (
            <button
              key={key}
              className={`portal-reel-dot ${key === world ? "current" : ""}`}
              onClick={() => { setPaused(true); showWorld(key); }}
              aria-label={`${THEME_SHOWCASE[key].name} (${THEME_SHOWCASE[key].genre})`}
              aria-pressed={key === world}
              title={THEME_SHOWCASE[key].name}
            >
              <span aria-hidden>{THEME_SHOWCASE[key].glyph}</span>
            </button>
          ))}
        </div>
        <span className="portal-foot-hint">Phones join at this address, or scan the lobby QR.</span>
      </footer>
    </div>
  );
}
