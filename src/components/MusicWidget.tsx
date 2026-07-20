"use client";

import { useEffect, useState } from "react";
import {
  bgmGetVolume,
  bgmIsMuted,
  bgmResume,
  bgmSetMuted,
  bgmSetVolume,
  subscribeBgm
} from "@/lib/client/audio";
import { sfxGetVolume, sfxSetVolume } from "@/lib/client/sfx";
import {
  ambienceGetVolume,
  ambienceResume,
  ambienceSetMuted,
  ambienceSetVolume,
  subscribeAmbience
} from "@/lib/client/ambience";

/**
 * The bard's little control tag: a speaker chip pinned to the corner of every
 * host screen (lobby → weaving → stage). Tap it to expand a panel with music
 * mute, music volume, SFX volume, and a "now playing" readout — the shelf key
 * and track name make it easy to check whether the score matches the theme.
 */
export default function MusicWidget() {
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [muted, setMuted] = useState(false);
  const [shelf, setShelf] = useState<string | null>(null);
  const [track, setTrack] = useState<string | null>(null);
  const [musicVol, setMusicVol] = useState(() => bgmGetVolume());
  const [sfxVol, setSfxVol] = useState(() => sfxGetVolume());
  const [ambienceVol, setAmbienceVol] = useState(() => ambienceGetVolume());
  const [ambienceCategories, setAmbienceCategories] = useState<string[]>([]);
  const [ambienceAcoustics, setAmbienceAcoustics] = useState<string[]>([]);

  useEffect(
    () =>
      subscribeBgm((s) => {
        setBlocked(s.blocked);
        setMuted(s.muted);
        setShelf(s.shelf);
        setTrack(s.track);
        setMusicVol(s.volume);
      }),
    []
  );

  useEffect(
    () =>
      subscribeAmbience((state) => {
        setAmbienceVol(state.volume);
        setAmbienceCategories(state.categories);
        setAmbienceAcoustics(state.acoustics);
      }),
    []
  );

  // Keep local state in sync if muting was flipped elsewhere on mount.
  useEffect(() => {
    setMuted(bgmIsMuted());
  }, []);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    bgmSetMuted(next);
    ambienceSetMuted(next);
  };

  const onMusicVol = (value: number) => {
    setMusicVol(value);
    bgmSetVolume(value);
    if (muted && value > 0) {
      setMuted(false);
      bgmSetMuted(false);
    }
  };

  const onSfxVol = (value: number) => {
    setSfxVol(value);
    sfxSetVolume(value);
  };

  const onAmbienceVol = (value: number) => {
    setAmbienceVol(value);
    ambienceSetVolume(value);
    if (muted && value > 0) {
      setMuted(false);
      bgmSetMuted(false);
      ambienceSetMuted(false);
    }
  };

  // A little glyph that reflects the audible state at a glance.
  const icon = blocked ? "🔈" : muted ? "🔇" : musicVol > 0 ? "🔊" : "🔈";
  const chipLabel = blocked ? "Tap for sound" : "Music";

  return (
    <div className={`music-widget ${open ? "open" : ""}`}>
      {open ? (
        <div className="music-panel" role="group" aria-label="Sound controls">
          <div className="music-panel-head">
            <span className="music-panel-title">Sound</span>
            <button className="music-x" onClick={() => setOpen(false)} aria-label="Close sound controls">
              ✕
            </button>
          </div>

          {blocked ? (
            <button
              className="music-enable"
              onClick={() => {
                setBlocked(false);
                bgmResume();
                ambienceResume();
              }}
            >
              ♪ Tap to enable sound
            </button>
          ) : null}

          <div className="music-row">
            <button className="music-mute" onClick={toggleMute} aria-pressed={muted}>
              {muted ? "🔇 Muted" : "🔊 Music"}
            </button>
          </div>

          <label className="music-slider">
            <span>Music</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : musicVol}
              onChange={(e) => onMusicVol(parseFloat(e.target.value))}
            />
            <span className="music-pct">{Math.round((muted ? 0 : musicVol) * 100)}</span>
          </label>

          <label className="music-slider">
            <span>SFX</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={sfxVol}
              onChange={(e) => onSfxVol(parseFloat(e.target.value))}
            />
            <span className="music-pct">{Math.round(sfxVol * 100)}</span>
          </label>

          <label className="music-slider">
            <span>World</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : ambienceVol}
              onChange={(e) => onAmbienceVol(parseFloat(e.target.value))}
            />
            <span className="music-pct">{Math.round((muted ? 0 : ambienceVol) * 100)}</span>
          </label>

          <div className="music-now">
            <span className="music-now-label">Now playing</span>
            {shelf || track ? (
              <>
                <span className="music-shelf">{shelf || "—"}</span>
                <span className="music-track">{track || "(silence)"}</span>
                {ambienceCategories.length ? (
                  <span className="music-track">World: {ambienceCategories.join(" + ")}</span>
                ) : null}
                {ambienceAcoustics.length ? (
                  <span className="music-track">Space: {ambienceAcoustics.join(" + ")}</span>
                ) : null}
              </>
            ) : (
              <span className="music-track">(nothing yet)</span>
            )}
          </div>
        </div>
      ) : null}

      <button
        className={`music-chip ${blocked ? "attention" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={chipLabel}
        title={chipLabel}
      >
        <span className="music-chip-icon" aria-hidden>
          {icon}
        </span>
      </button>
    </div>
  );
}
