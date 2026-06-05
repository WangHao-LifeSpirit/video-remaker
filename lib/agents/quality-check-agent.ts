import type { RemakePlan } from "../types/remake-plan";
import type { ReviewIssue, ReviewReport, SceneReview } from "../types/review";
import type { StoryboardAnalysis } from "../types/storyboard";
import type { TaskUserInputs } from "../types/task";
import type { VideoModelPrompt, VideoPrompts } from "../types/video-prompts";

export function evaluateRemakeQuality(input: {
  planDraft: Pick<RemakePlan, "new_storyboard" | "new_script" | "risk_notes">;
  userInputs: TaskUserInputs;
}): RemakePlan["quality_check"] {
  const tooSimilarRisk = input.userInputs.remake_strength === "high" ? "medium" : "low";
  const missingAssets = input.planDraft.new_storyboard
    .filter((scene) => !scene.asset_needed.trim())
    .map((scene) => scene.scene_id);

  return {
    too_similar_risk: tooSimilarRisk,
    executable: missingAssets.length === 0,
    missing_assets: missingAssets,
    suggestions: [
      "保持结构节奏相似，但更换具体素材、表达和案例。",
      "避免复用原视频字幕、口播和封面文案。",
      "真实 API 接入前，所有视频片段均保持 mock 标记。"
    ]
  };
}

function parseDurationSeconds(value: string): number | undefined {
  const trimmed = value.trim();
  const secondsMatch = trimmed.match(/^(\d+(?:\.\d+)?)s?$/i);
  if (secondsMatch) {
    return Number(secondsMatch[1]);
  }
  const rangeMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*s?\s*-\s*(\d+(?:\.\d+)?)\s*s?/i);
  if (rangeMatch) {
    return Math.max(0, Number(rangeMatch[2]) - Number(rangeMatch[1]));
  }
  return undefined;
}

function hasAny(text: string, words: string[]): boolean {
  const lower = text.toLowerCase();
  return words.some((word) => lower.includes(word));
}

function suggestedPrompt(input: {
  prompt: VideoModelPrompt;
  remakeScene?: RemakePlan["new_storyboard"][number];
  globalStyle: VideoPrompts["global_style"];
}): string {
  const scene = input.remakeScene;
  const visual = scene?.visual || input.prompt.prompt;
  const action = scene?.action || "clear subject action";
  const caption = scene?.caption ? `On-screen caption: ${scene.caption}.` : "";
  return [
    visual,
    `Subject performs: ${action}.`,
    `Scene duration ${input.prompt.duration}, ${input.prompt.aspect_ratio}.`,
    `Camera: ${input.prompt.camera_motion || "stable cinematic camera"}.`,
    `Style: ${input.globalStyle.visual_style}; color tone: ${input.globalStyle.color_tone}.`,
    caption,
    "Keep it original, executable, and avoid copied footage, logos, watermarks, and platform UI."
  ].filter(Boolean).join(" ");
}

function reviewPrompt(input: {
  prompt: VideoModelPrompt;
  remakeScene?: RemakePlan["new_storyboard"][number];
  storyboardScene?: StoryboardAnalysis["original_storyboard"][number];
  globalStyle: VideoPrompts["global_style"];
}): { review: SceneReview; issues: ReviewIssue[] } {
  const issues: ReviewIssue[] = [];
  let score = 100;
  const duration = parseDurationSeconds(input.prompt.duration);
  const promptText = input.prompt.prompt.trim();

  if (promptText.length < 45) {
    score -= 30;
    issues.push({
      scene_id: input.prompt.scene_id,
      severity: "high",
      type: "prompt",
      message: "Prompt is too short to reliably generate a specific scene.",
      suggestion: "Add subject, action, environment, camera, mood, and visual style."
    });
  }
  if (promptText.length > 750) {
    score -= 12;
    issues.push({
      scene_id: input.prompt.scene_id,
      severity: "medium",
      type: "prompt",
      message: "Prompt is long and may contain too many competing instructions.",
      suggestion: "Keep one clear subject, one scene, one action, and one camera direction."
    });
  }
  if (!hasAny(promptText, ["student", "person", "hand", "screen", "laptop", "computer", "desk", "phone", "creator", "subject"])) {
    score -= 12;
    issues.push({
      scene_id: input.prompt.scene_id,
      severity: "medium",
      type: "visual",
      message: "Prompt may lack a clear visual subject.",
      suggestion: "Name the primary subject and what the viewer should focus on."
    });
  }
  if (!hasAny(promptText, ["typing", "opening", "showing", "moving", "checking", "writing", "editing", "smiling", "working", "performs"])) {
    score -= 10;
    issues.push({
      scene_id: input.prompt.scene_id,
      severity: "medium",
      type: "execution",
      message: "Prompt may lack a concrete action.",
      suggestion: "Describe the visible action in one direct sentence."
    });
  }
  if (!input.prompt.camera_motion.trim()) {
    score -= 8;
    issues.push({
      scene_id: input.prompt.scene_id,
      severity: "low",
      type: "visual",
      message: "Camera motion is missing.",
      suggestion: "Add static, slow push-in, pan, handheld, or screen-recording style."
    });
  }
  if (!input.prompt.style_tags.length) {
    score -= 8;
    issues.push({
      scene_id: input.prompt.scene_id,
      severity: "low",
      type: "visual",
      message: "Style tags are missing.",
      suggestion: "Add concise style tags for lighting, pacing, and composition."
    });
  }
  if (duration === undefined || duration <= 0 || duration > 8) {
    score -= 15;
    issues.push({
      scene_id: input.prompt.scene_id,
      severity: "medium",
      type: "duration",
      message: "Duration is missing, invalid, or too long for a short-video scene.",
      suggestion: "Use a concise duration, usually 1s to 5s per scene."
    });
  }
  if (!input.remakeScene?.caption && !input.remakeScene?.narration) {
    score -= 8;
    issues.push({
      scene_id: input.prompt.scene_id,
      severity: "low",
      type: "storyboard",
      message: "Scene is missing narration or caption support.",
      suggestion: "Add a caption or narration line so editing rhythm is clear."
    });
  }
  if (!input.remakeScene?.asset_needed) {
    score -= 8;
    issues.push({
      scene_id: input.prompt.scene_id,
      severity: "low",
      type: "execution",
      message: "Asset requirement is unclear.",
      suggestion: "Specify what visual asset or generated shot is needed."
    });
  }
  if (input.storyboardScene && promptText.toLowerCase().includes(input.storyboardScene.visual_description.toLowerCase().slice(0, 30))) {
    score -= 12;
    issues.push({
      scene_id: input.prompt.scene_id,
      severity: "medium",
      type: "originality",
      message: "Prompt may be too close to the source storyboard wording.",
      suggestion: "Keep the structure but rewrite the specific visual expression and example."
    });
  }

  const normalizedScore = Math.max(0, Math.min(100, score));
  const promptQuality: SceneReview["prompt_quality"] =
    normalizedScore >= 78 ? "good" : normalizedScore >= 55 ? "needs_revision" : "bad";

  return {
    review: {
      scene_id: input.prompt.scene_id,
      score: normalizedScore,
      can_generate: normalizedScore >= 60 && !issues.some((issue) => issue.severity === "high"),
      prompt_quality: promptQuality,
      suggested_prompt: promptQuality === "good" ? undefined : suggestedPrompt(input)
    },
    issues
  };
}

