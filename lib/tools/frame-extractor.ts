import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import type { SourceFramesArtifact } from "../types/source-frames";
import type { SourceVideoMetadata } from "../types/source-video";
import { createErrorRecord } from "../types/common";
import { runFfmpeg } from "./ffmpeg";
import { getTask, getTaskDir, readTaskArtifact, resolveProjectPath, saveTask, setTaskStatus, toProjectRelativePath, writeTaskArtifact } from "./task-store";

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const fileStat = await stat(resolveProjectPath(filePath));
    return fileStat.isFile();
  } catch {
    return false;
  }
}

export async function extractFramesForTask(input: {
  taskId: string;
  maxFrames?: number;
  intervalSeconds?: number;
}): Promise<SourceFramesArtifact> {
  const task = await getTask(input.taskId);
  const maxFrames = Math.max(1, Math.min(input.maxFrames ?? 8, 8));
  const intervalSeconds = Math.max(0.5, input.intervalSeconds ?? 2);
  const sourceVideo = await readTaskArtifact<SourceVideoMetadata>(input.taskId, "source_video.json");
  const sourcePath = sourceVideo.uploaded_video_path;
  if (!sourcePath || !(await fileExists(sourcePath))) {
    const error = createErrorRecord({
      step: "extract-frames",
      message: "No readable source video is available for frame extraction.",
      code: "SOURCE_VIDEO_MISSING",
      recoverable: true
    });
    const failed: SourceFramesArtifact = {
      task_id: input.taskId,
      status: "failed",
      source_video_path: sourcePath,
      frames: [],
      max_frames: maxFrames,
      interval_seconds: intervalSeconds,
      errors: [error]
    };
    await writeTaskArtifact(input.taskId, "source_frames.json", failed);
    task.errors.push(error);
    setTaskStatus(task, "needs_user_input", "extract-frames");
    await saveTask(task);
    return failed;
  }

  const frameDir = path.join(getTaskDir(input.taskId), "assets", "source-frames");
  await mkdir(frameDir, { recursive: true });
  const duration = sourceVideo.duration_seconds ?? maxFrames * intervalSeconds;
  const timestamps = Array.from({ length: maxFrames }, (_, index) => Math.min(index * intervalSeconds, Math.max(duration - 0.1, 0)));
  const uniqueTimestamps = Array.from(new Set(timestamps.map((value) => Number(value.toFixed(3)))));
  const frames: SourceFramesArtifact["frames"] = [];

  for (let index = 0; index < uniqueTimestamps.length; index += 1) {
    const timestamp = uniqueTimestamps[index];
    const frameId = `frame_${String(index + 1).padStart(3, "0")}`;
    const outputPath = path.join(frameDir, `${frameId}.jpg`);
    await runFfmpeg([
      "-y",
      "-ss",
      timestamp.toFixed(3),
      "-i",
      resolveProjectPath(sourcePath),
      "-frames:v",
      "1",
      "-q:v",
      "3",
      outputPath
    ]);
    frames.push({
      frame_id: frameId,
      file_path: toProjectRelativePath(outputPath),
      timestamp_seconds: timestamp
    });
  }

  const artifact: SourceFramesArtifact = {
    task_id: input.taskId,
    status: "success",
    source_video_path: sourcePath,
    frames,
    max_frames: maxFrames,
    interval_seconds: intervalSeconds,
    errors: []
  };
  const { relativePath } = await writeTaskArtifact(input.taskId, "source_frames.json", artifact);
  task.files.source_frames_json = relativePath;
  setTaskStatus(task, "success", "extract-frames");
  await saveTask(task);
  return artifact;
}
