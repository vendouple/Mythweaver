import { NextResponse } from "next/server";
import { readCampaignTextFile, safeCampaignRelativePath, writeCampaignTextFile } from "@/lib/campaign/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const campaignId = url.searchParams.get("campaignId") || "";
    const path = safeCampaignRelativePath(url.searchParams.get("path") || "notes.md");
    if (path.toLowerCase() === "cast-plan.json") {
      return NextResponse.json({ error: "Private campaign file" }, { status: 403 });
    }
    return NextResponse.json({ content: await readCampaignTextFile(campaignId, path) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown file error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const path = safeCampaignRelativePath(String(body.path || "notes.md"));
    if (path.toLowerCase() === "cast-plan.json") {
      return NextResponse.json({ error: "Private campaign file" }, { status: 403 });
    }
    await writeCampaignTextFile(String(body.campaignId || ""), path, String(body.content || ""));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown file error" }, { status: 500 });
  }
}
