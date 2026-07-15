import { NextResponse } from "next/server";
import { exportCoverForTask } from "../../../../../lib/tools/cover-exporter";

export async function POST(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  try {
    const result = await exportCoverForTask(taskId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to export cover.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
