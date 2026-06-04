import type { ErrorRecord, MockMeta, StepStatus } from "./common";

export type AssetRecord = {
  asset_id: string;
  scene_id: string;
  type: "mock_video" | "image" | "voiceover" | "subtitle" | "bgm" | "cover" | "placeholder";
  provider: "mock" | "kling" | "luma" | "seedance" | "tts" | "asr" | "ffmpeg";
  file_path?: string;
  remote_task_id?: string;
  remote_url?: string;
  generation_note?: string;
  description: string;
  generation_status: StepStatus;
};

export type TimelineRecord = {
  scene_id: string;
  start: string;
  end: string;
  asset_ids: string[];
  narration: string;
  subtitle: string;
};

export type AssetsManifest = {
  task_id: string;
  status: StepStatus;
  mock: MockMeta;
  assets: AssetRecord[];
  timeline: TimelineRecord[];
  assemble_status: {
    status: StepStatus;
    mp4_reserved_path?: string;
    mp4_path?: string;
    subtitle_path?: string;
    audio_path?: string;
    mode?: "mock" | "ffmpeg";
    warnings?: string[];
    note: string;
  };
  errors: ErrorRecord[];
};
