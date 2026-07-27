"use client";

// Dev-only harness for eyeballing the Great Loom without playing a saga to
// its close (same spirit as /weavetest):
//   /outrotest                               — victory, neutral theme (placeholder copy)
//   /outrotest?kind=defeat&theme=gothic       — any kind x any of the 18 themes
//   /outrotest?campaign=<id>                  — a REAL ended saga: its actual ending,
//                                               players, portraits, title and theme
//   /outrotest?long=1                         — 12-word title, 6 highlights, 5 players
//   /outrotest?bare=1                         — no highlights, no stats, no cast lines
//   /outrotest?players=1                      — worst-case content: one hero
// Keys: K/k cycle kind · T/t cycle theme · L long · B bare. (Space/→ advance
// the finale itself; ←/Backspace rewind a beat; Home restarts; Esc seeks to
// the end — those belong to OutroTheater.)
// Completed sagas found on disk appear automatically as chips. Not linked
// from anywhere.

import { useEffect, useMemo, useState } from "react";
import OutroTheater from "@/components/three/OutroTheater";
import type { CampaignEnding, EndingKind, Player } from "@/lib/campaign/types";
import { THEME_KEYS, ThemeKey } from "@/components/three/themeVisuals";

const KINDS: EndingKind[] = ["victory", "defeat", "bittersweet", "escape", "draw", "cliffhanger"];

// Placeholder endings, one per kind — stand-ins until a real saga is picked.
const SAMPLES: Record<EndingKind, Pick<CampaignEnding, "title" | "summary" | "highlights" | "worldFate" | "epitaph">> = {
  victory: {
    title: "The Weaver's Crown",
    summary: "Against every prophecy, the party stood at the world's hinge and pushed. The dark tide broke, and dawn kept its appointment.",
    worldFate: "The morning came up over Aelis unbroken, for the first time in nine years.",
    epitaph: "The bells rang all day, and nobody asked them to stop.",
    highlights: ["The final roll was a natural 20", "The Adversary knelt at last", "The realm remembers its saviors"]
  },
  defeat: {
    title: "The Long Dark",
    summary: "The party gave everything, and it was not enough. The last torch guttered out in the deep, and the world above learned to whisper their names.",
    worldFate: "Aelis went under, tower by tower, and the sea closed over the place it had been.",
    epitaph: "The maps were redrawn without it. Nobody argued.",
    highlights: ["They fought to the final breath", "The Adversary's laughter still echoes", "Their story became a warning"]
  },
  bittersweet: {
    title: "The Price of Dawn",
    summary: "The city was saved, but not everyone walked out of the fire to see it. Victory tastes of ash and morning rain.",
    worldFate: "Half of Aelis woke to the light. The other half is still burning, and will be for years.",
    epitaph: "They saved what they could. It was not everything.",
    highlights: ["The ritual was broken — at a cost", "A hero stayed behind", "The survivors carry the flame"]
  },
  escape: {
    title: "Ashes at Our Heels",
    summary: "No one won. The party simply refused to be there when the ceiling came down, and the desert swallowed the rest.",
    worldFate: "Aelis is still down there, still turning, still theirs — and they are not going back.",
    epitaph: "Behind them, a light. Ahead of them, nothing they recognised.",
    highlights: ["The vault door shut behind them", "Nothing followed them out", "The map now has a blank space"]
  },
  draw: {
    title: "Neither Side Yielded",
    summary: "Two forces spent themselves down to the last ember and found the scales exactly level. The war simply stopped.",
    worldFate: "Aelis stopped turning. Nothing has moved on it since, and nothing has fallen off it either.",
    epitaph: "Held. Not won, not lost. Held.",
    highlights: ["Both banners still stand", "The bargain holds — for now", "Nobody speaks of who started it"]
  },
  cliffhanger: {
    title: "The Door Opens Inward",
    summary: "The seal cracked, the light inside was wrong, and something on the other side said a name nobody had spoken aloud.",
    worldFate: "There is a seam under Aelis now, and it is getting wider while everyone sleeps.",
    epitaph: "It knew one of their names. It has not used the others yet.",
    highlights: ["The name was one of theirs", "The countdown never reached zero", "Someone was already inside"]
  }
};

