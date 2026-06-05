import type { ErrorRecord } from "./common";

export type SourceFrameRecord = {
  frame_id: string;
  file_path: string;
  timestamp_seconds: number;
};

export type SourceFramesArtifact = {
  task_id: string;
  status: "success" | "failed";
  source_video_path?: string;
  frames: SourceFrameRecord[];
  max_frames: number;
  interval_seconds: number;
  errors: ErrorRecord[];
};
