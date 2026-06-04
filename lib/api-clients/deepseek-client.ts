import type { StructuredOutputRequest, StructuredOutputResult } from "./llm-client";
import { createErrorRecord } from "../types/common";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type DeepSeekChatResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  error?: {
    message?: unknown;
  };
};

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function missingConfigResult<T>(step: string, missing: string[]): StructuredOutputResult<T> {
  const error = createErrorRecord({
    step,
    message: `DeepSeek real mode requested but missing ${missing.join(", ")}. Falling back to mock output.`,
    code: "DEEPSEEK_CONFIG_MISSING",
    recoverable: true
  });
  return {
    mode: "mock",
    provider: "mock",
    fallbackReason: error.message,
    error
  };
}

function getDeepSeekConfig(): { apiKey?: string; baseUrl?: string; model?: string; missing: string[] } {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_MODEL;
  const missing = [];
  if (!apiKey) missing.push("DEEPSEEK_API_KEY");
  if (!baseUrl) missing.push("DEEPSEEK_BASE_URL");
  if (!model) missing.push("DEEPSEEK_MODEL");
  return { apiKey, baseUrl, model, missing };
}

function responseErrorMessage(value: DeepSeekChatResponse | undefined): string | undefined {
  return typeof value?.error?.message === "string" ? value.error.message : undefined;
}

function stripJsonFences(value: string): string {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function parseJsonOutput(value: string): unknown {
  return JSON.parse(stripJsonFences(value));
}

async function callDeepSeek(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: ChatMessage[];
}): Promise<string> {
  const response = await fetch(`${trimTrailingSlash(input.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: input.model,
      messages: input.messages,
      temperature: 0.2,
      response_format: {
        type: "json_object"
      }
    })
  });

  const json = (await response.json().catch(() => undefined)) as DeepSeekChatResponse | undefined;
  if (!response.ok) {
    throw new Error(responseErrorMessage(json) ?? `DeepSeek request failed with HTTP ${response.status}.`);
  }

  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("DeepSeek response did not include JSON text output.");
  }
  return content;
}

function buildRepairMessages(request: StructuredOutputRequest<unknown>, invalidText: string, reason: string): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "你是 JSON 修复器。只输出合法 JSON，不输出 Markdown，不要包裹 ```json。",
        "必须严格符合给定 JSON schema，不要增加 schema 之外的字段。",
        "如果原内容缺字段，请基于原内容和任务上下文补齐合理默认值。"
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `schema_name: ${request.schemaName}`,
        `validation_error: ${reason}`,
        `json_schema:\n${JSON.stringify(request.schema, null, 2)}`,
        `original_system_prompt:\n${request.systemPrompt}`,
        `original_user_prompt:\n${request.userPrompt}`,
        `invalid_output:\n${invalidText.slice(0, 8000)}`
      ].join("\n\n")
    }
  ];
}

async function parseAndValidateWithRepair<T>(input: {
  request: StructuredOutputRequest<T>;
  apiKey: string;
  baseUrl: string;
  model: string;
  outputText: string;
}): Promise<T> {
  try {
    const parsed = parseJsonOutput(input.outputText);
    if (input.request.validate(parsed)) {
      return parsed;
    }
    throw new Error(`DeepSeek ${input.request.schemaName} output failed local schema validation.`);
  } catch (firstError) {
    const reason = firstError instanceof Error ? firstError.message : String(firstError);
    const repairedText = await callDeepSeek({
      apiKey: input.apiKey,
      baseUrl: input.baseUrl,
      model: input.model,
      messages: buildRepairMessages(input.request as StructuredOutputRequest<unknown>, input.outputText, reason)
    });
    const repaired = parseJsonOutput(repairedText);
    if (!input.request.validate(repaired)) {
      throw new Error(`DeepSeek ${input.request.schemaName} repaired output failed local schema validation.`);
    }
    return repaired;
  }
}

export async function generateDeepSeekStructuredJson<T>(
  request: StructuredOutputRequest<T>
): Promise<StructuredOutputResult<T>> {
  const config = getDeepSeekConfig();
  if (config.missing.length > 0 || !config.apiKey || !config.baseUrl || !config.model) {
    return missingConfigResult(request.step, config.missing);
  }

  try {
    const outputText = await callDeepSeek({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      messages: [
        {
          role: "system",
          content: [
            request.systemPrompt,
            "输出必须是合法 JSON。",
            "不要输出 Markdown。",
            "不要包裹 ```json。",
            "不要增加 JSON schema 之外的字段。"
          ].join("\n")
        },
        {
          role: "user",
          content: [
            request.userPrompt,
            "",
            `json_schema:\n${JSON.stringify(request.schema, null, 2)}`
          ].join("\n")
        }
      ]
    });

    const data = await parseAndValidateWithRepair({
      request,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      outputText
    });

    return {
      mode: "real",
      provider: "deepseek",
      data
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorRecord = createErrorRecord({
      step: request.step,
      message: `DeepSeek real call failed. Falling back to mock output. Reason: ${message}`,
      code: "DEEPSEEK_REAL_CALL_FAILED",
      recoverable: true
    });
    return {
      mode: "mock",
      provider: "mock",
      fallbackReason: errorRecord.message,
      error: errorRecord
    };
  }
}

