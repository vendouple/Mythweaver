import { buildCampaignContext } from "@/lib/campaign/context";
import { getCampaign, getCampaignLock, saveCampaign, downloadAndSaveImage, logCampaignDebug, logCampaignEvent, scrubLogText, safePushDisplayEvent, isValidImageUrl, startCampaignDraft, finishCampaignDraft, reconcilePresence, normalizeBeatEffect, ensureLocations, getFocusedLocation, persistFocusedLocation, applyFocus, type CampaignLogCategory } from "@/lib/campaign/store";
import { createId } from "@/lib/utils/ids";
import { aquaConfig, aquaFetch, fastModelTarget, resolveChatTarget, DEFAULT_CHAT_TARGET_ID, AquaFetchOptions, AquaMessage, AquaToolCall, AquaToolDefinition } from "./client";
import { runTool, toolDefinitions, applyNpcGroupFields, applyConditionFields } from "@/lib/tools/registry";
import { generateImage } from "@/lib/aqua/images";
import { AmbienceMood, Campaign, DisplayEvent, Player, PlayerStat, StoryCharacter } from "@/lib/campaign/types";
import { MUSIC_THEMES, MusicTheme, THEME_GUIDE } from "@/lib/campaign/musicTheme";
import { expandDisplayEvent } from "@/lib/campaign/beats";
import { createBatch, releaseCampaign } from "@/lib/tts/runtime";
import { getVoice, listVoices } from "@/lib/tts/voices";
import { advanceCombat, buildExplorationResolution, ENEMY_SLOT, syncFocusedMirror, isPartySplit, rotateActiveLocation, startCombat, endCombat, eligiblePlayerIdsInLocation } from "@/lib/campaign/turns";

// Tiered server-log verbosity (DEBUG_VERBOSE):
//   0 / unset → errors only (quiet; default so the console isn't flooded)
//   1         → tool calls, DM steps, and game logic ("just tool calling etc")
//   2         → everything, including the noisy per-request "API …" logs
// Errors always print regardless (see serverError).
const VERBOSE_LEVEL = (() => {
  const v = String(process.env.DEBUG_VERBOSE || "").toLowerCase();
  if (v === "2") return 2;
  if (v === "1" || v === "true") return 1;
  return 0;
})();

/**
 * @param level minimum DEBUG_VERBOSE level required to print. Defaults to 2 for
 *   "API …" categories (request spam) and 1 for everything else, so level 1
 *   shows tool/DM activity while level 2 adds the API request chatter.
 */
export function serverLog(category: string, message: string, data?: any, level?: number) {
  const needed = level ?? (/^api\b/i.test(category) ? 2 : 1);
  if (VERBOSE_LEVEL < needed) return;
  const timestamp = new Date().toLocaleTimeString();
  const dataStr = data ? ` | ${typeof data === "object" ? JSON.stringify(data) : data}` : "";
  console.log(`\x1b[35m[DND SERVER]\x1b[0m [${timestamp}] \x1b[36m[${category}]\x1b[0m ${message}${dataStr}`);
}

export function serverError(category: string, message: string, error?: any) {
  const timestamp = new Date().toLocaleTimeString();
  const errorMsg = error instanceof Error ? error.stack : String(error || "");
  console.error(`\x1b[31m[DND ERROR]\x1b[0m [${timestamp}] \x1b[36m[${category}]\x1b[0m ${message}${errorMsg ? `\n${errorMsg}` : ""}`);
}

/**
 * Same as serverLog but tagged in pink and labeled [SMALL MODEL] — every call
 * site that actually hits fastModelTarget() (housekeeping, and the parse-retry
 * ladder when PARSE_RETRY_USE_FAST_MODEL is on) should log through here instead
 * of serverLog, so the small model's activity is visually distinct from the
 * large RP model's usual magenta/cyan lines in the console.
 */
export function serverLogSmall(category: string, message: string, data?: any, level?: number) {
  const needed = level ?? 1;
  if (VERBOSE_LEVEL < needed) return;
  const timestamp = new Date().toLocaleTimeString();
  const dataStr = data ? ` | ${typeof data === "object" ? JSON.stringify(data) : data}` : "";
  console.log(`\x1b[38;5;213m[SMALL MODEL]\x1b[0m [${timestamp}] \x1b[36m[${category}]\x1b[0m ${message}${dataStr}`);
}

/**
 * Fire-and-forget update of the live DM status line the TV/controllers show.
 * Used to surface slow-request retries mid-turn. Non-fatal on failure. During
 * a DM turn getCampaign returns the draft, so this reaches pollers.
 */
async function writeDmStatus(campaignId: string, status: string) {
  try {
    const campaign = await getCampaign(campaignId);
    campaign.dmStatus = status;
    await saveCampaign(campaign);
  } catch {
    /* non-fatal — status is cosmetic */
  }
}

// Max tool-calling steps per DM turn. Combat turns chain many rolls + state
// updates, so 8 was too tight (turns hit the cap mid-fight). Env-overridable.
const MAX_DM_STEPS = Math.max(4, Number(process.env.MAX_TOOL_STEPS) || 16);

// Interactive DM turns fail fast: a dead endpoint should surface in seconds,
// not after 6×60s of silence. Non-interactive generation keeps the defaults.
// Retries are clamped to a hard maximum (see MAX_RETRIES_HARD_CAP in client.ts)
// so a misconfigured env value can never trap a turn on one dead provider.
const INTERACTIVE_FETCH: Pick<AquaFetchOptions, "retries" | "timeoutMs"> = {
  retries: Math.min(Math.max(1, Number(process.env.INTERACTIVE_RETRIES) || 3), 10),
  timeoutMs: Math.max(5000, Number(process.env.INTERACTIVE_TIMEOUT_MS) || 45000)
};

/**
 * An `onRetry` handler that records provider retries durably in the campaign's
 * debug.log. Every campaign-scoped provider call should pass one: retries used
 * to be console-only for every call except the main narration request, so an
 * ancillary model quietly burning its attempts left no trace anyone could find
 * after the session.
 */
function retryLogger(campaignId: string, category: CampaignLogCategory, phase: string): AquaFetchOptions["onRetry"] {
  return ({ attempt, retries, status, error }) => {
    void logCampaignEvent(campaignId, "WARN", category, "Provider retry", {
      phase,
      attempt,
      retries,
      status,
      error: error instanceof Error ? error.message : error ? String(error) : undefined
    });
  };
}

const systemPrompt = `You are the Dungeon Master for a couch RPG. TV shows cinematic story; phones are player controllers.

Prevent context collapse:
- Treat the current user/task message as the highest priority.
- Use campaign state as facts, not as text to imitate.
- Do not re-summarize old transcript unless it matters now.
- Keep each turn focused: resolve action, update state, offer choices.

Core rules:
- Never control player characters: do not choose their actions, speech, thoughts, or feelings.
- Narrate external consequences only. Player names/characters are protected canon.
- Use roll_dice for meaningful risk according to the campaign's Roll Mode (see below).

Dice rules (the server rolls — you NEVER pick, predict, or invent numbers; narrate only from the tool result):
- A d20 check: call roll_dice with d20Mode "normal" and a dc. Base DC: Easy 5, Medium 10, Hard 15, Very Hard 18. Most uncertain actions in a medium campaign should land near DC 10, not DC 15.
- Campaign Difficulty shifts base DCs: easy −2, medium 0, hard +2, insane +4. The SERVER adds this shift, so pass the base DC after ability fit and do NOT add the campaign shift yourself.
- Ability fit shifts the DC further: a character whose listed special ability directly covers the task: DC −2 or −3. Specialist task with NO fitting ability/tool: DC +2 to +5.
- d20Mode "advantage"/"disadvantage" is the DM's discretionary call for a REAL situational swing (high ground, flanking, ambush → advantage; blinded, prone, restrained, terrible footing → disadvantage). Use it sparingly. Having a relevant ability is NOT advantage — that's a DC shift.
- Only use +N/−N modifiers in notation for real damage math or explicit sheet stats.
- Keep DCs WINNABLE. Reserve effective DC 20 for an extraordinary but genuinely possible feat. If an action cannot physically or logically work, do NOT assign a huge DC and do NOT roll: narrate why it fails. Dice measure uncertain plausible attempts, not whether impossibilities become possible.
- Outcome spectrum (honor EXACTLY): critical-success (nat 20), strong-success (beat DC by 5+), success, partial-success (miss by 1–4 with a cost — only on easy/medium), failure, hard-failure (miss by 5+), critical-failure (nat 1). On hard/insane, near-misses are full failures (no partials).
- ENEMY/NPC rolls: call roll_dice with isNpc true and playerName set to the NPC name so the TV dice theater shows them. Chain multiple rolls in one turn for combat (attack → damage, contested checks, multi-enemy).
- Do NOT restate the roll as a SYSTEM story beat — the TV already animates every roll.

Roll Mode (how often to call for dice):
- light: only climactic or life-or-death moments
- standard: meaningful risk (attacks, persuasion, stealth, search under pressure)
- heavy: most contested or uncertain actions
- all: nearly every uncertain action gets a check

When NOT to roll (this matters as much as when to roll):
- A specialist doing their own established job, with the right tool, no time pressure and nothing meaningful left uncertain, simply SUCCEEDS. Narrate it and move on. A demolitions expert with her kit opening a maintenance valve does not need a check; a locksmith picking an ordinary lock in an empty corridor does not need a check.
- An action with no plausible path to success simply FAILS. Narrate the hard constraint and offer consequences or grounded alternatives; a natural 20 cannot create an absent item, cross an impossible distance, or override established world facts.
- Never re-roll the same uncertainty. If a check already settled whether this character can do this kind of thing here, the next identical action inherits that answer — a corridor of four near-identical valves is ONE check (or none), not four. Roll again only when something material changed: new danger, a worse tool, a harder specimen, a deadline, injury.
- A failure must MOVE the story: change the route, spend a resource, cost time the enemy uses, break the tool, raise an alarm, or reveal something worse. Never answer a failure by inviting the same attempt again — "try the valve again" is not a consequence. If you cannot name what the failure changes, don't call for the roll.

Difficulty (tone of challenge — applies to EVERY contested action):
Campaign difficulty shifts ALL DCs (attacks to hit, damage thresholds when used, escape/flee, stealth, persuasion, locks, saves). The server applies the bias to the base DC supplied to roll_dice; do not apply it a second time.
Base ladder BEFORE difficulty bias: Easy 5, Medium 10, Hard 15, Very Hard 18. Use Medium 10 for an ordinary uncertain action; DC 15 means the action itself is genuinely hard.
Apply ability fit to that base DC; the server then applies campaign bias: easy -2, medium 0, hard +2, insane +4.
- easy: forgiving DCs (typical check ~5-8), softer enemy competence, lower enemy HP, lighter damage, partial successes common, flee often succeeds
- medium: balanced (typical check ~8-12), fair enemy HP/damage
- hard: tougher DCs (typical check ~10-15), competent enemies, higher HP, harder damage, no partials, flee is risky
- insane: brutal DCs (typical check ~12-17), lethal enemies, high HP, heavy damage, no partials, flee is desperate
Combat & encounters MUST honor difficulty:
- Player attack to damage an enemy: set dc to that enemy's defense (ordinary defense 10, hard-to-hit defense 15, then campaign difficulty bias and ability fit). Harder difficulty = harder to land hits.
- Enemy attack on a player: isNpc true; dc = player defense (same ladder). Harder difficulty = enemies hit more often (lower effective player defense or higher enemy attack competence).
- Escape / run away / disengage: always a d20 vs DC on the ladder above; hard/insane make escape costly or fail more often.
- Damage on a hit is MANDATORY: after any successful attack (player OR enemy), immediately roll_dice for the damage, then apply the HP change via playerUpdates/npcUpdates. Never narrate a wound without subtracting HP.
- Bonus/reduced damage is the DM's discretionary call: when the attacker has a clear edge (advantage, vulnerability, perfect setup) you MAY add to the damage; when the target resists or the blow is glancing you MAY reduce it. Scale base damage dice with difficulty (easy lighter; insane heavier, multi-enemy pressure).
- Contested social/stealth/skill checks use the same DC ladder + difficulty bias.

Continuity & assets:
- Track stats, inventory, abilities, NPCs, locations, quests. ALWAYS update player/NPC stats (HP) after damage or healing via playerUpdates/npcUpdates.
- Every player ability should be distinctive and matter mechanically (it defines their easy DCs).
- New NPC/monster on stage: call generate_image with kind "portrait" and npcName BEFORE introducing them.
- When the party moves somewhere visually new, update the TV backdrop (reuse currentImageUrl or generate_image kind "scene").
- Campaign files, each with a distinct job: quest_log.md = ONLY the current active player-facing objective and immediate tasks; storyline.md = your private structured arc (chapters/ending/current position); notes.md (and memory/*.md) = free-form durable worldbuilding — lore, NPC relationships, secrets, foreshadowing too long for the memory line. Keep hidden plans out of quest_log.md.
- Campaign files are PROSE, never a second copy of the numbers. Every authoritative quantity — HP, wounds, blood, ammo, charge, inventory counts, how many of a swarm still stand, timers — lives ONLY in structured state (playerUpdates / npcUpdates / update_location). Do not write those values into quest_log.md, storyline.md, or notes.md: the moment a file names a number, it starts contradicting the sheet the TV is showing. Write "the reactor is failing", not "reactor at 40%". When a file and the structured state disagree, the structured state is the truth — correct the file, never the sheet.
- Seed every foe with HP via npcUpdates the moment it enters the scene, so the TV shows an enemy HP bar and hits have something to subtract.
- Group handling: a NAMED or role foe (leader, lieutenant, champion — anyone who speaks or matters) is ALWAYS its own npcUpdates entry with its own HP. Only faceless rank-and-file (e.g. "Iron Warrens Thugs") are pooled into ONE entry with isGroup:true, count (how many stand), and maxCount. Decrement count as they drop; don't flood the UI with a card per mook.
- Reuse the SAME NPC entry (its id, or its exact existing name) across turns — do not re-introduce an already-tracked character under a new descriptive title (e.g. giving "Mara" a fuller name like "Mara — The Drowned Light" later) or you'll spawn a duplicate card. If a character's title genuinely evolves, use renameFrom to relabel the EXISTING entry rather than creating a new one.

Story planning (keep a private outline in storyline.md — never shown to players):
- On the opening turn, write storyline.md via write_campaign_file: a high-level arc with the number of chapters (scale to the Campaign Length setting — short 2-3, medium 4-6, long 7+; infinite = open-ended arcs), a one-line beat per chapter, the intended ENDING, and a 'Current: Chapter 1' marker.
- Each turn, keep it current: advance the 'Current: Chapter N' marker as the party progresses, and when they deviate (repeated failures, an unexpected route, an off-script choice) TWEAK or rewrite the upcoming chapters to fit — but always keep a defined ending and steer toward it.
- The story plan is yours alone (hidden win/loss conditions, future twists, the ending) — never leak it into quest_log.md or player-facing text.

World grounding (do NOT fabricate the world):
- Environment state is durable in environment.json. Each LOCATION has authoritative objects, cover, exits, hazards, narrative zones, and connections. Maintain them with update_location and SEED a place before interaction. If it isn't listed, it isn't there.
- Object kinds cover common roles (item, container, interactable, obstacle, clue, furniture). For anything else use kind "other" with descriptive traits/state; do not invent a new untracked object just because it lacks a perfect category.
- Players may only use items in their inventory or objects listed in their CURRENT location. If a player invents an item, weapon, or cover that isn't present ("I pull out a grenade", "I dive behind the crates" when there are no crates), do NOT grant it for free — deny it, or if plausible require a d20 check to improvise/scavenge, and only on success add it (to inventory via playerUpdates, or the room via update_location).
- Taking cover requires cover that exists in this location's cover[]. If there is none, the spot is exposed — say so (or allow a check to improvise cover).
- Never conjure loot from nowhere; when something genuinely new appears, record it with update_location or playerUpdates so it stays tracked.
- Use narrative zones for distance: same zone is close/melee, an adjacent zone is one normal move, and non-adjacent zones require movement or adequate range. Hard-deny physically impossible actions; roll only uncertain plausible attempts.
- Each player and NPC has their OWN zoneId within a location. Two players in the same location but different zones are at different ranges — Player A next to the sniper (same zone) can melee while Player B across the hall (adjacent or farther) cannot. Update zoneId via move_zone or playerUpdates/npcUpdates whenever someone repositions, and judge range from the ACTOR's zone vs the TARGET's zone, not the location as a whole.
- Abilities and owned equipment override ordinary range limits when their description clearly supports it (a sniper ability can attack distant zones). Do not hard-block a valid ability. If its range is ambiguous, interpret it consistently from its wording and use a roll/cost rather than silently granting or denying it.
- The party can SPLIT: each group is in its own location, and the SERVER schedules them like initiative — exactly one location holds the spotlight, its group acts, you resolve ONLY that scene, then the server cuts to the next location automatically. Never narrate, move, or decide anything for a group waiting off-stage; their scene is frozen until the spotlight returns. Off-stage players may still get playerActions, but grounded in THEIR own location. A remote group cannot react to the spotlight scene unless communication and travel time genuinely allow it.
- NPCs/enemies track locationId just like players. A brand-new NPC defaults to the party's current location automatically — you only need locationId when introducing one somewhere else. When an EXISTING NPC's physical position changes (it follows the party into a new room, flees to another location, or you start combat somewhere it was standing elsewhere), set locationId in npcUpdates to keep it in sync — otherwise it silently stops appearing where the fight/scene actually is.

Cinematic direction:
- If set_theme is offered and no score is chosen yet, call set_theme EXACTLY ONCE on the opening turn. ${THEME_GUIDE}
- Prefer atmosphere over words.

Campaign endings (win/loss/draw/cliffhanger — can end EARLY):
- When the story reaches a decisive close — party dead (TPK), villain defeated, escape, total failure, stalemate, or bittersweet resolution — call end_campaign with kind (victory|defeat|bittersweet|escape|draw|cliffhanger), title, summary, optional highlights, optional stats.
- TOTAL PARTY KILL — the hard rule: the instant the LAST able hero falls (every player at 0 HP or dead/dying/unconscious/incapacitated, canAct:false), the saga is OVER. Do NOT keep narrating the storm/scene, do NOT leave the table frozen with no one able to act, and do NOT wait for another prompt — call end_campaign (kind 'defeat') THAT SAME TURN. A downed party with no one who can act is a finished story; sealing it is your job, not the players'.
- draw = a true stalemate (neither side prevailed, the conflict exhausted itself). cliffhanger = a deliberate season-finale stop mid-crisis — the reveal lands, the door bursts open, cut to black. Use either whenever it is the most dramatically honest close, not only on wins/losses.
- Include 3-6 stats for the outro's stats board: mix real tallies (battles survived, NPCs befriended, gold earned) with flavorful ones (lies told, curses ignored). Values may be numbers or short witty phrases.
- ALSO fill the per-player 'cast' (one entry per player): a short epithet/title they earned, a 1-2 sentence 'fate' of what they did across the saga and how they ended, and optionally 1-3 personal 'stats' (their own tallies — kills, lies, wounds taken). This makes the outro read like end credits with each hero's own line. Invent flavorful deeds from the transcript when exact numbers are unknown.
- Early endings are valid and preferred over dragging a dead campaign. After end_campaign, write a short final story[] epilogue and stop offering player choices (empty playerActions).
- TIMING — end_campaign closes the show, it does not interrupt it. Call it only once the scene has actually finished: the last blow landed, the final words said, the door closed. If the closing moment still has beats owed to it — a dying NPC's last line, the party's reaction, the reveal that makes the ending land — play those beats in THIS turn's story[] and call end_campaign in the SAME turn, after you have decided them. Never end the saga a turn early and leave the closing dialogue unspoken: the credits will roll over it.
- Settle the state as you close: anything killed or disabled in the finale gets canAct:false with matching conditions via playerUpdates/npcUpdates, and quest_log.md is rewritten so nothing is left standing as an active objective — mark what was achieved, what failed, and what was abandoned.
- end_campaign sets status completed, plays the cinematic outro on the TV, and switches ambience to outro.

Story delivery (one channel only):
- Your final JSON story[] is the ONLY place narration and dialogue go. NEVER send narration/dialogue through update_campaign_state displayEvents.
- update_campaign_state is for state: scene, overview, actions, player/NPC updates, backdrop.

Narration style (the TV performs each story beat one at a time):
- Keep each story[] entry SHORT: 1-3 sentences. Split scenes into several beats.
- Use inline markdown: *italics* for whispers/dread; **bold** for weight/danger; ***both*** rarely.
- Give NPCs real voices in their own story entries with the NPC name as speaker.
- Dramatize player actions with the character's EXACT name as speaker (third-person cinema of what they declared only).
- Speaker values: "NARRATOR", "SYSTEM", an NPC name, or a player character's exact name.

Turns & combat flow (the table has two modes — honor the one in the context):
- EXPLORATION (default): all able players lock in simultaneously and you receive their actions together. Resolve them in ONE flowing narration where their choices interact.
- COMBAT (sequential): call start_combat when a fight begins, passing enemyIds for the hostile NPCs in THIS fight so they're placed at the fight's location (otherwise they may not show up on the TV/roster where the fight is happening). Then you resolve ONE actor per turn — only the active player's action (named in the context), never the others. After the last player, you get the enemies' turn: resolve every foe's action (attack roll → damage → apply HP). Call end_combat when the fight is over. Narrate initiative naturally ("Engu, you're up").
- Don't switch modes needlessly; stay in exploration for talk/travel/investigation, combat only for actual fights.
- The moment your narration has a fight ACTUALLY breaking out — an ambush springs, someone opens fire, a monster lunges — you MUST call start_combat that same turn (and set_ambience battle or boss). Narrating an attack while leaving the table in exploration is an error.
- Combat requires an identified HOSTILE making contact: it attacks, fires, lunges, springs, or grapples. Tension is not combat. Stay in EXPLORATION for a boss/dread mood, an alarm, a ticking countdown, enemies approaching or closing in, being spotted or hunted, a standoff, a threat spoken but not acted on, and for attacking an environmental target or hazard that happens to carry HP (a reactor, a vessel, a door). Enemies who are killed, disabled, destabilized, or otherwise made unable to act (canAct:false) never enter initiative — do not start a fight with them, and do not roll for them.
- Ambience and combat mode are INDEPENDENT. set_ambience boss/battle is a music choice; it neither starts nor implies combat. Never call start_combat merely because the scene sounds like a fight is coming.

Conditions & lifecycle (ENFORCED — not just flavor):
- When a character is stunned, incapacitated, knocked out, or dead, set canAct:false on their playerUpdates/npcUpdates entry (and a matching conditions list, e.g. ["stunned"] or ["dead"], plus a status line). Their controller hard-locks — they truly cannot act that turn.
- Clear it by setting canAct:true (and removing the condition) the moment they recover — a stun that ends next turn, a revive, standing back up.
- A dead player stays canAct:false with empty playerActions for the rest of the saga; weave them out of the action.

Controller choices:
- Provide UP TO 4 playerActions ("next actions") per active player — go with fewer (3, 2, or 1) when the situation is constrained, and none when the player is incapacitated (canAct:false) or the campaign ended.
- Optionally provide UP TO 4 partyActions — shared "together" actions the whole party can take as one — when a joint move fits. Fewer or none is fine.

CRITICAL — how to end your turn:
- Run any other tools first (dice, images, ambience). THEN end your turn by calling the narrate_turn tool EXACTLY ONCE with your story beats and final state. This is the required, reliable way to finish.
- Do NOT also write prose or JSON in the message content — narrate_turn carries everything.
- (Only if you truly cannot call narrate_turn: return ONLY a single valid JSON object matching the shape below, no markdown fences, no prose.)`;

