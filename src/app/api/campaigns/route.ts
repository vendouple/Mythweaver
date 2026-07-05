import { NextResponse } from "next/server";
import { createCampaign, listCampaigns } from "@/lib/campaign/store";
import { serverLog, serverError } from "@/lib/aqua/chat";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ campaigns: await listCampaigns() });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const title = String(body.title || "Untitled Adventure");
    const randomized = !!body.isRandomized;
    const length = body.campaignLength ? String(body.campaignLength) : "auto";
    const campaignType = body.campaignType === "dnd" ? "dnd" : "tabletop";
    serverLog("API campaigns", `Creating campaign: '${title}' | type: ${campaignType} | randomized: ${randomized} | length: ${length}`);
    
    const rulesMode = campaignType === "dnd" && body.rulesMode === "full" ? "full" : "casual";
    const campaign = await createCampaign(
      title,
      String(body.startingStory || body.premise || ""),
      Array.isArray(body.storyCharacters) ? body.storyCharacters : [],
      randomized,
      length,
      rulesMode,
      campaignType
    );
    
    serverLog("API campaigns", `Successfully created campaign ID: ${campaign.id} | Code: ${campaign.joinCode}`);
    return NextResponse.json({ campaign });
  } catch (error) {
    serverError("API campaigns", "Failed to create campaign", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown campaigns error" }, { status: 500 });
  }
}
