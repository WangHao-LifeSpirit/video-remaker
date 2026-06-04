import type { JsonSchema } from "../api-clients/llm-client";
import type { RemakePlan } from "../types/remake-plan";
import type { VideoRemakeTask } from "../types/task";
import {
  compactJson,
  isRecord,
  isStringArray,
  nestedObjectSchema,
  objectSchema,
  SAFETY_SYSTEM_PROMPT,
  stringArraySchema
} from "./common";

export type QualityCheckModelOutput = {
  too_similar_risk: "low" | "medium" | "high";
  executable: boolean;
  missing_assets: string[];
  suggestions: string[];
};

export const qualityCheckSchema: JsonSchema = objectSchema({
  too_similar_risk: { type: "string", enum: ["low", "medium", "high"] },
  executable: { type: "boolean" },
  missing_assets: stringArraySchema,
  suggestions: stringArraySchema
});

export function buildQualityCheckPrompt(task: VideoRemakeTask, remakePlan: RemakePlan): {
  systemPrompt: string;
  userPrompt: string;
} {
  return {
    systemPrompt: SAFETY_SYSTEM_PROMPT,
    userPrompt: [
      "请检查原创改编方案是否安全、可执行、符合目标平台，并输出质量检查 JSON。",
      "重点检查：是否太像原视频、是否缺素材、是否有未授权搬运风险、是否可继续进入视频生成。",
      "不要编造原视频未提供的信息；只根据 task 和 remake_plan 判断。",
      "",
      `task_json:\n${compactJson(task)}`,
      "",
      `remake_plan_json:\n${compactJson(remakePlan)}`
    ].join("\n")
  };
}

export function isQualityCheckModelOutput(value: unknown): value is QualityCheckModelOutput {
  return (
    isRecord(value) &&
    (value.too_similar_risk === "low" || value.too_similar_risk === "medium" || value.too_similar_risk === "high") &&
    typeof value.executable === "boolean" &&
    isStringArray(value.missing_assets) &&
    isStringArray(value.suggestions)
  );
}

