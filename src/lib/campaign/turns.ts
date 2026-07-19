import { Campaign, Location, Player } from "./types";

/**
 * Two-mode turn system (feedback #1), now PER-LOCATION so a split party works.
 *   exploration – simultaneous lock-in among the players present in a location:
 *                 they all pick, then ONE combined DM turn resolves them.
 *   combat      – sequential initiative within a location: the active player
 *                 acts, control passes to the next, then the enemies there act.
 *
 * Turn state + lock-ins live on each Location (loc.turnState / loc.pendingActions).
 * `syncFocusedMirror` copies the focused location's turn state up to the campaign
 * so the TV/host (which watch campaign.turnState) keep working unchanged.
 */

export const TURN_TIMEOUT_MS = Math.max(15000, Number(process.env.TURN_TIMEOUT_MS) || 90000);
export const ENEMY_SLOT = "enemies";

export function turnMode(loc: Location | undefined): "exploration" | "combat" {
  return loc?.turnState?.mode === "combat" ? "combat" : "exploration";
}

/** A player can take part if they're not incapacitated and not away. */
export function isEligible(player: Player): boolean {
  return player.canAct !== false && !player.away;
}

/** Eligible players physically present in a given location. */
export function eligiblePlayerIdsInLocation(campaign: Campaign, locationId: string): string[] {
  return campaign.players.filter((p) => p.locationId === locationId && isEligible(p)).map((p) => p.id);
}

/** True when every eligible player in this location has locked in an action. */
export function allLockedIn(campaign: Campaign, loc: Location): boolean {
  const ids = eligiblePlayerIdsInLocation(campaign, loc.id);
  if (!ids.length) return false;
  const pending = loc.pendingActions || {};
  return ids.every((id) => !!pending[id]);
}

/** Whether it's this player's move right now (always true in exploration). */
export function canPlayerActNow(campaign: Campaign, playerId: string): boolean {
  const player = campaign.players.find((p) => p.id === playerId);
  if (!player || !isEligible(player)) return false;
  const loc = campaign.locations?.find((l) => l.id === player.locationId);
  if (!loc) return true;
  if (turnMode(loc) === "combat") return loc.turnState?.activeId === playerId;
  return true;
}

function deadline(): string {
  return new Date(Date.now() + TURN_TIMEOUT_MS).toISOString();
}

/** Begin sequential initiative in a location. `order` defaults to those present. */
export function startCombat(campaign: Campaign, loc: Location, order?: string[]) {
  const present = eligiblePlayerIdsInLocation(campaign, loc.id);
  const valid = (order && order.length ? order : present).filter((id) =>
    campaign.players.some((p) => p.id === id && p.locationId === loc.id)
  );
  const ids = valid.length ? valid : present;
  loc.turnState = { mode: "combat", order: ids, activeId: ids[0], round: 1, deadlineAt: deadline() };
  loc.pendingActions = {};
}

/** Return a location to free exploration. */
export function endCombat(loc: Location) {
  loc.turnState = { mode: "exploration" };
  loc.pendingActions = {};
}

/**
 * Advance a location's combat pointer after the current actor finished. Drops
 * only players who physically LEFT the location; a transient disconnect
 * (away) or a knockdown (canAct:false) keeps its initiative slot — the pointer
 * just skips past them instead of dissolving the encounter (a couch player's
 * phone going quiet for one poll cycle must not end the fight). Inserts an
 * "enemies" phase after the last eligible player, and bumps the round when
 * wrapping. Returns the new activeId (may be ENEMY_SLOT).
 */
export function advanceCombat(campaign: Campaign, loc: Location): string | undefined {
  const ts = loc.turnState;
  if (!ts || ts.mode !== "combat") return undefined;
  // Presence in the location keeps a slot; eligibility only decides whose turn
  // it actually is right now.
  const order = (ts.order || []).filter((id) =>
    campaign.players.some((p) => p.id === id && p.locationId === loc.id)
  );
  ts.order = order;
  if (!order.length) {
    // Nobody from this fight is even in the location anymore — the encounter
    // has nothing left to resolve.
    endCombat(loc);
    return undefined;
  }

  const canGo = (id: string) => {
    const player = campaign.players.find((p) => p.id === id);
    return !!player && isEligible(player);
  };

  let next: string;
  if (ts.activeId === ENEMY_SLOT) {
    next = order[0];
    ts.round = (ts.round || 1) + 1;
  } else {
    const idx = order.indexOf(ts.activeId || "");
    next = idx === -1 || idx >= order.length - 1 ? ENEMY_SLOT : order[idx + 1];
  }

  // Skip anyone away/incapacitated right now — they keep their initiative
  // slot for when they return; they just don't hold up the table today.
  let guard = 0;
  while (next !== ENEMY_SLOT && !canGo(next) && guard++ < order.length) {
    const idx = order.indexOf(next);
    next = idx >= order.length - 1 ? ENEMY_SLOT : order[idx + 1];
  }

  ts.activeId = next;
  ts.deadlineAt = deadline();
  return ts.activeId;
}

/** Arm the exploration round timer when the first lock-in lands. */
export function armExplorationDeadline(loc: Location) {
  if (!loc.turnState) loc.turnState = { mode: "exploration" };
  if (loc.turnState.mode !== "exploration") return;
  if (!loc.turnState.deadlineAt) loc.turnState.deadlineAt = deadline();
}

