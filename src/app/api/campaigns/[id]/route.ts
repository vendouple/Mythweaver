import { NextResponse } from "next/server";
import { getCampaign, touchHostSession, recordPlayerHeartbeat, isHostHeartbeatActive, deleteCampaign } from "@/lib/campaign/store";
import { serverLog, serverError } from "@/lib/aqua/chat";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const url = new URL(request.url);
  const isHost = url.searchParams.get("host") === "1";
  const playerId = url.searchParams.get("playerId") || "";
  const hostToken = url.searchParams.get("hostToken") || "";
  const peek = url.searchParams.get("peek") === "1";

  const campaign = await getCampaign(params.id);

  // Lightweight pre-join projection: lets the join screen offer a "who's
  // disconnected" reconnect picker without leaking story/message content to
  // anyone who merely has the join code but hasn't joined yet.
  if (peek) {
    return NextResponse.json({
      id: campaign.id,
      title: campaign.title,
      status: campaign.status,
      reconnectable: campaign.players
        .filter((p) => p.away === true)
        .map((p) => ({ id: p.id, name: p.name, characterName: p.characterName }))
    });
  }

  let hostSession: { isLive: boolean } | undefined;
  if (isHost) {
    hostSession = touchHostSession(params.id, hostToken);
  }
  // Controllers pass their playerId so the server tracks presence (drives the
  // turn system's "skip absent players" and the reconnect UI).
  if (!isHost && playerId) {
    recordPlayerHeartbeat(params.id, playerId);
  }

  // hostActive lets controllers show "waiting for the screen" when the TV drops.
  return NextResponse.json({
    campaign,
    hostActive: isHostHeartbeatActive(params.id),
    hostSession
  });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    serverLog("API campaigns [id]", `Request to delete campaign ID: ${params.id}`);
    await deleteCampaign(params.id);
    serverLog("API campaigns [id]", `Successfully deleted campaign ID: ${params.id}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    serverError("API campaigns [id]", `Failed to delete campaign ID: ${params.id}`, error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to delete campaign" }, { status: 500 });
  }
}
