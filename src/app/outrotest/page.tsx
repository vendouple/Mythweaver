"use client";

// Dev-only harness for eyeballing the Grand Outro without playing a saga to
// its close (same spirit as /weavetest):
//   /outrotest                              — victory, neutral theme
//   /outrotest?kind=defeat&theme=horror      — any kind x any theme
//   /outrotest?kind=cliffhanger&players=1    — worst-case content: one hero
//   /outrotest?long=1                        — 12-word title, 6 highlights, 5 players
//   /outrotest?bare=1                        — no highlights, no stats, no cast lines
//   /outrotest?plates=<campaignId>           — hold that saga's real painted scenes
//   (with no ?plates the shader's procedural field stands in, which is the
//    path a saga that never painted a backdrop actually takes)
// Not linked from anywhere.

import { useEffect, useMemo, useState } from "react";
import OutroTheater from "@/components/three/OutroTheater";
import type { CampaignEnding, EndingKind, Player } from "@/lib/campaign/types";
import type { ThemeKey } from "@/components/three/themeVisuals";

const KINDS: EndingKind[] = ["victory", "defeat", "bittersweet", "escape", "draw", "cliffhanger"];
const THEMES: ThemeKey[] = ["none", "fantasy", "scifi", "horror", "noir", "western", "postapoc"];

const SAMPLES: Record<EndingKind, Pick<CampaignEnding, "title" | "summary" | "highlights">> = {
  victory: {
    title: "The Weaver's Crown",
    summary: "Against every prophecy, the party stood at the world's hinge and pushed. The dark tide broke, and dawn kept its appointment.",
    highlights: ["The final roll was a natural 20", "The Adversary knelt at last", "The realm remembers its saviors"]
  },
  defeat: {
    title: "The Long Dark",
    summary: "The party gave everything, and it was not enough. The last torch guttered out in the deep, and the world above learned to whisper their names.",
    highlights: ["They fought to the final breath", "The Adversary's laughter still echoes", "Their story became a warning"]
  },
  bittersweet: {
    title: "The Price of Dawn",
    summary: "The city was saved, but not everyone walked out of the fire to see it. Victory tastes of ash and morning rain.",
    highlights: ["The ritual was broken — at a cost", "A hero stayed behind", "The survivors carry the flame"]
  },
  escape: {
    title: "Ashes at Our Heels",
    summary: "No one won. The party simply refused to be there when the ceiling came down, and the desert swallowed the rest.",
    highlights: ["The vault door shut behind them", "Nothing followed them out", "The map now has a blank space"]
  },
  draw: {
    title: "Neither Side Yielded",
    summary: "Two forces spent themselves down to the last ember and found the scales exactly level. The war simply stopped.",
    highlights: ["Both banners still stand", "The bargain holds — for now", "Nobody speaks of who started it"]
  },
  cliffhanger: {
    title: "The Door Opens Inward",
    summary: "The seal cracked, the light inside was wrong, and something on the other side said a name nobody had spoken aloud.",
    highlights: ["The name was one of theirs", "The countdown never reached zero", "Someone was already inside"]
  }
};

