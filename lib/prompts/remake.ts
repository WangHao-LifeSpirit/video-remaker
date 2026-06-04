import type { JsonSchema } from "../api-clients/llm-client";
import type { VideoAnalysis } from "../types/analysis";
import type { RemakeStrength } from "../types/common";
import type { StoryboardAnalysis } from "../types/storyboard";
import type { VideoRemakeTask } from "../types/task";
import {
  compactJson,
  isRecord,
  isString,
  isStringArray,
  nestedObjectSchema,
  objectSchema,
  SAFETY_SYSTEM_PROMPT,
  stringArraySchema
} from "./common";

export type RemakeModelOutput = {
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
};

const scriptItemSchema = nestedObjectSchema({
  section: { type: "string" },
  narration: { type: "string" },
  caption: { type: "string" },
  visual_direction: { type: "string" }
});

const storyboardItemSchema = nestedObjectSchema({
  scene_id: { type: "string" },
  duration: { type: "string" },
  visual: { type: "string" },
  action: { type: "string" },
  narration: { type: "string" },
  caption: { type: "string" },
  asset_needed: { type: "string" }
});

export const remakeSchema: JsonSchema = objectSchema({
  new_concept: nestedObjectSchema({
    title: { type: "string" },
    theme: { type: "string" },
    angle: { type: "string" },
    audience: { type: "string" }
  }),
  new_script: {
    type: "array",
    items: scriptItemSchema
  },
  new_storyboard: {
    type: "array",
    items: storyboardItemSchema
  },
  cover_titles: stringArraySchema,
  publish_copy: { type: "string" },
  risk_notes: stringArraySchema,
  quality_check: nestedObjectSchema({
    too_similar_risk: { type: "string", enum: ["low", "medium", "high"] },
    executable: { type: "boolean" },
    missing_assets: stringArraySchema,
    suggestions: stringArraySchema
  })
});

export function buildRemakePrompt(
  task: VideoRemakeTask,
  analysis: VideoAnalysis,
  storyboard: StoryboardAnalysis
): {
  systemPrompt: string;
  userPrompt: string;
} {
  return {
    systemPrompt: SAFETY_SYSTEM_PROMPT,
    userPrompt: [
      "请生成同款结构、原创内容的短视频改编方案 JSON。",
      "必须保留结构学习价值，但文案、案例、视觉方向、封面标题和发布文案必须原创。",
      "new_storyboard 的 scene_id 应与 storyboard 中的 scene_id 对齐，duration 用可解析格式，例如 0-3s 或 3s。",
      "quality_check 需要主动检查是否太像原视频、是否可执行、缺什么素材。",
      "",
      `task_json:\n${compactJson(task)}`,
      "",
      `analysis_json:\n${compactJson(analysis)}`,
      "",
      `storyboard_json:\n${compactJson(storyboard)}`
    ].join("\n")
  };
}

function isRemakeStrength(value: unknown): value is RemakeStrength {
  return value === "low" || value === "medium" || value === "high";
}

function isScriptItem(value: unknown): value is RemakeModelOutput["new_script"][number] {
  return (
    isRecord(value) &&
    isString(value.section) &&
    isString(value.narration) &&
    isString(value.caption) &&
    isString(value.visual_direction)
  );
}

function isStoryboardItem(value: unknown): value is RemakeModelOutput["new_storyboard"][number] {
  return (
    isRecord(value) &&
    isString(value.scene_id) &&
    isString(value.duration) &&
    isString(value.visual) &&
    isString(value.action) &&
    isString(value.narration) &&
    isString(value.caption) &&
    isString(value.asset_needed)
  );
}

export function isRemakeModelOutput(value: unknown): value is RemakeModelOutput {
  if (!isRecord(value)) return false;
  const concept = value.new_concept;
  const qualityCheck = value.quality_check;
  return (
    isRecord(concept) &&
    isString(concept.title) &&
    isString(concept.theme) &&
    isString(concept.angle) &&
    isString(concept.audience) &&
    Array.isArray(value.new_script) &&
    value.new_script.length > 0 &&
    value.new_script.every(isScriptItem) &&
    Array.isArray(value.new_storyboard) &&
    value.new_storyboard.length > 0 &&
    value.new_storyboard.every(isStoryboardItem) &&
    isStringArray(value.cover_titles) &&
    isString(value.publish_copy) &&
    isStringArray(value.risk_notes) &&
    isRecord(qualityCheck) &&
    isRemakeStrength(qualityCheck.too_similar_risk) &&
    typeof qualityCheck.executable === "boolean" &&
    isStringArray(qualityCheck.missing_assets) &&
    isStringArray(qualityCheck.suggestions)
  );
}

