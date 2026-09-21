/** Shared by model tools, persisted-state validation, and the stage preview UI. */
export const EFFECT_KINDS = [
  "shake", "flash", "embers", "fog", "rain", "snow", "darkness", "heartbeat",
  "shockwave", "heal", "glitch", "spotlight"
] as const;

export const SFX_CUES = [
  "beat", "heartbeat", "rumble", "flash", "darkness",
  "door-creak", "door-open", "door-close", "knock",
  "airlock-open", "airlock-close", "code-beep", "code-success", "code-denied",
  "alarm", "siren", "radio-static", "power-up", "power-down",
  "explosion", "gunshot", "laser", "impact", "debris", "glass-break",
  "sword", "arrow", "shield", "footsteps", "horse",
  "thunder", "fire-burst", "splash", "wind-gust",
  "magic", "portal", "spell-fail", "creature-roar", "whisper",
  "trap", "lock-click", "coin", "item-pickup", "heal",
  "reveal", "discovery", "quest-complete", "level-up", "spell-charge", "shield-break",
  "teleport", "glitch", "scan", "radio-call", "reload", "ricochet",
  "footsteps-stone", "footsteps-water", "footsteps-snow", "chain-rattle",
  "page-turn", "quill-write", "bell", "clock-tick", "crowd-gasp", "applause",
  "intro-rise", "outro-resolve"
] as const;

export const AMBIENCE_SOUNDS = [
  "none", "storm", "rain", "wind", "snow", "ocean", "water", "forest", "swamp", "desert", "insects", "birds",
  "cave", "dungeon", "tavern", "village", "castle", "city", "traffic", "crowd", "office", "industrial",
  "machinery", "electrical", "ventilation", "laboratory", "spaceship", "western-town", "wasteland",
  "battlefield", "fire", "supernatural", "underwater", "library", "cafe", "train", "harbor", "temple", "hospital"
] as const;

export const AMBIENCE_ACOUSTICS = [
  "outdoors", "indoors", "small-room", "large-hall", "cave", "distant", "muffled", "underwater"
] as const;
