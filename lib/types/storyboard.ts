import type { ErrorRecord, MockMeta, StepStatus } from "./common";

export type OriginalStoryboardScene = {
  scene_id: string;
  time_range: string;
  shot_type: string;
  visual_description: string;
  narration_or_caption: string;
  purpose: string;
  pacing_note: string;
};

export type StoryboardAnalysis = {
  task_id: string;
  status: StepStatus;
  mock: MockMeta;
  original_storyboard: OriginalStoryboardScene[];
  rhythm_analysis: string;
  visual_language: string;
  bgm_and_sound_notes: string;
  subtitle_style_notes: string;
  errors: ErrorRecord[];
};
