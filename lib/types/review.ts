export type ReviewIssue = {
  scene_id?: string;
  severity: "low" | "medium" | "high";
  type: "storyboard" | "prompt" | "duration" | "visual" | "originality" | "execution";
  message: string;
  suggestion: string;
};

export type SceneReview = {
  scene_id: string;
  score: number;
  can_generate: boolean;
  prompt_quality: "good" | "needs_revision" | "bad";
  suggested_prompt?: string;
};

export type ReviewReport = {
  task_id: string;
  status: "success" | "needs_revision" | "failed";
  overall_score: number;
  issues: ReviewIssue[];
  scene_reviews: SceneReview[];
  final_decision: "approve" | "revise_before_generation" | "manual_review";
};
