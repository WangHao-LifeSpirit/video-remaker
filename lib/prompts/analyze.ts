import type { JsonSchema } from "../api-clients/llm-client";
import type { VideoInputArtifact } from "../types/input";
import type { VideoRemakeTask } from "../types/task";
import type { SourceVideoMetadata } from "../types/source-video";
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
  visual_style: {
    shot_types: string;
    composition: string;
    color_tone: string;
    lighting: string;
    camera_movement: string;
    text_overlay_style: string;
    subject: string;
  };
  shot_breakdown: Array<{
    timestamp: string;
    what_is_shown: string;
    shot_type: string;
  }>;
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
  visual_style: nestedObjectSchema({
    shot_types: { type: "string" },
    composition: { type: "string" },
    color_tone: { type: "string" },
    lighting: { type: "string" },
    camera_movement: { type: "string" },
    text_overlay_style: { type: "string" },
    subject: { type: "string" }
  }),
  shot_breakdown: {
    type: "array",
    items: nestedObjectSchema({
      timestamp: { type: "string" },
      what_is_shown: { type: "string" },
      shot_type: { type: "string" }
    })
  },
  risk_notes: stringArraySchema
});

export function buildAnalyzePrompt(
  task: VideoRemakeTask,
  input: VideoInputArtifact,
  options: {
    visionCanSeeFrames?: boolean;
    extractedFrameCount?: number;
    sourceVideo?: SourceVideoMetadata;
  } = {}
): {
  systemPrompt: string;
  userPrompt: string;
} {
  const frameInstruction = options.visionCanSeeFrames
    ? [
        "随附的图片是原视频按时间顺序抽取的关键帧，请仔细观察它们。",
        "visual_style 和 shot_breakdown 必须基于关键帧里真实可见的画面来写：景别、构图、色调、光线、运镜、字幕/文字样式、主体对象。",
        "只描述画面里真实存在的东西，不要编造看不到的内容；这是风格与结构学习，不复制可识别的原镜头、原字幕文字、人物形象、水印或平台 UI。"
      ]
    : [
        options.extractedFrameCount
          ? `系统已从原视频抽取 ${options.extractedFrameCount} 张关键帧，但当前没有配置可读取图片的视觉模型。`
          : "本次没有可用的原视频关键帧。",
        "visual_style 和 shot_breakdown 只能基于用户文字材料做保守推断，",
        "无法确定的字段请填\"未提供画面，无法确认\"，并在 risk_notes 中说明缺少真实画面，切勿凭空编造具体画面。"
      ];
  return {
    systemPrompt: SAFETY_SYSTEM_PROMPT,
    userPrompt: [
      "请根据以下任务和用户材料，生成短视频结构分析 JSON。",
      "重点输出主题判断、结构、爆点、节奏、视觉风格和风险提示。",
      ...frameInstruction,
      "如果材料不足，请明确写在 risk_notes 中，不要补造未提供的信息。",
      "",
      `task_json:\n${compactJson(task)}`,
      "",
      `input_json:\n${compactJson(input)}`,
      "",
      `source_video_metadata:\n${compactJson(options.sourceVideo ?? { status: "not_available" })}`
    ].join("\n")
  };
}

function isVisualStyle(value: unknown): boolean {
  // Lenient: accept when absent (text-only providers may omit), validate shape when present.
  if (value === undefined) return true;
  return (
    isRecord(value) &&
    isString(value.shot_types) &&
    isString(value.composition) &&
    isString(value.color_tone) &&
    isString(value.lighting) &&
    isString(value.camera_movement) &&
    isString(value.text_overlay_style) &&
    isString(value.subject)
  );
}

function isShotBreakdown(value: unknown): boolean {
  if (value === undefined) return true;
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        isString(item.timestamp) &&
        isString(item.what_is_shown) &&
        isString(item.shot_type)
    )
  );
}

export function isAnalysisModelOutput(value: unknown): value is AnalysisModelOutput {
  if (!isRecord(value)) return false;
  const topic = value.topic;
  const structure = value.structure;
  const pacing = value.pacing;
  return (
    isVisualStyle(value.visual_style) &&
    isShotBreakdown(value.shot_breakdown) &&
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
