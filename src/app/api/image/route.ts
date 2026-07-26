import { NextResponse } from "next/server";
import { getCampaign, saveCampaign, downloadAndSaveImage, logCampaignEvent } from "@/lib/campaign/store";
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
    // Host-initiated scene paint (the Director's Drawer paint box). Logged to
    // the campaign's debug.log like every other image path, so a backdrop the
    // host asked for is as traceable as one the model asked for.
    const startedAt = Date.now();
    void logCampaignEvent(campaignId, "INFO", "Image", "Host scene image requested", {
      kind: "scene",
      target: "backdrop",
      promptChars: prompt.length
    });
    const image = await generateImage(prompt, { aspect: "16:9" });
    const campaign = await getCampaign(campaignId);
    
    const localUrl = await downloadAndSaveImage(campaignId, image.url, "backgrounds");
    
    const entry = { id: createId("image"), url: localUrl, prompt: image.prompt, createdAt: new Date().toISOString() };
    campaign.images.push(entry);
    campaign.currentImageUrl = entry.url;
    await saveCampaign(campaign);
    
    serverLog("API image", `Successfully generated image for campaign: ${campaignId} | Local URL: ${localUrl}`);
    void logCampaignEvent(campaignId, "INFO", "Image", "Host scene image applied", {
      kind: "scene",
      durationMs: Date.now() - startedAt,
      imageId: entry.id
    });
    return NextResponse.json({ campaign, image: entry });
  } catch (error) {
    serverError("API image", `Failed to generate image for campaign: ${campaignId} | Prompt: "${prompt}"`, error);
    if (campaignId) {
      void logCampaignEvent(campaignId, "ERROR", "Image", "Host scene image failed", {
        kind: "scene",
        error: error instanceof Error ? error.message : String(error),
        status: (error as { status?: unknown })?.status,
        code: (error as { code?: unknown })?.code
      });
    }
    // Same reasoning as the chat route: never hand a provider's raw response
    // body back to a browser — it can carry the echoed request.
    const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : undefined;
    const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : undefined;
    const detail = [status ? `HTTP ${status}` : null, code].filter(Boolean).join(" ");
    return NextResponse.json({ error: `Image generation failed${detail ? ` (${detail})` : ""}` }, { status: 500 });
  }
}

