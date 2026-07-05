import { NextResponse } from "next/server";
import { runDungeonMaster, serverLog, serverError } from "@/lib/aqua/chat";
import { getCampaign, getCampaignLock, saveCampaign, safePushDisplayEvent } from "@/lib/campaign/store";
import { createId } from "@/lib/utils/ids";

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
      return NextResponse.json(await runDungeonMaster(campaignId, playerName, action, { playerId, displayAction, actionId }));
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
          content: `${speaker}'s action could not be resolved after multiple AI attempts. ${error instanceof Error ? error.message : "Unknown chat error"}`
        });
        await saveCampaign(campaign);
      } catch (saveError) {
        serverError("API chat", `Failed to persist DM error event for campaign: ${campaignId}`, saveError);
      }
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown chat error" }, { status: 500 });
  }
}
