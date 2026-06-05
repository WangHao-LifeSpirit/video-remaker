import { NextResponse } from "next/server";
import { clearTaskErrors } from "../../../../../lib/tools/error-log";

export async function POST(_request: Request, { params }: { params: { taskId: string } }) {
  try {
    const result = await clearTaskErrors(params.taskId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to clear historical errors.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