const turnChecklistPrompt = `Before responding:
1. Read current task, difficulty, roll mode, the story plan (storyline.md — where are we in the arc?), and whether the campaign is already completed.
2. Check active players (stats/HP), scene, quest, NPCs, and recent transcript.
3. Call required tools before ending (dice, images, end_campaign if the saga closes). On the opening turn, write storyline.md; on later turns update it when the party advances a chapter or deviates.
4. Honor dice outcomes exactly (full spectrum). Update HP/stats after harm or healing. Keep the current location's objects/cover/exits current with update_location; don't let players use items or cover that aren't there.
5. END by calling narrate_turn (preferred) with story + updates. If the campaign ended, leave playerActions empty.

The narrate_turn tool takes the same fields as this shape (story, title, currentScene, overview, playerActions, partyActions, playerUpdates, npcUpdates). Only if you cannot call it, emit this JSON instead:
{"story":[{"speaker":"NARRATOR|SYSTEM|NPC name|player character name","content":"short beat (1-3 sentences, may use *italic*/**bold** inline markdown)","itemUsed":"optional","abilityUsed":"optional"}],"title":"optional","currentScene":"optional","overview":"optional","playerActions":{"<playerId>":[{"title":"Look around","prompt":"I look around."}]},"partyActions":[{"title":"Shared Action","prompt":"We act together."}],"playerUpdates":[{"playerId":"...","characterName":"optional","background":"optional","portraitUrl":"optional","portraitPrompt":"optional","status":"Ready/Active/Stunned/etc.","inventory":["item"],"abilities":["ability"],"notes":"private notes","color":"cyan","stats":[{"name":"HP","value":15,"maxValue":20,"color":"red"}]}],"npcUpdates":[{"id":"existing id","renameFrom":"old name","name":"NPC name","description":"desc","portraitUrl":"url","status":"Ready","color":"orange","inventory":["item"],"abilities":["ability"],"stats":[{"name":"HP","value":15,"maxValue":15,"color":"red"}]}]}

Provide UP TO 4 playerActions for every active player (fewer is fine; none only when incapacitated or the campaign has ended), and UP TO 4 optional partyActions when a shared move fits.`;

const tabletopRulesPrompt = `CAMPAIGN TYPE: STANDARD TABLETOP RPG (NOT D&D)
This is a broad tabletop roleplaying campaign. Preserve the genre, era, and tone from the setup.
- Do NOT turn modern, sci-fi, mystery, horror, spy, superhero, or slice-of-life premises into fantasy.
- Do NOT introduce D&D races, classes, spells, spell slots, rests, armor classes, alignments, or standard attributes unless the setup or player explicitly asks for them.
- Character sheets should use story-first gear, specialties, conditions, and simple custom traits that match the premise.
- Use simple d20 checks only when risk matters, and narrate outcomes without D&D mechanical jargon.
- Keep the experience cinematic, rules-light, and setting-faithful.`;

const dndCasualRulesPrompt = `CAMPAIGN TYPE: DUNGEONS & DRAGONS, RULES-LIGHT (IMPORTANT)
This is a D&D campaign with approachable, rules-light handling.
- Use fantasy adventure conventions, monsters, magic, quests, treasure, and heroic party play.
- Avoid heavy mechanical bookkeeping unless the player asks for it.
- Do NOT use standard D&D mechanical stats (Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma) or modifiers in casual mode. The only required stat is HP.
- Mention classes, ancestry, spells, and iconic D&D ideas when they fit, but keep choices simple and narrative-focused.
- Do NOT mention short/long rests, spell slots, initiative rolls, or complex checks unless the scene truly needs them.`;

const fullRulesPrompt = `CAMPAIGN RULES MODE: FULL D&D 5E IMMERSION (IMPORTANT)
This campaign uses full, authentic Dungeons & Dragons rules.
- Fully embrace classic D&D mechanics: standard stats (Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma), standard classes, spells, spell slots, short/long rests, player races, and DC checks.
- Incorporate attributes, class features, and rules checks into story narration and options.`;

function campaignRulesPrompt(campaign: { campaignType?: string; rulesMode?: string }) {
  if (campaign.campaignType !== "dnd") return tabletopRulesPrompt;
  return campaign.rulesMode === "full" ? fullRulesPrompt : dndCasualRulesPrompt;
}

// The preferred way for the model to END its turn: a single structured tool
// call instead of free-form final JSON. Small/RP models are far more reliable
// at emitting a validated tool call than at closing a big JSON object, so this
// is the primary path; the free-JSON parser remains as a cross-model fallback.
const actionItemSchema = {
  type: "object",
  required: ["title", "prompt"],
  properties: {
    title: { type: "string", description: "Short button label shown on the phone." },
    prompt: { type: "string", description: "Detailed hidden prompt sent if the player taps this choice." }
  }
} as const;

const statSchema = {
  type: "object",
  required: ["name", "value"],
  properties: {
    name: { type: "string" },
    value: { type: "number" },
    maxValue: { type: "number", description: "Optional — omit to keep the existing max." },
    color: { type: "string" }
  }
} as const;

const narrateTurnTool: AquaToolDefinition = {
  type: "function",
  function: {
    name: "narrate_turn",
    description: "END YOUR TURN by calling this EXACTLY ONCE after all other tools (dice, images, ambience). Deliver the story beats and the final state here. This REPLACES the final JSON — do not also emit prose. story[] is the ONLY place narration/dialogue goes.",
    parameters: {
      type: "object",
      required: ["story"],
      properties: {
        story: {
          type: "array",
          description: "Ordered cinematic beats, each SHORT (1-3 sentences). speaker = NARRATOR, SYSTEM, an NPC name, or a player character's exact name.",
          items: {
            type: "object",
            required: ["speaker", "content"],
            properties: {
              speaker: { type: "string" },
              content: { type: "string", description: "1-3 sentences; inline *italic*/**bold** allowed." },
              itemUsed: { type: "string" },
              abilityUsed: { type: "string" },
              effect: {
                type: "object",
                description: "Optional cinematic effect LINKED to this beat — its cues and optional visual fire the instant this line plays on the TV, not at turn start. Use it to land thunder, a door, an explosion, a spell, or a heartbeat exactly on the words that earn it. Provide cues, visual, or both. Omit on beats that need no effect.",
                properties: {
                  cues: { type: "array", minItems: 1, maxItems: 4, items: { type: "string", enum: ["beat", "heartbeat", "rumble", "flash", "darkness", "door-creak", "door-open", "door-close", "knock", "airlock-open", "airlock-close", "code-beep", "code-success", "code-denied", "alarm", "siren", "radio-static", "power-up", "power-down", "explosion", "gunshot", "laser", "impact", "debris", "glass-break", "sword", "arrow", "shield", "footsteps", "horse", "thunder", "fire-burst", "splash", "wind-gust", "magic", "portal", "spell-fail", "creature-roar", "whisper", "trap", "lock-click", "coin", "item-pickup", "heal"] } },
                  visual: { type: "string", enum: ["shake", "flash", "embers", "fog", "rain", "snow", "darkness", "heartbeat"] },
                  strength: { type: "number", description: "0.0-1.0 impact strength. Default 0.6." },
                  repeat: { type: "number", description: "How many times to fire (1-12). Default 1." },
                  delayMs: { type: "number", description: "Delay in ms between repeats (0-10000). Default 0." }
                }
              }
            }
          }
        },
        title: { type: "string" },
        currentScene: { type: "string", description: "SHORT label (a few words) for the current physical location, e.g. 'The Ashlands' or 'Haven Arcology Outskirts'. Never backstory, lore, or prose — that belongs in story[] beats and overview." },
        overview: { type: "string", description: "Brief TV overview of the situation. No controller choices here." },
        playerActions: {
          type: "array",
          description: "Per-player controller buttons (1-4 each). Empty for a player who is incapacitated/dead or when the campaign ended.",
          items: {
            type: "object",
            required: ["playerId", "actions"],
            properties: {
              playerId: { type: "string" },
              actions: { type: "array", items: actionItemSchema }
            }
          }
        },
        partyActions: { type: "array", description: "Optional shared 'together' actions shown on every phone.", items: actionItemSchema },
        playerUpdates: {
          type: "array",
          description: "Apply HP/stat/inventory/status changes after harm or healing.",
          items: {
            type: "object",
            properties: {
              playerId: { type: "string" },
              playerName: { type: "string" },
              status: { type: "string", description: "Free-text flavor line." },
              conditions: { type: "array", items: { type: "string" }, description: "e.g. ['stunned'] or ['dead']." },
              canAct: { type: "boolean", description: "False when stunned/incapacitated/dead — locks their controller." },
              inventory: { type: "array", items: { type: "string" } },
              abilities: { type: "array", items: { type: "string" } },
              notes: { type: "string" },
              color: { type: "string" },
              zoneId: { type: "string", description: "Move this player to a narrative zone within their current location." },
              locationId: { type: "string", description: "Move this player to a different tracked location (id from the locations list). Prefer move_player for group moves; this covers a single hero relocating as part of the turn's outcome." },
              stats: { type: "array", items: statSchema }
            }
          }
        },
        npcUpdates: {
          type: "array",
          description: "Create/update NPCs & enemies. Seed HP when a foe appears. Pool ONLY faceless minions via isGroup+count; named/role NPCs stay individual.",
          items: {
            type: "object",
            required: ["name"],
            properties: {
              id: { type: "string" },
              renameFrom: { type: "string" },
              name: { type: "string" },
              description: { type: "string" },
              status: { type: "string" },
              conditions: { type: "array", items: { type: "string" } },
              canAct: { type: "boolean" },
              isGroup: { type: "boolean", description: "TRUE only for pooled faceless rank-and-file (never a named leader/lieutenant)." },
              count: { type: "number", description: "Group: how many still standing." },
              maxCount: { type: "number", description: "Group: size at first encounter." },
              color: { type: "string" },
              locationId: { type: "string", description: "Move this NPC/enemy to a different tracked location (id from the locations list). New NPCs default to the party's current location automatically — only set this to introduce one elsewhere, or to move an existing one when it follows/relocates." },
              zoneId: { type: "string", description: "Move this NPC/enemy to a narrative zone within their current location." },
              inventory: { type: "array", items: { type: "string" } },
              abilities: { type: "array", items: { type: "string" } },
              stats: { type: "array", items: statSchema }
            }
          }
        }
      }
    }
  }
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: AquaMessage;
  }>;
  message?: AquaMessage;
};

/**
 * A total party kill / wipe: every player is hard-locked out of acting (canAct
 * false) AND shows a lethal signal (0 HP, or a dead/dying/downed/unconscious
 * condition). Requiring the lethal signal on top of canAct:false keeps a
 * one-turn full-party STUN from being mistaken for the end of the saga.
 */
function isPartyWiped(campaign: Campaign): boolean {
  const players = campaign.players;
  if (!players.length) return false;
  const lethal = /\b(dead|dying|down(ed)?|killed|slain|deceased|expired|unconscious|incapacitated|knocked\s*out)\b/i;
  return players.every((p) => {
    if (p.canAct !== false) return false;
    const hp = (p.stats || []).find((s) => s.name.toUpperCase() === "HP");
    if (hp && hp.value <= 0) return true;
    if ((p.conditions || []).some((c) => lethal.test(c))) return true;
    if (p.status && lethal.test(p.status)) return true;
    return false;
  });
}

