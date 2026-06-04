import type { JsonSchema } from "../api-clients/llm-client";
import type { VideoInputArtifact } from "../types/input";
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

export type AnalysisModelOutput = {
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
};

export const analyzeSchema: JsonSchema = objectSchema({
  topic: nestedObjectSchema({
    title_guess: { type: "string" },
    content_theme: { type: "string" },
    audience: { type: "string" },
    core_message: { type: "string" }
  }),
  structure: nestedObjectSchema({
    total_duration_estimate: { type: "string" },
    opening_hook: { type: "string" },
    development: { type: "string" },
    climax_or_turning_point: { type: "string" },
    ending: { type: "string" }
  }),
  viral_points: stringArraySchema,
  pacing: nestedObjectSchema({
    rhythm: { type: "string" },
    hook_timing: { type: "string" },
    subtitle_density: { type: "string" },
    visual_density: { type: "string" }
  }),
  risk_notes: stringArraySchema
});

export function buildAnalyzePrompt(task: VideoRemakeTask, input: VideoInputArtifact): {
  systemPrompt: string;
  userPrompt: string;
} {
  return {
    systemPrompt: SAFETY_SYSTEM_PROMPT,
    userPrompt: [
      "请根据以下任务和用户材料，生成短视频结构分析 JSON。",
      "重点输出主题判断、结构、爆点、节奏和风险提示。",
      "如果材料不足，请明确写在 risk_notes 中，不要补造未提供的信息。",
      "",
      `task_json:\n${compactJson(task)}`,
      "",
      `input_json:\n${compactJson(input)}`
    ].join("\n")
  };
}

export function isAnalysisModelOutput(value: unknown): value is AnalysisModelOutput {
  if (!isRecord(value)) return false;
  const topic = value.topic;
  const structure = value.structure;
  const pacing = value.pacing;
  return (
    isRecord(topic) &&
    isString(topic.title_guess) &&
    isString(topic.content_theme) &&
    isString(topic.audience) &&
    isString(topic.core_message) &&
    isRecord(structure) &&
    isString(structure.total_duration_estimate) &&
    isString(structure.opening_hook) &&
    isString(structure.development) &&
    isString(structure.climax_or_turning_point) &&
    isString(structure.ending) &&
    isStringArray(value.viral_points) &&
    isRecord(pacing) &&
    isString(pacing.rhythm) &&
    isString(pacing.hook_timing) &&
    isString(pacing.subtitle_density) &&
    isString(pacing.visual_density) &&
    isStringArray(value.risk_notes)
  );
}

