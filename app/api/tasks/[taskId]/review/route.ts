import { NextResponse } from "next/server";
import { reviewTask } from "../../../../../lib/tools/review";

export async function POST(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  try {
    const result = await reviewTask({
      taskId,
      apply: false
    });

    return NextResponse.json({
      task_id: taskId,
      status: result.report.status,
      overall_score: result.report.overall_score,
      final_decision: result.report.final_decision,
      issue_count: result.report.issues.length,
      scene_count: result.report.scene_reviews.length,
      review_report_path: result.review_report_path
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run Agent review.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