export async function runDungeonMaster(campaignId: string, playerName: string, action: string, options: { hiddenUserMessage?: boolean; playerId?: string; displayAction?: string; actionId?: string; isAutoEnding?: boolean } = {}) {
  await logCampaignDebug(campaignId, `[runDungeonMaster] Called by: ${playerName}. Action: "${action}". Options: ${JSON.stringify(options)}`);
  serverLog("DM START", `Running DM for campaign: ${campaignId} | Player: ${playerName} | Action: "${action}"`);
  const turnStartedAt = Date.now();
  const campaign = await getCampaign(campaignId);
  // Backdrop the party sees BEFORE this turn's tools run, so afterward we can
  // tell whether the DM repainted it itself or left it stale.
  const preTurnImageUrl = campaign.currentImageUrl;
  // Snapshot the choices on the table BEFORE this turn. If the turn fails
  // (dead endpoint, unparseable output), we restore these so the party can
  // simply retry the same options instead of being stranded with empty cards.
  const preTurnPlayerActions = JSON.parse(JSON.stringify(campaign.playerActions || {}));
  const preTurnPartyActions = JSON.parse(JSON.stringify(campaign.partyActions || []));
  const preTurnSuggestedActions = JSON.parse(JSON.stringify(campaign.suggestedActions || []));
  const isJoin = action.startsWith("A new player has joined") || action.startsWith("A new player joined");
  const isRejoin = action.startsWith("Player ") && action.includes("rejoined");
  // A disconnect timeout: the presence sweep asks the DM to write the hero
  // out of the scene. The "lost thread" status is what the TV's pause spinner
  // (and the sync-flow tool remaps below) key off.
  const isDepart = !isRejoin && action.startsWith("Player ") && action.includes("disconnected from the game");
  const isInitialStart = action.startsWith("Start the couch campaign now.");
  campaign.dmStatus = isInitialStart
    ? "Preparing the initial scenario..."
    : (isJoin
       ? "Integrating new player profile..."
       : (isRejoin
          ? "Reintegrating player..."
          : (isDepart ? "Weaving a lost thread out of the tale..." : "The Dungeon Master is scheming...")));
  campaign.dmPhase = "signal";

  if (!options.hiddenUserMessage) {
    campaign.messages.push({ id: options.actionId || createId("msg"), role: "user", name: playerName, content: action, createdAt: new Date().toISOString() });
    safePushDisplayEvent(campaign, {
      type: "playerAction",
      speaker: playerName,
      playerId: options.playerId,
      content: options.displayAction || action
    });
  }
  await saveCampaign(campaign);

  // Start campaign draft caching for background AI run
  startCampaignDraft(campaignId, campaign);

  try {
    const messages: AquaMessage[] = [
      { role: "system", content: systemPrompt + "\n\n" + atmosphereDirective() + "\n\n" + campaignRulesPrompt(campaign) },
      { role: "system", content: buildCampaignContext(campaign) },
      { role: "system", content: turnChecklistPrompt },
      { role: "user", name: playerName, content: action }
    ];

    let finalMessage: AquaMessage | null = null;
    // Populated when the model ends its turn via the narrate_turn tool (the
    // reliable path). When set, it IS the turn's final structured result.
    let structuredResult: Record<string, any> | null = null;
    const toolEvents: string[] = [];
    // Once the score is chosen (now or on a past turn), drop set_theme from
    // the offered tools so it can't be picked again mid-turn.
    let themeChosen = !!campaign.musicTheme;
    // Whether the model itself directed the stage this turn — when it didn't,
    // the post-turn stage-director pass double-checks mood/combat for it.
    let modelSetAmbience = false;
    let modelTouchedCombat = false;

    // Interactive fetch: fail fast, and surface each retry to the TV so a slow
    // request reads as "retrying (2/3)" instead of a silent multi-minute hang.
    // The narration target is the host's manual selection for this campaign;
    // resolveChatTarget() falls back to the default when unset/unknown.
    const selectedChatTargetId = campaign.selectedChatTargetId;
    const narrationModel = resolveChatTarget(selectedChatTargetId).model;
    const interactiveFetch: AquaFetchOptions = {
      ...INTERACTIVE_FETCH,
      onRetry: ({ attempt, retries, status, error }) => {
        void writeDmStatus(campaignId, `The connection wavers… retrying (${attempt}/${retries})`);
        void logCampaignEvent(campaignId, "WARN", "Narration", "Provider retry", {
          attempt,
          retries,
          status,
          target: selectedChatTargetId || DEFAULT_CHAT_TARGET_ID,
          model: narrationModel,
          error: error instanceof Error ? error.message : error ? String(error) : undefined
        });
      }
    };

    // The opening turn is the heaviest of the whole saga (background, location
    // seeding, two campaign files, every player, NPCs + portraits, ambience,
    // narrate_turn) — give it extra headroom so setup never dies mid-flight.
    const maxSteps = isInitialStart ? Math.max(MAX_DM_STEPS, 24) : MAX_DM_STEPS;

    for (let step = 0; step < maxSteps; step += 1) {
      await logCampaignDebug(campaignId, `[AI Step ${step + 1}] Requesting completion on ${selectedChatTargetId || DEFAULT_CHAT_TARGET_ID} (${narrationModel})...`);
      serverLog("DM AI Step", `Step ${step + 1}/${maxSteps}: Requesting completion...`);
      const stepStartedAt = Date.now();
      let response: ChatCompletionResponse;
      try {
        response = await complete(messages, "auto", [...toolsForTurn({ musicTheme: themeChosen ? "set" : undefined }), narrateTurnTool], interactiveFetch, selectedChatTargetId);
      } catch (err) {
        // Narration provider failed all retries on the selected target. Log
        // durably with classification so the host can see why and switch.
        const status = (err as any)?.status;
        const code = (err as any)?.code;
        void logCampaignEvent(campaignId, "ERROR", "Narration", "Provider request failed", {
          step: step + 1,
          target: selectedChatTargetId || DEFAULT_CHAT_TARGET_ID,
          status,
          code,
          error: err instanceof Error ? err.message : String(err),
          errorName: err instanceof Error ? err.name : undefined
        });
        // Carry how far the turn got out to the outer catch, which records the
        // host-facing failure and has no other way to know the step.
        (err as { dmStep?: number }).dmStep = step + 1;
        throw err;
      }
      const message = response.choices?.[0]?.message || response.message;
      if (!message) throw new Error("Aqua chat response did not include a message");
      await logCampaignDebug(campaignId, `[AI Step ${step + 1}] Received response: ${JSON.stringify(message)}`);

      const toolCalls = normalizeToolCalls(message);
      serverLog("DM AI Step", `Step ${step + 1}/${maxSteps}: Received response. Tool calls found: ${toolCalls.length}`);
      // One durable line per step naming the target and model that answered.
      // Without it debug.log could not tell you which provider narrated a
      // SUCCESSFUL turn — only the failures identified themselves.
      void logCampaignEvent(campaignId, "INFO", "Narration", "Provider responded", {
        step: step + 1,
        target: selectedChatTargetId || DEFAULT_CHAT_TARGET_ID,
        model: narrationModel,
        durationMs: Date.now() - stepStartedAt,
        toolCalls: toolCalls.length,
        tools: toolCalls.map((call) => call.function.name).slice(0, 8)
      });
      if (!toolCalls.length) {
        finalMessage = message;
        break;
      }

      messages.push({ ...message, content: message.content || "" });
      for (const call of toolCalls) {
        // narrate_turn is the turn terminator, not an executable tool: capture
        // its validated args as the final structured result and stop. Any other
        // tools in the same step are still executed above/below.
        if (call.function.name === "narrate_turn") {
          let parseError: string | null = null;
          try {
            structuredResult = typeof call.function.arguments === "string"
              ? JSON.parse(call.function.arguments || "{}")
              : (call.function.arguments as Record<string, any>) || {};
          } catch (err) {
            parseError = err instanceof Error ? err.message : String(err);
            structuredResult = null;
          }
          // Every tool_call in the pushed assistant message needs a matching
          // tool result — a dangling id makes strict OpenAI-compatible
          // endpoints reject the NEXT completion call, which is exactly the
          // call we need when the model has to retry a malformed narrate_turn.
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: parseError
              ? JSON.stringify({ error: `narrate_turn arguments were not valid JSON (${parseError}). Call narrate_turn again with valid JSON arguments.` })
              : JSON.stringify({ ok: true })
          });
          await logCampaignDebug(campaignId, `[Tool Call] narrate_turn (turn terminator)${parseError ? ` — argument parse FAILED: ${parseError}` : ""}`);
          continue;
        }
        // Update dmStatus before executing tool
        const current = await getCampaign(campaignId);
        const originalStatus = current.dmStatus || "";
        const isJoinOrSetup = originalStatus.includes("Integrating") || originalStatus.includes("Preparing") || originalStatus.includes("Reintegrating") || originalStatus.includes("lost thread");

        let toolStatus = "";
        let toolPhase: import("@/lib/campaign/types").DmPhase | undefined;

        const isPlayerSyncFlow = originalStatus.toLowerCase().includes("integrating") || originalStatus.toLowerCase().includes("reintegrating") || originalStatus.toLowerCase().includes("lost thread");

        if (call.function.name === "roll_dice") {
          toolStatus = "Rolling the 20-sided die...";
        } else if (call.function.name === "set_theme") {
          toolStatus = "Choosing the campaign's score...";
        } else if (call.function.name === "set_ambience") {
          toolStatus = "Tuning the table's atmosphere...";
        } else if (call.function.name === "trigger_effect") {
          toolStatus = "Conjuring stage effects...";
        } else if (call.function.name === "end_campaign") {
          toolStatus = "Sealing the final chapter...";
        } else if (call.function.name === "generate_image") {
          let isPortrait = false;
          try {
            const a = JSON.parse(call.function.arguments || "{}");
            isPortrait = a && (a.kind === "portrait" || !!a.playerId || !!a.npcName);
          } catch { /* ignore */ }
          toolStatus = isPortrait ? "Painting a character portrait..." : "Painting a cinematic scene...";
          toolPhase = "image";
        } else if (call.function.name === "write_campaign_file") {
          let pathArg = "";
          try {
            const a = JSON.parse(call.function.arguments || "{}");
            pathArg = String(a.path || "").toLowerCase();
          } catch { /* ignore */ }
          const isWorldFile = pathArg.includes("world") || pathArg.includes("lore") || pathArg.includes("history") || pathArg.includes("npc");
          
          if (isWorldFile && !isPlayerSyncFlow) {
            toolStatus = "Writing campaign lore and world history...";
            toolPhase = "world";
          } else {
            toolStatus = "Updating character notes and scrolls...";
            toolPhase = "sheet";
          }
        } else if (call.function.name === "read_campaign_file") {
          let pathArg = "";
          try {
            const a = JSON.parse(call.function.arguments || "{}");
            pathArg = String(a.path || "").toLowerCase();
          } catch { /* ignore */ }
          const isWorldFile = pathArg.includes("world") || pathArg.includes("lore") || pathArg.includes("history") || pathArg.includes("npc");
          
          toolStatus = isWorldFile ? "Reading world history files..." : "Reading character sheet data...";
          toolPhase = (isWorldFile && !isPlayerSyncFlow) ? "world" : "sheet";
        } else if (call.function.name === "update_campaign_state") {
          let hasPlayerUpdates = false;
          let hasNpcUpdates = false;
          let hasSceneUpdates = false;
          try {
            const a = JSON.parse(call.function.arguments || "{}");
            hasPlayerUpdates = a && Array.isArray(a.playerUpdates) && a.playerUpdates.length > 0;
            hasNpcUpdates = a && Array.isArray(a.npcUpdates) && a.npcUpdates.length > 0;
            hasSceneUpdates = a && (typeof a.currentScene === "string" || Array.isArray(a.displayEvents));
          } catch { /* ignore */ }

          if (hasPlayerUpdates) {
            toolStatus = "Forging character sheet details...";
            toolPhase = "sheet";
          } else if (hasNpcUpdates) {
            toolStatus = "Designing NPC profiles...";
            toolPhase = isPlayerSyncFlow ? "sheet" : "world";
          } else if (hasSceneUpdates) {
            toolStatus = isPlayerSyncFlow ? "Splicing player into the live timeline..." : "Drafting the opening scene and narrative beats...";
            toolPhase = isPlayerSyncFlow ? "integrate" : "scene";
          } else {
            toolStatus = "Aligning campaign state...";
            toolPhase = isPlayerSyncFlow ? "integrate" : "scene";
          }
        }

        if (toolStatus) {
          if (isJoinOrSetup) {
            const baseStatus = originalStatus.replace(/\s*\(.*?\)/g, "").replace(/\.\.\./g, "").trim();
            current.dmStatus = `${baseStatus}... (${toolStatus.toLowerCase().replace(/\.\.\./g, "")})`;
          } else {
            current.dmStatus = toolStatus;
          }
        }
        if (toolPhase) current.dmPhase = toolPhase;
        await saveCampaign(current);

        await logCampaignDebug(campaignId, `[Tool Call] Executing ${call.function.name} with args: ${call.function.arguments}`);
        serverLog("DM Tool Call", `Executing '${call.function.name}' with arguments: ${call.function.arguments}`);
        let toolArgs: Record<string, unknown> = {};
        try {
          toolArgs = typeof call.function.arguments === "string"
            ? JSON.parse(call.function.arguments || "{}")
            : (call.function.arguments as Record<string, unknown>) || {};
        } catch {
          toolArgs = {};
        }
        const result = await runTool(campaignId, call.function.name, toolArgs);
        if (call.function.name === "set_theme" && result && !(result as any).error) themeChosen = true;
        if (call.function.name === "set_ambience" && result && !(result as any).error) modelSetAmbience = true;
        if ((call.function.name === "start_combat" || call.function.name === "end_combat" || call.function.name === "end_campaign") && result && !(result as any).error) modelTouchedCombat = true;
        const resultText = JSON.stringify(result);
        await logCampaignDebug(campaignId, `[Tool Result] ${call.function.name} returned: ${resultText}`);
        serverLog("DM Tool Result", `Tool '${call.function.name}' returned: ${resultText.slice(0, 160)}${resultText.length > 160 ? "..." : ""}`);
        toolEvents.push(`${call.function.name}: ${resultText}`);
        messages.push({ role: "tool", tool_call_id: call.id, content: resultText });
      }
      // The model ended its turn via narrate_turn — stop looping.
      if (structuredResult) break;
    }

    if (!finalMessage && !structuredResult) {
      serverError("DM Loop", `Tool loop exceeded maximum steps (${maxSteps}).`);
      throw new Error("Tool loop exceeded maximum steps");
    }

    let content = finalMessage?.content || "";
    let parsedJson: Record<string, any> | null = null;

    if (structuredResult) {
      // Reliable path: use the validated tool args directly — no JSON parsing.
      parsedJson = structuredResult;
      content = JSON.stringify(structuredResult);
      await logCampaignDebug(campaignId, `[AI Finish] Turn ended via narrate_turn (structured).`);
    } else {
      await logCampaignDebug(campaignId, `[AI Finish] Final response content: ${content}`);
      parsedJson = await parseFinalJson(campaignId, content);
    }

    if (!structuredResult && !parsedJson) {
      // NEVER fall back to plain text (feedback #3): an unparseable turn loses
      // every state update and can splash raw tool syntax onto the TV (seen
      // when a model emitted its native tool-call XML as content). Retry by
      // FORCING the narrate_turn tool — small/RP models are far more reliable
      // at emitting a validated tool call than strict JSON content — and if it
      // still can't produce one, fail the turn cleanly: the error path
      // restores the party's previous choices so they simply retry.
      const maxParseRetries = Math.max(1, Number(process.env.PARSE_RETRIES) || 3);
      // Repackaging an already-decided turn into narrate_turn args is pure
      // reformatting, not creative generation, so it's a fit for the small
      // housekeeping model when one is configured — cheaper/faster than
      // re-running the whole conversation through the large model. Set
      // PARSE_RETRY_USE_FAST_MODEL=0 to fall back to the old behavior (retry
      // with CHAT_MODEL) if the small model ever starts altering the narration
      // instead of just repackaging it.
      const parseRetryFlag = String(process.env.PARSE_RETRY_USE_FAST_MODEL ?? "1").toLowerCase().trim();
      const parseRetryDisabled = ["0", "false", "off", "no"].includes(parseRetryFlag);
      const useFastModelForRetry = !parseRetryDisabled && !!aquaConfig().fastModel;
      if (useFastModelForRetry) {
        // The one deliberate cross-provider hop in the narration path, and it is
        // reformatting only — never new creative content. Recorded so a
        // debug.log reader never has to wonder which model produced a turn.
        void logCampaignEvent(campaignId, "INFO", "Narration", "Parse repair routed to the fast model", {
          from: selectedChatTargetId || DEFAULT_CHAT_TARGET_ID,
          to: fastModelTarget().model,
          reason: "PARSE_RETRY_USE_FAST_MODEL"
        });
      }
      for (let attempt = 1; attempt <= maxParseRetries && !parsedJson; attempt += 1) {
        // When NOT using the fast model this must stay on the host's SELECTED
        // target. It previously used the bare chat model with no endpoint
        // override, so parse repairs silently ran on the default provider even
        // after the host had switched away from it.
        const { model: retryModel, options: retryModelOptions } = useFastModelForRetry
          ? fastModelTarget()
          : campaignChatTarget(campaign);
        await logCampaignDebug(campaignId, `[AI Retry] Parse failed — forcing narrate_turn on the ${useFastModelForRetry ? "small" : "large"} model (attempt ${attempt}/${maxParseRetries}).`);
        if (useFastModelForRetry) {
          serverLogSmall("DM Parser", `Repackaging turn ${attempt}/${maxParseRetries} into narrate_turn args (no new content, reformat only).`);
        } else {
          serverLog("DM Parser", `Parse failed — retrying with forced narrate_turn (attempt ${attempt}/${maxParseRetries}).`);
        }
        void writeDmStatus(campaignId, `The Weaver re-threads the tale… (${attempt}/${maxParseRetries})`);
        try {
          const retryResponse = (await aquaFetch("/chat/completions", {
            method: "POST",
            body: JSON.stringify({
              model: retryModel,
              messages: [
                ...messages,
                { role: "assistant", content },
                {
                  role: "user",
                  content: useFastModelForRetry
                    ? "Your previous response could not be parsed and was discarded. Do NOT write prose, XML, or markdown, and do NOT invent, add, or omit any story beats, dialogue, or state changes. Repackage EXACTLY what was already decided above — call the narrate_turn tool EXACTLY ONCE, carrying this turn's story beats and final state as valid JSON arguments."
                    : "Your previous response could not be parsed and was discarded. Do NOT write prose, XML, or markdown. Call the narrate_turn tool EXACTLY ONCE right now, carrying this turn's story beats and final state as valid JSON arguments."
                }
              ],
              tools: [narrateTurnTool],
              tool_choice: { type: "function", function: { name: "narrate_turn" } }
            })
          }, { ...INTERACTIVE_FETCH, ...retryModelOptions, onRetry: retryLogger(campaignId, "Narration", "parse-repair") })) as ChatCompletionResponse;
          const retryMessage = retryResponse.choices?.[0]?.message || retryResponse.message;
          const retryCall = retryMessage ? normalizeToolCalls(retryMessage).find((c) => c.function.name === "narrate_turn") : undefined;
          if (retryCall) {
            parsedJson = typeof retryCall.function.arguments === "string"
              ? JSON.parse(retryCall.function.arguments || "{}")
              : (retryCall.function.arguments as Record<string, any>) || {};
            content = JSON.stringify(parsedJson);
            await logCampaignDebug(campaignId, `[AI Retry] Forced narrate_turn succeeded on attempt ${attempt} (${useFastModelForRetry ? "small" : "large"} model).`);
            break;
          }
          // Some endpoints ignore tool_choice and answer in content — give the
          // repairing JSON parser one look at whatever came back.
          const retryContent = retryMessage?.content || "";
          if (retryContent) {
            const retryParsedJson = await parseFinalJson(campaignId, retryContent);
            if (retryParsedJson) {
              content = retryContent;
              parsedJson = retryParsedJson;
              break;
            }
          }
        } catch (err) {
          await logCampaignDebug(campaignId, `[AI Retry] Forced narrate_turn attempt ${attempt} failed: ${err instanceof Error ? err.message : String(err)}`);
          serverError("DM Parser", `Forced narrate_turn retry ${attempt}/${maxParseRetries} failed (${useFastModelForRetry ? "small" : "large"} model)`, err);
        }
      }
      if (!parsedJson) {
        await logCampaignDebug(campaignId, `[AI Retry] All ${maxParseRetries} forced retries failed — failing the turn (no plain-text fallback).`);
        throw new Error("The storyteller's response could not be parsed after retries — the turn was rolled back so it can be retried.");
      }
    }

    // Small models occasionally double-encode narrate_turn fields (story
    // arriving as a JSON string instead of an array — seen in the first
    // split-party session). Decode them so a correct turn is never half-applied.
    if (parsedJson) parsedJson = decodeStringifiedFields(parsedJson);

    const latestCampaign = await getCampaign(campaignId);
    // True only for this campaign's very first DM response — used to gate the
    // one-time "AI invents a title for a surprise campaign" behavior below.
    const isOpeningTurn = !latestCampaign.messages.some((m) => m.role === "assistant");
    latestCampaign.messages.push({
      id: createId("msg"),
      role: "assistant",
      content: content,
      createdAt: new Date().toISOString()
    });

    // The story beats pushed to the TV this turn, in play order, with a live
    // reference to each display event.
    const turnBeats: Array<{ speaker?: string; content?: string; event: DisplayEvent }> = [];

    if (parsedJson) {
      // Robustly recover the story[] array even when the model emitted it as a
      // malformed stringified array (e.g. a premature `]` mid-stream). The
      // previous `Array.isArray(parsedJson.story)` check silently skipped the
      // whole story block on a malformed string, pushing ZERO narration beats
      // to displayEvents — so `storyStarted` never flipped true and the TV
      // stayed stuck on the Weaving screen at ~95% even though the DM finished.
      const storyItems = parseStoryArray(parsedJson.story);
      if (storyItems.length) {
        const mergedStory: any[] = [];
        for (const item of storyItems) {
          if (!item || typeof item !== "object") continue;
          const speaker = item.speaker || "NARRATOR";
          const contentText = item.content || "";
          const itemUsed = typeof item.itemUsed === "string" ? item.itemUsed : undefined;
          const abilityUsed = typeof item.abilityUsed === "string" ? item.abilityUsed : undefined;
          // A cinematic effect the DM linked to this line (fires when it plays).
          const effect = normalizeBeatEffect(item.effect);

          const prev = mergedStory[mergedStory.length - 1];
          if (prev &&
              prev.speaker.toLowerCase() === speaker.toLowerCase() &&
              prev.itemUsed === itemUsed &&
              prev.abilityUsed === abilityUsed) {
            prev.content = `${prev.content}\n\n${contentText}`;
            if (!prev.effect && effect) prev.effect = effect;
          } else {
            mergedStory.push({ speaker, content: contentText, itemUsed, abilityUsed, effect });
          }
        }

        // Defense-in-depth: smaller models sometimes send the same beats via
        // update_campaign_state displayEvents AND the final story[] — drop
        // any beat whose text already sits in the recent TV timeline.
        const recentContents = new Set(
          latestCampaign.displayEvents.slice(-20).map((event) => (event.content || "").trim())
        );
        for (const item of mergedStory) {
          const speaker = item.speaker;
          const contentText = item.content;
          const itemUsed = item.itemUsed;
          const abilityUsed = item.abilityUsed;

          if ((contentText || "").trim() && recentContents.has(contentText.trim())) continue;
          if (latestCampaign.status !== "lobby") {
            const pushed = safePushDisplayEvent(latestCampaign, {
              ...classifyStoryBeat(latestCampaign, speaker),
              content: contentText,
              itemUsed: itemUsed,
              abilityUsed: abilityUsed,
              effect: item.effect
            });
            if (pushed) turnBeats.push({ speaker, content: contentText, event: pushed });
          }
        }
      } else {
        // Fallback
        const speaker = parsedJson.speaker || "NARRATOR";
        const narratorText = parsedJson.narrator || "";
        const itemUsed = typeof parsedJson.itemUsed === "string" ? parsedJson.itemUsed : undefined;
        const abilityUsed = typeof parsedJson.abilityUsed === "string" ? parsedJson.abilityUsed : undefined;

        if (latestCampaign.status !== "lobby") {
          safePushDisplayEvent(latestCampaign, {
            ...classifyStoryBeat(latestCampaign, speaker),
            content: narratorText,
            itemUsed: itemUsed,
            abilityUsed: abilityUsed
          });
        }
      }

      if (typeof parsedJson.currentScene === "string" && parsedJson.currentScene.trim()) {
        latestCampaign.currentScene = sanitizeSceneLabel(parsedJson.currentScene);
      }
      if (typeof parsedJson.overview === "string") {
        latestCampaign.overview = parsedJson.overview;
      }
      // The title is set once, on the opening turn of a surprise/randomized
      // campaign (where the player deliberately left it for the AI to invent).
      // Every other campaign already has a real, player-chosen title — and
      // ANY campaign's title used to get silently overwritten every turn
      // (it flip-flopped mid-combat in playtesting), so later turns never
      // touch it regardless of what the model sends.
      if (isOpeningTurn && latestCampaign.isRandomized && typeof parsedJson.title === "string" && parsedJson.title.trim()) {
        latestCampaign.title = parsedJson.title.trim();
      }

      if (latestCampaign.status === "active") {
        // Clear player actions at start of turn so they don't linger
        for (const p of latestCampaign.players) {
          latestCampaign.playerActions[p.id] = [];
        }
        if (parsedJson.playerActions) {
          if (Array.isArray(parsedJson.playerActions)) {
            for (const item of parsedJson.playerActions) {
              if (item && typeof item === "object") {
                const pId = String(item.playerId || item.playerName || "");
                const actions = item.actions;
                const player = latestCampaign.players.find((p) => p.id === pId) ||
                               latestCampaign.players.find((p) => (p.characterName || p.name).toLowerCase() === pId.toLowerCase());
                if (player && Array.isArray(actions)) {
                  latestCampaign.playerActions[player.id] = normalizeActions(actions).slice(0, 4);
                }
              }
            }
          } else if (typeof parsedJson.playerActions === "object") {
            for (const [pId, actions] of Object.entries(parsedJson.playerActions)) {
              const player = latestCampaign.players.find((p) => p.id === pId) ||
                             latestCampaign.players.find((p) => (p.characterName || p.name).toLowerCase() === pId.toLowerCase());
              if (player && Array.isArray(actions)) {
                latestCampaign.playerActions[player.id] = normalizeActions(actions).slice(0, 4);
              }
            }
          }
        }
      }

      if (Array.isArray(parsedJson.partyActions)) {
        latestCampaign.partyActions = normalizeActions(parsedJson.partyActions).slice(0, 4);
      }

      if (Array.isArray(parsedJson.playerUpdates)) {
        for (const update of parsedJson.playerUpdates) {
          const player = latestCampaign.players.find((item) => item.id === String(update.playerId || "")) ||
                         latestCampaign.players.find((item) => (item.characterName || item.name).toLowerCase() === String(update.playerName || update.playerId || "").toLowerCase());
          if (!player) continue;
          if (Array.isArray(update.inventory)) player.inventory = update.inventory.map(String);
          if (Array.isArray(update.abilities)) player.abilities = update.abilities.map(String);
          if (typeof update.notes === "string") player.notes = update.notes;
          if (typeof update.characterName === "string" && (latestCampaign.isRandomized || !player.characterName)) {
            player.characterName = update.characterName;
          }
          if (typeof update.background === "string") player.background = update.background;
          if (typeof update.status === "string") player.status = update.status;
          if (typeof update.portraitUrl === "string" && isValidImageUrl(update.portraitUrl)) {
            const localUrl = await downloadAndSaveImage(campaignId, update.portraitUrl, "players", player.id);
            player.portraitUrl = localUrl;
            if (localUrl && localUrl.trim()) {
              if (!latestCampaign.portraits) latestCampaign.portraits = [];
              const exists = latestCampaign.portraits.some((p) => p.url === localUrl);
              if (!exists) {
                latestCampaign.portraits.push({
                  id: createId("portrait"),
                  url: localUrl,
                  prompt: update.portraitPrompt || player.portraitPrompt || "Portrait of " + (player.characterName || player.name),
                  characterName: player.characterName || player.name,
                  createdAt: new Date().toISOString()
                });
              }
            }
          }
          if (typeof update.portraitPrompt === "string") player.portraitPrompt = update.portraitPrompt;
          if (typeof update.color === "string") player.color = update.color;
          if (typeof update.zoneId === "string" && update.zoneId.trim()) player.zoneId = update.zoneId.trim();
          // The model may relocate a player via playerUpdates (it did so in the
          // first split session and the move was silently dropped, desyncing
          // positions). Honor it when the target location actually exists.
          if (typeof update.locationId === "string" && update.locationId.trim()) {
            const locId = update.locationId.trim();
            if ((latestCampaign.locations || []).some((l) => l.id === locId)) player.locationId = locId;
          }
          applyConditionFields(player, update);
          if (Array.isArray(update.stats)) {
            player.stats = mergeStats(player.stats, update.stats);
          }
        }
      }

      if (Array.isArray(parsedJson.npcUpdates)) {
        for (const update of parsedJson.npcUpdates) {
          let char = latestCampaign.storyCharacters.find((c) => c.id === String(update.id || "")) ||
                     (update.renameFrom && latestCampaign.storyCharacters.find((c) => c.name.trim().toLowerCase() === String(update.renameFrom).trim().toLowerCase())) ||
                     latestCampaign.storyCharacters.find((c) => c.name.trim().toLowerCase() === String(update.name || "").trim().toLowerCase());
          if (char) {
            if (typeof update.name === "string") char.name = update.name;
            if (typeof update.description === "string") char.description = update.description;
            if (typeof update.portraitUrl === "string" && isValidImageUrl(update.portraitUrl)) {
              const localUrl = await downloadAndSaveImage(campaignId, update.portraitUrl, "npcs", char.id);
              char.portraitUrl = localUrl;
              if (localUrl && localUrl.trim()) {
                if (!latestCampaign.portraits) latestCampaign.portraits = [];
                const exists = latestCampaign.portraits.some((p) => p.url === localUrl);
                if (!exists) {
                  latestCampaign.portraits.push({
                    id: createId("portrait"),
                    url: localUrl,
                    prompt: update.description || char.description || "Portrait of NPC " + char.name,
                    characterName: char.name,
                    createdAt: new Date().toISOString()
                  });
                }
              }
            }
            if (typeof update.status === "string") char.status = update.status;
            if (typeof update.color === "string") char.color = update.color;
            if (typeof update.locationId === "string" && update.locationId.trim()) char.locationId = update.locationId.trim();
            if (typeof update.zoneId === "string" && update.zoneId.trim()) char.zoneId = update.zoneId.trim();
            if (Array.isArray(update.inventory)) char.inventory = update.inventory.map(String);
            if (Array.isArray(update.abilities)) char.abilities = update.abilities.map(String);
            applyNpcGroupFields(char, update);
            applyConditionFields(char, update);
            if (Array.isArray(update.stats)) {
              char.stats = mergeStats(char.stats, update.stats);
            }
          } else {
            const newCharId = String(update.id || createId("character"));
            let localUrl = undefined;
            if (typeof update.portraitUrl === "string" && isValidImageUrl(update.portraitUrl)) {
              localUrl = await downloadAndSaveImage(campaignId, update.portraitUrl, "npcs", newCharId);
            }
            // A brand-new NPC/enemy defaults to wherever the party currently is
            // (the focused location) so it shows up in the same right-side rail
            // and combat as the players it just appeared in front of, instead of
            // silently landing on the campaign's very first location.
            const npc: StoryCharacter = {
              id: newCharId,
              name: String(update.name || "NPC"),
              description: String(update.description || ""),
              portraitUrl: localUrl,
              status: update.status,
              color: update.color,
              locationId: typeof update.locationId === "string" && update.locationId.trim() ? update.locationId.trim() : getFocusedLocation(latestCampaign).id,
              inventory: Array.isArray(update.inventory) ? update.inventory.map(String) : [],
              abilities: Array.isArray(update.abilities) ? update.abilities.map(String) : [],
              stats: Array.isArray(update.stats) ? mergeStats([], update.stats) : []
            };
            applyNpcGroupFields(npc, update);
            applyConditionFields(npc, update);
            if (localUrl) {
              if (!latestCampaign.portraits) latestCampaign.portraits = [];
              const exists = latestCampaign.portraits.some((p) => p.url === localUrl);
              if (!exists) {
                latestCampaign.portraits.push({
                  id: createId("portrait"),
                  url: localUrl,
                  prompt: npc.description || "Portrait of NPC " + npc.name,
                  characterName: npc.name,
                  createdAt: new Date().toISOString()
                });
              }
            }
            latestCampaign.storyCharacters.push(npc);
          }
        }
      }
    }

    // Backdrop guarantee: the small RP model paints the opening scene then
    // forgets the backdrop exists (in playtesting it changed ambience 27× but
    // the image 0× across 46 turns). So we reconcile server-side — if the scene
    // has moved materially and the DM didn't repaint this turn, reuse a fitting
    // past background or paint a fresh one. Non-fatal on failure.
    if (latestCampaign.status === "active") {
      const reconcileBackdrop = async () => {
        try {
          const scene = (latestCampaign.currentScene || "").trim();
          const modelChangedBackdrop = latestCampaign.currentImageUrl !== preTurnImageUrl;
          if (scene) {
            if (modelChangedBackdrop) {
              latestCampaign.backdropScene = scene; // the DM handled it this turn
            } else if (
              !latestCampaign.backdropScene ||
              sceneSimilarity(scene, latestCampaign.backdropScene) < 0.75 ||
              // Also reconcile when the situation summary has clearly moved on,
              // even if the short scene label reads similar — keeps the backdrop
              // from going stale across a long beat in one location.
              sceneSimilarity(`${scene} ${latestCampaign.overview || ""}`, latestCampaign.backdropScene) < 0.6
            ) {
              const decision = await chooseBackdrop(latestCampaign, false);
              await applyBackdropDecision(latestCampaign, decision, scene, false);
            }
          }
        } catch (err) {
          serverError("Backdrop", "Scene-director reconcile failed (non-fatal)", err);
          void logCampaignEvent(campaignId, "ERROR", "Image", "Scene-director reconcile failed", {
            error: err instanceof Error ? err.message : String(err),
            errorName: err instanceof Error ? err.name : undefined
          });
        }
      };

      // The correction passes below are corrective, not prescriptive: each one
      // no-ops when the model already did its job this turn (repainted, set the
      // mood, switched combat, painted its NPCs). A capable model therefore
      // pays ~nothing, while a tool-forgetful RP model gets caught every time —
      // the guidance self-calibrates per turn, so there is no config knob.
      // Stage-direction guarantee (feedback: ambience froze on one mood for an
      // entire climax and start_combat never fired even when the model's own
      // reasoning said "combat begins"). When the model didn't direct the
      // stage itself this turn, a narrowly-scoped follow-up call reviews the
      // fresh beats and corrects mood/combat state. Non-fatal on failure.
      try {
        await reconcileStageDirection(latestCampaign, turnBeats, { modelSetAmbience, modelTouchedCombat });
      } catch (err) {
        serverError("StageDirector", "Stage-direction reconcile failed (non-fatal)", err);
        void logCampaignEvent(campaignId, "ERROR", "Narration", "Stage-direction reconcile failed", {
          error: err instanceof Error ? err.message : String(err),
          errorName: err instanceof Error ? err.name : undefined
        });
      }
    }

    // The music theme is chosen by the DM AI before the lobby opens (see
    // chooseCampaignTheme), so there is nothing to backfill here. The score
    // stays fixed for the whole saga once set.

    latestCampaign.dmStatus = undefined; // Clear DM status
    latestCampaign.dmPhase = undefined;
    // A turn got through, so whatever the host was being asked to recover from
    // is resolved — drop the failure banner and the preserved retry payload.
    latestCampaign.narrationFailure = undefined;

    // Save this turn's backdrop/ambience into the focused location so cutting
    // back to it later restores instantly, and keep the focused mirror in sync.
    persistFocusedLocation(latestCampaign);
    syncFocusedMirror(latestCampaign);

    // Kick off TTS clip synthesis for this turn's spoken beats. This resolves
    // the voice, builds the batch SYNCHRONOUSLY (so latestCampaign.ttsBatchId
    // is set before the save below lets polling clients see it), and only the
    // actual audio generation runs in the background. Best-effort, never throws.
    await startTtsForTurn(latestCampaign, turnBeats);

    finishCampaignDraft(campaignId);
    await saveCampaign(latestCampaign);
    queuePostTurnMaintenance(latestCampaign, preTurnImageUrl);

    // TPK backstop (feedback: "once the party dies the AI is reluctant to call
    // end_campaign"). When the whole party is down and the DM left the saga
    // open, the table is frozen — nobody can act and no outro ever plays. Force
    // ONE more turn whose only job is to seal the ending, so the credits always
    // fire without a human having to nudge the DM. `isAutoEnding` guards against
    // recursion if that follow-up turn still doesn't end things.
    if (
      !options.isAutoEnding &&
      latestCampaign.status === "active" &&
      isPartyWiped(latestCampaign)
    ) {
      serverLog("DM END", `TPK detected for ${campaignId} — auto-sealing the saga.`);
      await logCampaignDebug(campaignId, `[TPK] Whole party down — auto-ending the campaign.`);
      try {
        return await runDungeonMaster(
          campaignId,
          "Game Master",
          "The ENTIRE party is down — every player is at 0 HP or dead/dying/unconscious/incapacitated. This is a total party kill: the saga cannot continue and the table is frozen with no one able to act. Call end_campaign NOW (kind 'defeat', or 'bittersweet'/'escape' only if the fiction genuinely supports it) with a fitting title, a 1-3 sentence epilogue, 3-6 highlights, a per-player cast line for each fallen hero, and 3-6 stats. Then narrate a short final epilogue with empty playerActions and offer no further choices.",
          { hiddenUserMessage: true, isAutoEnding: true }
        );
      } catch (autoErr) {
        serverError("DM END", `TPK auto-end failed for ${campaignId} (non-fatal)`, autoErr);
      }
    }

    serverLog("DM END", `DM finished successfully for campaign: ${campaignId}`);
    void logCampaignEvent(campaignId, "INFO", "Narration", "Turn completed", {
      target: selectedChatTargetId || DEFAULT_CHAT_TARGET_ID,
      model: resolveChatTarget(selectedChatTargetId).model,
      durationMs: Date.now() - turnStartedAt,
      messageCount: latestCampaign.messages.length,
      status: latestCampaign.status
    });
    return { campaign: latestCampaign, toolEvents };
  } catch (error) {
    serverError("Dungeon Master", `DM failed with error for campaign: ${campaignId}`, error);
    const errorMsg = error instanceof Error ? error.stack : String(error);
    await logCampaignDebug(campaignId, `[ERROR] Dungeon Master error: ${errorMsg}`);
    const failureStatus = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : undefined;
    const failureCode = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : undefined;
    const failureStep = typeof (error as { dmStep?: unknown })?.dmStep === "number" ? (error as { dmStep: number }).dmStep : undefined;
    void logCampaignEvent(campaignId, "ERROR", "Narration", "Turn failed", {
      target: campaign.selectedChatTargetId || DEFAULT_CHAT_TARGET_ID,
      step: failureStep,
      status: failureStatus,
      code: failureCode,
      durationMs: Date.now() - turnStartedAt,
      error: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : undefined
    });
    try {
      finishCampaignDraft(campaignId);
      const currentCampaign = await getCampaign(campaignId);
      currentCampaign.dmStatus = undefined;
      currentCampaign.dmPhase = undefined;
      // Fall back to the last option: restore the choices that were on the
      // table before this failed turn so the party can retry immediately
      // instead of being stranded with empty controllers.
      currentCampaign.playerActions = preTurnPlayerActions;
      currentCampaign.partyActions = preTurnPartyActions;
      currentCampaign.suggestedActions = preTurnSuggestedActions;
      // Leave the failure ON campaign state. Switching provider is MANUAL by
      // design, so the host has to be able to see what broke and on which
      // target — and to replay this exact turn once they've switched. The
      // composed action string can't be reconstructed from the restored
      // choices (an exploration round folds every lock-in into one prompt),
      // so it is preserved here and nowhere else. Auto-ending turns are
      // excluded: their prompt is machine-generated and replaying it by hand
      // isn't a thing a host should be offered.
      currentCampaign.narrationFailure = {
        at: new Date().toISOString(),
        targetId: currentCampaign.selectedChatTargetId || DEFAULT_CHAT_TARGET_ID,
        status: failureStatus,
        code: failureCode,
        message: scrubLogText(error instanceof Error ? error.message : String(error), 400),
        step: failureStep,
        payload: options.isAutoEnding ? undefined : { playerName, action }
      };
      await saveCampaign(currentCampaign);
    } catch (dbErr) {
      serverError("Dungeon Master", "Failed to clear dmStatus on error", dbErr);
    }
    // A failed turn leaves no spoken beats behind — drop any clips the
    // sidecar may have queued for this campaign so stale audio never plays.
    try {
      releaseCampaign(campaignId);
    } catch {
      /* best-effort — never mask the real turn failure */
    }
    throw error;
  }
}

