export type Role = "system" | "user" | "assistant" | "tool";
export type CampaignType = "tabletop" | "dnd";

/** How often the DM should call for d20 checks. */
export type RollMode = "light" | "standard" | "heavy" | "all";

/** Campaign challenge tuning — shifts DCs, damage willingness, enemy competence. */
export type Difficulty = "easy" | "medium" | "hard" | "insane";

/**
 * How the saga closed (or is closing).
 *   victory     – the party won
 *   defeat      – the party lost / died / failed
 *   bittersweet – mixed result, gains paid for in losses
 *   escape      – survived by fleeing; the threat remains
 *   draw        – stalemate; neither side prevailed
 *   cliffhanger – the story stops mid-breath, deliberately unresolved
 */
export type EndingKind = "victory" | "defeat" | "bittersweet" | "escape" | "draw" | "cliffhanger";

/**
 * High-level loading phase the host PC uses to drive the timeline UI.
 * The DM/server writes this so the loading bar stays in lockstep with what
 * is actually happening (no more "painting image" while we are forging stats).
 *
 *   signal     – contacting Aqua / spinning up the DM
 *   world      – writing world lore / opening narrative
 *   scene      – composing the opening playable beat
 *   image      – painting a cinematic background or portrait
 *   sheet      – forging stats / inventory / abilities
 *   integrate  – splicing a player into the live timeline
 *   live       – about to hand control back to the table
 */
export type DmPhase =
  | "signal"
  | "world"
  | "scene"
  | "image"
  | "sheet"
  | "integrate"
  | "live";

export type PlayerStat = {
  name: string;
  value: number;
  maxValue: number;
  color?: string;
};

export type Player = {
  id: string;
  name: string;
  characterName?: string;
  background?: string;
  personality?: string;
  portraitUrl?: string;
  portraitPrompt?: string;
  status?: string;
  joinedAt?: string;
  inventory: string[];
  abilities: string[];
  notes: string;
  stats: PlayerStat[];
  color?: string;
};

export type StoryCharacter = {
  id: string;
  name: string;
  description: string;
  claimedByPlayerId?: string;
  portraitUrl?: string;
  status?: string;
  stats?: PlayerStat[];
  inventory?: string[];
  abilities?: string[];
  color?: string;
};

export type SuggestedAction = {
  title: string;
  prompt: string;
};

export type MessageSegment = {
  speaker: "narrator" | "npc" | "system" | "player";
  name?: string;
  content: string;
};

/**
 * Server-judged d20 result spectrum. Not binary — margin vs DC matters.
 *   critical-success  – natural 20
 *   strong-success    – beat DC by 5+
 *   success           – meet/beat DC by 0–4
 *   partial-success   – miss by 1–4 (progress with a cost) — only when difficulty allows
 *   failure           – miss by 1–4 (or any miss when partials are off)
 *   hard-failure      – miss by 5+
 *   critical-failure  – natural 1
 */
export type DiceOutcome =
  | "critical-success"
  | "strong-success"
  | "success"
  | "partial-success"
  | "failure"
  | "hard-failure"
  | "critical-failure";

export type DiceEvent = {
  notation: string;
  reason: string;
  rolls: number[];
  modifier: number;
  total: number;
  d20Mode?: "normal" | "advantage" | "disadvantage";
  /** Difficulty class the check was judged against (server-side). */
  dc?: number;
  /** How far the total sits from the DC (total - dc). Positive = over. */
  margin?: number;
  /** Server-judged result of the check — the narrator cannot fudge this. */
  outcome?: DiceOutcome;
  /** True when this roll is for an NPC/enemy (not a player). */
  isNpc?: boolean;
};

export type DisplayEvent = {
  id: string;
  type: "narration" | "dialogue" | "playerAction" | "dice" | "scene" | "system";
  speaker?: string;
  playerId?: string;
  content?: string;
  dice?: DiceEvent;
  itemUsed?: string;
  abilityUsed?: string;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  role: Role;
  name?: string;
  content: string;
  segments?: MessageSegment[];
  createdAt: string;
};

/**
 * Mood palette the DM can set with the set_ambience tool. The host TV maps
 * each mood to a particle palette, fog density, color grade, and music bias.
 * "outro" is reserved for the closing credits after the campaign ends.
 */