const LONG_SAMPLE = {
  title: "The Seventeen Bells of the Drowned Cathedral Ring Out at Last",
  summary:
    "It took every debt, every favour and every lie the party had ever told, and in the end the bells rang anyway — which is either a triumph or a warning, depending on which of them you ask about it afterwards.",
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

export default function OutroTest() {
  // Read after mount so the server and client render the same markup (the nav
  // links below embed the current params, which SSR cannot know).
  const [params, setParams] = useState(() => new URLSearchParams());
  useEffect(() => setParams(new URLSearchParams(window.location.search)), []);
  const kindParam = params.get("kind") || "victory";
  const kind = (KINDS.includes(kindParam as EndingKind) ? kindParam : "victory") as EndingKind;
  const themeParam = params.get("theme") || "none";
  const theme = (THEMES.includes(themeParam as ThemeKey) ? themeParam : "none") as ThemeKey;
  const long = params.get("long") === "1";
  const bare = params.get("bare") === "1";
  const playerCount = Math.max(0, Math.min(5, Number(params.get("players") ?? (long ? 5 : 3))));

  const players = useMemo(() => makePlayers(bare ? 2 : playerCount), [bare, playerCount]);

  // Real painted scenes from a saga on disk, when one is named. The asset route
  // serves them, so this exercises the same URLs the finale gets in production.
  const [plates, setPlates] = useState<string[]>([]);
  const plateCampaign = params.get("plates") || "";
  useEffect(() => {
    if (!plateCampaign) return;
    let cancelled = false;
    fetch(`/api/campaigns/${encodeURIComponent(plateCampaign)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const urls: string[] = (data?.campaign?.images || []).map((img: { url: string }) => img.url).filter(Boolean);
        setPlates(urls.slice(0, 4));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [plateCampaign]);

  const ending = useMemo<CampaignEnding>(() => {
    const base = long ? LONG_SAMPLE : SAMPLES[kind];
    return {
      kind,
      title: base.title,
      summary: base.summary,
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
        : players.map((player, index) => ({
            playerId: player.id,
            name: player.characterName,
            title: EPITHETS[index % EPITHETS.length],
            fate: FATES[index % FATES.length],
            stats: index % 2 ? [{ label: "Lies Told", value: String(3 + index) }] : undefined
          }))
    };
  }, [kind, long, bare, players]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#020306" }}>
      <OutroTheater
        key={`${kind}-${theme}-${long}-${bare}-${playerCount}`}
        ending={ending}
        players={players}
        campaignTitle={long ? "The Drowned Cathedral of Ys" : "A Test Saga"}
        theme={theme}
        plates={plates}
        onExit={() => undefined}
      />
      <div
        style={{
          position: "fixed",
          bottom: 8,
          left: 8,
          zIndex: 99,
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          fontFamily: "system-ui, sans-serif",
          fontSize: 11
        }}
      >
        {KINDS.map((k) => (
          <a
            key={k}
            href={`/outrotest?kind=${k}&theme=${theme}${long ? "&long=1" : ""}${bare ? "&bare=1" : ""}`}
            style={{
              color: k === kind ? "#0a0a0a" : "#cfd6e6",
              background: k === kind ? "#e6c378" : "rgba(10,14,24,0.75)",
              border: "1px solid rgba(230,195,120,0.35)",
              borderRadius: 999,
              padding: "3px 9px",
              textDecoration: "none"
            }}
          >
            {k}
          </a>
        ))}
        {THEMES.map((t) => (
          <a
            key={t}
            href={`/outrotest?kind=${kind}&theme=${t}${long ? "&long=1" : ""}${bare ? "&bare=1" : ""}`}
            style={{
              color: t === theme ? "#0a0a0a" : "#9aa4c0",
              background: t === theme ? "#7b6cff" : "rgba(10,14,24,0.75)",
              border: "1px solid rgba(123,108,255,0.3)",
              borderRadius: 999,
              padding: "3px 9px",
              textDecoration: "none"
            }}
          >
            {t}
          </a>
        ))}
        <a
          href={`/outrotest?kind=${kind}&theme=${theme}${long ? "" : "&long=1"}`}
          style={{
            color: long ? "#0a0a0a" : "#9aa4c0",
            background: long ? "#4fd8a8" : "rgba(10,14,24,0.75)",
            border: "1px solid rgba(79,216,168,0.3)",
            borderRadius: 999,
            padding: "3px 9px",
            textDecoration: "none"
          }}
        >
          long content
        </a>
        <a
          href={`/outrotest?kind=${kind}&theme=${theme}${bare ? "" : "&bare=1"}`}
          style={{
            color: bare ? "#0a0a0a" : "#9aa4c0",
            background: bare ? "#e0654f" : "rgba(10,14,24,0.75)",
            border: "1px solid rgba(224,101,79,0.3)",
            borderRadius: 999,
            padding: "3px 9px",
            textDecoration: "none"
          }}
        >
          bare content
        </a>
      </div>
    </div>
  );
}