/**
 * Deterministic delivery-hint heuristic for a spoken line: excited or punchy
 * lines get a higher exaggeration (up to 1.0), everything else sits at 0.5.
 * cfgWeight is a constant 0.5 for all clips.
 */
function ttsDeliveryHints(text: string): { exaggeration: number; cfgWeight: number } {
  const exclamations = (text.match(/!/g) || []).length;
  const sentences = text.split(/[.!?…]+/).map((s) => s.trim()).filter(Boolean);
  const avgSentenceLength = sentences.length ? text.length / sentences.length : text.length;
  const words = text.split(/\s+/).filter(Boolean);
  const allCapsWords = words.filter((w) => w.length >= 3 && /^[^a-z]*[A-Z][^a-z]*$/.test(w) && /[A-Z]/.test(w)).length;
  const excited = exclamations > 0 || allCapsWords > 0 || avgSentenceLength < 40;
  return { exaggeration: excited ? 1.0 : 0.5, cfgWeight: 0.5 };
}

/** Strip inline TV emphasis markers (*…* and `…`) so the TTS reads plain text. */
function ttsPlainText(text: string): string {
  return text.replace(/\*+/g, "").replace(/`+/g, "").replace(/[ \t]{2,}/g, " ").trim();
}

/**
 * Let the configured fast model simplify delivery for speech synthesis without
 * changing plot, names, or speaker intent. This is deliberately best-effort:
 * malformed output, unavailable fast models, and timeouts all retain the
 * deterministic plain-text version of each line.
 */
async function prepareTtsChunks(chunks: Array<{ id: string; text: string }>): Promise<Array<{ id: string; text: string }>> {
  if (!aquaConfig().fastModel || !chunks.length) return chunks;
  const { model, options } = fastModelTarget();
  const fallback = new Map(chunks.map((chunk) => [chunk.id, chunk.text]));
  try {
    const response = (await aquaFetch("/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "Rewrite RPG narration for a single TTS voice. Return JSON only: {\"lines\":[{\"id\":string,\"text\":string}]}. Preserve every id exactly. Keep names, facts, dialogue meaning, tense, and mood. Remove markdown and stage directions. Use short natural sentences and punctuation for clear delivery. Do not add or omit content."
          },
          { role: "user", content: JSON.stringify({ lines: chunks }) }
        ],
        response_format: { type: "json_object" }
      })
    }, {
      ...options,
      retries: 1,
      timeoutMs: Math.max(3000, Number(process.env.TTS_PREP_TIMEOUT_MS) || 8000)
    })) as ChatCompletionResponse;
    const content = response.choices?.[0]?.message?.content || response.message?.content;
    const parsed = typeof content === "string" ? JSON.parse(content) : null;
    if (!Array.isArray(parsed?.lines)) throw new Error("Fast model returned no TTS line list");
    const rewritten = new Map<string, string>();
    for (const line of parsed.lines) {
      const id = typeof line?.id === "string" ? line.id : "";
      const text = typeof line?.text === "string" ? ttsPlainText(line.text) : "";
      if (fallback.has(id) && text && text.length <= fallback.get(id)!.length * 2) rewritten.set(id, text);
    }
    if (rewritten.size !== chunks.length) throw new Error("Fast model returned an incomplete TTS line list");
    return chunks.map((chunk) => ({ ...chunk, text: rewritten.get(chunk.id) || chunk.text }));
  } catch (err) {
    serverError("TTS", "Fast-model speech preparation failed; using deterministic text", err);
    return chunks;
  }
}

/**
 * Turn-scoped TTS batch kickoff. Filters this turn's beats down to the spoken
 * lines (narration + NPC/narrator dialogue, never player lines), resolves the
 * campaign voice, and creates a fresh in-memory clip batch — releasing any
 * batch from a previous turn first. The batch id lands on the campaign BEFORE
 * the caller saves it, so polling clients can start pulling clips immediately;
 * audio generation itself continues in the background.
 *
 * Best-effort by contract: wrapped in try/catch, logs via serverError +
 * logCampaignEvent, and NEVER throws — a dead sidecar must never break a turn.
 */
async function startTtsForTurn(
  campaign: Campaign,
  turnBeats: Array<{ speaker?: string; content?: string; event: DisplayEvent }>
): Promise<void> {
  try {
    if (campaign.ttsEnabled === false) return;

    // Speakers that belong at the table, not in the narrator's voice: player
    // character/display names are excluded; everyone else (NARRATOR, NPCs and
    // other story characters) is speakable.
    const playerNames = new Set(
      campaign.players
        .flatMap((p) => [p.characterName, p.name])
        .filter((n): n is string => !!n && !!n.trim())
        .map((n) => n.trim().toLowerCase())
    );
    const storyNames = new Set(
      campaign.storyCharacters
        .map((c) => c.name)
        .filter((n): n is string => !!n && !!n.trim())
        .map((n) => n.trim().toLowerCase())
    );

    // Expand each event exactly the way the TV will perform it, then keep only
    // narration/dialogue beats spoken by the narrator or a story character.
    const chunks: Array<{ id: string; text: string }> = [];
    for (const beat of turnBeats) {
      for (const expanded of expandDisplayEvent(beat.event)) {
        if (expanded.type !== "narration" && expanded.type !== "dialogue") continue;
        const speaker = (expanded.speaker || "").trim();
        const lower = speaker.toLowerCase();
        if (playerNames.has(lower)) continue;
        const isNarrator = !speaker || lower === "narrator";
        if (!isNarrator && !storyNames.has(lower)) continue;
        const text = ttsPlainText(expanded.content || "");
        if (text) chunks.push({ id: expanded.id, text });
      }
    }
    if (!chunks.length) return;

    // Voice: the campaign's chosen voice when it still resolves, otherwise the
    // first discovered voice. No voices on disk → nothing to synthesize.
    let voiceId: string | undefined;
    if (campaign.ttsVoiceId) {
      voiceId = (await getVoice(campaign.ttsVoiceId))?.id;
    }
    if (!voiceId) {
      voiceId = (await listVoices())[0]?.id;
    }
    if (!voiceId) return;

    const preparedChunks = await prepareTtsChunks(chunks);
    const clips = preparedChunks.map(({ id, text }) => ({ id, text, voiceId, ...ttsDeliveryHints(text) }));

    // One live batch per campaign: drop last turn's clips before queuing these.
    releaseCampaign(campaign.id);
    const summary = createBatch(campaign.id, clips, campaign.ttsServerPort);
    campaign.ttsBatchId = summary.batchId;
    void logCampaignEvent(campaign.id, "INFO", "TTS", "Turn TTS batch queued", {
      batchId: summary.batchId,
      clipCount: clips.length,
      voiceId
    });
  } catch (err) {
    serverError("TTS", "Turn TTS batch creation failed (non-fatal)", err);
    void logCampaignEvent(campaign.id, "ERROR", "TTS", "Turn TTS batch creation failed", {
      error: err instanceof Error ? err.message : String(err),
      errorName: err instanceof Error ? err.name : undefined
    });
  }
}

function cloneCampaign(campaign: Campaign): Campaign {
  return JSON.parse(JSON.stringify(campaign)) as Campaign;
}

function queuePostTurnMaintenance(campaign: Campaign, preTurnImageUrl?: string) {
  const backdropSnapshot = cloneCampaign(campaign);
  const portraitSnapshot = cloneCampaign(campaign);
  const housekeepingSnapshot = cloneCampaign(campaign);

  void Promise.allSettled([
    campaign.status === "active" ? (async () => {
      try {
        const scene = (backdropSnapshot.currentScene || "").trim();
        const modelChangedBackdrop = backdropSnapshot.currentImageUrl !== preTurnImageUrl;
        if (!scene || modelChangedBackdrop) return;
        const stale = !backdropSnapshot.backdropScene ||
          sceneSimilarity(scene, backdropSnapshot.backdropScene) < 0.75 ||
          sceneSimilarity(`${scene} ${backdropSnapshot.overview || ""}`, backdropSnapshot.backdropScene) < 0.6;
        if (!stale) return;
        const beforeImageIds = new Set((backdropSnapshot.images || []).map((image) => image.id));
        const decision = await chooseBackdrop(backdropSnapshot, false);
        await applyBackdropDecision(backdropSnapshot, decision, scene, false);
        const release = await getCampaignLock(campaign.id).acquire();
        try {
          const fresh = await getCampaign(campaign.id);
          if (fresh.status !== "active" || fresh.currentScene !== scene) return;
          const additions = (backdropSnapshot.images || []).filter((image) => !beforeImageIds.has(image.id));
          for (const image of additions) {
            if (!fresh.images.some((existing) => existing.id === image.id)) fresh.images.push(image);
          }
          const changed = fresh.currentImageUrl !== backdropSnapshot.currentImageUrl;
          fresh.currentImageUrl = backdropSnapshot.currentImageUrl;
          fresh.backdropScene = backdropSnapshot.backdropScene;
          if (changed) safePushDisplayEvent(fresh, { type: "scene", speaker: "Scene", content: "The TV scene background shifts." });
          await saveCampaign(fresh);
        } finally {
          release();
        }
      } catch (err) {
        serverError("Backdrop", "Background reconcile failed and was skipped (non-fatal)", err);
        void logCampaignEvent(campaign.id, "ERROR", "Image", "Detached backdrop reconcile failed", {
          error: err instanceof Error ? err.message : String(err),
          errorName: err instanceof Error ? err.name : undefined
        });
      }
    })() : Promise.resolve(),
    campaign.status === "active" ? (async () => {
      try {
        const beforePortraitIds = new Set((portraitSnapshot.portraits || []).map((portrait) => portrait.id));
        await reconcileNpcPortraits(portraitSnapshot);
        const additions = (portraitSnapshot.portraits || []).filter((portrait) => !beforePortraitIds.has(portrait.id));
        if (!additions.length) return;
        const release = await getCampaignLock(campaign.id).acquire();
        try {
          const fresh = await getCampaign(campaign.id);
          if (!fresh.portraits) fresh.portraits = [];
          for (const portrait of additions) {
            if (!fresh.portraits.some((existing) => existing.id === portrait.id)) fresh.portraits.push(portrait);
            const sourceNpc = portraitSnapshot.storyCharacters.find((npc) => npc.name === portrait.characterName);
            const freshNpc = sourceNpc && fresh.storyCharacters.find((npc) => npc.id === sourceNpc.id);
            if (freshNpc && !freshNpc.portraitUrl) freshNpc.portraitUrl = sourceNpc.portraitUrl;
          }
          await saveCampaign(fresh);
        } finally {
          release();
        }
      } catch (err) {
        // This runs detached, after the HTTP request and the DM turn are both
        // gone. Without its own catch the rejection dies inside allSettled and
        // the campaign's own log shows nothing at all.
        serverError("Portraits", "Portrait backfill merge failed (non-fatal)", err);
        void logCampaignEvent(campaign.id, "ERROR", "Image", "Portrait backfill task failed", {
          error: err instanceof Error ? err.message : String(err),
          errorName: err instanceof Error ? err.name : undefined
        });
      }
    })() : Promise.resolve(),
    sweepAndMergeHousekeeping(campaign.id, housekeepingSnapshot)
  ]).then((results) => {
    // Belt and braces. Each branch above catches its own failures, but a
    // rejection that escapes one of them must still land somewhere: this runs
    // after the HTTP request and the DM turn are both gone, so an unobserved
    // promise here is a silent loss that looks exactly like "it never ran".
    const labels = ["backdrop", "portraits", "housekeeping"];
    results.forEach((result, index) => {
      if (result.status !== "rejected") return;
      const task = labels[index] || String(index);
      serverError("PostTurn", `Detached ${task} task rejected (non-fatal)`, result.reason);
      void logCampaignEvent(campaign.id, "ERROR", "System", "Detached maintenance task rejected", {
        task,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        errorName: result.reason instanceof Error ? result.reason.name : undefined
      });
    });
  });
}

/**
 * Run one housekeeping sweep off a snapshot and merge the result back under the
 * campaign lock.
 *
 * The provider call deliberately happens with NO lock held — on a bad day it
 * runs for minutes, and holding the campaign mutex through it freezes every
 * chat turn, presence sweep and party action at the table. Only the merge takes
 * the lock, and it preserves messages and NPCs created after the snapshot.
 *
 * Never throws: this is best-effort background work by contract, and its
 * failures have to be visible in the campaign's own debug.log rather than dying
 * in an unobserved promise. The merge is what actually persists the summary and
 * the trim, so a silent loss here is indistinguishable from "housekeeping never
 * ran" — exactly the ambiguity this phase exists to remove.
 */
async function sweepAndMergeHousekeeping(campaignId: string, snapshot: Campaign): Promise<void> {
  // One sweep per campaign at a time. Two concurrent sweeps work from separate
  // snapshots of the same transcript and then merge in sequence, so the second
  // one's summary — computed without the first one's trim — silently wins.
  // Reachable from the manual retry button, which the host can click repeatedly.
  if (housekeepingInFlight.has(campaignId)) {
    void logCampaignEvent(campaignId, "INFO", "Housekeeping", "Sweep skipped", { reason: "already_running" });
    return;
  }
  housekeepingInFlight.add(campaignId);
  try {
    const originalMessageIds = new Set(snapshot.messages.map((message) => message.id));
    const originalNpcIds = new Set(snapshot.storyCharacters.map((npc) => npc.id));
    const beforeSummary = snapshot.storySummary;
    const beforeMemory = snapshot.memory;
    const beforeHk = JSON.stringify(snapshot.housekeeping || null);
    await runHousekeeping(snapshot);
    const summaryChanged = snapshot.storySummary !== beforeSummary;
    const memoryChanged = snapshot.memory !== beforeMemory;
    const changed = summaryChanged ||
      memoryChanged ||
      snapshot.messages.length !== originalMessageIds.size ||
      snapshot.storyCharacters.length !== originalNpcIds.size ||
      JSON.stringify(snapshot.housekeeping || null) !== beforeHk;
    if (!changed) return;
    const keptMessageIds = new Set(snapshot.messages.map((message) => message.id));
    const keptNpcIds = new Set(snapshot.storyCharacters.map((npc) => npc.id));
    const release = await getCampaignLock(campaignId).acquire();
    try {
      const fresh = await getCampaign(campaignId);
      // Write back ONLY what this sweep actually produced. The provider call runs
      // for up to a couple of minutes with no lock held, and a whole turn can
      // land in that window and legitimately rewrite memory (update_campaign_state
      // does exactly that) — so assigning the snapshot's copies unconditionally
      // reverts the newer turn's work. A failed sweep still reaches this merge,
      // because its own bookkeeping counts as a change; without these guards a
      // failure would quietly roll memory back to a two-minute-old value.
      if (summaryChanged) fresh.storySummary = snapshot.storySummary;
      if (memoryChanged) fresh.memory = snapshot.memory;
      fresh.housekeeping = snapshot.housekeeping;
      fresh.messages = fresh.messages.filter((message) => !originalMessageIds.has(message.id) || keptMessageIds.has(message.id));
      fresh.storyCharacters = fresh.storyCharacters.filter((npc) => !originalNpcIds.has(npc.id) || keptNpcIds.has(npc.id));
      await saveCampaign(fresh);
    } finally {
      release();
    }
  } catch (err) {
    serverError("Housekeeping", "Housekeeping sweep/merge failed (non-fatal)", err);
    void logCampaignEvent(campaignId, "ERROR", "Housekeeping", "Merge failed", {
      error: err instanceof Error ? err.message : String(err),
      errorName: err instanceof Error ? err.name : undefined
    });
  } finally {
    housekeepingInFlight.delete(campaignId);
  }
}

/**
 * After a location's beat finishes (an exploration round resolved, or a full
 * combat round played out), hand the spotlight to the next occupied location
 * and cut the TV there. No-op when the party isn't split or the saga ended.
 * Callers must hold the campaign lock.
 */
export async function rotateSpotlight(campaignId: string, fromLocationId: string): Promise<Campaign> {
  const campaign = await getCampaign(campaignId);
  ensureLocations(campaign);
  if (campaign.status !== "active" || !isPartySplit(campaign)) return campaign;
  // Rotate FROM the scene that just resolved, regardless of where a mid-turn
  // set_focus wandered off to.
  campaign.activeLocationId = fromLocationId;
  const next = rotateActiveLocation(campaign);
  if (next && next.id !== fromLocationId) {
    applyFocus(campaign, next);
    const names = campaign.players
      .filter((p) => p.locationId === next.id && !p.away)
      .map((p) => p.characterName || p.name);
    safePushDisplayEvent(campaign, {
      type: "system",
      speaker: "SYSTEM",
      content: `The story cuts to ${next.name}${names.length ? ` — ${names.join(", ")}, it's your group's turn` : ""}.`
    });
    serverLog("Spotlight", `Rotated active location ${fromLocationId} → ${next.id} (${next.name})`);
    await logCampaignDebug(campaignId, `[Spotlight] Beat finished at ${fromLocationId}; spotlight moves to ${next.id} (${next.name}).`);
  }
  syncFocusedMirror(campaign);
  await saveCampaign(campaign);
  return campaign;
}

/**
 * Resolve a full EXPLORATION round: fold every locked-in action into ONE DM
 * turn (honoring unanimous "together" actions), pushing each player's choice as
 * a user message + display beat first so the transcript and TV reflect it.
 */
export async function resolveExplorationRound(campaignId: string, locationId?: string): Promise<Campaign> {
  const campaign = await getCampaign(campaignId);
  ensureLocations(campaign);
  reconcilePresence(campaign); // absent players don't count toward the round
  const loc = campaign.locations!.find((l) => l.id === locationId) || getFocusedLocation(campaign);
  const { action, displays } = buildExplorationResolution(campaign, loc);
  // The action resolves here → the TV cuts to this location.
  campaign.focusedLocationId = loc.id;
  if (!displays.length) {
    // Nothing locked in (all away/incapacitated) — just clear and return.
    loc.pendingActions = {};
    if (loc.turnState?.mode === "exploration") loc.turnState.deadlineAt = undefined;
    syncFocusedMirror(campaign);
    await saveCampaign(campaign);
    return campaign;
  }
  for (const d of displays) {
    campaign.messages.push({ id: createId("msg"), role: "user", name: d.name, content: d.action, createdAt: new Date().toISOString() });
    safePushDisplayEvent(campaign, { type: "playerAction", speaker: d.name, playerId: d.playerId, content: d.display });
  }
  loc.pendingActions = {};
  if (loc.turnState?.mode === "exploration") loc.turnState.deadlineAt = undefined;
  syncFocusedMirror(campaign);
  await saveCampaign(campaign);
  await runDungeonMaster(campaignId, "The Party", action, { hiddenUserMessage: true });
  // This scene's action played out — a split party's spotlight moves on.
  // (If the DM just STARTED combat here, the fight's rounds run when the
  // rotation returns; the ambush itself was this beat.)
  return await rotateSpotlight(campaignId, loc.id);
}

/**
 * After a combat actor's turn resolves, advance that location's initiative
 * pointer. Each time it lands on the enemy slot, run ONE hidden DM turn for the
 * enemies there, then advance again — looping until it's a player's turn (or
 * combat ended). Focus follows the location whose combat is resolving.
 */
export async function advanceCombatAndRunEnemies(campaignId: string, locationId?: string): Promise<Campaign> {
  let campaign = await getCampaign(campaignId);
  ensureLocations(campaign);
  const locId = locationId || campaign.focusedLocationId!;
  let loc = campaign.locations!.find((l) => l.id === locId);
  if (!loc) return campaign;
  if (loc.turnState?.mode !== "combat") {
    // The fight ended during the actor's own turn (end_combat / end_campaign)
    // — that closes this location's beat, so a split party's spotlight moves.
    return await rotateSpotlight(campaignId, locId);
  }
  reconcilePresence(campaign); // drop disconnected players from initiative
  let active = advanceCombat(campaign, loc);
  campaign.focusedLocationId = loc.id;
  syncFocusedMirror(campaign);
  await saveCampaign(campaign);

  let guard = 0;
  let ranEnemyPhase = false;
  while (active === ENEMY_SLOT && guard++ < 4) {
    ranEnemyPhase = true;
    await runDungeonMaster(
      campaignId,
      "Enemies",
      "It is the enemies' turn. Resolve every hostile NPC's action now — attacks (roll to hit, then damage), moves, taunts, retreats — and apply HP changes. If the fight is over (all foes down or fled), call end_campaign only if the whole saga closes, otherwise call end_combat. Then hand the turn back to the players.",
      { hiddenUserMessage: true }
    );
    campaign = await getCampaign(campaignId);
    loc = campaign.locations!.find((l) => l.id === locId);
    if (!loc || loc.turnState?.mode !== "combat") break;
    active = advanceCombat(campaign, loc);
    campaign.focusedLocationId = loc.id;
    syncFocusedMirror(campaign);
    await saveCampaign(campaign);
  }
  const combatOver = !loc || loc.turnState?.mode !== "combat";
  if (combatOver || ranEnemyPhase) {
    // The fight ended, or a FULL round just completed (every player acted and
    // the enemy phase resolved) — either way this location's beat is done, so
    // a split party's spotlight rotates. Mid-round player→player handoffs stay.
    return await rotateSpotlight(campaignId, locId);
  }
  return campaign;
}

// Matches the controllers' PRESENTING_STALE_MS: past this age a "presenting"
// flag is a crashed/closed TV, not a live playback, and must not block anyone.
const PRESENTING_STALE_MS = 60_000;

/** True while the TV reports it's still typing/holding this turn's beats. */
function isPresenting(campaign: Campaign): boolean {
  return !!(campaign.presenting?.active && Date.now() - campaign.presenting.updatedAt < PRESENTING_STALE_MS);
}

/**
 * Wait until the table is genuinely idle: no DM turn generating, the TV done
 * playing out the previous turn's beats, and no exploration round half-locked.
 * Used to defer join/rejoin/departure weaves so a new arrival never interrupts
 * a story beat in flight (feedback #7). Bounded — after `timeoutMs` it returns
 * anyway so nobody is stranded waiting forever (e.g. behind a long fight).
 * Callers must NOT hold the campaign lock while waiting.
 */
export async function waitForDmIdle(campaignId: string, timeoutMs = 180_000): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      const campaign = await getCampaign(campaignId);
      if (campaign.status !== "active") return;
      const pendingSomewhere = (campaign.locations || []).some(
        (l) => Object.keys(l.pendingActions || {}).length > 0
      );
      if (!campaign.dmStatus && !isPresenting(campaign) && !pendingSomewhere) return;
    } catch {
      return; // campaign unreadable — let the caller's own error path surface it
    }
    if (Date.now() - start > timeoutMs) return;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

function humanizeDuration(ms: number): string {
  const minutes = ms / 60_000;
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `about ${Math.max(1, Math.round(minutes))} minute${Math.round(minutes) === 1 ? "" : "s"}`;
  const hours = minutes / 60;
  if (hours < 24) return `about ${Math.round(hours)} hour${Math.round(hours) === 1 ? "" : "s"}`;
  const days = hours / 24;
  return `about ${Math.round(days)} day${Math.round(days) === 1 ? "" : "s"}`;
}

/**
 * Extra context lines for a reintegration (rejoin/return) prompt: whether
 * their last known location is now abandoned (so the DM can relocate them
 * instead of leaving them narratively stranded alone), and how long they were
 * gone (so the DM can size the "meanwhile…" catch-up beat instead of always
 * giving a flat one-line return). Both derived from existing state — no new
 * counters beyond Player.awaySince.
 */
export function buildAbsenceBriefing(campaign: Campaign, player: Player): string[] {
  const lines: string[] = [];

  const lastLoc = (campaign.locations || []).find((l) => l.id === player.locationId);
  if (lastLoc) {
    const othersHere = eligiblePlayerIdsInLocation(campaign, lastLoc.id).filter((id) => id !== player.id);
    if (othersHere.length === 0) {
      const focus = getFocusedLocation(campaign);
      lines.push(
        focus.id === lastLoc.id
          ? `Their last known location was "${lastLoc.name}", which is also where the story is focused now — reintegrate them there.`
          : `Their last known location, "${lastLoc.name}", is now empty of other party members — the group has moved on to "${focus.name}". Relocate them into the current scene there rather than leaving them narratively stranded alone.`
      );
    }
  }

  if (player.awaySince) {
    const beatsElapsed = campaign.displayEvents.filter(
      (e) => (e.type === "narration" || e.type === "dialogue") && Date.parse(e.createdAt) > player.awaySince!
    ).length;
    // displayEvents is trimmed to the last 80 (normalizeDisplayEvents) — if
    // every kept event postdates their absence, more may have scrolled off.
    const capped = beatsElapsed > 0 && beatsElapsed >= campaign.displayEvents.length && campaign.displayEvents.length >= 80
      ? " (possibly more — the chronicle only keeps recent beats)"
      : "";
    lines.push(
      `They've been disconnected for roughly ${humanizeDuration(Date.now() - player.awaySince)}` +
        (beatsElapsed > 0 ? `, during which ~${beatsElapsed} story beat${beatsElapsed === 1 ? "" : "s"} happened${capped}` : "") +
        `. Size the "meanwhile…" catch-up beat to match — a brief aside for a short gap, a fuller recap for a long one.`
    );
  } else {
    lines.push(`Their absence length isn't tracked (likely a server restart) — keep the catch-up brief and generic.`);
  }

  return lines;
}

