import type { ErrorRecord, MockMeta, RemakeStrength, StepStatus } from "./common";

export type RemakePlan = {
  task_id: string;
  status: StepStatus;
  mock: MockMeta;
  remake_strategy: {
    target_platform: string;
    duration: string;
    style: string;
    remake_strength: RemakeStrength;
    originality_rule: string;
  };
  new_concept: {
    title: string;
    theme: string;
    angle: string;
    audience: string;
  };
  new_script: Array<{
    section: string;
    narration: string;
    caption: string;
    visual_direction: string;
  }>;
  new_storyboard: Array<{
    scene_id: string;
    duration: string;
    visual: string;
    action: string;
    narration: string;
    caption: string;
    asset_needed: string;
  }>;
  cover_titles: string[];
  publish_copy: string;
  risk_notes: string[];
  quality_check: {
    too_similar_risk: "low" | "medium" | "high";
    executable: boolean;
    missing_assets: string[];
    suggestions: string[];
  };
  errors: ErrorRecord[];
};
