import path from "node:path";
import { reviewTaskQuality } from "../agents/quality-check-agent";
import type { RemakePlan } from "../types/remake-plan";
import type { ReviewReport } from "../types/review";
import type { StoryboardAnalysis } from "../types/storyboard";
import type { VideoPrompts } from "../types/video-prompts";
import { getTask, getTaskDir, readTaskArtifact, saveTask, writeJsonFile, writeTaskArtifact } from "./task-store";

export type ReviewTaskResult = {
  report: ReviewReport;
  review_report_path: string;
  applied: boolean;
  video_prompts_backup_path?: string;
  updated_scene_ids: string[];
};

function timestamp(): string {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

async function backupAndApplyPromptSuggestions(input: {
  taskId: string;
  report: ReviewReport;
  videoPrompts: VideoPrompts;
}): Promise<{ backupPath: string; updatedSceneIds: string[] }> {
  const backupPath = await writeJsonFile(
    path.join(getTaskDir(input.taskId), `video_prompts.backup.${timestamp()}.json`),
    input.videoPrompts
  );
  const suggestions = new Map(
    input.report.scene_reviews
      .filter((scene) => scene.prompt_quality !== "good" && scene.suggested_prompt)
      .map((scene) => [scene.scene_id, scene.suggested_prompt as string])
  );
  const updatedSceneIds: string[] = [];
  const updatedPrompts: VideoPrompts = {
    ...input.videoPrompts,
    prompts: input.videoPrompts.prompts.map((prompt) => {
      const suggestion = suggestions.get(prompt.scene_id);
      if (!suggestion) {
        return prompt;
      }
      updatedSceneIds.push(prompt.scene_id);
      return {
        ...prompt,
        prompt: suggestion
      };
    })
  };

  await writeJsonFile(path.join(getTaskDir(input.taskId), "video_prompts.json"), updatedPrompts);
  return { backupPath, updatedSceneIds };
}

export async function reviewTask(input: {
  taskId: string;
  apply?: boolean;
}): Promise<ReviewTaskResult> {
  const [storyboard, remakePlan, videoPrompts] = await Promise.all([
    readTaskArtifact<StoryboardAnalysis>(input.taskId, "storyboard.json"),
    readTaskArtifact<RemakePlan>(input.taskId, "remake_plan.json"),
    readTaskArtifact<VideoPrompts>(input.taskId, "video_prompts.json")
  ]);

  const report = reviewTaskQuality({
    taskId: input.taskId,
    storyboard,
    remakePlan,
    videoPrompts
  });
  const { relativePath } = await writeTaskArtifact(input.taskId, "review_report.json", report);

  let backupPath: string | undefined;
  let updatedSceneIds: string[] = [];
  if (input.apply) {
    const applied = await backupAndApplyPromptSuggestions({
      taskId: input.taskId,
      report,
      videoPrompts
    });
    backupPath = applied.backupPath;
    updatedSceneIds = applied.updatedSceneIds;
  }

  const task = await getTask(input.taskId);
  task.files.review_report_json = relativePath;
  task.current_step = input.apply ? "review-apply" : "review";
  await saveTask(task);

  return {
    report,
    review_report_path: relativePath,
    applied: Boolean(input.apply),
    video_prompts_backup_path: backupPath,
    updated_scene_ids: updatedSceneIds
  };
}