/**
 * Small models occasionally double-encode structured fields — story arrives as
 * a JSON string ("[{...}]") instead of an array, playerActions as a stringified
 * list (both seen in the first split-party session). Decode any stringified
 * array/object field back to its real shape so a structurally-correct turn is
 * applied in full instead of silently dropping its updates.
 */
function decodeStringifiedFields(data: Record<string, any>): Record<string, any> {
  const decode = (value: unknown) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) return value;
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  };
  for (const key of ["story", "playerActions", "partyActions", "playerUpdates", "npcUpdates"]) {
    if (key in data) data[key] = decode(data[key]);
  }
  return data;
}

/**
 * Robustly recover a story[] array from a model output that arrived as a
 * string (small models sometimes double-encode narrate_turn's story field).
 * `decodeStringifiedFields` only catches the clean case; this handles the
 * messy ones seen in the wild:
 *   - a stringified array with a premature `]` mid-stream (the model closed
 *     the array early then kept appending objects): `[{…},{…}], {…}, {…}]`
 *   - a stringified array with trailing junk after the closing bracket
 *   - an already-parsed array (returned as-is)
 *   - anything else (returns [] so the turn's beats aren't silently dropped)
 *
 * Without this, a malformed story string falls through `Array.isArray(...)` as
 * false, the whole story block is skipped, and ZERO narration/dialogue events
 * get pushed to displayEvents — so `storyStarted` never flips true and the TV
 * stays stuck on the Weaving screen at ~95% even though the DM finished.
 */
function parseStoryArray(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string") return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  // Fast path: clean stringified array.
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // fall through to recovery
  }

  // Recovery: scan for top-level JSON objects and collect every one that
  // looks like a story beat ({speaker, content}). This survives a premature
  // `]` (the model closed the array early then kept emitting objects) and
  // trailing junk after the real closing bracket.
  const beats: any[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        const candidate = trimmed.slice(start, i + 1);
        try {
          const obj = JSON.parse(candidate);
          if (obj && typeof obj === "object" && ("speaker" in obj || "content" in obj)) {
            beats.push(obj);
          }
        } catch {
          // skip malformed object
        }
        start = -1;
      }
    }
  }
  return beats;
}

// How many missing NPC portraits to backfill per turn (cost guard).
const NPC_PORTRAIT_BACKFILL_PER_TURN = 2;

/**
 * Portrait guarantee (same spirit as the backdrop guarantee): the small RP
 * model introduces NPCs via npcUpdates and forgets the "generate their
 * portrait first" rule — the first split-party session added four NPCs and
 * painted zero of them. After each turn, paint missing faces server-side (at
 * most a couple per turn) so every character on stage gets a real card.
 * Mutates the campaign in place; the caller saves. Non-fatal per NPC.
 */
