import { stat } from "node:fs/promises";
import path from "node:path";
import { runFfmpeg, runFfprobe } from "./ffmpeg";
import { generateOutputsManifestForTask } from "./output-manifest";
import { getTask, getTaskOutputsDir, resolveProjectPath, saveTask, setTaskStatus, toProjectRelativePath } from "./task-store";

async function pickVideo(taskId: string): Promise<string> {
  const outputDir = getTaskOutputsDir(taskId);
  for (const fileName of ["final_subtitled.mp4", "final.mp4"]) {
    const filePath = path.join(outputDir, fileName);
    try {
      const fileStat = await stat(filePath);
      if (fileStat.isFile()) return filePath;
    } catch {
      // Continue.
    }
  }
  throw new Error("No final_subtitled.mp4 or final.mp4 exists for cover export.");
}

export async function exportCoverForTask(taskId: string): Promise<{
  task_id: string;
  status: "success";
  source_video: string;
  cover_path: string;
}> {
  const task = await getTask(taskId);
  const sourceVideo = await pickVideo(taskId);
  const outputPath = path.join(getTaskOutputsDir(taskId), "cover.jpg");
  await runFfmpeg([
    "-y",
    "-ss",
    "1",
    "-i",
    sourceVideo,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    outputPath
  ]);
  await runFfprobe(["-v", "error", "-show_streams", outputPath]);
  const coverPath = toProjectRelativePath(outputPath);
  task.export_paths.cover = coverPath;
  setTaskStatus(task, "success", "export-cover");
  await saveTask(task);
  await generateOutputsManifestForTask(taskId);
  return {
    task_id: taskId,
    status: "success",
    source_video: toProjectRelativePath(resolveProjectPath(sourceVideo)),
    cover_path: coverPath
  };
}
