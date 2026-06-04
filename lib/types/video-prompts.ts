import type { ErrorRecord, MockMeta, StepStatus } from "./common";

export type VideoModelPrompt = {
  scene_id: string;
  provider: "kling" | "seedance";
  prompt: string;
  negative_prompt?: string;
  duration: string;
  aspect_ratio: string;
  camera_motion: string;
  style_tags: string[];
  safety_note: string;
};

export type VideoPrompts = {
  task_id: string;
  status: StepStatus;
  mock: MockMeta;
  prompts: VideoModelPrompt[];
  global_style: {
    visual_style: string;
    color_tone: string;
    pacing: string;
  };
  errors: ErrorRecord[];
};
