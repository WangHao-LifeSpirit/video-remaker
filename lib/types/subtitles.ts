import type { ErrorRecord } from "./common";

export type SubtitleSegment = {
  index: number;
  scene_id: string;
  start: number;
  end: number;
  text: string;
};

export type SubtitlePackage = {
  task_id: string;
  status: "success" | "failed";
  language: "zh" | "en";
  format: "srt";
  segments: SubtitleSegment[];
  srt_path?: string;
  errors: ErrorRecord[];
};
