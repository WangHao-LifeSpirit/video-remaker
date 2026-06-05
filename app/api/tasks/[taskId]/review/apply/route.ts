import { NextResponse } from "next/server";
import { reviewTask } from "../../../../../../lib/tools/review";

export async function POST(_request: Request, { params }: { params: { taskId: string } }) {
  try {
    const result = await reviewTask({
      taskId: params.taskId,
      apply: true
    });

    return NextResponse.json({
      task_id: params.taskId,
      status: result.report.status,
      overall_score: result.report.overall_score,
      final_decision: result.report.final_decision,
      issue_count: result.report.issues.length,
      scene_count: result.report.scene_reviews.length,
      review_report_path: result.review_report_path,
      video_prompts_backup_path: result.video_prompts_backup_path,
      updated_scene_ids: result.updated_scene_ids,
      message: result.updated_scene_ids.length
        ? `已应用 ${result.updated_scene_ids.length} 个 scene 的 prompt 修正。`
        : "暂无需要应用的 prompt 修正。"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to apply Agent review suggestions.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
