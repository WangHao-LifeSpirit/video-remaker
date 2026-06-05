import type { ErrorRecord } from "./common";

export type SourceVideoMetadata = {
  task_id: string;
  status: "success" | "failed";
  uploaded_video_path?: string;
  duration_seconds?: number;
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
  has_audio: boolean;
  audio_codec?: string;
  format_name?: string;
  errors: ErrorRecord[];
};
