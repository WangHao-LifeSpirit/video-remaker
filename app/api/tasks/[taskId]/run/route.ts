import { NextResponse } from "next/server";
import { runFullMockPipeline } from "../../../../../lib/agents/orchestrator";

export async function POST(request: Request, { params }: { params: { taskId: string } }) {
  try {
    const body = await request.json().catch(() => ({}));
    const task = await runFullMockPipeline(params.taskId, {
      ...body,
      assemble: body.assemble ?? true,
      export: body.export ?? true
    });
    return NextResponse.json(task);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run task.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
