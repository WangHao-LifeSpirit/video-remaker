import { mkdir } from "node:fs/promises";
import path from "node:path";
import { runFfmpeg } from "./ffmpeg";
import { getTaskDir, toProjectRelativePath } from "./task-store";

export async function generateSilentAudio(input: {
  taskId: string;
  durationSeconds: number;
}): Promise<string> {
  const audioDir = path.join(getTaskDir(input.taskId), "assets", "audio");
  await mkdir(audioDir, { recursive: true });
  const outputPath = path.join(audioDir, "silent.m4a");
  const duration = Math.max(0.5, input.durationSeconds);

  await runFfmpeg([
    "-y",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=48000:cl=stereo",
    "-t",
    duration.toFixed(3),
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    outputPath
  ]);

  return toProjectRelativePath(outputPath);
}

