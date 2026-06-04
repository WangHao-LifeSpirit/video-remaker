import type { JsonSchema } from "../api-clients/llm-client";
import type { VideoAnalysis } from "../types/analysis";
import type { VideoRemakeTask } from "../types/task";
import {
  compactJson,
  isRecord,
  isString,
  nestedObjectSchema,
  objectSchema,
  SAFETY_SYSTEM_PROMPT
} from "./common";

export type StoryboardModelOutput = {
  original_storyboard: Array<{
    scene_id: string;
    time_range: string;
    shot_type: string;
    visual_description: string;
    narration_or_caption: string;
    purpose: string;
    pacing_note: string;
  }>;
  rhythm_analysis: string;
  visual_language: string;
  bgm_and_sound_notes: string;
  subtitle_style_notes: string;
};

const sceneSchema = nestedObjectSchema({
  scene_id: { type: "string" },
  time_range: { type: "string" },
  shot_type: { type: "string" },
  visual_description: { type: "string" },
  narration_or_caption: { type: "string" },
  purpose: { type: "string" },
  pacing_note: { type: "string" }
});

export const storyboardSchema: JsonSchema = objectSchema({
  original_storyboard: {
    type: "array",
    items: sceneSchema
  },
  rhythm_analysis: { type: "string" },
  visual_language: { type: "string" },
  bgm_and_sound_notes: { type: "string" },
  subtitle_style_notes: { type: "string" }
});

export function buildStoryboardPrompt(task: VideoRemakeTask, analysis: VideoAnalysis): {
  systemPrompt: string;
  userPrompt: string;
} {
  return {
    systemPrompt: SAFETY_SYSTEM_PROMPT,
    userPrompt: [
      "请根据 analysis.json 生成原视频结构学习用的分镜拆解 JSON。",
      "这是结构拆解，不是复制原视频。所有画面描述都必须来自用户材料和 analysis，不得编造具体未提供画面。",
      "scene_id 使用 s1、s2、s3...；time_range 使用类似 0-3s、3-8s 的格式，便于后续剪辑。",
      "",
      `task_json:\n${compactJson(task)}`,
      "",
      `analysis_json:\n${compactJson(analysis)}`
    ].join("\n")
  };
}

function isScene(value: unknown): value is StoryboardModelOutput["original_storyboard"][number] {
  return (
    isRecord(value) &&
    isString(value.scene_id) &&
    isString(value.time_range) &&
    isString(value.shot_type) &&
    isString(value.visual_description) &&
    isString(value.narration_or_caption) &&
    isString(value.purpose) &&
    isString(value.pacing_note)
  );
}

export function isStoryboardModelOutput(value: unknown): value is StoryboardModelOutput {
  return (
    isRecord(value) &&
    Array.isArray(value.original_storyboard) &&
    value.original_storyboard.length > 0 &&
    value.original_storyboard.every(isScene) &&
    isString(value.rhythm_analysis) &&
    isString(value.visual_language) &&
    isString(value.bgm_and_sound_notes) &&
    isString(value.subtitle_style_notes)
  );
}

