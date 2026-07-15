import path from "node:path";
import type { VideoAnalysis } from "../types/analysis";
import type { AssetsManifest } from "../types/assets";
import type { VideoInputArtifact } from "../types/input";
import type { RemakePlan } from "../types/remake-plan";
import type { StoryboardAnalysis } from "../types/storyboard";
import type { VideoPrompts } from "../types/video-prompts";
import {
  getTask,
  getTaskOutputsDir,
  readTaskArtifact,
  saveTask,
  toProjectRelativePath,
  writeJsonFile
} from "../tools/task-store";

export async function exportJsonForTask(taskId: string): Promise<string> {
  const task = await getTask(taskId);
  const outputDir = getTaskOutputsDir(taskId);
  const outputPath = path.join(outputDir, "project-package.json");
  task.export_paths.json = toProjectRelativePath(outputPath);
  task.current_step = "export-json";

  const projectPackage = {
    task,
    input: await readTaskArtifact<VideoInputArtifact>(taskId, "input.json"),
    analysis: await readTaskArtifact<VideoAnalysis>(taskId, "analysis.json"),
    storyboard: await readTaskArtifact<StoryboardAnalysis>(taskId, "storyboard.json"),
    remake_plan: await readTaskArtifact<RemakePlan>(taskId, "remake_plan.json"),
    video_prompts: await readTaskArtifact<VideoPrompts>(taskId, "video_prompts.json"),
    assets: await readTaskArtifact<AssetsManifest>(taskId, "assets.json")
  };

  await writeJsonFile(outputPath, projectPackage);
  await saveTask(task);
  return task.export_paths.json;
}
