import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { TimelineRecord } from "../types/assets";
import { getTaskDir, toProjectRelativePath } from "./task-store";

function secondsFromTimeValue(value: string): number | undefined {
  const normalized = value.trim().toLowerCase().replace(/秒$/, "s");
  if (!normalized) return undefined;

  if (normalized.includes(":")) {
    const parts = normalized.split(":").map((part) => Number(part));
    if (parts.some((part) => Number.isNaN(part))) return undefined;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return undefined;
  }

  const match = normalized.match(/^(\d+(?:\.\d+)?)s?$/);
  return match ? Number(match[1]) : undefined;
}

export function timelineStartSeconds(item: TimelineRecord): number {
  return secondsFromTimeValue(item.start) ?? 0;
}

export function timelineEndSeconds(item: TimelineRecord): number {
  const start = timelineStartSeconds(item);
  const end = secondsFromTimeValue(item.end);
  return end !== undefined && end > start ? end : start + 4;
}

export function timelineDurationSeconds(item: TimelineRecord): number {
  return Math.max(0.5, timelineEndSeconds(item) - timelineStartSeconds(item));
}

export function totalTimelineSeconds(timeline: TimelineRecord[]): number {
  return Math.max(
    0.5,
    ...timeline.map((item) => timelineEndSeconds(item))
  );
}

function toSrtTimestamp(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const milliseconds = Math.floor((totalSeconds - Math.floor(totalSeconds)) * 1000);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")},${milliseconds.toString().padStart(3, "0")}`;
}

function cleanSubtitleText(value: string): string {
  const text = value.trim();
  return text ? text.replace(/\r?\n/g, " ") : " ";
}

export async function writeSrtForTimeline(taskId: string, timeline: TimelineRecord[]): Promise<string> {
  const subtitleDir = path.join(getTaskDir(taskId), "assets", "subtitles");
  await mkdir(subtitleDir, { recursive: true });
  const subtitlePath = path.join(subtitleDir, "subtitles.srt");
  const content = timeline
    .map((item, index) => {
      const start = timelineStartSeconds(item);
      const end = timelineEndSeconds(item);
      return [
        String(index + 1),
        `${toSrtTimestamp(start)} --> ${toSrtTimestamp(end)}`,
        cleanSubtitleText(item.subtitle),
        ""
      ].join("\n");
    })
    .join("\n");
  await writeFile(subtitlePath, content, "utf8");
  return toProjectRelativePath(subtitlePath);
}