const LONG_SAMPLE = {
  title: "The Seventeen Bells of the Drowned Cathedral Ring Out at Last",
  summary:
    "It took every debt, every favour and every lie the party had ever told, and in the end the bells rang anyway — which is either a triumph or a warning, depending on which of them you ask about it afterwards.",
  worldFate:
    "Ys is above the water for the first time in four hundred years, and it is not clear that this was an improvement.",
  epitaph: "Seventeen bells. Five seals. Two of them holding.",
  highlights: [
    "The first bell woke the harbour",
    "A vow was broken to keep a better one",
    "The Cartographer was never found",
    "Two of the seals hold; five do not",
    "The tide has not gone out since",
    "Nobody has slept properly since either"
  ]
};

const NAMES = [
  { characterName: "Vess Aldemar", name: "Jo", color: "cyan" },
  { characterName: "Brother Quill", name: "Sam", color: "gold" },
  { characterName: "Sixteen-Teeth", name: "Ade", color: "#e0654f" },
  { characterName: "The Cartographer", name: "Min", color: "#7b6cff" },
  { characterName: "Hesper Vane", name: "Rue", color: "#4fd8a8" }
];

const FATES = [
  "Walked out first and did not look back at the water.",
  "Stayed to read the last rites over a bell that would not stop ringing.",
  "Took the ledger, the blame, and a very fast horse.",
  "Is still down there, drawing the parts of the map nobody asked for.",
  "Kept one promise out of three, which is better than the odds allowed."
];

const EPITHETS = ["Who Held the Line", "Of the Quiet Rites", "The Unpaid Debt", "Last of the Mapmakers", "Who Counted the Bells"];

function makePlayers(count: number): Player[] {
  return NAMES.slice(0, count).map((entry, index) => ({
    id: `p_${index}`,
    name: entry.name,
    characterName: entry.characterName,
    color: entry.color,
    background: "",
    personality: "",
    notes: "",
    status: "Ready",
    inventory: [],
    abilities: [],
    stats: [
      { name: "HP", value: index === 2 ? 0 : 9 + index * 3, maxValue: 24, color: "red" },
      { name: "Resolve", value: 6, maxValue: 10 }
    ]
  })) as Player[];
}

type RealSaga = {
  ending: CampaignEnding;
  players: Player[];
  title: string;
  musicTheme?: string;
};

type SagaChip = { id: string; title: string; endingKind?: string };

const chip = (active: boolean, tint: string): React.CSSProperties => ({
  color: active ? "#0a0a0a" : "#cfd6e6",
  background: active ? tint : "rgba(10,14,24,0.78)",
  border: `1px solid ${tint}55`,
  borderRadius: 999,
  padding: "3px 9px",
  textDecoration: "none",
  cursor: "pointer"
});

