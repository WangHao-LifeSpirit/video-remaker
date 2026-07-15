import { NextResponse } from "next/server";
import { generateSubtitlesForTask } from "../../../../../lib/tools/subtitle-generator";

export async function POST(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  try {
    const subtitles = await generateSubtitlesForTask(taskId);
    return NextResponse.json({
      task_id: taskId,
      status: subtitles.status,
      language: subtitles.language,
      format: subtitles.format,
      segment_count: subtitles.segments.length,
      subtitles_json_path: `data/tasks/${taskId}/subtitles.json`,
      srt_path: subtitles.srt_path
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate subtitles.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
