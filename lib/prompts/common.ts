import type { JsonSchema } from "../api-clients/llm-client";

export type RecordValue = Record<string, unknown>;

export const SAFETY_SYSTEM_PROMPT = [
  "你是短视频原创改编工作台里的专业 Agent。",
  "只基于用户提供材料、系统已有解析结果和上一步 JSON，不编造未提供的视频画面、字幕、作者、播放数据或平台私有信息。",
  "对公开视频只能做结构学习、节奏拆解和原创改编，不搬运原视频素材、原文案、封面或可识别表达。",
  "输出必须能被后续视频生成和 FFmpeg 组装流程执行。",
  "输出必须是符合 JSON Schema 的 JSON，不要输出 Markdown、解释或额外文本。"
].join("\n");

export const stringArraySchema = {
  type: "array",
  items: { type: "string" }
};

export function objectSchema(properties: Record<string, unknown>, required = Object.keys(properties)): JsonSchema {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false
  };
}

export function nestedObjectSchema(properties: Record<string, unknown>, required = Object.keys(properties)) {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false
  };
}

export function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function compactJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