async function reconcileNpcPortraits(campaign: Campaign): Promise<void> {
  const missing = campaign.storyCharacters.filter(
    (c) => !c.portraitUrl && c.status !== "Future NPC" && !c.claimedByPlayerId
  );
  if (!missing.length) return;
  for (const npc of missing.slice(0, NPC_PORTRAIT_BACKFILL_PER_TURN)) {
    try {
      const visual = (npc.description || "").trim();
      // The image model knows no names or lore — describe, never just name.
      const prompt = visual.length >= 20
        ? `Close-up character portrait: ${visual}. Cinematic lighting, detailed face, dramatic atmosphere.`
        : `Close-up character portrait of a mysterious figure from a ${campaign.musicTheme || "dark adventure"} tale${campaign.currentScene ? `, seen at ${campaign.currentScene}` : ""}. Cinematic lighting, detailed face, dramatic atmosphere.`;
      const portraitStartedAt = Date.now();
      const image = await generateImage(prompt, {
        aspect: "9:16",
        onRetry: retryLogger(campaign.id, "Image", "portrait-backfill")
      });
      const localUrl = await downloadAndSaveImage(campaign.id, image.url, "npcs", npc.id);
      npc.portraitUrl = localUrl;
      if (!campaign.portraits) campaign.portraits = [];
      campaign.portraits.push({
        id: createId("portrait"),
        url: localUrl,
        prompt: image.prompt,
        characterName: npc.name,
        createdAt: new Date().toISOString()
      });
      serverLog("Portraits", `Backfilled missing portrait for NPC "${npc.name}"`);
      await logCampaignDebug(campaign.id, `[Portraits] Backfilled missing portrait for NPC "${npc.name}".`);
      void logCampaignEvent(campaign.id, "INFO", "Image", "NPC portrait backfilled", {
        kind: "portrait",
        target: npc.name,
        durationMs: Date.now() - portraitStartedAt
      });
    } catch (err) {
      serverError("Portraits", `Portrait backfill failed for NPC "${npc.name}" (non-fatal)`, err);
      void logCampaignEvent(campaign.id, "ERROR", "Image", "NPC portrait backfill failed", {
        kind: "portrait",
        target: npc.name,
        error: err instanceof Error ? err.message : String(err),
        status: (err as { status?: unknown })?.status,
        code: (err as { code?: unknown })?.code
      });
    }
  }
}

// Moods the stage director may move the table to ("outro" is end_campaign's).
const DIRECTABLE_MOODS: AmbienceMood[] = ["calm", "tense", "adrenaline", "battle", "boss", "mystery", "dread", "triumph", "wonder", "somber"];

/**
 * Stage-direction guarantee (feedback #8/#9): the small RP model narrates
 * fights and mood swings but forgets the tools that make the TV follow —
 * in the first split-party session set_ambience stayed on one mood through the
 * whole climax and start_combat never fired even when the model's own
 * reasoning said "combat begins". Whenever the model touched neither mood nor
 * combat this turn, a narrowly-scoped forced tool call reviews the fresh beats
 * and corrects both. Mutates the campaign in place; the caller saves.
 */
async function reconcileStageDirection(
  campaign: Campaign,
  turnBeats: Array<{ speaker?: string; content?: string }>,
  opts: { modelSetAmbience: boolean; modelTouchedCombat: boolean }
): Promise<void> {
  if (campaign.status !== "active") return;
  if (opts.modelSetAmbience && opts.modelTouchedCombat) return;
  if (!turnBeats.length) return;

  ensureLocations(campaign);
  const loc = getFocusedLocation(campaign);
  const mode = loc.turnState?.mode === "combat" ? "combat" : "exploration";
  // Anything alive with tracked HP in this scene can be fought — the director
  // decides hostility from the beats; this is just the sanity gate.
  const combatants = campaign.storyCharacters.filter((c) => {
    if (c.locationId !== loc.id || c.canAct === false) return false;
    const hp = (c.stats || []).find((s) => s.name.toUpperCase() === "HP");
    return !!hp && hp.value > 0;
  });

  const tool: AquaToolDefinition = {
    type: "function",
    function: {
      name: "direct_stage",
      description: "Judge the scene's CURRENT emotional register and combat state from the beats that just played. Call EXACTLY ONCE.",
      parameters: {
        type: "object",
        required: ["mood", "combat"],
        properties: {
          mood: {
            type: "string",
            enum: ["keep", ...DIRECTABLE_MOODS],
            description: "'keep' if the mood already playing still fits; otherwise the register the scene has ACTUALLY moved to (a fight = battle, a climactic showdown or dreadful confrontation = boss, a chase = adrenaline, victory = triumph). Mood is about the MUSIC only — choosing 'boss' or 'battle' says nothing about whether the table is in combat, and never decide 'combat' from the mood you picked."
          },
          intensity: { type: "number", description: "0.0-1.0 for a changed mood. Default 0.6." },
          combat: {
            type: "string",
            enum: ["keep", "start", "end"],
            description: "'start' ONLY when these beats show an identified hostile actually engaging: it attacks, opens fire, springs an ambush, lunges, or lays hands on someone. 'end' when the fight is clearly over (foes dead, fled, or surrendered). 'keep' for everything else — and everything else includes: dread, a boss mood, an alarm, a countdown, enemies approaching or closing in, being seen or hunted, a standoff, a threat spoken, and damaging an environmental object or hazard that has HP. Nothing in the scene being scary or dangerous starts combat; only a hostile creature making contact does. When in doubt, 'keep'."
          }
        }
      }
    }
  };

  const beatText = turnBeats.slice(-10).map((b) => `${b.speaker || "NARRATOR"}: ${b.content || ""}`).join("\n");
  const user = [
    `Mood currently playing: ${campaign.ambience ? `${campaign.ambience.mood} (intensity ${campaign.ambience.intensity})` : "none yet (calm default)"}`,
    `Turn mode: ${mode}${mode === "combat" ? ` (round ${loc.turnState?.round || 1})` : ""}`,
    `Everything alive with HP in this scene (allies, neutrals and environmental targets included — this is NOT a list of enemies): ${combatants.length ? combatants.map((c) => c.name).join(", ") : "none tracked"}`,
    `Story beats that just played:\n${beatText}`
  ].join("\n\n");

  const stageTarget = campaignChatTarget(campaign);
  const response = (await aquaFetch("/chat/completions", {
    method: "POST",
    body: JSON.stringify({
      model: stageTarget.model,
      messages: [
        {
          role: "system",
          content: "You are the stage director for a couch RPG TV. Decide whether the mood/music register or the combat mode must change to match what just played on screen. Judge the two INDEPENDENTLY: mood is what the scene sounds like, combat is whether blows are actually being exchanged, and a tense or dreadful scene is very often not a fight. Be decisive about mood — a scene whose register genuinely shifted deserves a new one, do not let one mood drone through an entire act — and conservative about combat: switch it on only when an identified hostile has actually engaged, off only when the fight is plainly over. The NPC list you are given is everything alive with HP in the scene, which includes neutrals, allies, and environmental targets; presence in that list is not hostility. Call direct_stage exactly once."
        },
        { role: "user", content: user }
      ],
      tools: [tool],
      tool_choice: { type: "function", function: { name: "direct_stage" } }
    })
  }, { ...INTERACTIVE_FETCH, ...stageTarget.options, onRetry: retryLogger(campaign.id, "Narration", "stage-director") })) as ChatCompletionResponse;
  const message = response.choices?.[0]?.message || response.message;
  const call = Array.isArray(message?.tool_calls) ? message?.tool_calls?.[0] : null;
  if (!call?.function?.arguments) return;
  const args = JSON.parse(call.function.arguments) as Record<string, unknown>;

  const mood = String(args.mood || "keep").toLowerCase();
  if (!opts.modelSetAmbience && mood !== "keep" && DIRECTABLE_MOODS.includes(mood as AmbienceMood) && mood !== campaign.ambience?.mood) {
    const rawIntensity = Number(args.intensity ?? 0.6);
    campaign.ambience = {
      mood: mood as AmbienceMood,
      intensity: Number.isFinite(rawIntensity) ? Math.max(0, Math.min(1, rawIntensity)) : 0.6,
      updatedAt: new Date().toISOString()
    };
    serverLog("StageDirector", `Mood corrected to "${mood}" for campaign ${campaign.id}`);
    await logCampaignDebug(campaign.id, `[StageDirector] Ambience corrected to "${mood}" (the DM model didn't call set_ambience this turn).`);
  }

  const combat = String(args.combat || "keep").toLowerCase();
  if (!opts.modelTouchedCombat) {
    if (combat === "start" && mode === "exploration" && combatants.length) {
      startCombat(campaign, loc);
      safePushDisplayEvent(campaign, { type: "system", speaker: "SYSTEM", content: "⚔ Battle is joined — initiative order begins." });
      serverLog("StageDirector", `Combat auto-started at ${loc.name} for campaign ${campaign.id}`);
      await logCampaignDebug(campaign.id, `[StageDirector] start_combat enforced at ${loc.id} — the beats describe a fight but the DM model never switched modes.`);
    } else if (combat === "end" && mode === "combat") {
      endCombat(loc);
      serverLog("StageDirector", `Combat auto-ended at ${loc.name} for campaign ${campaign.id}`);
      await logCampaignDebug(campaign.id, `[StageDirector] end_combat enforced at ${loc.id} — the beats show the fight is over.`);
    }
  }
  syncFocusedMirror(campaign);
}

type BackdropDecision = { mode: "keep" | "reuse" | "new"; backgroundId?: string; prompt?: string };

/**
 * Word-overlap similarity (Jaccard on 4+ letter tokens) between two scene
 * descriptions. Used as a cheap gate: near-identical scenes (same location,
 * minor rewording) skip the scene-director AI call entirely.
 */
function sceneSimilarity(a: string, b: string): number {
  const toks = (s: string) =>
    new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3));
  const A = toks(a);
  const B = toks(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter += 1;
  return inter / (A.size + B.size - inter);
}

/** Plain-language description of the backdrop currently on the TV. */
function describeBackdropPrompt(campaign: Campaign): string {
  const url = campaign.currentImageUrl;
  if (!url) return "nothing yet (no backdrop painted)";
  const match = (campaign.images || []).find((img) => img.url === url);
  return match?.prompt ? match.prompt : "a previously painted scene";
}

/**
 * The backdrop safety-net pass: a standalone forced-tool call that decides the
 * TV backdrop for the CURRENT scene — reuse a fitting past background, paint a
 * new one, or keep what's showing. Runs on the large chat model (the RP model
 * reliably forgets to repaint on its own, so the server double-checks with a
 * fresh, narrowly-scoped call rather than trusting live narration for this).
 * When `force` is set (the host tapped Nudge), "keep" is not an option.
 */
async function chooseBackdrop(campaign: Campaign, force: boolean): Promise<BackdropDecision | null> {
  const backgrounds = (campaign.images || []).slice(-12).map((img) => ({ id: img.id, depicts: img.prompt }));
  const tool = {
    type: "function" as const,
    function: {
      name: "set_backdrop",
      description: "Choose the TV backdrop for the CURRENT scene. Prefer reuse when a listed background already depicts this place; choose new only when the party is somewhere none of them show; choose keep only if the current backdrop still fits.",
      parameters: {
        type: "object",
        required: ["mode"],
        properties: {
          mode: { type: "string", enum: force ? ["reuse", "new"] : ["keep", "reuse", "new"], description: force ? "reuse an existing background, or new to paint a fresh one." : "keep the current backdrop, reuse an existing one, or paint a new one." },
          backgroundId: { type: "string", description: "For reuse: the id of the existing background that best depicts the current place." },
          prompt: { type: "string", description: "For new: a vivid, self-contained text-to-image scene prompt. Describe place, time of day, weather, lighting, and mood in concrete visual detail. NO character or proper names — the image model does not know them." }
        }
      }
    }
  };

  const system = `You are the TV scene director for a couch RPG. Read the CURRENT scene and the backdrop now showing, then call set_backdrop EXACTLY ONCE.${force ? " The host has asked you to refresh the backdrop, so you MUST change it — reuse a fitting past background or paint a new one." : " Prefer reuse; only paint new when the location is genuinely new; keep only if the current backdrop still depicts this place."}`;
  const user = [
    `Current scene: ${campaign.currentScene}`,
    campaign.ambience ? `Atmosphere: ${campaign.ambience.mood}${campaign.ambience.note ? ` — ${campaign.ambience.note}` : ""}` : "",
    `Backdrop currently on the TV depicts: ${describeBackdropPrompt(campaign)}`,
    `Existing backgrounds you may reuse: ${JSON.stringify(backgrounds)}`
  ].filter(Boolean).join("\n");

  const backdropTarget = campaignChatTarget(campaign);
  try {
    const response = (await aquaFetch("/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: backdropTarget.model,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "set_backdrop" } }
      })
      // Bounded like every other ancillary call — this had no options at all,
      // so it inherited aquaFetch's 6-attempt default against a dead endpoint.
    }, { ...INTERACTIVE_FETCH, ...backdropTarget.options, onRetry: retryLogger(campaign.id, "Narration", "scene-director") })) as ChatCompletionResponse;
    const message = response.choices?.[0]?.message || response.message;
    const call = Array.isArray(message?.tool_calls) ? message?.tool_calls?.[0] : null;
    if (!call?.function?.arguments) return null;
    const args = JSON.parse(call.function.arguments) as Record<string, unknown>;
    const rawMode = String(args.mode || "");
    const mode = (["keep", "reuse", "new"] as const).includes(rawMode as any) ? (rawMode as BackdropDecision["mode"]) : (force ? "new" : "keep");
    return {
      mode,
      backgroundId: typeof args.backgroundId === "string" ? args.backgroundId : undefined,
      prompt: typeof args.prompt === "string" ? args.prompt : undefined
    };
  } catch (err) {
    serverError("Backdrop", "chooseBackdrop tool call failed", err);
    void logCampaignEvent(campaign.id, "ERROR", "Image", "Scene-director call failed", {
      error: err instanceof Error ? err.message : String(err),
      status: (err as { status?: unknown })?.status,
      code: (err as { code?: unknown })?.code
    });
    return null;
  }
}

/** Paint a fresh backdrop from a prompt and make it the live TV background. */
async function paintNewBackdrop(campaign: Campaign, prompt: string) {
  const startedAt = Date.now();
  void logCampaignEvent(campaign.id, "INFO", "Image", "Backdrop paint starting", {
    kind: "scene",
    target: "backdrop",
    promptChars: prompt.length
  });
  try {
    const image = await generateImage(prompt, {
      aspect: "16:9",
      onRetry: retryLogger(campaign.id, "Image", "backdrop-paint")
    });
    const localUrl = await downloadAndSaveImage(campaign.id, image.url, "backgrounds");
    campaign.images.push({ id: createId("image"), url: localUrl, prompt: image.prompt, createdAt: new Date().toISOString() });
    campaign.currentImageUrl = localUrl;
    safePushDisplayEvent(campaign, { type: "scene", speaker: "Scene", content: "The TV scene background shifts." });
    void logCampaignEvent(campaign.id, "INFO", "Image", "Backdrop painted", {
      kind: "scene",
      durationMs: Date.now() - startedAt
    });
  } catch (err) {
    // Rethrown for the caller's own non-fatal handling; logged here because
    // this is the path that paints the LIVE backdrop and it previously wrote
    // nothing at all to the campaign's log.
    void logCampaignEvent(campaign.id, "ERROR", "Image", "Backdrop paint failed", {
      kind: "scene",
      durationMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
      status: (err as { status?: unknown })?.status,
      code: (err as { code?: unknown })?.code
    });
    throw err;
  }
}

/** Apply a scene-director decision to the campaign, recording the scene it now depicts. */
async function applyBackdropDecision(campaign: Campaign, decision: BackdropDecision | null, scene: string, force: boolean) {
  const mode = decision?.mode || "keep";
  let changed = false;
  if (mode === "reuse" && decision?.backgroundId) {
    const img = (campaign.images || []).find((i) => i.id === decision.backgroundId);
    if (img && img.url !== campaign.currentImageUrl) {
      campaign.currentImageUrl = img.url;
      safePushDisplayEvent(campaign, { type: "scene", speaker: "Scene", content: "The TV scene background shifts." });
      changed = true;
    }
  } else if (mode === "new" && decision?.prompt) {
    await paintNewBackdrop(campaign, decision.prompt);
    changed = true;
  }
  // Host tapped Nudge (force) but nothing actually changed — the director chose
  // keep, gave no prompt, or named a background already showing. Repaint from
  // the scene text so the button always visibly does something.
  if (force && !changed) {
    await paintNewBackdrop(campaign, campaign.currentScene || scene);
  }
  campaign.backdropScene = scene;
}

/**
 * Repaint the TV backdrop to match the current scene, on demand (the Director's
 * "Nudge" button). This is a pure visual refresh — no story turn, no touched
 * choices. With force, the director must change the backdrop.
 */
export async function repaintBackdrop(campaignId: string, options: { force?: boolean } = {}): Promise<Campaign> {
  const campaign = await getCampaign(campaignId);
  if (campaign.status !== "active") return campaign;
  const scene = (campaign.currentScene || "").trim();
  if (!scene) return campaign;
  const force = options.force !== false;
  const decision = await chooseBackdrop(campaign, force);
  await applyBackdropDecision(campaign, decision, scene, force);
  await saveCampaign(campaign);
  serverLog("Backdrop", `Nudge repaint applied for campaign ${campaignId} (mode=${decision?.mode || "keep"})`);
  return campaign;
}

/**
 * Map a story beat's speaker to a display-event type: NARRATOR stays pure
 * narration, SYSTEM is table talk, a player's character name means the DM is
 * dramatizing that player's declared action, anything else is NPC dialogue.
 */
function classifyStoryBeat(
  campaign: { players: Array<{ id: string; name: string; characterName?: string }> },
  speaker: string
): { type: import("@/lib/campaign/types").DisplayEvent["type"]; speaker: string; playerId?: string } {
  const upper = speaker.toUpperCase();
  if (upper === "SYSTEM") return { type: "system", speaker };
  if (upper === "NARRATOR") return { type: "narration", speaker };
  const player = campaign.players.find(
    (p) => (p.characterName || p.name).toLowerCase() === speaker.toLowerCase()
  );
  if (player) return { type: "playerAction", speaker, playerId: player.id };
  return { type: "dialogue", speaker };
}

// currentScene is a short location LABEL, not narrative prose — but the
// schema description is only a nudge, and a model has occasionally ignored
// it and dumped the whole campaign backstory in there instead. That value
// gets re-injected into the system prompt every subsequent turn (see
// `Current scene: ${...}` below) and rendered as a pill-shaped chip on the
// TV, so an unbounded string both wastes tokens turn after turn and balloons
// that chip into a giant blob. Clamp defensively regardless of what the
// model sends.
function sanitizeSceneLabel(value: string): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > 90 ? `${flat.slice(0, 89).trimEnd()}…` : flat;
}

async function complete(
  messages: AquaMessage[],
  toolChoice: "auto" | "none" = "auto",
  tools: typeof toolDefinitions = toolDefinitions,
  fetchOptions: AquaFetchOptions = {},
  targetId?: string
) {
  // Resolve the narration target from the campaign's manual selection. Falls
  // back to the default (CHAT_MODEL/BASE_URL/API_KEY) when unset or unknown,
  // so a stale selection can never brick narration. The target's baseUrl/key
  // are merged into fetchOptions so they override the defaults for this call
  // only — credentials never leave the server.
  const target = resolveChatTarget(targetId);
  const mergedOptions: AquaFetchOptions = {
    ...fetchOptions,
    baseUrl: target.baseUrl || fetchOptions.baseUrl,
    apiKey: target.apiKey || fetchOptions.apiKey
  };
  return (await aquaFetch("/chat/completions", {
    method: "POST",
    body: JSON.stringify({
      model: target.model,
      messages,
      tools,
      tool_choice: toolChoice
    })
  }, mergedOptions)) as ChatCompletionResponse;
}

/**
 * The tools the DM may use this turn. We prune tools whose job is already
 * done so the model isn't tempted to re-run them: once the score is chosen,
 * set_theme vanishes (a mid-saga music swap just confuses the table).
 */
function toolsForTurn(opts: { musicTheme?: string }): typeof toolDefinitions {
  return toolDefinitions.filter((tool) => {
    if (tool.function.name === "set_theme") return !opts.musicTheme;
    return true;
  });
}

/**
 * The atmosphere half of the system prompt. The large RP model always drives
 * live mood + stage effects itself — no small/fast model is trusted with
 * real-time creative direction (it produced the wrong music/backdrop in
 * playtesting). The small model, when configured, is housekeeping-only: see
 * runHousekeeping().
 */
