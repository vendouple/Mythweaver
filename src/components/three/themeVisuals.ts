import type { MusicTheme } from "@/lib/campaign/musicTheme";

/**
 * The visual identity of each campaign theme — one spec drives the lobby
 * cosmos, the Weaving loom, the stage atmosphere tint, and the UI copy, so
 * a "scifi" saga looks scifi from the first lobby frame to the last credits.
 * "none" is the neutral Astral Table used before a theme exists (portal,
 * create wizard, sealed envelopes).
 */
export type ThemeKey = MusicTheme | "none";

/**
 * Per-genre motion personality of the Weaving loom — how the unassembled
 * halo swirls and drifts (rising fantasy embers, noir rain, post-apoc ash),
 * how the glyph rings precess and sway, how the camera orbits, and whether
 * the light gutters (horror candles, wasteland reactors).
 */
export type LoomMotion = {
  /** Halo orbit speed multiplier (1 = stately). */
  swirl: number;
  /** Vertical drift of unassembled motes; positive rises, negative falls. */
  rise: number;
  /** Jitter amplitude of unassembled motes. */
  wobble: number;
  /** Glyph ring precession speed multiplier. */
  ringSpeed: number;
  /** Ring tilt sway amplitude (radians, small). */
  ringSway: number;
  /** Camera orbit speed. */
  orbit: number;
  /** 0..1 irregular light gutter. */
  flicker: number;
};

export type ThemeVisual = {
  key: ThemeKey;
  /** Primary glow — dust, dice edges, key light, glyph rings. */
  accent: string;
  accentBright: string;
  /** Counterpart color — rim light, loom threads, second nebula. */
  secondary: string;
  /** Scene fog / depth color. */
  fog: string;
  fogDensity: number;
  ambient: string;
  /** Star-dust behavior: color, size, and a constant wind (x, y per second). */
  dust: { color: string; size: number; flow: [number, number] };
  /** Three nebula glows, back of the scene. */
  nebulae: [string, string, string];
  /** Signature full-scene layer, one per theme. */
  effect: "aurora" | "warp" | "haunt" | "rain" | "bokeh" | "frontier" | "none";
  /** Drifting dice-moon materials. */
  dice: { body: string; roughness: number; metalness: number; opacity: number; edge: string; edgeOpacity: number };
  /** Glyph alphabet worn by the loom's great rings. */
  glyphs: string;
  glyphFont: string;
  /** Loom of Worlds palette and motion personality. */
  loom: { heart: string; world: string; wireBoost: number; motion: LoomMotion };
  copy: {
    kicker: string;
    join: string;
    reconnect: string;
    /** A hero's thread is woven out after a disconnect timeout. */
    depart: string;
    gathering: string;
    joinGathering: string;
  };
};

