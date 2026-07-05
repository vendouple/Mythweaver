import { NextResponse } from "next/server";
import { readCampaignTextFile, writeCampaignTextFile } from "@/lib/campaign/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const campaignId = url.searchParams.get("campaignId") || "";
    const path = url.searchParams.get("path") || "notes.md";
    return NextResponse.json({ content: await readCampaignTextFile(campaignId, path) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown file error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    await writeCampaignTextFile(String(body.campaignId || ""), String(body.path || "notes.md"), String(body.content || ""));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown file error" }, { status: 500 });
  }
}
