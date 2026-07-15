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
  /**
   * Concrete visual observations of the source video. Populated when the
   * analyze step can actually see source frames (vision model). May be absent
   * on older artifacts or text-only/mock fallbacks.
   */
  visual_style?: {
    shot_types: string;
    composition: string;
    color_tone: string;
    lighting: string;
    camera_movement: string;
    text_overlay_style: string;
    subject: string;
  };
  /** Per-frame / per-segment visual breakdown observed from source frames. */
  shot_breakdown?: Array<{
    timestamp: string;
    what_is_shown: string;
    shot_type: string;
  }>;
  risk_notes: string[];
  errors: ErrorRecord[];
};
