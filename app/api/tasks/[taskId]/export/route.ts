import { NextResponse } from "next/server";
import { exportJsonForTask } from "../../../../../lib/export/json-exporter";
import { exportMarkdownForTask } from "../../../../../lib/export/markdown-exporter";

export async function POST(_request: Request, { params }: { params: { taskId: string } }) {
  try {
    const markdown = await exportMarkdownForTask(params.taskId);
    const json = await exportJsonForTask(params.taskId);
    return NextResponse.json({ markdown, json });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to export task.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
