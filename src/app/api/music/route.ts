import { readdir } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const dirPath = path.join(process.cwd(), "public", "music", "BGM");
    const entries = await readdir(dirPath).catch(() => []);
    const mp3s = entries
      .filter((file) => file.toLowerCase().endsWith(".mp3"))
      .map((file) => `/music/BGM/${file}`);
      
    return NextResponse.json({ tracks: mp3s });
  } catch (error) {
    console.error("Failed to list BGM music files:", error);
    return NextResponse.json({ tracks: [] });
  }
}
