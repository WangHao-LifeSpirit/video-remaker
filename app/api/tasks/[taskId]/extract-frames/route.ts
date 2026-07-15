import { NextResponse } from "next/server";
import { extractFramesForTask } from "../../../../../lib/tools/frame-extractor";

export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  try {
    const body = await request.json().catch(() => ({})) as {
      max?: number;
    };
    const result = await extractFramesForTask({
      taskId,
      maxFrames: body.max ?? 8
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to extract frames.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