export const THEME_VISUALS: Record<ThemeKey, ThemeVisual> = {
  none: {
    key: "none",
    accent: "#c9a35c",
    accentBright: "#e6c378",
    secondary: "#7b6cff",
    fog: "#05070d",
    fogDensity: 0.055,
    ambient: "#2a3350",
    dust: { color: "#c9a35c", size: 0.045, flow: [0, 0] },
    nebulae: ["#7b6cff", "#c9a35c", "#4c8cb4"],
    effect: "none",
    dice: { body: "#0d1322", roughness: 0.35, metalness: 0.75, opacity: 1, edge: "#c9a35c", edgeOpacity: 0.5 },
    glyphs: "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ",
    glyphFont: "44px serif",
    loom: {
      heart: "230,195,120", world: "#0b1020", wireBoost: 1,
      motion: { swirl: 1, rise: 0, wobble: 1, ringSpeed: 1, ringSway: 0.02, orbit: 0.05, flicker: 0 }
    },
    copy: {
      kicker: "The Weaving begins",
      join: "A new hero is woven in",
      reconnect: "A lost thread returns to the loom",
      depart: "A thread slips loose from the loom",
      gathering: "The threads are gathering…",
      joinGathering: "The loom makes room for another…"
    }
  },
  fantasy: {
    key: "fantasy",
    accent: "#e0b25f",
    accentBright: "#ffe2a1",
    secondary: "#8d7fff",
    fog: "#060810",
    fogDensity: 0.05,
    ambient: "#2e3252",
    dust: { color: "#ffd98a", size: 0.05, flow: [0, 0.12] },
    nebulae: ["#8d7fff", "#e0b25f", "#4fd8a8"],
    effect: "aurora",
    dice: { body: "#141126", roughness: 0.3, metalness: 0.8, opacity: 1, edge: "#ffd98a", edgeOpacity: 0.65 },
    glyphs: "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ",
    glyphFont: "44px serif",
    loom: {
      heart: "255,214,138", world: "#0d1024", wireBoost: 1.1,
      // Rising embers, a graceful waltz of a swirl.
      motion: { swirl: 1.3, rise: 0.35, wobble: 1.15, ringSpeed: 1, ringSway: 0.035, orbit: 0.06, flicker: 0 }
    },
    copy: {
      kicker: "The Weaving begins",
      join: "A new hero is woven in",
      reconnect: "A lost thread returns to the loom",
      depart: "A thread slips loose from the loom",
      gathering: "The threads are gathering…",
      joinGathering: "The loom makes room for another…"
    }
  },
  scifi: {
    key: "scifi",
    accent: "#4fd8ff",
    accentBright: "#a8ecff",
    secondary: "#ff4fa8",
    fog: "#020610",
    fogDensity: 0.045,
    ambient: "#16324a",
    dust: { color: "#7fe2ff", size: 0.042, flow: [0, 0] },
    nebulae: ["#2450c8", "#ff4fa8", "#4fd8ff"],
    effect: "warp",
    dice: { body: "#04101c", roughness: 0.15, metalness: 0.4, opacity: 0.22, edge: "#4fd8ff", edgeOpacity: 0.95 },
    glyphs: "0123456789ABCDEF∆◇",
    glyphFont: "40px monospace",
    loom: {
      heart: "120,220,255", world: "#04101e", wireBoost: 1.8,
      // Fast, precise, machine-steady: quick rings, no jitter, brisk camera.
      motion: { swirl: 2.3, rise: 0, wobble: 0.35, ringSpeed: 1.8, ringSway: 0.012, orbit: 0.085, flicker: 0 }
    },
    copy: {
      kicker: "Reality compiles",
      join: "A new signal joins the constellation",
      reconnect: "Signal reacquired — re-syncing",
      depart: "Signal lost — sealing the airlock",
      gathering: "Assembling the starfield…",
      joinGathering: "Docking a new arrival…"
    }
  },
  horror: {
    key: "horror",
    accent: "#9fb86a",
    accentBright: "#c9dd8f",
    secondary: "#b3202a",
    fog: "#050303",
    fogDensity: 0.075,
    ambient: "#1c2418",
    dust: { color: "#8a9a6a", size: 0.04, flow: [0, 0.22] },
    nebulae: ["#3d0f14", "#41501f", "#20262c"],
    effect: "haunt",
    dice: { body: "#160f0d", roughness: 0.9, metalness: 0.1, opacity: 1, edge: "#9fb86a", edgeOpacity: 0.4 },
    glyphs: "†‡☽☾ΨΦΘΞΔϟζξ",
    glyphFont: "44px serif",
    loom: {
      heart: "170,200,110", world: "#100a08", wireBoost: 0.8,
      // Slow sinking dread; rings list like a derelict; candlelight gutters.
      motion: { swirl: 0.55, rise: -0.25, wobble: 2.4, ringSpeed: 0.45, ringSway: 0.09, orbit: 0.03, flicker: 0.8 }
    },
    copy: {
      kicker: "Something stirs in the dark",
      join: "Another soul wanders in",
      reconnect: "A lost soul claws its way back",
      depart: "The dark swallows a soul whole",
      gathering: "The shadows are knitting together…",
      joinGathering: "The dark makes room…"
    }
  },
  noir: {
    key: "noir",
    accent: "#d9c69a",
    accentBright: "#f2e3bb",
    secondary: "#5f7285",
    fog: "#04050a",
    fogDensity: 0.06,
    ambient: "#242a34",
    dust: { color: "#aebdd6", size: 0.032, flow: [0.05, -0.05] },
    nebulae: ["#2a3542", "#d9c69a", "#141a22"],
    effect: "rain",
    dice: { body: "#0c0d12", roughness: 0.2, metalness: 0.9, opacity: 1, edge: "#d9c69a", edgeOpacity: 0.42 },
    glyphs: "?!•§¶†×—",
    glyphFont: "42px monospace",
    loom: {
      heart: "217,198,154", world: "#0b0d13", wireBoost: 0.9,
      // Rain streaks down past the streetlamp; a faint neon buzz in the light.
      motion: { swirl: 0.45, rise: -0.9, wobble: 0.55, ringSpeed: 0.55, ringSway: 0.015, orbit: 0.035, flicker: 0.2 }
    },
    copy: {
      kicker: "The case file opens",
      join: "A new face walks into the precinct",
      reconnect: "An old face steps back out of the rain",
      depart: "A silhouette fades into the rain",
      gathering: "Smoke curls under the streetlamp…",
      joinGathering: "Someone new takes a seat in the back…"
    }
  },
  modern: {
    key: "modern",
    accent: "#4fe0c4",
    accentBright: "#9df2e1",
    secondary: "#ff9a3c",
    fog: "#030809",
    fogDensity: 0.05,
    ambient: "#183434",
    dust: { color: "#7fe8d4", size: 0.038, flow: [0.08, 0] },
    nebulae: ["#0f3c3c", "#ff9a3c", "#274a6a"],
    effect: "bokeh",
    dice: { body: "#0a1014", roughness: 0.15, metalness: 0.65, opacity: 1, edge: "#4fe0c4", edgeOpacity: 0.55 },
    glyphs: "0123456789°′″NSEW·",
    glyphFont: "40px monospace",
    loom: {
      heart: "110,235,205", world: "#081014", wireBoost: 1.4,
      motion: { swirl: 1.6, rise: 0.1, wobble: 0.6, ringSpeed: 1.25, ringSway: 0.02, orbit: 0.07, flicker: 0 }
    },
    copy: {
      kicker: "The operation goes live",
      join: "A new operative is being briefed",
      reconnect: "Re-establishing the uplink",
      depart: "An asset goes dark — covering their exit",
      gathering: "Assets are moving into position…",
      joinGathering: "Clearing a new asset…"
    }
  },
  western: {
    key: "western",
    accent: "#ffb35c",
    accentBright: "#ffd9a0",
    secondary: "#c4573a",
    fog: "#0a0503",
    fogDensity: 0.05,
    ambient: "#3a2414",
    dust: { color: "#d9a976", size: 0.05, flow: [0.55, 0.04] },
    nebulae: ["#c4573a", "#ffb35c", "#4a2a1a"],
    effect: "frontier",
    dice: { body: "#170f0a", roughness: 0.6, metalness: 0.4, opacity: 1, edge: "#d9964a", edgeOpacity: 0.55 },
    glyphs: "★✶✦☆♠♦†$",
    glyphFont: "42px serif",
    loom: {
      heart: "255,179,92", world: "#160d06", wireBoost: 1,
      // Dust on a hot wind; campfire flicker in the light.
      motion: { swirl: 1.1, rise: 0.12, wobble: 1.5, ringSpeed: 0.8, ringSway: 0.045, orbit: 0.045, flicker: 0.3 }
    },
    copy: {
      kicker: "The frontier awakens",
      join: "A stranger rides into town",
      reconnect: "A familiar silhouette returns at dusk",
      depart: "A rider vanishes over the ridge",
      gathering: "Dust rises on the horizon…",
      joinGathering: "Hoofbeats approach the camp…"
    }
  },
  postapoc: {
    key: "postapoc",
    accent: "#d98a3c",
    accentBright: "#ffc27a",
    secondary: "#9fd23c",
    fog: "#0a0806",
    fogDensity: 0.065,
    ambient: "#2e2a20",
    dust: { color: "#b09a7a", size: 0.055, flow: [0.4, 0.08] },
    nebulae: ["#5a3a1a", "#9fd23c", "#3a3430"],
    effect: "frontier",
    dice: { body: "#141210", roughness: 0.85, metalness: 0.3, opacity: 1, edge: "#d98a3c", edgeOpacity: 0.5 },
    glyphs: "☢☣▲✚Ø×∅≡",
    glyphFont: "42px monospace",
    loom: {
      heart: "217,138,60", world: "#12100c", wireBoost: 0.9,
      // Ash sifts down; the world knits together under a failing reactor glow.
      motion: { swirl: 0.8, rise: -0.55, wobble: 1.9, ringSpeed: 0.7, ringSway: 0.055, orbit: 0.04, flicker: 0.45 }
    },
    copy: {
      kicker: "The old world stirs",
      join: "A survivor crests the ridge",
      reconnect: "A survivor limps back to the fire",
      depart: "A survivor's trail goes cold",
      gathering: "Ash settles over the meeting ground…",
      joinGathering: "Another silhouette against the dust…"
    }
  },
  cyberpunk: {
    key: "cyberpunk",
    // Hot magenta on cold cyan — the neon-and-acid-rain palette.
    accent: "#ff2fb9",
    accentBright: "#ff9ae0",
    secondary: "#2ff5ff",
    fog: "#07030f",
    fogDensity: 0.07,
    ambient: "#2a1240",
    dust: { color: "#ff6fd0", size: 0.036, flow: [0.06, -0.5] },
    nebulae: ["#7a0fbf", "#2ff5ff", "#ff2fb9"],
    effect: "rain",
    dice: { body: "#0b0416", roughness: 0.12, metalness: 0.55, opacity: 0.3, edge: "#ff2fb9", edgeOpacity: 0.95 },
    glyphs: "01∎▚▞◤◥╱╲ｱｲｳﬁ",
    glyphFont: "38px monospace",
    loom: {
      heart: "255,90,210", world: "#0d0518", wireBoost: 1.9,
      // Rain down the neon canyon, but the machine drive is fast and jittery.
      motion: { swirl: 1.9, rise: -0.8, wobble: 0.75, ringSpeed: 1.9, ringSway: 0.018, orbit: 0.08, flicker: 0.35 }
    },
    copy: {
      kicker: "Jacking in",
      join: "A new runner spoofs the door",
      reconnect: "Reconnecting — signal scrubbed clean",
      depart: "A runner flatlines off the grid",
      gathering: "The crew assembles in the sprawl…",
      joinGathering: "Someone new buys into the run…"
    }
  },
  spaceopera: {
    key: "spaceopera",
    // Imperial gold against deep royal blue: grand, ceremonial, vast.
    accent: "#ffd76a",
    accentBright: "#fff2c4",
    secondary: "#5a7bff",
    fog: "#02040e",
    fogDensity: 0.038,
    ambient: "#1b2452",
    dust: { color: "#cfd8ff", size: 0.04, flow: [0.02, 0.05] },
    nebulae: ["#3a3ac8", "#ffd76a", "#a03ad0"],
    effect: "warp",
    dice: { body: "#070b1c", roughness: 0.2, metalness: 0.85, opacity: 1, edge: "#ffd76a", edgeOpacity: 0.7 },
    glyphs: "✦✧★⬡⬢◈❖⟡ΑΩΣΛ",
    glyphFont: "42px serif",
    loom: {
      heart: "255,215,106", world: "#080d20", wireBoost: 1.5,
      // Stately as a fleet under sail: broad slow swirl, majestic camera.
      motion: { swirl: 1.5, rise: 0.08, wobble: 0.4, ringSpeed: 1.15, ringSway: 0.025, orbit: 0.055, flicker: 0 }
    },
    copy: {
      kicker: "The fleet makes way",
      join: "A new star joins the formation",
      reconnect: "Comms restored — welcome back aboard",
      depart: "A ship falls out of formation",
      gathering: "The armada gathers at the jump point…",
      joinGathering: "Clearing another ship to dock…"
    }
  },
  gothic: {
    key: "gothic",
    // Blood-wine crimson and cold moonlit silver.
    accent: "#b8324a",
    accentBright: "#e88a9c",
    secondary: "#9aa8c4",
    fog: "#060407",
    fogDensity: 0.082,
    ambient: "#241a2c",
    dust: { color: "#c9a8bc", size: 0.042, flow: [0.03, -0.14] },
    nebulae: ["#3e0f22", "#5a4a70", "#b8324a"],
    effect: "haunt",
    dice: { body: "#12080f", roughness: 0.55, metalness: 0.35, opacity: 1, edge: "#b8324a", edgeOpacity: 0.6 },
    glyphs: "✝♰♱☩⚜❦❧☙⁂†",
    glyphFont: "46px serif",
    loom: {
      heart: "200,70,95", world: "#120a12", wireBoost: 0.95,
      // A slow waltz in a draughty hall; candles gutter but never gust.
      motion: { swirl: 0.7, rise: -0.15, wobble: 1.3, ringSpeed: 0.6, ringSway: 0.06, orbit: 0.032, flicker: 0.55 }
    },
    copy: {
      kicker: "The house opens its doors",
      join: "Another guest is admitted",
      reconnect: "A guest returns from the east wing",
      depart: "A guest is shown out — and not seen again",
      gathering: "The candles are being lit…",
      joinGathering: "Another place is set at the table…"
    }
  },
  urbanfantasy: {
    key: "urbanfantasy",
    // Streetlight sodium against faerie violet — two worlds in one frame.
    accent: "#a86cff",
    accentBright: "#d9bcff",
    secondary: "#ffb04f",
    fog: "#060512",
    fogDensity: 0.058,
    ambient: "#2a2246",
    dust: { color: "#c9a6ff", size: 0.044, flow: [0.05, 0.1] },
    nebulae: ["#5a2ab0", "#ffb04f", "#2a4a8a"],
    effect: "bokeh",
    dice: { body: "#100b1e", roughness: 0.3, metalness: 0.6, opacity: 1, edge: "#a86cff", edgeOpacity: 0.7 },
    glyphs: "✷✸❋⟠⟁⧉⧗ᛝᛞ☾",
    glyphFont: "42px serif",
    loom: {
      heart: "170,110,255", world: "#0e0a1c", wireBoost: 1.25,
      // City hum with a glamour on it: brisk but with a magical wobble.
      motion: { swirl: 1.35, rise: 0.2, wobble: 1.05, ringSpeed: 1.1, ringSway: 0.04, orbit: 0.06, flicker: 0.18 }
    },
    copy: {
      kicker: "The veil thins",
      join: "Another initiate steps through",
      reconnect: "A warded soul finds the door again",
      depart: "The city swallows another name",
      gathering: "Sigils are waking under the streetlights…",
      joinGathering: "The circle widens for one more…"
    }
  },
  steampunk: {
    key: "steampunk",
    // Polished brass and boiler-fire copper, with verdigris in the shadows.
    accent: "#d9a04a",
    accentBright: "#ffdca0",
    secondary: "#4fb8a8",
    fog: "#0a0705",
    fogDensity: 0.068,
    ambient: "#3a2c1c",
    dust: { color: "#d9bc8a", size: 0.048, flow: [0.16, 0.14] },
    nebulae: ["#7a4a1a", "#4fb8a8", "#4a3520"],
    effect: "frontier",
    dice: { body: "#1a120a", roughness: 0.4, metalness: 0.95, opacity: 1, edge: "#d9a04a", edgeOpacity: 0.7 },
    glyphs: "⚙⚗⌘✜⊕⊗№℧Ω",
    glyphFont: "42px serif",
    loom: {
      heart: "230,170,90", world: "#150f08", wireBoost: 1.15,
      // Geared and deliberate: everything turns, nothing drifts. Boiler glow.
      motion: { swirl: 1.05, rise: 0.3, wobble: 0.5, ringSpeed: 1.45, ringSway: 0.022, orbit: 0.05, flicker: 0.25 }
    },
    copy: {
      kicker: "The boilers come to pressure",
      join: "A new hand signs the manifest",
      reconnect: "A hand returns to their station",
      depart: "A berth is struck from the manifest",
      gathering: "The gears are taking up their slack…",
      joinGathering: "Another berth is made ready…"
    }
  },
  pirate: {
    key: "pirate",
    // Sun-bleached gold on deep sea teal.
    accent: "#f2c15c",
    accentBright: "#ffe8a8",
    secondary: "#2f9aa8",
    fog: "#03080c",
    fogDensity: 0.052,
    ambient: "#1a3a42",
    dust: { color: "#a8d8dc", size: 0.046, flow: [0.35, 0.06] },
    nebulae: ["#1a5a68", "#f2c15c", "#0f3040"],
    effect: "frontier",
    dice: { body: "#0d1418", roughness: 0.5, metalness: 0.55, opacity: 1, edge: "#f2c15c", edgeOpacity: 0.65 },
    glyphs: "☠⚓✠❈✷⊛†×∴",
    glyphFont: "42px serif",
    loom: {
      heart: "242,193,92", world: "#0a1418", wireBoost: 1.05,
      // A deck under a long swell: big rolling wobble, salt wind, lamp sway.
      motion: { swirl: 1.2, rise: 0.18, wobble: 2.1, ringSpeed: 0.85, ringSway: 0.07, orbit: 0.048, flicker: 0.3 }
    },
    copy: {
      kicker: "The anchor comes up",
      join: "A new hand climbs aboard",
      reconnect: "A hand hauled back over the rail",
      depart: "A name struck from the ship's articles",
      gathering: "The crew musters on deck…",
      joinGathering: "Another berth swings in the hold…"
    }
  },
  eastasian: {
    key: "eastasian",
    // Cinnabar and jade — lacquer, ink, and blossom.
    accent: "#e8563c",
    accentBright: "#ffab8f",
    secondary: "#4fc99a",
    fog: "#05070a",
    fogDensity: 0.055,
    ambient: "#22323a",
    dust: { color: "#ffc4c9", size: 0.05, flow: [0.12, 0.06] },
    nebulae: ["#8a1f2a", "#4fc99a", "#2a3a54"],
    effect: "aurora",
    dice: { body: "#120c0c", roughness: 0.35, metalness: 0.6, opacity: 1, edge: "#e8563c", edgeOpacity: 0.7 },
    glyphs: "道天龍氣心風雷山水火月",
    glyphFont: "40px serif",
    loom: {
      heart: "232,86,60", world: "#0d1014", wireBoost: 1.2,
      // Petals on a mountain draft: unhurried, poised, precise.
      motion: { swirl: 1.15, rise: 0.28, wobble: 0.85, ringSpeed: 0.95, ringSway: 0.03, orbit: 0.05, flicker: 0.1 }
    },
    copy: {
      kicker: "The scroll unrolls",
      join: "A new disciple bows in",
      reconnect: "A disciple returns to the courtyard",
      depart: "A disciple walks the road alone",
      gathering: "The courtyard fills in silence…",
      joinGathering: "Another cup is poured…"
    }
  },
  superhero: {
    key: "superhero",
    // Primary-color comic energy: heroic red-orange and sky blue.
    accent: "#ff4f3c",
    accentBright: "#ffb0a0",
    secondary: "#2f9cff",
    fog: "#04070f",
    fogDensity: 0.042,
    ambient: "#1f3a5a",
    dust: { color: "#ffe07a", size: 0.05, flow: [0.1, 0.3] },
    nebulae: ["#2f5ad0", "#ffd23c", "#ff4f3c"],
    effect: "bokeh",
    dice: { body: "#0a1020", roughness: 0.22, metalness: 0.7, opacity: 1, edge: "#ff4f3c", edgeOpacity: 0.8 },
    glyphs: "★✦⚡✷✸◆▲!?※",
    glyphFont: "44px sans-serif",
    loom: {
      heart: "255,110,80", world: "#0a1020", wireBoost: 1.6,
      // Big, bright, fast — the world assembles like a splash page.
      motion: { swirl: 2.0, rise: 0.5, wobble: 0.6, ringSpeed: 1.7, ringSway: 0.03, orbit: 0.09, flicker: 0 }
    },
    copy: {
      kicker: "The signal goes up",
      join: "A new cape answers the call",
      reconnect: "Comms back up — welcome back to the team",
      depart: "A hero goes off the grid",
      gathering: "The team is assembling…",
      joinGathering: "One more answers the call…"
    }
  },
  pulp: {
    key: "pulp",
    // Aged newsprint amber and jungle green — serial-adventure sepia.
    accent: "#e8a33c",
    accentBright: "#ffd48f",
    secondary: "#5a9a4f",
    fog: "#080604",
    fogDensity: 0.058,
    ambient: "#38301c",
    dust: { color: "#d9c08a", size: 0.05, flow: [0.28, 0.1] },
    nebulae: ["#6a4a1a", "#5a9a4f", "#3a2a18"],
    effect: "frontier",
    dice: { body: "#161008", roughness: 0.55, metalness: 0.45, opacity: 1, edge: "#e8a33c", edgeOpacity: 0.6 },
    glyphs: "✈☀✜✠※◈☼⚒",
    glyphFont: "42px serif",
    loom: {
      heart: "232,163,60", world: "#141008", wireBoost: 1.1,
      // Breathless serial pacing: quick swirl, propeller-wash wobble.
      motion: { swirl: 1.7, rise: 0.22, wobble: 1.4, ringSpeed: 1.2, ringSway: 0.045, orbit: 0.075, flicker: 0.2 }
    },
    copy: {
      kicker: "The expedition sets out",
      join: "Another adventurer signs on",
      reconnect: "An adventurer stumbles back into camp",
      depart: "An adventurer is lost to the jungle",
      gathering: "The expedition assembles at the airfield…",
      joinGathering: "One more seat on the plane…"
    }
  },
  cozy: {
    key: "cozy",
    // Hearth amber and soft sage — lamplight, wool, and rain on a window.
    accent: "#f2b46a",
    accentBright: "#ffe0b8",
    secondary: "#8fbf8a",
    fog: "#0a0806",
    fogDensity: 0.04,
    ambient: "#3e3428",
    dust: { color: "#ffd9a8", size: 0.052, flow: [0.03, 0.08] },
    nebulae: ["#8a6a3a", "#8fbf8a", "#5a4a6a"],
    effect: "bokeh",
    dice: { body: "#1a1410", roughness: 0.7, metalness: 0.15, opacity: 1, edge: "#f2b46a", edgeOpacity: 0.5 },
    glyphs: "❀✿❁☘♡✧⁕✤❃",
    glyphFont: "42px serif",
    loom: {
      heart: "242,180,106", world: "#181208", wireBoost: 0.85,
      // The gentlest personality in the set: everything drifts, nothing rushes.
      motion: { swirl: 0.5, rise: 0.16, wobble: 0.7, ringSpeed: 0.45, ringSway: 0.03, orbit: 0.028, flicker: 0.12 }
    },
    copy: {
      kicker: "The kettle goes on",
      join: "Someone new pulls up a chair",
      reconnect: "A familiar face is back — kettle's still warm",
      depart: "Someone heads home for the night",
      gathering: "Chairs are being pulled around the table…",
      joinGathering: "Room for one more at the table…"
    }
  }
};

/** Every theme key, in declaration order — for dev galleries and pickers. */
export const THEME_KEYS = Object.keys(THEME_VISUALS) as ThemeKey[];

export function themeVisual(theme: ThemeKey | string | null | undefined): ThemeVisual {
  return THEME_VISUALS[(theme || "none") as ThemeKey] || THEME_VISUALS.none;
}