function selectScenePrompts(prompts: VideoModelPrompt[]): VideoModelPrompt[] {
  const byScene = new Map<string, VideoModelPrompt[]>();
  for (const prompt of prompts) {
    const scenePrompts = byScene.get(prompt.scene_id) ?? [];
    scenePrompts.push(prompt);
    byScene.set(prompt.scene_id, scenePrompts);
  }

  return Array.from(byScene.values()).map((scenePrompts) =>
    scenePrompts.find((prompt) => prompt.provider === "seedance")
      ?? scenePrompts[0]
  );
}

export function reviewTaskQuality(input: {
  taskId: string;
  storyboard: StoryboardAnalysis;
  remakePlan: RemakePlan;
  videoPrompts: VideoPrompts;
}): ReviewReport {
  const issues: ReviewIssue[] = [];
  const sceneReviews: SceneReview[] = [];

  if (!input.videoPrompts.prompts.length) {
    return {
      task_id: input.taskId,
      status: "failed",
      overall_score: 0,
      issues: [{
        severity: "high",
        type: "prompt",
        message: "No video prompts were found.",
        suggestion: "Run prompts generation before review."
      }],
      scene_reviews: [],
      final_decision: "manual_review"
    };
  }

  const promptsForReview = selectScenePrompts(input.videoPrompts.prompts);
  for (const prompt of promptsForReview) {
    const remakeScene = input.remakePlan.new_storyboard.find((scene) => scene.scene_id === prompt.scene_id);
    const storyboardScene = input.storyboard.original_storyboard.find((scene) => scene.scene_id === prompt.scene_id);
    const result = reviewPrompt({
      prompt,
      remakeScene,
      storyboardScene,
      globalStyle: input.videoPrompts.global_style
    });
    sceneReviews.push(result.review);
    issues.push(...result.issues);
  }

  if (input.remakePlan.quality_check.too_similar_risk === "high") {
    issues.push({
      severity: "high",
      type: "originality",
      message: "Remake plan reports high similarity risk.",
      suggestion: "Rewrite scene examples, captions, and visual settings before generation."
    });
  }
  if (!input.remakePlan.quality_check.executable) {
    issues.push({
      severity: "medium",
      type: "execution",
      message: "Remake plan reports missing assets.",
      suggestion: `Clarify missing assets: ${input.remakePlan.quality_check.missing_assets.join(", ") || "unknown"}.`
    });
  }

  const overallScore = Math.round(sceneReviews.reduce((sum, scene) => sum + scene.score, 0) / sceneReviews.length);
  const hasHighIssue = issues.some((issue) => issue.severity === "high");
  const hasBadScene = sceneReviews.some((scene) => scene.prompt_quality === "bad" || !scene.can_generate);
  const hasRevision = issues.length > 0 || sceneReviews.some((scene) => scene.prompt_quality === "needs_revision");

  return {
    task_id: input.taskId,
    status: hasHighIssue || hasBadScene ? "needs_revision" : hasRevision ? "needs_revision" : "success",
    overall_score: overallScore,
    issues,
    scene_reviews: sceneReviews,
    final_decision: hasHighIssue || hasBadScene
      ? "manual_review"
      : hasRevision
        ? "revise_before_generation"
        : "approve"
  };
}
