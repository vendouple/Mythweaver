import type { Campaign } from "./types";

/**
 * The score's *instrumentation* flavor, chosen once per campaign from its
 * genre. It biases which music shelf plays: a "modern" campaign prefers
 * BGM/<mood>/modern/, a "fantasy" one BGM/<mood>/fantasy/, and so on. If a
 * themed shelf is empty the engine falls back to the neutral mood root, so
 * a theme never has to be fully stocked to be safe to set.
 *
 * The AI DM never touches this — it only ever picks *moods* (calm, tense,
 * battle…). The theme is orthogonal and fixed at campaign start.
 */
export type MusicTheme = "fantasy" | "scifi" | "horror" | "noir" | "modern" | "western";

export const MUSIC_THEMES: MusicTheme[] = ["fantasy", "scifi", "horror", "noir", "modern", "western"];

/** Whole-word-ish keyword signals per theme (matched case-insensitively). */
const THEME_KEYWORDS: Record<MusicTheme, string[]> = {
  fantasy: [
    "fantasy", "dragon", "wizard", "sorcer", "mage", "magic", "spell", "sword", "elf", "elves",
    "dwarf", "orc", "goblin", "kingdom", "castle", "dungeon", "knight", "rune", "tavern",
    "medieval", "enchant", "wyvern", "necromanc", "paladin", "druid", "arcane", "realm", "quest"
  ],
  scifi: [
    "sci-fi", "scifi", "science fiction", "space", "spaceship", "starship", "spacecraft", "alien",
    "robot", "android", "cyborg", "cyber", "cyberpunk", "laser", "plasma", "galaxy", "galactic",
    "planet", "orbital", "orbit", "mech", "warp", "hyperspace", "station", "nanite", "quantum",
    "colony", "hologram", "futuristic", "starfaring", "terraform", "AI core", "neural implant"
  ],
  horror: [
    "horror", "haunted", "haunting", "ghost", "undead", "zombie", "demon", "demonic", "eldritch",
    "cursed", "curse", "nightmare", "occult", "monster", "creature", "cult", "possess", "decay",
    "cosmic dread", "lovecraft", "vampire", "werewolf", "abomination", "flesh", "asylum", "grave"
  ],
  noir: [
    "noir", "detective", "private eye", "gumshoe", "hardboiled", "hard-boiled", "femme fatale",
    "precinct", "informant", "1920s", "1930s", "1940s", "prohibition", "mobster", "speakeasy",
    "whodunit", "murder mystery", "smoke-filled", "trench coat", "rain-slick"
  ],
  modern: [
    "spy", "espionage", "secret agent", "agency", "handler", "operative", "surveillance",
    "thriller", "terrorist", "hacker", "heist", "corporate", "conspiracy", "assassin", "sniper",
    "black ops", "special forces", "cartel", "smuggl", "encrypted", "wiretap", "cia", "fbi",
    "interpol", "contemporary", "present-day", "modern day", "megacity"
  ],
  western: [
    "western", "wild west", "frontier", "cowboy", "saloon", "sheriff", "outlaw", "gunslinger",
    "revolver", "six-shooter", "stagecoach", "ranch", "cattle", "prairie", "bounty hunter",
    "gold rush", "homestead", "desperado"
  ]
};

/**
 * Deterministically pick a music theme from a campaign's text. D&D is always
 * fantasy; other campaigns are scored by keyword hits across title, premise,
 * scene, overview, and NPC blurbs. Returns null when nothing scores (→ the
 * neutral mood roots play), which is the right answer for slice-of-life and
 * other genres we don't have a themed shelf for.
 */
export function classifyMusicTheme(campaign: Campaign): MusicTheme | null {
  if (campaign.campaignType === "dnd") return "fantasy";

  const haystack = [
    campaign.title,
    campaign.startingStory,
    campaign.currentScene,
    campaign.overview,
    campaign.memory,
    ...(campaign.storyCharacters || []).map((npc) => `${npc.name} ${npc.description}`)
  ]
    .join(" \n ")
    .toLowerCase();

  if (!haystack.trim()) return null;

  let best: MusicTheme | null = null;
  let bestScore = 0;
  for (const theme of MUSIC_THEMES) {
    let score = 0;
    for (const keyword of THEME_KEYWORDS[theme]) {
      if (haystack.includes(keyword)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = theme;
    }
  }
  // Require a small floor so one stray word doesn't lock a theme.
  return bestScore >= 1 ? best : null;
}