export type AmbienceMood =
  | "calm"
  | "tense"
  | "battle"
  | "mystery"
  | "dread"
  | "triumph"
  | "wonder"
  | "somber"
  | "outro";

export type Ambience = {
  mood: AmbienceMood;
  /** 0..1 — how strongly the TV leans into the mood (particles, grade, pulse). */
  intensity: number;
  /** Optional flavor note, e.g. "rain hammers the tin roof". */
  note?: string;
  updatedAt: string;
};

export type StageEffectKind =
  | "shake"
  | "flash"
  | "embers"
  | "fog"
  | "rain"
  | "snow"
  | "darkness"
  | "heartbeat";

/** Cinematic effect queued by the DM via trigger_effect. Supports repeats. */
export type StageEffect = {
  id: string;
  kind: StageEffectKind;
  /** 0..1 strength. */
  strength: number;
  /** How many times to fire (default 1). */
  repeat?: number;
  /** Delay in ms between repeats (default 0). */
  delayMs?: number;
  createdAt: string;
};

export type SceneImage = {
  id: string;
  url: string;
  prompt: string;
  createdAt: string;
};

export type PortraitImage = {
  id: string;
  url: string;
  prompt: string;
  characterName: string;
  createdAt: string;
};

/** One line of the outro's stats board, e.g. { label: "Dragons Slain", value: "1" }. */
export type EndingStat = {
  label: string;
  value: string;
};

/** Snapshot shown on the TV outro cinematic after the campaign ends. */
export type CampaignEnding = {
  kind: EndingKind;
  /** Short title, e.g. "The Fat Man Falls" or "Veridia Burns". */
  title: string;
  /** 1–3 sentence epilogue. */
  summary: string;
  /** When the ending was sealed. */
  endedAt: string;
  /** Optional highlight lines for the credits (key moments, final fates). */
  highlights?: string[];
  /** Optional campaign statistics for the outro's stats board. */
  stats?: EndingStat[];
};

export type Campaign = {
  id: string;
  title: string;
  joinCode: string;
  /** lobby → active → completed (after win/loss credits). */
  status: "lobby" | "active" | "completed";
  hostStartedAt?: string;
  hostActiveAt?: string;
  partyLeaderId?: string;
  players: Player[];
  startingStory: string;
  storyCharacters: StoryCharacter[];
  currentScene: string;
  overview: string;
  displayEvents: DisplayEvent[];
  suggestedActions: SuggestedAction[];
  playerActions: Record<string, SuggestedAction[]>;
  partyActions: SuggestedAction[];
  memory: string;
  images: SceneImage[];
  portraits: PortraitImage[];
  currentImageUrl?: string;
  ambience?: Ambience;
  effects?: StageEffect[];
  dmStatus?: string;
  dmPhase?: DmPhase;
  messages: ChatMessage[];
  campaignType?: CampaignType;
  /**
   * Score instrumentation flavor for this campaign (e.g. "fantasy", "scifi",
   * "modern"). Chosen once at campaign start; biases which music shelf plays.
   * Undefined → the neutral mood roots. See lib/campaign/musicTheme.ts.
   */
  musicTheme?: string;
  isRandomized?: boolean;
  campaignLength?: "auto" | "short" | "medium" | "long" | "extra_long" | "infinite";
  rulesMode?: "casual" | "full";
  /** Challenge tuning. Default medium. */
  difficulty?: Difficulty;
  /** How often d20 checks fire. Default standard (risk-gated). */
  rollMode?: RollMode;
  /** Filled when the campaign reaches a win/loss/bittersweet close. */
  ending?: CampaignEnding;
  questLog?: string;
  showQuestOnTV?: boolean;
  showQuestOnController?: boolean;
  showPartyInventories?: boolean;
  showPartyAbilities?: boolean;
  showNpcInventories?: boolean;
  showNpcAbilities?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CampaignSummary = Pick<
  Campaign,
  | "id"
  | "title"
  | "joinCode"
  | "status"
  | "updatedAt"
  | "hostActiveAt"
  | "campaignType"
  | "isRandomized"
  | "campaignLength"
  | "rulesMode"
  | "difficulty"
  | "rollMode"
> & {
  playerCount: number;
  isHostActive?: boolean;
  endingKind?: EndingKind;
};
