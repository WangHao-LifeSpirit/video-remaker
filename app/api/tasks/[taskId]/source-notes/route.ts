import { NextResponse } from "next/server";
import { saveSourceNotesForTask } from "../../../../../lib/tools/source-input";

export async function POST(request: Request, { params }: { params: { taskId: string } }) {
  try {
    const body = await request.json().catch(() => ({})) as {
      source_transcript?: string;
      source_caption?: string;
      screenshot_notes?: string;
      remake_requirements?: string;
    };
    const result = await saveSourceNotesForTask({
      taskId: params.taskId,
      source_transcript: body.source_transcript,
      source_caption: body.source_caption,
      screenshot_notes: body.screenshot_notes,
      remake_requirements: body.remake_requirements
    });
    return NextResponse.json({
      task_id: params.taskId,
      status: result.status,
      input_json_path: `data/tasks/${params.taskId}/input.json`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save source notes.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
