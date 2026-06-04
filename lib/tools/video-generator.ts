import { constants } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { runFfmpeg } from "./ffmpeg";
import { getTaskDir, resolveProjectPath, toProjectRelativePath } from "./task-store";

const SCENE_COLORS = ["0x0f172a", "0x164e63", "0x365314", "0x7c2d12", "0x581c87", "0x831843"];

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

function colorForScene(sceneId: string): string {
  const codeSum = Array.from(sceneId).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return SCENE_COLORS[codeSum % SCENE_COLORS.length];
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
    `color=c=${colorForScene(input.sceneId)}:s=720x1280:r=30:d=${duration.toFixed(3)}`,
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

