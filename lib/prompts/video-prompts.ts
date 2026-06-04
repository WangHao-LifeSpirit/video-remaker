import type { JsonSchema } from "../api-clients/llm-client";
import type { RemakePlan } from "../types/remake-plan";
import type { VideoRemakeTask } from "../types/task";
import type { VideoModelPrompt } from "../types/video-prompts";
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

export type VideoPromptsModelOutput = {
  prompts: VideoModelPrompt[];
  global_style: {
    visual_style: string;
    color_tone: string;
    pacing: string;
  };
};

const promptItemSchema = nestedObjectSchema({
  scene_id: { type: "string" },
  provider: { type: "string", enum: ["kling", "seedance"] },
  prompt: { type: "string" },
  negative_prompt: { type: "string" },
  duration: { type: "string" },
  aspect_ratio: { type: "string" },
  camera_motion: { type: "string" },
  style_tags: stringArraySchema,
  safety_note: { type: "string" }
});

export const videoPromptsSchema: JsonSchema = objectSchema({
  prompts: {
    type: "array",
    items: promptItemSchema
  },
  global_style: nestedObjectSchema({
    visual_style: { type: "string" },
    color_tone: { type: "string" },
    pacing: { type: "string" }
  })
});

export function buildVideoPromptsPrompt(task: VideoRemakeTask, remakePlan: RemakePlan): {
  systemPrompt: string;
  userPrompt: string;
} {
  return {
    systemPrompt: SAFETY_SYSTEM_PROMPT,
    userPrompt: [
      "请根据 remake_plan.json 生成 Kling 和 Seedance 的视频模型 prompt JSON。",
      "每个 new_storyboard scene 至少生成 kling 和 seedance 各一条 prompt。",
      "prompt 必须生成原创画面，不能复刻原视频可识别镜头、字幕、平台 UI、水印或人物形象。",
      "negative_prompt 必须排除 copied footage、watermark、logos、platform UI、duplicated source video 等风险。",
      "duration、aspect_ratio、camera_motion 和 style_tags 要能被后续视频生成器读取。",
      "",
      `task_json:\n${compactJson(task)}`,
      "",
      `remake_plan_json:\n${compactJson(remakePlan)}`
    ].join("\n")
  };
}

function isProvider(value: unknown): value is VideoModelPrompt["provider"] {
  return value === "kling" || value === "seedance";
}

function isPromptItem(value: unknown): value is VideoModelPrompt {
  return (
    isRecord(value) &&
    isString(value.scene_id) &&
    isProvider(value.provider) &&
    isString(value.prompt) &&
    (value.negative_prompt === undefined || typeof value.negative_prompt === "string") &&
    isString(value.duration) &&
    isString(value.aspect_ratio) &&
    isString(value.camera_motion) &&
    isStringArray(value.style_tags) &&
    isString(value.safety_note)
  );
}

export function isVideoPromptsModelOutput(value: unknown): value is VideoPromptsModelOutput {
  if (!isRecord(value)) return false;
  const globalStyle = value.global_style;
  return (
    Array.isArray(value.prompts) &&
    value.prompts.length > 0 &&
    value.prompts.every(isPromptItem) &&
    isRecord(globalStyle) &&
    isString(globalStyle.visual_style) &&
    isString(globalStyle.color_tone) &&
    isString(globalStyle.pacing)
  );
}

