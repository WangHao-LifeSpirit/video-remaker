import { NextResponse } from "next/server";
import { clearTaskErrors } from "../../../../../lib/tools/error-log";

export async function POST(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  try {
    const result = await clearTaskErrors(taskId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to clear historical errors.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