/** True when this location's turn/round deadline has passed. */
export function deadlinePassed(loc: Location): boolean {
  const at = loc.turnState?.deadlineAt;
  if (!at) return false;
  return Date.now() > new Date(at).getTime();
}

/* ── Split-party location scheduler ──────────────────────────────────────
 * When the party is split, locations take turns like players do: exactly ONE
 * location is "active" (its group may act), everyone else waits. A location's
 * beat ends when its exploration round resolves, or — in combat — when a full
 * round (all players + the enemy phase) completes. Then the spotlight rotates
 * to the next occupied location. The small RP model never has to juggle two
 * scenes at once; the harness serializes them.
 */

/** Locations that currently hold ≥1 present, able player (campaign order). */
export function occupiedLocations(campaign: Campaign): Location[] {
  return (campaign.locations || []).filter(
    (loc) => eligiblePlayerIdsInLocation(campaign, loc.id).length > 0
  );
}

/** True when the party is genuinely split across 2+ occupied locations. */
export function isPartySplit(campaign: Campaign): boolean {
  return occupiedLocations(campaign).length > 1;
}

/**
 * The location whose group may act right now. Falls back to (and repairs)
 * activeLocationId when it's unset, invalid, or points somewhere abandoned.
 */
export function getActiveLocation(campaign: Campaign): Location | undefined {
  const occupied = occupiedLocations(campaign);
  if (!occupied.length) {
    return (campaign.locations || []).find((l) => l.id === campaign.focusedLocationId) || campaign.locations?.[0];
  }
  const current = occupied.find((l) => l.id === campaign.activeLocationId);
  if (current) return current;
  // Repair: prefer wherever the TV is, else the first occupied location.
  const next = occupied.find((l) => l.id === campaign.focusedLocationId) || occupied[0];
  campaign.activeLocationId = next.id;
  return next;
}

/** Whether this player's location holds the spotlight (always true unsplit). */
export function isPlayersLocationActive(campaign: Campaign, playerId: string): boolean {
  if (!isPartySplit(campaign)) return true;
  const player = campaign.players.find((p) => p.id === playerId);
  const active = getActiveLocation(campaign);
  return !!player?.locationId && player.locationId === active?.id;
}

/** Re-arm a location's turn/round timer with a FULL fresh window. */
export function refreshLocationDeadline(loc: Location) {
  if (!loc.turnState) loc.turnState = { mode: "exploration" };
  loc.turnState.deadlineAt = deadline();
}

/**
 * Move the spotlight to the next occupied location (round-robin). Returns the
 * new active location, or the current one when the party isn't split. Also
 * re-arms the incoming location's deadline so a beat spent waiting off-stage
 * can never be instantly auto-skipped the moment it comes back on.
 */
export function rotateActiveLocation(campaign: Campaign): Location | undefined {
  const occupied = occupiedLocations(campaign);
  if (!occupied.length) return getActiveLocation(campaign);
  const currentId = campaign.activeLocationId || campaign.focusedLocationId;
  const idx = occupied.findIndex((l) => l.id === currentId);
  const next = occupied[(idx + 1) % occupied.length];
  campaign.activeLocationId = next.id;
  if (occupied.length > 1) refreshLocationDeadline(next);
  return next;
}

/** Copy the focused location's live turn state up to the campaign for the TV/host. */
export function syncFocusedMirror(campaign: Campaign) {
  const loc =
    campaign.locations?.find((l) => l.id === campaign.focusedLocationId) || campaign.locations?.[0];
  if (!loc) return;
  campaign.turnState = loc.turnState;
  campaign.pendingActions = loc.pendingActions;
}

/**
 * Build the combined user message for a location's exploration round, honoring
 * "together" agreement: a party action fires as JOINT only when every eligible
 * player in the location opted into the SAME partyActionId; otherwise opt-ins
 * fall back to acting individually and dissenters act on their own.
 */
export function buildExplorationResolution(
  campaign: Campaign,
  loc: Location
): { action: string; displays: Array<{ playerId: string; name: string; display: string; action: string }> } {
  const pending = loc.pendingActions || {};
  const displays: Array<{ playerId: string; name: string; display: string; action: string }> = [];
  const eligible = eligiblePlayerIdsInLocation(campaign, loc.id);

  const byParty: Record<string, string[]> = {};
  for (const id of eligible) {
    const pa = pending[id];
    if (pa?.partyActionId) (byParty[pa.partyActionId] ||= []).push(id);
  }
  const unanimousParty = Object.entries(byParty).find(
    ([, ids]) => ids.length === eligible.length && eligible.length > 1
  );

  const nameOf = (pid: string) => {
    const p = campaign.players.find((x) => x.id === pid);
    return p?.characterName || p?.name || "A player";
  };

  const lines: string[] = [];
  for (const id of eligible) {
    const pa = pending[id];
    if (!pa) continue;
    displays.push({ playerId: id, name: nameOf(id), display: pa.display || pa.action, action: pa.action });
    lines.push(`- ${nameOf(id)}: ${pa.action}`);
  }

  const where = ` (at ${loc.name})`;
  let header: string;
  if (unanimousParty) {
    header = `The group acts TOGETHER this round on a shared plan${where}. Resolve it as one coordinated action, then the consequences for everyone:`;
  } else {
    header =
      lines.length > 1
        ? `The group acts simultaneously this round${where}. Resolve ALL of these together in one flowing narration; a bad roll by one can complicate the others:`
        : `A player acts${where}:`;
  }
  return { action: `${header}\n${lines.join("\n")}`, displays };
}
