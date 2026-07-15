import { NextResponse } from "next/server";
import { analyzeSourceVideoForTask } from "../../../../../lib/tools/source-video-analyzer";

export async function POST(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  try {
    const result = await analyzeSourceVideoForTask(taskId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to analyze source video.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
