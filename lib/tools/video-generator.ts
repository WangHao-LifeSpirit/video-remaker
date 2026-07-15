import { constants } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { runFfmpeg } from "./ffmpeg";
import { getTaskDir, resolveProjectPath, toProjectRelativePath } from "./task-store";

export function getMockSceneVideoPath(taskId: string, sceneId: string): string {
  return path.join(getTaskDir(taskId), "assets", "videos", `${sceneId}.mp4`);
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(resolveProjectPath(filePath), constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function generateMockSceneVideo(input: {
  taskId: string;
  sceneId: string;
  durationSeconds: number;
}): Promise<string> {
  const outputPath = getMockSceneVideoPath(input.taskId, input.sceneId);
  await mkdir(path.dirname(outputPath), { recursive: true });
  const duration = Math.max(0.5, input.durationSeconds);

  await runFfmpeg([
    "-y",
    "-f",
    "lavfi",
    "-i",
    `testsrc2=size=720x1280:rate=30:duration=${duration.toFixed(3)}`,
    "-t",
    duration.toFixed(3),
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outputPath
  ]);

  return toProjectRelativePath(outputPath);
}
