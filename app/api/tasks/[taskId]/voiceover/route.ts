import { NextResponse } from "next/server";
import { generateVoiceoverForTask } from "../../../../../lib/tools/voiceover-generator";

export async function POST(_request: Request, { params }: { params: { taskId: string } }) {
  try {
    const voiceover = await generateVoiceoverForTask(params.taskId);
    return NextResponse.json({
      task_id: params.taskId,
      status: voiceover.status,
      provider: voiceover.provider,
      language: voiceover.language,
      segment_count: voiceover.segments.length,
      total_duration_seconds: voiceover.total_duration_seconds,
      voiceover_script_path: `data/tasks/${params.taskId}/voiceover_script.json`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate voiceover script.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
