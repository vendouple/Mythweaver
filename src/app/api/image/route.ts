import { NextResponse } from "next/server";
import { getCampaign, saveCampaign, downloadAndSaveImage } from "@/lib/campaign/store";
import { generateImage } from "@/lib/aqua/images";
import { createId } from "@/lib/utils/ids";
import { serverLog, serverError } from "@/lib/aqua/chat";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let campaignId = "";
  let prompt = "";
  try {
    const body = await request.json();
    campaignId = String(body.campaignId || "");
    prompt = String(body.prompt || "");
    serverLog("API image", `Generating image for campaign: ${campaignId} | Prompt: "${prompt}"`);
    if (!campaignId || !prompt.trim()) return NextResponse.json({ error: "campaignId and prompt are required" }, { status: 400 });
    const image = await generateImage(prompt);
    const campaign = await getCampaign(campaignId);
    
    const localUrl = await downloadAndSaveImage(campaignId, image.url, "backgrounds");
    
    const entry = { id: createId("image"), url: localUrl, prompt: image.prompt, createdAt: new Date().toISOString() };
    campaign.images.push(entry);
    campaign.currentImageUrl = entry.url;
    await saveCampaign(campaign);
    
    serverLog("API image", `Successfully generated image for campaign: ${campaignId} | Local URL: ${localUrl}`);
    return NextResponse.json({ campaign, image: entry });
  } catch (error) {
    serverError("API image", `Failed to generate image for campaign: ${campaignId} | Prompt: "${prompt}"`, error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown image error" }, { status: 500 });
  }
}