function atmosphereDirective(): string {
  return `Atmosphere (you are the stage director this turn):
- Call set_ambience when the emotional register shifts. Moods: calm, tense, adrenaline (chases, escapes, heists, races against time — excitement without combat), battle (ordinary combat), boss (climactic showdowns against a major villain or endgame threat), mystery, dread, triumph, wonder, somber. Use sparingly — once per real shift, not every turn.
- EVERY turn, compare this scene's register against the "Current ambience/music playing" line in the context: if they no longer match (a fight broke out, dread gave way to triumph, the chase began), call set_ambience THIS TURN — the music only changes when you do. Do not let one mood drone through an entire act.
- Cinematic effects have two timings: call trigger_effect to fire one or more sound cues IMMEDIATELY, optionally paired with a synchronized visual enhancement; OR attach an \`effect\` to a specific story beat in narrate_turn so its visual lands the instant that line performs on the TV. Layer cues for richer moments and use repeat/delayMs for heartbeats, knocks, alarms, footsteps, gunfire, or multi-hit impacts. Missing cue files safely remain silent.`;
}

/**
 * Choose and persist a campaign's music theme at CREATION time, before the
 * lobby opens, so the lobby's own music already plays on the right shelf.
 *
 * D&D campaigns are always "fantasy" (no model call). Non-D&D campaigns ask
 * the DM AI to pick the genre from the title/premise/NPC blurbs — this is a
 * creative judgment call (a Victorian haunted house is horror, not fantasy),
 * so the model is better at it than keyword matching. This adds a short wait
 * before the lobby opens, but the score then stays fixed for the whole saga.
 * Sealed-envelope/randomized campaigns with no premise stay unthemed here and
 * are scored on the DM's opening turn via the set_theme tool instead.
 */
export async function chooseCampaignTheme(campaignId: string): Promise<Campaign> {
  const campaign = await getCampaign(campaignId);
  try {
    // D&D is always fantasy — no model call needed.
    if (campaign.campaignType === "dnd") {
      if (campaign.musicTheme !== "fantasy") {
        campaign.musicTheme = "fantasy";
        await saveCampaign(campaign);
      }
      return campaign;
    }
    // Randomized/sealed-envelope campaigns have no premise yet — leave the
    // theme unset and let the DM's opening turn pick it via set_theme.
    if (campaign.isRandomized) return campaign;

    // Already chosen (e.g. host re-saved) — keep it.
    if (campaign.musicTheme && MUSIC_THEMES.includes(campaign.musicTheme as MusicTheme)) return campaign;

    // Ask the DM AI to pick the genre from the campaign's text.
    const theme = await aiPickTheme(campaign);
    if (theme) {
      campaign.musicTheme = theme;
      await saveCampaign(campaign);
      serverLog("Theme", `AI chose music theme "${theme}" for campaign ${campaignId}`);
    } else {
      serverLog("Theme", `AI did not return a theme for campaign ${campaignId}; lobby will play neutral mood roots`);
    }
  } catch (err) {
    serverError("Theme", "AI theme selection failed; keeping any existing theme", err);
  }
  return campaign;
}

/**
 * Ask the DM AI to pick a music theme for a campaign from its title, premise,
 * overview, and NPC blurbs. Returns the chosen theme or null if the model
 * didn't return a valid one. Uses a single tool-forced call to set_theme so
 * the model's reasoning is constrained to the valid shelves (MUSIC_THEMES).
 */
async function aiPickTheme(campaign: Campaign): Promise<MusicTheme | null> {
  const setThemeTool: AquaToolDefinition = {
    type: "function",
    function: {
      name: "set_theme",
      description: `Pick the campaign's musical score shelf based on its genre. ${THEME_GUIDE}`,
      parameters: {
        type: "object",
        required: ["theme"],
        properties: {
          theme: { type: "string", enum: MUSIC_THEMES }
        }
      }
    }
  };

  const haystack = [
    `Title: ${campaign.title || ""}`,
    `Premise: ${campaign.startingStory || campaign.memory || ""}`,
    `Overview: ${campaign.overview || ""}`,
    `Current scene: ${campaign.currentScene || ""}`,
    ...(campaign.storyCharacters || []).map((npc) => `NPC: ${npc.name} — ${npc.description}`)
  ].join("\n");

  const messages: AquaMessage[] = [
    {
      role: "system",
      content: `You are the music director for a tabletop RPG campaign. Read the campaign's title, premise, and characters, then pick the single musical score shelf that best matches its GENRE — the threat and tone, not the era. Call set_theme exactly once with your choice.\n\n${THEME_GUIDE}`
    },
    { role: "user", content: haystack }
  ];

  try {
    const response = await complete(messages, "auto", [setThemeTool], INTERACTIVE_FETCH);
    const message = response.choices?.[0]?.message || response.message;
    if (!message) return null;
    const toolCalls = normalizeToolCalls(message);
    for (const call of toolCalls) {
      if (call.function.name !== "set_theme") continue;
      try {
        const args = JSON.parse(call.function.arguments || "{}");
        const theme = args.theme as MusicTheme;
        if (MUSIC_THEMES.includes(theme)) return theme;
      } catch {
        /* ignore malformed args */
      }
    }
  } catch (err) {
    serverError("Theme", "aiPickTheme model call failed", err);
    void logCampaignEvent(campaign.id, "ERROR", "Narration", "Theme selection call failed", {
      error: err instanceof Error ? err.message : String(err),
      status: (err as { status?: unknown })?.status,
      code: (err as { code?: unknown })?.code
    });
  }
  return null;
}

/**
 * Model + endpoint for ancillary CHAT work (scene director, stage director,
 * forced-narrate_turn repackaging) on the campaign's own narration target.
 *
 * These used to hardcode `aquaConfig().chatModel` with no base URL/key override,
 * which meant they always hit the DEFAULT provider. That silently defeats the
 * whole point of a manual switch: the host moves the campaign off a dead
 * provider and every ancillary call keeps hammering the dead one. Housekeeping
 * and image work stay on their own separate targets (see fastModelTarget).
 */
function campaignChatTarget(campaign: Campaign): { model: string; options: AquaFetchOptions } {
  const target = resolveChatTarget(campaign.selectedChatTargetId);
  return { model: target.model, options: { baseUrl: target.baseUrl, apiKey: target.apiKey } };
}

// Housekeeping thresholds: a sweep only runs once there's genuinely stale
// history to compact, so a fresh/short campaign never pays for it.
const HOUSEKEEPING_KEEP_RECENT = 32; // raw messages always left untouched after a sweep
const HOUSEKEEPING_MESSAGE_TRIGGER = 48; // sweep once this many messages have piled up
const HOUSEKEEPING_MEMORY_CHARS_TRIGGER = 6_000;
const HOUSEKEEPING_NPC_TRIGGER = 8;
const HOUSEKEEPING_SUMMARY_MAX_CHARS = 8_000;
// Cross-turn resilience: after this many consecutive failures on UNCHANGED
// input, suppress housekeeping until the input materially changes or the
// cooldown elapses. Prevents the observed every-turn retry loop on a dead
// provider. Env-overridable.
const HOUSEKEEPING_MAX_CONSECUTIVE_FAILURES = Math.max(1, Number(process.env.HOUSEKEEPING_MAX_CONSECUTIVE_FAILURES) || 5);
// Cooldown after a failure: don't retry a failed sweep on the same input for
// this long. The input changing (new messages/NPCs) overrides the cooldown.
const HOUSEKEEPING_FAILURE_COOLDOWN_MS = Math.max(30_000, Number(process.env.HOUSEKEEPING_FAILURE_COOLDOWN_MS) || 300_000);

/**
 * Returns the reasons a campaign needs housekeeping (message count, memory
 * chars, NPC count), or null if none apply. Replaces the old boolean-only
 * check so the cooldown/fingerprint logic can key off WHY it needs sweeping.
 */
function housekeepingReasons(campaign: Campaign): { reasons: string[]; fingerprint: string } | null {
  const reasons: string[] = [];
  if (campaign.messages.length > HOUSEKEEPING_MESSAGE_TRIGGER) reasons.push(`messages=${campaign.messages.length}`);
  if ((campaign.memory || "").length > HOUSEKEEPING_MEMORY_CHARS_TRIGGER) reasons.push(`memory=${(campaign.memory || "").length}`);
  if (campaign.storyCharacters.length > HOUSEKEEPING_NPC_TRIGGER) reasons.push(`npcs=${campaign.storyCharacters.length}`);
  if (!reasons.length) return null;
  // Fingerprint of the input that triggered this sweep. It must express
  // "MATERIALLY different input", not "any different input": an exact
  // messages:memory:npcs triple changes on literally every turn, so a failed
  // sweep looked like a brand-new job one turn later and neither the cooldown
  // nor the failure budget could ever hold — that is precisely the observed
  // retry-every-turn loop (sweeps at 19, 23, 27, 31, 35 stale messages). So
  // bucket it: whole keep-recent windows of transcript, kilobytes of memory,
  // groups of NPCs. Crossing a bucket is a genuinely different job and earns a
  // fresh attempt; one more message does not.
  const fingerprint = [
    Math.floor(campaign.messages.length / HOUSEKEEPING_KEEP_RECENT),
    Math.floor((campaign.memory || "").length / 1_000),
    Math.floor(campaign.storyCharacters.length / 4)
  ].join(":");
  return { reasons, fingerprint };
}

/**
 * Decide whether housekeeping should run NOW, given cooldown and the failure
 * budget. Returns { run: true } or { run: false, reason, until? } for logging.
 */
function shouldRunHousekeeping(campaign: Campaign): { run: boolean; reason?: string; until?: string } {
  const needs = housekeepingReasons(campaign);
  if (!needs) return { run: false, reason: "no_trigger" };

  const hk = campaign.housekeeping;
  if (!hk) return { run: true }; // never run before — go

  // Has the input changed materially since the sweep that failed? With the
  // bucketed fingerprint above this is true only after a real accumulation of
  // new transcript/memory/NPCs, which is a genuinely different job and worth
  // one more attempt. Until then BOTH the budget and the cooldown hold.
  const materiallyChanged = !!hk.lastFailedFingerprint && hk.lastFailedFingerprint !== needs.fingerprint;
  if (materiallyChanged) return { run: true };

  // Failure budget: a provider that cannot do this job at all (no tool support,
  // wrong model, bad key) fails identically however much history has piled up.
  const failures = hk.consecutiveFailures || 0;
  if (failures >= HOUSEKEEPING_MAX_CONSECUTIVE_FAILURES) {
    return { run: false, reason: "failure_budget", until: hk.cooldownUntil };
  }

  // Cooldown: after ANY failure, wait out the wall clock before trying again.
  if (hk.cooldownUntil) {
    const until = new Date(hk.cooldownUntil).getTime();
    if (Number.isFinite(until) && Date.now() < until) {
      return { run: false, reason: "cooldown", until: hk.cooldownUntil };
    }
  }

  return { run: true };
}

/**
 * Provider error codes (from classifyHttpError) that housekeeping can never
 * recover from by trying again: the model cannot do tool calling at all. One
 * attempt is the correct number of attempts — the observed `gemini-3.6 does not
 * support tools` 400 should cost one failed sweep, not six, and should not come
 * back next turn.
 *
 * Deliberately narrow. `invalid_model` and `auth` look permanent but recover
 * without a code change (a provider re-adding a model, a rotated key, a gateway
 * misreporting 401 during an outage), so they take the ordinary +1 increment and
 * spend the budget the slow way.
 */
const HOUSEKEEPING_PERMANENT_CODES = ["unsupported_tools", "unsupported_feature"];

/**
 * Campaigns with a sweep in flight. The provider call runs unlocked for up to a
 * couple of minutes, so without this a host tapping "Retry housekeeping" twice
 * starts two sweeps over the same transcript whose merges overwrite each other.
 */
const housekeepingInFlight = new Set<string>();

/** Whether a sweep is currently running for this campaign. */
export function isHousekeepingRunning(campaignId: string): boolean {
  return housekeepingInFlight.has(campaignId);
}

/**
 * Small models occasionally leak stray foreign-script tokens mid-word (seen in
 * playtesting: "He返回ed" instead of "He returned"). This is an English-only
 * app, so any CJK/Hangul/kana run in model-produced text is always corruption,
 * never legitimate content — strip it and tidy the resulting whitespace.
 */
function sanitizeHousekeepingText(text: string): string {
  return text
    .replace(/[　-ヿ㐀-䶿一-鿿가-힣豈-﫿＀-￯]+/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Housekeeping pass (the small/fast model's ONLY job): once the transcript,
 * memory, or NPC roster has genuinely piled up, fold the stale portion into a
 * bounded running summary and trim it back down — so the RP-focused large
 * model keeps long-term continuity without paying for the full history every
 * turn, and never suffers context collapse. Runs post-turn, non-blocking, and
 * is skipped entirely when no fast model is configured or nothing has crossed
 * a threshold yet. Mutates the campaign in place; the caller saves.
 */
async function runHousekeeping(campaign: Campaign): Promise<void> {
  const config = aquaConfig();
  if (!config.fastModel) return;
  const gate = shouldRunHousekeeping(campaign);
  if (!gate.run) {
    // Log every skip reason except "no_trigger" — that's the normal idle case
    // and would just spam the log every turn. Cooldown/budget skips are worth
    // recording so a stuck sweep is explainable after the fact.
    if (gate.reason && gate.reason !== "no_trigger") {
      void logCampaignEvent(campaign.id, "INFO", "Housekeeping", "Sweep skipped", {
        reason: gate.reason,
        until: gate.until,
        consecutiveFailures: campaign.housekeeping?.consecutiveFailures
      });
    }
    return;
  }

  // From here on a sweep is genuinely attempting — record the attempt so the
  // failure budget/cooldown have something to act on even if it crashes.
  const now = new Date().toISOString();
  if (!campaign.housekeeping) campaign.housekeeping = { consecutiveFailures: 0 };
  campaign.housekeeping.lastAttemptAt = now;
  // Which thresholds actually triggered this sweep, recorded on the campaign so
  // the Director's Drawer can say *why* a sweep is due rather than just that
  // one is (Phase 6 step 1: eligibility reasons are part of the metadata).
  const gateReasons = housekeepingReasons(campaign)?.reasons || [];

  const staleCount = Math.max(0, campaign.messages.length - HOUSEKEEPING_KEEP_RECENT);
  const staleMessages = staleCount > 0 ? campaign.messages.slice(0, staleCount) : [];
  const staleTranscript = staleMessages
    .map((m) => `${m.role.toUpperCase()}${m.name ? ` ${m.name}` : ""}: ${m.content}`)
    .join("\n\n")
    .slice(0, 40_000);

  const npcRoster = campaign.storyCharacters.map((c) => ({ id: c.id, name: c.name, description: c.description.slice(0, 200) }));

  const tool = {
    type: "function" as const,
    function: {
      name: "apply_housekeeping",
      description: "Compact the campaign's long-term memory so it stays usable. Call EXACTLY ONCE.",
      parameters: {
        type: "object",
        required: ["storySummary"],
        properties: {
          storySummary: { type: "string", description: "The FULL updated running summary (merge the previous summary with the stale transcript below into one coherent account, under ~500 words). This replaces the previous summary entirely. If the party is (or was) split across locations, keep a separate line per group — where each group is and what they were last doing — so no group's thread is ever lost." },
          memory: { type: "string", description: "Optional: a compacted rewrite of long-term memory — merge duplicate/resolved notes, drop anything superseded. Omit if memory is already clean." },
          duplicateNpcs: {
            type: "array",
            description: "Optional: groups of NPC ids that are actually the SAME character tracked twice (e.g. renamed mid-story). Omit if none.",
            items: {
              type: "object",
              required: ["keepId", "removeIds"],
              properties: {
                keepId: { type: "string", description: "The id to keep." },
                removeIds: { type: "array", items: { type: "string" }, description: "Duplicate ids of the SAME character to remove." }
              }
            }
          }
        }
      }
    }
  };

  const system = "You are the housekeeping assistant for a couch RPG. You never narrate, direct atmosphere, or make creative decisions — you ONLY compact bookkeeping so the game master model doesn't drown in old context. Call apply_housekeeping EXACTLY ONCE.";
  const user = [
    `Previous running summary: ${campaign.storySummary || "(none yet)"}`,
    staleTranscript ? `Stale transcript to fold into the summary (then it will be discarded — capture anything worth remembering):\n${staleTranscript}` : "(no stale transcript this sweep — only memory/NPC cleanup needed)",
    `Current long-term memory: ${campaign.memory || "(empty)"}`,
    `Tracked NPCs/enemies: ${JSON.stringify(npcRoster)}`
  ].join("\n\n");

  const { model, options } = fastModelTarget();
  serverLogSmall("Housekeeping", `Sweep starting for campaign ${campaign.id} on ${model} (${staleCount} stale messages).`);
  void logCampaignEvent(campaign.id, "INFO", "Housekeeping", "Sweep starting", {
    model,
    staleCount,
    messageCount: campaign.messages.length,
    memoryChars: (campaign.memory || "").length,
    npcCount: campaign.storyCharacters.length,
    hasStorySummary: !!campaign.storySummary
  });
  const sweepStartedAt = Date.now();
  try {
    const response = (await aquaFetch("/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "apply_housekeeping" } }
      })
    }, {
      ...options,
      retries: Math.max(1, Number(process.env.HOUSEKEEPING_RETRIES) || 3),
      timeoutMs: Math.max(5000, Number(process.env.HOUSEKEEPING_TIMEOUT_MS) || 45000),
      onRetry: retryLogger(campaign.id, "Housekeeping", "sweep")
    })) as ChatCompletionResponse;
    const message = response.choices?.[0]?.message || response.message;
    const call = Array.isArray(message?.tool_calls) ? message?.tool_calls?.[0] : null;
    if (!call?.function?.arguments) {
      // A target that ignores a forced tool_choice cannot do this job. Treat it
      // as a genuine failure so it consumes the budget and starts a cooldown —
      // the old bare `return` left no outcome recorded at all, so such a target
      // was silently re-attempted on every single turn forever.
      throw new Error("Housekeeping model returned no apply_housekeeping tool call (a forced tool_choice was ignored)");
    }
    const args = JSON.parse(call.function.arguments) as Record<string, any>;

    if (typeof args.storySummary === "string" && args.storySummary.trim()) {
      campaign.storySummary = sanitizeHousekeepingText(args.storySummary).slice(0, HOUSEKEEPING_SUMMARY_MAX_CHARS);
      // Only trim the transcript once its stale portion is safely captured.
      if (staleCount > 0) campaign.messages = campaign.messages.slice(staleCount);
    }
    if (typeof args.memory === "string" && args.memory.trim()) {
      campaign.memory = sanitizeHousekeepingText(args.memory);
    }
    if (Array.isArray(args.duplicateNpcs)) {
      for (const group of args.duplicateNpcs) {
        const keepId = String(group?.keepId || "");
        const removeIds = Array.isArray(group?.removeIds) ? group.removeIds.map(String) : [];
        if (!keepId || !removeIds.length) continue;
        if (!campaign.storyCharacters.some((c) => c.id === keepId)) continue;
        campaign.storyCharacters = campaign.storyCharacters.filter((c) => c.id === keepId || !removeIds.includes(c.id));
      }
    }
    serverLogSmall("Housekeeping", `Sweep applied for campaign ${campaign.id} (trimmed ${staleCount} messages)`);
    // Success: clear the failure budget/cooldown so the next trigger runs freely.
    campaign.housekeeping = {
      ...campaign.housekeeping,
      consecutiveFailures: 0,
      lastSuccessAt: new Date().toISOString(),
      cooldownUntil: undefined,
      lastFailedFingerprint: undefined,
      lastError: undefined,
      lastErrorCode: undefined,
      lastFailureAt: undefined,
      lastReasons: gateReasons,
      staleCount,
      targetModel: model
    };
    void logCampaignEvent(campaign.id, "INFO", "Housekeeping", "Sweep applied", {
      model,
      durationMs: Date.now() - sweepStartedAt,
      trimmedMessages: staleCount,
      summaryChars: (campaign.storySummary || "").length,
      memoryChars: (campaign.memory || "").length,
      npcCount: campaign.storyCharacters.length,
      duplicateNpcGroups: Array.isArray(args.duplicateNpcs) ? args.duplicateNpcs.length : 0
    });
  } catch (err) {
    serverError("Housekeeping [small model]", "Housekeeping sweep failed (non-fatal)", err);
    // Failure: bump the consecutive-failure count and start a cooldown, keyed to
    // the bucketed fingerprint of the input that just failed. A materially
    // changed input lifts both and tries again.
    const needs = housekeepingReasons(campaign);
    const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : undefined;
    const code = typeof (err as { code?: unknown })?.code === "string" ? (err as { code: string }).code : undefined;
    // A permanent capability/credential error is worth exactly one attempt:
    // exhaust the budget immediately rather than burning MAX sweeps discovering
    // the same 400 five times over.
    const permanent = !!code && HOUSEKEEPING_PERMANENT_CODES.includes(code);
    const failures = permanent
      ? HOUSEKEEPING_MAX_CONSECUTIVE_FAILURES
      : (campaign.housekeeping?.consecutiveFailures || 0) + 1;
    const failedAt = new Date().toISOString();
    campaign.housekeeping = {
      ...campaign.housekeeping,
      consecutiveFailures: failures,
      cooldownUntil: new Date(Date.now() + HOUSEKEEPING_FAILURE_COOLDOWN_MS).toISOString(),
      lastFailedFingerprint: needs?.fingerprint,
      // Scrubbed the same way debug.log metadata is, so a provider that echoes a
      // key back inside its error body can't smuggle it into campaign.json (and
      // from there into the housekeepingStatus response every player can read).
      lastError: scrubLogText(err instanceof Error ? err.message : String(err)),
      lastErrorCode: code,
      lastFailureAt: failedAt,
      lastReasons: gateReasons,
      staleCount,
      targetModel: model
    };
    void logCampaignEvent(campaign.id, "ERROR", "Housekeeping", "Sweep failed", {
      model,
      durationMs: Date.now() - sweepStartedAt,
      error: err instanceof Error ? err.message : String(err),
      errorName: err instanceof Error ? err.name : undefined,
      status,
      code,
      permanent,
      consecutiveFailures: failures,
      cooldownUntil: campaign.housekeeping.cooldownUntil
    });
  }
}

