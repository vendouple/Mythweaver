import { NextResponse } from "next/server";
import { getCampaign, recordHostHeartbeat, deleteCampaign } from "@/lib/campaign/store";
import { serverLog, serverError } from "@/lib/aqua/chat";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const url = new URL(request.url);
  const isHost = url.searchParams.get("host") === "1";

  if (isHost) {
    recordHostHeartbeat(params.id);
  }

  return NextResponse.json({ campaign: await getCampaign(params.id) });
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
