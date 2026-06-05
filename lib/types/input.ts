import type { TaskSource, TaskUserInputs } from "./task";
import type { ErrorRecord, StepStatus } from "./common";
import type { SourceLinkInfo } from "./source-link";

export type InputMaterial = {
  type: "url" | "source_link" | "upload" | "text_notes" | "transcript" | "screenshot_notes" | "source_caption" | "remake_requirements";
  status: StepStatus;
  value?: string;
  note?: string;
};

export type UploadedVideoInfo = {
  uploaded_video_path: string;
  original_filename: string;
  upload_time: string;
  content_type?: string;
  size_bytes?: number;
};

export type VideoInputArtifact = {
  task_id: string;
  status: StepStatus;
  source: TaskSource;
  user_inputs: TaskUserInputs;
  source_link?: SourceLinkInfo;
  uploaded_video?: UploadedVideoInfo;
  source_transcript?: string;
  source_caption?: string;
  screenshot_notes?: string;
  remake_requirements?: string;
  materials: InputMaterial[];
  available_materials: string[];
  missing_materials: string[];
  errors: ErrorRecord[];
};
