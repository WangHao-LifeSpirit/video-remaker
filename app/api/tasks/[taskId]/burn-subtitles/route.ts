import { NextResponse } from "next/server";
import { burnSubtitlesForTask } from "../../../../../lib/tools/subtitle-burner";

export async function POST(request: Request, { params }: { params: { taskId: string } }) {
  try {
    const body = await request.json().catch(() => ({})) as {
      input?: string;
      output?: string;
    };
    const result = await burnSubtitlesForTask({
      taskId: params.taskId,
      input: body.input,
      output: body.output
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to burn subtitles.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