export default function OutroTest() {
  // Read after mount so the server and client render the same markup (the nav
  // links below embed the current params, which SSR cannot know).
  const [params, setParams] = useState(() => new URLSearchParams());
  useEffect(() => setParams(new URLSearchParams(window.location.search)), []);
  const kindParam = params.get("kind") || "victory";
  const kind = (KINDS.includes(kindParam as EndingKind) ? kindParam : "victory") as EndingKind;
  const themeParam = params.get("theme") || "";
  const long = params.get("long") === "1";
  const bare = params.get("bare") === "1";
  const playerCount = Math.max(0, Math.min(5, Number(params.get("players") ?? (long ? 5 : 4))));
  const campaignId = params.get("campaign") || "";

  // A real ended saga, when one is named — the genuine article, portraits and all.
  const [real, setReal] = useState<RealSaga | null>(null);
  useEffect(() => {
    if (!campaignId) {
      setReal(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/campaigns/${encodeURIComponent(campaignId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const campaign = data?.campaign;
        if (campaign?.ending) {
          setReal({
            ending: campaign.ending,
            players: campaign.players || [],
            title: campaign.title || "A Finished Saga",
            musicTheme: campaign.musicTheme
          });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  // Every completed saga on disk becomes a chip.
  const [sagas, setSagas] = useState<SagaChip[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/campaigns")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const list = (data?.campaigns || [])
          .filter((c: { status?: string; endingKind?: string }) => c.status === "completed" || c.endingKind)
          .map((c: { id: string; title: string; endingKind?: string }) => ({ id: c.id, title: c.title, endingKind: c.endingKind }));
        setSagas(list);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // A real saga carries its own theme unless the URL overrides it.
  const theme = (
    THEME_KEYS.includes(themeParam as ThemeKey) ? themeParam : real?.musicTheme && THEME_KEYS.includes(real.musicTheme as ThemeKey) ? real.musicTheme : "none"
  ) as ThemeKey;

  const href = (next: Partial<{ kind: string; theme: string; long: boolean; bare: boolean; campaign: string }>) => {
    const kindValue = next.kind ?? kind;
    const themeValue = next.theme ?? themeParam;
    const longValue = next.long ?? long;
    const bareValue = next.bare ?? bare;
    const campaignValue = next.campaign ?? campaignId;
    const parts = [
      campaignValue ? `campaign=${encodeURIComponent(campaignValue)}` : `kind=${kindValue}`,
      themeValue ? `theme=${themeValue}` : "",
      longValue ? "long=1" : "",
      bareValue ? "bare=1" : ""
    ].filter(Boolean);
    return `/outrotest?${parts.join("&")}`;
  };

  // K/T cycle kind and theme even mid-finale; L/B toggle content shape.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key !== "k" && key !== "t" && key !== "l" && key !== "b") return;
      const step = event.key === event.key.toUpperCase() ? -1 : 1;
      if (key === "k") {
        const next = KINDS[(KINDS.indexOf(kind) + step + KINDS.length) % KINDS.length];
        window.location.href = href({ kind: next, campaign: "" });
      } else if (key === "t") {
        const at = THEME_KEYS.indexOf(theme);
        const next = THEME_KEYS[(at + step + THEME_KEYS.length) % THEME_KEYS.length];
        window.location.href = href({ theme: next });
      } else if (key === "l") {
        window.location.href = href({ long: !long });
      } else if (key === "b") {
        window.location.href = href({ bare: !bare });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, theme, long, bare, campaignId]);

  const samplePlayers = useMemo(() => makePlayers(bare ? 2 : playerCount), [bare, playerCount]);

  const sampleEnding = useMemo<CampaignEnding>(() => {
    const base = long ? LONG_SAMPLE : SAMPLES[kind];
    return {
      kind,
      title: base.title,
      summary: base.summary,
      // `bare` is the worst-case shape: no world-fate line, no epitaph, so the
      // reel has to fall back to the per-kind copy and drop the FIN sub-line.
      worldFate: bare ? undefined : base.worldFate,
      epitaph: bare ? undefined : base.epitaph,
      endedAt: new Date().toISOString(),
      highlights: bare ? undefined : base.highlights,
      stats: bare
        ? undefined
        : [
            { label: "Battles Won", value: "12" },
            { label: "Natural 20s", value: "4" },
            { label: "Allies Made", value: "7" },
            { label: "Gold Squandered", value: "All of it" }
          ],
      cast: bare
        ? undefined
        : samplePlayers.map((player, index) => ({
            playerId: player.id,
            name: player.characterName,
            title: EPITHETS[index % EPITHETS.length],
            fate: FATES[index % FATES.length],
            stats: index % 2 ? [{ label: "Lies Told", value: String(3 + index) }] : undefined
          }))
    };
  }, [kind, long, bare, samplePlayers]);

  const ending = real?.ending || sampleEnding;
  const players = real?.players?.length ? real.players : samplePlayers;
  const campaignTitle = real?.title || (long ? "The Drowned Cathedral of Ys" : "A Test Saga");
  const activeKind = real?.ending?.kind || kind;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#020306" }}>
      <OutroTheater
        key={`${real ? campaignId : activeKind}-${theme}-${long}-${bare}-${players.length}`}
        ending={ending}
        players={players}
        campaignTitle={campaignTitle}
        theme={theme}
        onExit={() => undefined}
      />
      <div
        style={{
          position: "fixed",
          bottom: 8,
          left: 8,
          right: 8,
          zIndex: 99,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 5,
          fontFamily: "system-ui, sans-serif",
          fontSize: 11
        }}
      >
        {sagas.map((saga) => (
          <a key={saga.id} href={href({ campaign: saga.id })} style={chip(campaignId === saga.id, "#4fd8a8")} title={saga.id}>
            ◆ {saga.title}
            {saga.endingKind ? ` · ${saga.endingKind}` : ""}
          </a>
        ))}
        {KINDS.map((k) => (
          <a key={k} href={href({ kind: k, campaign: "" })} style={chip(!campaignId && k === kind, "#e6c378")}>
            {k}
          </a>
        ))}
        {THEME_KEYS.map((t) => (
          <a key={t} href={href({ theme: t })} style={chip(t === theme, "#7b6cff")}>
            {t}
          </a>
        ))}
        <a href={href({ long: !long })} style={chip(long, "#4fd8a8")}>
          long
        </a>
        <a href={href({ bare: !bare })} style={chip(bare, "#e0654f")}>
          bare
        </a>
        <span style={{ color: "#7d87a3", letterSpacing: "0.05em" }}>K kind · T theme · L long · B bare · click/Space advance · ← rewind · Home restart · Esc end</span>
      </div>
    </div>
  );
}