/**
 * Read-only snapshot of the campaign's housekeeping state for the Director's
 * Drawer. Purely derived — safe to call any time.
 */
export function getHousekeepingStatus(campaign: Campaign) {
  const needs = housekeepingReasons(campaign);
  const gate = shouldRunHousekeeping(campaign);
  return {
    configured: !!aquaConfig().fastModel,
    pending: !!needs,
    triggers: needs?.reasons || [],
    running: gate.run,
    // A sweep is physically in flight right now (the provider call is unlocked
    // and slow, so this can be true for minutes).
    sweeping: isHousekeepingRunning(campaign.id),
    skipReason: gate.run ? undefined : gate.reason,
    skipUntil: gate.until,
    consecutiveFailures: campaign.housekeeping?.consecutiveFailures || 0,
    lastAttemptAt: campaign.housekeeping?.lastAttemptAt,
    lastSuccessAt: campaign.housekeeping?.lastSuccessAt,
    cooldownUntil: campaign.housekeeping?.cooldownUntil,
    lastError: campaign.housekeeping?.lastError
  };
}

/**
 * Manual housekeeping retry (party leader only, via the party route). Clears the
 * failure cooldown/budget so the gate can't short-circuit the attempt, then
 * STARTS one sweep detached and returns immediately with the pre-sweep status.
 *
 * Non-blocking by contract: a manual retry must never hold up the table. The
 * sweep can run for minutes on a broken provider, and awaiting it inside the
 * party route — which holds the campaign lock for the whole request — froze
 * every chat turn, presence sweep and party action for that entire time.
 *
 * `ran` reports whether a sweep actually started: false when no fast model is
 * configured, or when there is genuinely nothing to sweep.
 *
 * IMPORTANT: does NOT acquire the campaign lock for its own bookkeeping save —
 * the caller (party route) already holds it and the mutex is non-reentrant. The
 * detached sweep acquires the lock itself, for the merge only.
 */
export async function retryHousekeepingNow(campaignId: string): Promise<{ ran: boolean; status: ReturnType<typeof getHousekeepingStatus> }> {
  const campaign = await getCampaign(campaignId);
  if (!aquaConfig().fastModel) {
    return { ran: false, status: getHousekeepingStatus(campaign) };
  }
  // Clear suppression so shouldRunHousekeeping can't short-circuit this run.
  campaign.housekeeping = {
    ...campaign.housekeeping,
    consecutiveFailures: 0,
    cooldownUntil: undefined,
    lastFailedFingerprint: undefined
  };
  // Already sweeping: don't stack a second one. The in-flight sweep is the
  // retry the host is asking for.
  if (isHousekeepingRunning(campaignId)) {
    return { ran: false, status: getHousekeepingStatus(campaign) };
  }
  const gate = shouldRunHousekeeping(campaign);
  void logCampaignEvent(campaignId, "INFO", "Housekeeping", "Manual retry requested", {
    starting: gate.run,
    skipReason: gate.run ? undefined : gate.reason,
    previousLastError: campaign.housekeeping.lastError
  });
  await saveCampaign(campaign);
  if (!gate.run) return { ran: false, status: getHousekeepingStatus(campaign) };
  // Snapshot + detach, exactly like the post-turn path, so the provider call is
  // outside the lock and the merge preserves anything added meanwhile.
  void sweepAndMergeHousekeeping(campaignId, cloneCampaign(campaign));
  return { ran: true, status: getHousekeepingStatus(campaign) };
}

/**
 * Best-effort repair of not-quite-valid JSON from weaker models: strips code
 * fences, drops trailing commas, and balances an unterminated tail of braces/
 * brackets (a common truncation). Returns candidate strings to try in order.
 */
function repairJsonCandidates(raw: string): string[] {
  const candidates: string[] = [];
  let s = raw.trim();
  // Strip ```json ... ``` fences if present.
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const startIdx = s.indexOf("{");
  const endIdx = s.lastIndexOf("}");
  if (startIdx === -1) return candidates;
  const sliced = endIdx > startIdx ? s.substring(startIdx, endIdx + 1) : s.substring(startIdx);
  candidates.push(sliced);
  // Remove trailing commas before } or ].
  const noTrailingCommas = sliced.replace(/,\s*([}\]])/g, "$1");
  if (noTrailingCommas !== sliced) candidates.push(noTrailingCommas);
  // Balance unterminated braces/brackets by appending closers (ignoring those
  // inside strings). Handles the frequent "cut off mid-object" truncation.
  const base = noTrailingCommas;
  let inStr = false, esc = false;
  const stack: string[] = [];
  for (const ch of base) {
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  if (stack.length || inStr) {
    const closed = (inStr ? base + '"' : base) + stack.reverse().join("");
    const closedClean = closed.replace(/,\s*([}\]])/g, "$1");
    candidates.push(closedClean);
  }
  return candidates;
}

async function parseFinalJson(campaignId: string, content: string) {
  const candidates = repairJsonCandidates(content);
  if (!candidates.length) {
    serverLog("DM Parser", "AI response did not contain a JSON block. Falling back to plain text.");
    await logCampaignDebug(campaignId, `[AI Finish] Response did not contain a JSON block.`);
    return null;
  }

  let lastErr: unknown = null;
  for (const candidate of candidates) {
    try {
      const parsedJson = JSON.parse(candidate);
      await logCampaignDebug(campaignId, `[AI Finish] Parsed JSON successfully${candidate === candidates[0] ? "" : " (after repair)"}.`);
      serverLog("DM Parser", "Successfully parsed story JSON response.", {
        title: parsedJson.title || undefined,
        currentScene: parsedJson.currentScene || undefined,
        storyCount: Array.isArray(parsedJson.story) ? parsedJson.story.length : 0,
        playerUpdatesCount: Array.isArray(parsedJson.playerUpdates) ? parsedJson.playerUpdates.length : 0,
        npcUpdatesCount: Array.isArray(parsedJson.npcUpdates) ? parsedJson.npcUpdates.length : 0,
      });
      return parsedJson;
    } catch (err) {
      lastErr = err;
    }
  }
  serverError("DM Parser", "Failed to parse JSON content from AI message. Error: " + String(lastErr));
  await logCampaignDebug(campaignId, `[AI Finish] Failed to parse JSON content (tried ${candidates.length} repairs). Error: ${lastErr}`);
  return null;
}

function normalizeToolCalls(message: AquaMessage): AquaToolCall[] {
  if (Array.isArray(message.tool_calls)) return message.tool_calls;
  return [];
}

function normalizeActions(actions: unknown): Array<{ title: string; prompt: string }> {
  if (!Array.isArray(actions)) return [];
  return actions.map((action) => {
    if (typeof action === "string") return { title: action, prompt: action };
    const item = action as Record<string, unknown>;
    return { title: String(item.title || item.prompt || "Act"), prompt: String(item.prompt || item.title || "Act") };
  });
}

function mergeStats(currentStats: PlayerStat[] | undefined, incomingStats: any[]): PlayerStat[] {
  const merged = Array.isArray(currentStats) ? [...currentStats] : [];
  for (const s of incomingStats) {
    if (!s || typeof s !== "object") continue;
    const nameStr = String(s.name || "").trim();
    if (!nameStr) continue;
    const value = Number(s.value ?? 0);
    if (!Number.isFinite(value)) continue;
    const existingIdx = merged.findIndex((item) => item.name.toLowerCase() === nameStr.toLowerCase());
    const incomingMax = Number(s.maxValue);
    if (existingIdx !== -1) {
      const prev = merged[existingIdx];
      // maxValue omitted/invalid → keep the existing max (don't reset to a
      // default — that would silently cap HP). narrate_turn makes maxValue
      // optional precisely so the model can send just {name, value}.
      const maxValue = Number.isFinite(incomingMax) && incomingMax > 0 ? incomingMax : prev.maxValue;
      merged[existingIdx] = {
        name: prev.name,
        value,
        maxValue,
        color: s.color ? String(s.color) : prev.color
      };
    } else {
      // New stat with no max → fall back to the value itself (so a full bar),
      // then 10 as a last resort.
      const maxValue = Number.isFinite(incomingMax) && incomingMax > 0 ? incomingMax : (value > 0 ? value : 10);
      merged.push({
        name: nameStr,
        value,
        maxValue,
        color: s.color ? String(s.color) : undefined
      });
    }
  }
  return merged;
}

/**
 * Inventory/abilities items may arrive from the model as either strings or
 * objects ({ name, description } / { title, ... }). Coerce objects to a
 * readable "Name: description" string instead of "[object Object]".
 */
function stringifyItem(item: unknown): string {
  if (typeof item === "string") return item;
  if (item && typeof item === "object") {
    const obj = item as Record<string, unknown>;
    const name = String(obj.name || obj.title || "").trim();
    const desc = String(obj.description || obj.detail || obj.notes || "").trim();
    if (name && desc) return `${name}: ${desc}`;
    if (name) return name;
    if (desc) return desc;
    return JSON.stringify(obj);
  }
  return String(item ?? "");
}

export async function runProfileGeneration(campaignId: string, playerId: string) {
  await logCampaignDebug(campaignId, `[runProfileGeneration] Player ID: ${playerId}`);
  serverLog("PROFILE START", `Running profile generation for player: ${playerId} in campaign: ${campaignId}`);
  
  const campaign = await getCampaign(campaignId);
  const player = campaign.players.find(p => p.id === playerId);
  if (!player) {
    throw new Error(`Player not found: ${playerId}`);
  }

  // Idempotency guard. generate_image persists the portrait straight to the
  // player record, so a portrait already present means a prior run produced a
  // usable profile. Re-running would risk the model returning an empty or
  // story-shaped response that gets treated as a failure and clobbers the good
  // profile back to "Generating profile..." (which freezes the lobby's start
  // button). Just finalize and return.
  if (player.portraitUrl) {
    if (!player.status || player.status === "Generating profile...") {
      player.status = "Ready";
    }
    campaign.dmStatus = undefined;
    campaign.dmPhase = undefined;
    await saveCampaign(campaign);
    serverLog("PROFILE END", `Profile already generated (portrait present) for player: ${playerId}; skipping regeneration.`);
    return;
  }

  const isSurprise = campaign.isRandomized;
  const isDndCampaign = campaign.campaignType === "dnd";
  const isFullRules = isDndCampaign && campaign.rulesMode === "full";
  const submittedCharacterName = (player.characterName || player.name || "").trim();
  const modeBrief = isDndCampaign
    ? (isFullRules ? "full Dungeons & Dragons 5e" : "rules-light Dungeons & Dragons")
    : "standard tabletop RPG";
  const genreGuard = isDndCampaign
    ? "Create a D&D-appropriate fantasy adventurer."
    : "Preserve the campaign's actual genre, era, and tone. Do not add D&D fantasy races, classes, magic, medieval gear, or standard attributes unless the setup or player explicitly included them.";
  const inventoryInstruction = isDndCampaign
    ? "starting adventuring items that fit their class/archetype and the campaign"
    : "starting gear, clues, contacts, tools, or resources that fit the campaign premise and the player's concept";
  const abilitiesInstruction = isDndCampaign
    ? "starting abilities, talents, class features, or spells"
    : "simple story-first specialties, edges, training, or useful traits";
  const statsInstruction = isFullRules
    ? "- Include standard D&D stats: Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma (value: 8 to 18, maxValue: 20)."
    : isDndCampaign
      ? "- Do NOT include standard D&D attribute stats or modifiers in rules-light mode. Include HP and up to 2-3 simple fantasy-themed traits if useful."
      : "- Do NOT include D&D stats, attribute modifiers, classes, spell slots, or fantasy-only mechanics. Include HP and 2-3 simple custom traits matching this campaign's genre.";

  const systemInstruction = `You are a character generation assistant for a ${modeBrief} campaign.
Your only job is to forge a detailed character profile (backstory, stats, inventory, abilities, notes, color, status) and generate a matching character portrait.
${genreGuard}

1. Call generate_image to create a close-up portrait of the character.
2. Return a JSON object with a single key 'playerUpdates' containing the completed player profile details:
   - characterName: ${isSurprise ? "generate a creative name" : `MUST be exactly "${submittedCharacterName}". Do not rename, improve, translate, or decorate it.`}
   - background: ${isSurprise ? "generate a detailed background backstory" : "polished/expanded backstory matching their background input"}
   - personality: ${isSurprise ? "generate a thematic personality" : "polished/expanded personality matching their personality input"}
   - portraitUrl: the URL returned by the generate_image tool
   - portraitPrompt: the prompt used for image generation
   - status: "Ready"
   - inventory: ${inventoryInstruction}
   - abilities: ${abilitiesInstruction}
   - notes: private character sheet notes (e.g., character description, traits, quirks ${isFullRules ? ", class description" : ""})
   - color: a thematic CSS color name (e.g. green, orange, cyan, gold)
   - stats: starting stats. 
     - HP: value 20, maxValue 20, color "red".
     ${statsInstruction}

Return ONLY valid JSON matching this schema. Do not include markdown code fences (like \`\`\`json). Do not write prose outside JSON. Run generate_image first, then return the JSON.`;

  const userPrompt = isSurprise
    ? `Generate a random ${modeBrief} character sheet for campaign "${campaign.title}".\nCampaign setup: ${campaign.startingStory || campaign.currentScene || "No setup provided."}`
    : `Campaign Title: "${campaign.title}"\nCampaign Type: "${modeBrief}"\nCampaign Setup: "${campaign.startingStory || campaign.currentScene || ""}"\nPlayer Name: "${player.name}"\nCharacter Name Draft: "${submittedCharacterName}"\nBackground Draft: "${player.background || ""}"\nPersonality Draft: "${player.personality || ""}"`;

  const messages: AquaMessage[] = [
    { role: "system", content: systemInstruction },
    { role: "user", content: userPrompt }
  ];

  // Simple tool loop (up to 4 steps)
  let finalMessage: AquaMessage | null = null;
  for (let step = 0; step < 4; step += 1) {
    const response = await complete(messages);
    const message = response.choices?.[0]?.message || response.message;
    if (!message) throw new Error("Aqua chat response did not include a message");
    
    const toolCalls = normalizeToolCalls(message);
    if (!toolCalls.length) {
      finalMessage = message;
      break;
    }

    messages.push({ ...message, content: message.content || "" });
    for (const call of toolCalls) {
      if (call.function.name === "generate_image") {
        await logCampaignDebug(campaignId, `[Profile Gen Image] Executing generate_image with args: ${call.function.arguments}`);
        
        let toolArgs: Record<string, any> = {};
        try {
          toolArgs = JSON.parse(call.function.arguments || "{}");
        } catch {
          toolArgs = { prompt: call.function.arguments };
        }
        toolArgs.kind = "portrait";
        toolArgs.playerId = playerId;

        const result = await runTool(campaignId, call.function.name, toolArgs);
        const resultText = JSON.stringify(result);
        messages.push({ role: "tool", tool_call_id: call.id, content: resultText });
      } else {
        // Disallow other tools to prevent story/file changes during profile generation
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: "Only generate_image is allowed during profile generation" }) });
      }
    }
  }

  if (!finalMessage) throw new Error("Profile generation loop exceeded maximum steps");

  const content = finalMessage.content || "";
  let parsedJson = await parseFinalJson(campaignId, content);

  // If JSON parsing failed, try once more with strict constraint
  if (!parsedJson) {
    const retryResponse = await complete([
      ...messages,
      { role: "assistant", content },
      { role: "user", content: "Your previous response was not valid JSON. Return the playerUpdates JSON again. No markdown fences, no extra text." }
    ], "none");
    const retryMessage = retryResponse.choices?.[0]?.message || retryResponse.message;
    const retryContent = retryMessage?.content || "";
    parsedJson = await parseFinalJson(campaignId, retryContent);
  }

  // The model sometimes returns the player fields at the top level instead of
  // wrapped in { playerUpdates: [{ ... }] }. Normalize both shapes so a
  // structurally-correct response is never rejected just for missing the wrapper.
  let update: Record<string, any> | null = null;
  if (parsedJson && Array.isArray(parsedJson.playerUpdates) && parsedJson.playerUpdates.length > 0) {
    update = parsedJson.playerUpdates[0];
  } else if (parsedJson && typeof parsedJson === "object" && (parsedJson.characterName || parsedJson.background || parsedJson.portraitUrl || parsedJson.inventory || parsedJson.stats)) {
    update = parsedJson;
  }
  // Apply updates only to the target player
  const latestCampaign = await getCampaign(campaignId);
  const targetPlayer = latestCampaign.players.find(p => p.id === playerId);
  if (!targetPlayer) throw new Error("Target player disappeared from campaign during generation");

  if (!update || typeof update !== "object") {
    // generate_image (called earlier in the loop) already persisted the portrait
    // directly to the player record, so a portrait here means the run produced a
    // usable character even though the model returned prose or story-shaped JSON
    // without the playerUpdates wrapper. Salvage it instead of hard-failing and
    // leaving the player frozen on "Generating profile...".
    if (targetPlayer.portraitUrl) {
      if (!targetPlayer.status || targetPlayer.status === "Generating profile...") {
        targetPlayer.status = "Ready";
      }
      latestCampaign.dmStatus = undefined;
      latestCampaign.dmPhase = undefined;
      await saveCampaign(latestCampaign);
      serverLog("PROFILE END", `Salvaged profile for player ${playerId}: portrait present but model omitted playerUpdates.`);
      return;
    }
    throw new Error("Failed to generate player profile details");
  }

  if (isSurprise && typeof update.characterName === "string") {
    targetPlayer.characterName = update.characterName;
  } else if (submittedCharacterName) {
    targetPlayer.characterName = submittedCharacterName;
  }
  if (typeof update.background === "string") targetPlayer.background = update.background;
  if (typeof update.personality === "string") targetPlayer.personality = update.personality;
  // Inventory/abilities may arrive as objects ({name, description}) or strings.
  // Stringify objects to "Name: description" instead of "[object Object]".
  if (Array.isArray(update.inventory)) targetPlayer.inventory = update.inventory.map(stringifyItem);
  if (Array.isArray(update.abilities)) targetPlayer.abilities = update.abilities.map(stringifyItem);
  if (typeof update.notes === "string") targetPlayer.notes = update.notes;
  // The model frequently omits status; default to "Ready" so the join verifier
  // and lobby UI don't keep showing "Generating profile..." forever.
  targetPlayer.status = typeof update.status === "string" && update.status.trim() ? update.status.trim() : "Ready";
  if (typeof update.color === "string") targetPlayer.color = update.color;
  
  if (typeof update.portraitUrl === "string" && isValidImageUrl(update.portraitUrl)) {
    const localUrl = await downloadAndSaveImage(campaignId, update.portraitUrl, "players", targetPlayer.id);
    targetPlayer.portraitUrl = localUrl;
    if (localUrl && localUrl.trim()) {
      if (!latestCampaign.portraits) latestCampaign.portraits = [];
      const exists = latestCampaign.portraits.some((p) => p.url === localUrl);
      if (!exists) {
        latestCampaign.portraits.push({
          id: createId("portrait"),
          url: localUrl,
          prompt: update.portraitPrompt || targetPlayer.portraitPrompt || "Portrait of " + (targetPlayer.characterName || targetPlayer.name),
          characterName: targetPlayer.characterName || targetPlayer.name,
          createdAt: new Date().toISOString()
        });
      }
    }
  }
  if (typeof update.portraitPrompt === "string") targetPlayer.portraitPrompt = update.portraitPrompt;
  if (Array.isArray(update.stats)) {
    targetPlayer.stats = mergeStats(targetPlayer.stats, update.stats);
  }

  // Clear DM status
  latestCampaign.dmStatus = undefined;
  latestCampaign.dmPhase = undefined;

  await saveCampaign(latestCampaign);
  serverLog("PROFILE END", `Successfully finished profile generation for player: ${playerId}`);
}
