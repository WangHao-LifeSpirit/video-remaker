import type { ErrorRecord } from "./common";

export type VoiceoverSegment = {
  scene_id: string;
  start: number;
  end: number;
  text: string;
  tone?: string;
  speed?: "slow" | "normal" | "fast";
};

export type VoiceoverScript = {
  task_id: string;
  status: "success" | "failed";
  provider: "mock" | "tts";
  language: "zh" | "en";
  total_duration_seconds: number;
  segments: VoiceoverSegment[];
  errors: ErrorRecord[];
};
