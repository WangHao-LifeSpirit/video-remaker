import type {
  ErrorRecord,
  RemakeStrength,
  SourceInputType,
  StepStatus,
  SupportedPlatform
} from "./common";

export type TaskSource = {
  input_type: SourceInputType;
  original_url?: string;
  final_url?: string;
  platform?: SupportedPlatform;
  content_id?: string;
  parse_status: StepStatus;
  parse_error?: string;
  upload_path?: string;
};

export type TaskUserInputs = {
  target_platform: string;
  duration: string;
  style: string;
  remake_strength: RemakeStrength;
  is_original_remake: boolean;
  text_notes?: string;
  transcript?: string;
  screenshot_notes?: string;
};

export type TaskFiles = {
  input_json?: string;
  analysis_json?: string;
  storyboard_json?: string;
  remake_plan_json?: string;
  video_prompts_json?: string;
  assets_json?: string;
};

export type TaskExportPaths = {
  markdown?: string;
  json?: string;
  mp4?: string;
};

export type VideoRemakeTask = {
  task_id: string;
  created_at: string;
  updated_at: string;
  status: StepStatus;
  current_step: string;
  source: TaskSource;
  user_inputs: TaskUserInputs;
  files: TaskFiles;
  export_paths: TaskExportPaths;
  errors: ErrorRecord[];
};

export const defaultUserInputs: TaskUserInputs = {
  target_platform: "douyin",
  duration: "30s",
  style: "clean, fast-paced, creator-style short video",
  remake_strength: "medium",
  is_original_remake: true,
  text_notes: "",
  transcript: "",
  screenshot_notes: ""
};
