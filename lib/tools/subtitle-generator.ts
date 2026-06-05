import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { VoiceoverScript } from "../types/audio";
import type { SubtitlePackage } from "../types/subtitles";
import { getTask, getTaskDir, readTaskArtifact, saveTask, setTaskStatus, toProjectRelativePath, writeTaskArtifact } from "./task-store";

function toSrtTimestamp(totalSeconds: number): string {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = Math.floor(safeSeconds % 60);
  const milliseconds = Math.floor((safeSeconds - Math.floor(safeSeconds)) * 1000);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")},${milliseconds.toString().padStart(3, "0")}`;
}

function cleanSubtitleText(value: string): string {
  return value.replace(/\s+/g, " ").trim() || " ";
}

function srtContent(subtitles: SubtitlePackage): string {
  return subtitles.segments
    .map((segment) => [
      String(segment.index),
      `${toSrtTimestamp(segment.start)} --> ${toSrtTimestamp(segment.end)}`,
      cleanSubtitleText(segment.text),
      ""
    ].join("\n"))
    .join("\n");
}

export async function generateSubtitlesForTask(taskId: string): Promise<SubtitlePackage> {
  const voiceover = await readTaskArtifact<VoiceoverScript>(taskId, "voiceover_script.json");
  const subtitleDir = path.join(getTaskDir(taskId), "assets", "subtitles");
  await mkdir(subtitleDir, { recursive: true });

  const subtitles: SubtitlePackage = {
    task_id: taskId,
    status: "success",
    language: voiceover.language,
    format: "srt",
    segments: voiceover.segments.map((segment, index) => ({
      index: index + 1,
      scene_id: segment.scene_id,
      start: segment.start,
      end: segment.end,
      text: segment.text
    })),
    errors: []
  };

  const srtPath = path.join(subtitleDir, "subtitles.srt");
  await writeFile(srtPath, srtContent(subtitles), "utf8");
  subtitles.srt_path = toProjectRelativePath(srtPath);

  const { relativePath } = await writeTaskArtifact(taskId, "subtitles.json", subtitles);
  const task = await getTask(taskId);
  task.files.subtitles_json = relativePath;
  setTaskStatus(task, "success", "subtitles");
  await saveTask(task);
  return subtitles;
}
