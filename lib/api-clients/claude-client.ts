import type { StructuredOutputRequest, StructuredOutputResult } from "./llm-client";
import { createErrorRecord } from "../types/common";

type ClaudeMessageResponse = {
  content?: Array<{
    type?: string;
    text?: unknown;
  }>;
  error?: {
    message?: unknown;
  };
};

type ClaudeConfig = {
  apiKey?: string;
  model?: string;
  missing: string[];
};

function getClaudeConfig(): ClaudeConfig {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL;
  const missing = [];
  if (!apiKey) missing.push("ANTHROPIC_API_KEY");
  if (!model) missing.push("ANTHROPIC_MODEL");
  return { apiKey, model, missing };
}

function missingConfigResult<T>(step: string, missing: string[]): StructuredOutputResult<T> {
  const error = createErrorRecord({
    step,
    message: `Claude real mode requested but missing ${missing.join(", ")}. Falling back to mock output.`,
    code: "CLAUDE_CONFIG_MISSING",
    recoverable: true
  });
  return {
    mode: "mock",
    provider: "mock",
    fallbackReason: error.message,
    error
  };
}

function responseErrorMessage(value: ClaudeMessageResponse | undefined): string | undefined {
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

function extractText(value: ClaudeMessageResponse | undefined): string | undefined {
  const blocks = value?.content ?? [];
  const text = blocks
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("\n")
    .trim();
  return text || undefined;
}

async function callClaude(input: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": input.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: 4096,
      temperature: 0.2,
      system: input.systemPrompt,
      messages: [
        {
          role: "user",
          content: input.userPrompt
        }
      ]
    })
  });

  const json = (await response.json().catch(() => undefined)) as ClaudeMessageResponse | undefined;
  if (!response.ok) {
    throw new Error(responseErrorMessage(json) ?? `Claude request failed with HTTP ${response.status}.`);
  }

  const outputText = extractText(json);
  if (!outputText) {
    throw new Error("Claude response did not include JSON text output.");
  }
  return outputText;
}

function buildSystemPrompt(request: StructuredOutputRequest<unknown>): string {
  return [
    request.systemPrompt,
    "Output valid JSON only.",
    "Do not output Markdown.",
    "Do not wrap the response in ```json.",
    "Do not add fields outside the provided JSON schema.",
    "If information is missing, use conservative defaults instead of inventing source-video facts."
  ].join("\n");
}

function buildUserPrompt(request: StructuredOutputRequest<unknown>): string {
  return [
    request.userPrompt,
    "",
    `json_schema:\n${JSON.stringify(request.schema, null, 2)}`
  ].join("\n");
}

function buildRepairPrompt(request: StructuredOutputRequest<unknown>, invalidText: string, reason: string): string {
  return [
    "Repair the previous output into valid JSON only.",
    `schema_name: ${request.schemaName}`,
    `validation_error: ${reason}`,
    `json_schema:\n${JSON.stringify(request.schema, null, 2)}`,
    `invalid_output:\n${invalidText.slice(0, 8000)}`
  ].join("\n\n");
}

async function parseAndValidateWithRepair<T>(input: {
  request: StructuredOutputRequest<T>;
  apiKey: string;
  model: string;
  outputText: string;
}): Promise<T> {
  try {
    const parsed = parseJsonOutput(input.outputText);
    if (input.request.validate(parsed)) {
      return parsed;
    }
    throw new Error(`Claude ${input.request.schemaName} output failed local schema validation.`);
  } catch (firstError) {
    const reason = firstError instanceof Error ? firstError.message : String(firstError);
    const repairedText = await callClaude({
      apiKey: input.apiKey,
      model: input.model,
      systemPrompt: "You are a JSON repair tool. Return JSON only.",
      userPrompt: buildRepairPrompt(input.request as StructuredOutputRequest<unknown>, input.outputText, reason)
    });
    const repaired = parseJsonOutput(repairedText);
    if (!input.request.validate(repaired)) {
      throw new Error(`Claude ${input.request.schemaName} repaired output failed local schema validation.`);
    }
    return repaired;
  }
}

export async function generateClaudeStructuredJson<T>(
  request: StructuredOutputRequest<T>
): Promise<StructuredOutputResult<T>> {
  const config = getClaudeConfig();
  if (config.missing.length > 0 || !config.apiKey || !config.model) {
    return missingConfigResult(request.step, config.missing);
  }

  try {
    const outputText = await callClaude({
      apiKey: config.apiKey,
      model: config.model,
      systemPrompt: buildSystemPrompt(request as StructuredOutputRequest<unknown>),
      userPrompt: buildUserPrompt(request as StructuredOutputRequest<unknown>)
    });

    const data = await parseAndValidateWithRepair({
      request,
      apiKey: config.apiKey,
      model: config.model,
      outputText
    });

    return {
      mode: "real",
      provider: "claude",
      data
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorRecord = createErrorRecord({
      step: request.step,
      message: `Claude real call failed. Falling back to mock output. Reason: ${message}`,
      code: "CLAUDE_REAL_CALL_FAILED",
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
