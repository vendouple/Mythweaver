import { NextResponse } from "next/server";
import { runDungeonMaster, resolveExplorationRound, advanceCombatAndRunEnemies, serverLog, serverError } from "@/lib/aqua/chat";
import { getCampaign, getCampaignLock, saveCampaign, safePushDisplayEvent, reconcilePresence, ensureLocations, getPlayerLocation } from "@/lib/campaign/store";
import { turnMode, allLockedIn, armExplorationDeadline, syncFocusedMirror } from "@/lib/campaign/turns";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let campaignId = "";
  let playerId = "";
  try {
    const body = await request.json();
    campaignId = String(body.campaignId || "");
    playerId = String(body.playerId || "");
    const action = String(body.action || "");
    serverLog("API chat", `Incoming POST request | Campaign: ${campaignId} | Player: ${playerId} | Action: "${action}"`);
    if (!campaignId || !playerId || !action.trim()) return NextResponse.json({ error: "campaignId, playerId, and action are required" }, { status: 400 });

    const release = await getCampaignLock(campaignId).acquire();
    try {
      const campaign = await getCampaign(campaignId);
      const player = campaign.players.find((item) => item.id === playerId);
      if (!player) return NextResponse.json({ error: "Player not found" }, { status: 404 });
      const playerName = player.characterName || player.name;

      // Lifecycle guard (#8/#15): a stunned/incapacitated/dead player cannot act.
      // The controller already hard-locks; this rejects any stale/forced submit.
      if (player.canAct === false) {
        serverLog("Action Guard", `Rejected action from ${playerName}: canAct=false (${player.status || "incapacitated"})`);
        return NextResponse.json({ campaign, blocked: "cannot-act" });
      }

      const actionId = body.actionId ? String(body.actionId) : undefined;

      // Duplicate check: skip processing if duplicate actionId or exact same action within 45 seconds
      const isActionIdDuplicate = actionId && campaign.messages.some((m) => m.id === actionId);

      const recentUserMsg = [...campaign.messages].reverse().find(
        (m) => m.role === "user" && m.name === playerName
      );
      let isTimeDuplicate = false;
      if (recentUserMsg && recentUserMsg.content === action) {
        const elapsed = Date.now() - new Date(recentUserMsg.createdAt).getTime();
        if (elapsed < 45000) {
          isTimeDuplicate = true;
        }
      }

      if (isActionIdDuplicate || isTimeDuplicate) {
        serverLog("Duplicate Guard", `Ignored duplicate action from ${playerName} (actionId duplicate: ${!!isActionIdDuplicate}, time duplicate: ${isTimeDuplicate})`);
        return NextResponse.json({ campaign });
      }

      const displayAction = body.displayAction ? String(body.displayAction) : undefined;
      const partyActionId = body.partyActionId ? String(body.partyActionId) : undefined;

      // Presence reconcile (#2): mark disconnected players away so they don't
      // block a round, and weave the transition into the timeline.
      const presence = reconcilePresence(campaign);
      for (const id of presence.wentAway) {
        const p = campaign.players.find((x) => x.id === id);
        if (p) safePushDisplayEvent(campaign, { type: "system", speaker: "SYSTEM", content: `${p.characterName || p.name} slips from the weave — disconnected.` });
      }
      for (const id of presence.returned) {
        const p = campaign.players.find((x) => x.id === id);
        if (p) safePushDisplayEvent(campaign, { type: "system", speaker: "SYSTEM", content: `${p.characterName || p.name} returns to the table.` });
      }
      if (presence.wentAway.length || presence.returned.length) await saveCampaign(campaign);

      // ── Turn model (#1), scoped to the acting player's LOCATION (#split) ──
      ensureLocations(campaign);
      const loc = getPlayerLocation(campaign, playerId);
      if (turnMode(loc) === "combat") {
        // Sequential initiative: only this location's active player may act.
        if (loc.turnState?.activeId !== playerId) {
          serverLog("Turn Guard", `Rejected ${playerName}'s action — not their turn (active=${loc.turnState?.activeId}).`);
          return NextResponse.json({ campaign, blocked: "not-your-turn" });
        }
        await runDungeonMaster(campaignId, playerName, action, { playerId, displayAction, actionId });
        // Advance initiative in THIS location; run its enemy phase on wrap.
        const fresh = await advanceCombatAndRunEnemies(campaignId, loc.id);
        return NextResponse.json({ campaign: fresh });
      }

      // Exploration: record this player's lock-in in their location; resolve the
      // round once every able + present player THERE has locked in.
      loc.pendingActions = loc.pendingActions || {};
      loc.pendingActions[playerId] = {
        action,
        display: displayAction,
        actionId,
        partyActionId,
        lockedAt: new Date().toISOString()
      };
      armExplorationDeadline(loc);
      // Focus the TV on where the action is happening.
      campaign.focusedLocationId = loc.id;
      syncFocusedMirror(campaign);
      await saveCampaign(campaign);

      if (allLockedIn(campaign, loc)) {
        const resolved = await resolveExplorationRound(campaignId, loc.id);
        return NextResponse.json({ campaign: resolved });
      }
      return NextResponse.json({ campaign, locked: true });
    } finally {
      release();
    }
  } catch (error) {
    serverError("API chat", `Error processing chat request for campaign: ${campaignId}`, error);
    if (campaignId) {
      try {
        const campaign = await getCampaign(campaignId);
        const player = campaign.players.find((item) => item.id === playerId);
        const speaker = player?.characterName || player?.name || "Dungeon Master";
        campaign.dmStatus = undefined;
        campaign.dmPhase = undefined;
        safePushDisplayEvent(campaign, {
          type: "system",
          speaker: "DM Error",
          playerId: player?.id,
          content: `${speaker}'s action couldn't be resolved (the storyteller stumbled). Your previous choices have been restored — try again. ${error instanceof Error ? error.message : "Unknown chat error"}`
        });
        await saveCampaign(campaign);
      } catch (saveError) {
        serverError("API chat", `Failed to persist DM error event for campaign: ${campaignId}`, saveError);
      }
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown chat error" }, { status: 500 });
  }
}
