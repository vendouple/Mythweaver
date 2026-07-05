import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const url = new URL(request.url);
    const filePath = url.searchParams.get("path");
    if (!filePath) {
      return NextResponse.json({ error: "path parameter is required" }, { status: 400 });
    }

    const cleanPath = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
    if (cleanPath.includes("..") || path.isAbsolute(cleanPath)) {
      return NextResponse.json({ error: "Unsafe path" }, { status: 400 });
    }

    const dataRoot = path.join(process.cwd(), "data", "campaigns");
    const campaignDir = path.join(dataRoot, params.id.replace(/[^a-zA-Z0-9_-]/g, ""));
    const fullPath = path.join(campaignDir, cleanPath);

    if (!fullPath.startsWith(campaignDir)) {
      return NextResponse.json({ error: "Unsafe path" }, { status: 400 });
    }

    const content = await readFile(fullPath);
    let contentType = "image/png";
    const lower = fullPath.toLowerCase();
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) contentType = "image/jpeg";
    else if (lower.endsWith(".gif")) contentType = "image/gif";
    else if (lower.endsWith(".webp")) contentType = "image/webp";

    return new NextResponse(content, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable"
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Asset not found" }, { status: 404 });
  }
}
