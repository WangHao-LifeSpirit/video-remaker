import type { ErrorRecord, MockMeta, StepStatus } from "./common";

export type VideoAnalysis = {
  task_id: string;
  status: StepStatus;
  mock: MockMeta;
  source_summary: {
    platform?: string;
    available_materials: string[];
    missing_materials: string[];
  };
  topic: {
    title_guess: string;
    content_theme: string;
    audience: string;
    core_message: string;
  };
  structure: {
    total_duration_estimate: string;
    opening_hook: string;
    development: string;
    climax_or_turning_point: string;
    ending: string;
  };
  viral_points: string[];
  pacing: {
    rhythm: string;
    hook_timing: string;
    subtitle_density: string;
    visual_density: string;
  };
  risk_notes: string[];
  errors: ErrorRecord[];
};
