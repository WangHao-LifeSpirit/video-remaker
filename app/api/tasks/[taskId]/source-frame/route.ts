import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getTaskDir } from "../../../../../lib/tools/task-store";

function isAllowedFrame(value: string | null): value is string {
  return Boolean(value && /^frame_\d{3}\.jpg$/.test(value));
}

export async function GET(request: Request, { params }: { params: { taskId: string } }) {
  try {
    const url = new URL(request.url);
    const file = url.searchParams.get("file");
    if (!isAllowedFrame(file)) {
      return NextResponse.json({ error: "Unsupported source frame." }, { status: 400 });
    }
    const frameDir = path.join(getTaskDir(params.taskId), "assets", "source-frames");
    const filePath = path.join(frameDir, file);
    if (!filePath.startsWith(frameDir)) {
      return NextResponse.json({ error: "Invalid source frame path." }, { status: 400 });
    }
    const bytes = await readFile(filePath);
    return new Response(bytes, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store"
      }
    });
  } catch {
    return NextResponse.json({ error: "Source frame not found." }, { status: 404 });
  }
}
