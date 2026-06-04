import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ErrorRecord } from "../types/common";
import { createErrorRecord } from "../types/common";

export type ClientMode = "mock" | "real";

export type JsonSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
  $defs?: Record<string, unknown>;
};

export type StructuredOutputRequest<T> = {
  step: string;
  schemaName: string;
  schema: JsonSchema;
  systemPrompt: string;
  userPrompt: string;
  validate: (value: unknown) => value is T;
};

export type StructuredOutputResult<T> =
  | {
      mode: "real";
      data: T;
    }
  | {
      mode: "mock";
      fallbackReason?: string;
      error?: ErrorRecord;
    };

let envLoaded = false;

function parseEnvLine(line: string): { key: string; value: string } | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return undefined;
  const equalsIndex = trimmed.indexOf("=");
  if (equalsIndex === -1) return undefined;
  const key = trimmed.slice(0, equalsIndex).trim();
  let value = trimmed.slice(equalsIndex + 1).trim();
  if (!key) return undefined;
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

async function loadDotEnvOnce(): Promise<void> {
  if (envLoaded) return;
  envLoaded = true;
  try {
    const content = await readFile(path.join(process.cwd(), ".env"), "utf8");
    for (const line of content.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (parsed && process.env[parsed.key] === undefined) {
        process.env[parsed.key] = parsed.value;
      }
    }
  } catch {
    // Missing .env is fine; defaults remain mock-safe.
  }
}

function getMode(): ClientMode {
  return process.env.MOCK_MODE === "false" ? "real" : "mock";
}

function missingConfigError(step: string, missing: string[]): ErrorRecord {
  return createErrorRecord({
    step,
    message: `OpenAI real mode requested but missing ${missing.join(", ")}. Falling back to mock output.`,
    code: "OPENAI_CONFIG_MISSING",
    recoverable: true
  });
}

function extractOutputText(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const response = value as {
    output_text?: unknown;
    output?: Array<{
      content?: Array<{
        type?: string;
        text?: unknown;
        refusal?: unknown;
      }>;
    }>;
  };

  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  for (const output of response.output ?? []) {
    for (const content of output.content ?? []) {
      if (content.type === "refusal" && typeof content.refusal === "string") {
        throw new Error(`OpenAI refusal: ${content.refusal}`);
      }
      if (typeof content.text === "string") {
        return content.text;
      }
    }
  }

  return undefined;
}

function errorMessageFromResponse(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const response = value as { error?: { message?: unknown } };
  return typeof response.error?.message === "string" ? response.error.message : undefined;
}

export async function generateOpenAIStructuredJson<T>(
  request: StructuredOutputRequest<T>
): Promise<StructuredOutputResult<T>> {
  await loadDotEnvOnce();

  if (getMode() === "mock") {
    return { mode: "mock" };
  }

  const missing = [];
  if (!process.env.OPENAI_API_KEY) missing.push("OPENAI_API_KEY");
  if (!process.env.OPENAI_MODEL) missing.push("OPENAI_MODEL");
  if (missing.length > 0) {
    const error = missingConfigError(request.step, missing);
    return {
      mode: "mock",
      fallbackReason: error.message,
      error
    };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL,
        input: [
          {
            role: "system",
            content: request.systemPrompt
          },
          {
            role: "user",
            content: request.userPrompt
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: request.schemaName,
            strict: true,
            schema: request.schema
          }
        }
      })
    });

    const raw = (await response.json().catch(() => undefined)) as unknown;
    if (!response.ok) {
      throw new Error(errorMessageFromResponse(raw) ?? `OpenAI request failed with HTTP ${response.status}.`);
    }

    const outputText = extractOutputText(raw);
    if (!outputText) {
      throw new Error("OpenAI response did not include JSON text output.");
    }

    const parsed = JSON.parse(outputText) as unknown;
    if (!request.validate(parsed)) {
      throw new Error(`OpenAI ${request.schemaName} output failed local schema validation.`);
    }

    return {
      mode: "real",
      data: parsed
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorRecord = createErrorRecord({
      step: request.step,
      message: `OpenAI real call failed. Falling back to mock output. Reason: ${message}`,
      code: "OPENAI_REAL_CALL_FAILED",
      recoverable: true
    });
    return {
      mode: "mock",
      fallbackReason: errorRecord.message,
      error: errorRecord
    };
  }
}

export async function generateOpenAIText(prompt: string): Promise<{ mode: ClientMode; text: string }> {
  await loadDotEnvOnce();
  if (getMode() === "mock") {
    return {
      mode: "mock",
      text: `[MOCK_OPENAI] ${prompt.slice(0, 160)}`
    };
  }
  const missing = [];
  if (!process.env.OPENAI_API_KEY) missing.push("OPENAI_API_KEY");
  if (!process.env.OPENAI_MODEL) missing.push("OPENAI_MODEL");
  if (missing.length > 0) {
    return {
      mode: "mock",
      text: `[MOCK_OPENAI_FALLBACK] Missing ${missing.join(", ")}. ${prompt.slice(0, 160)}`
    };
  }
  const result = await generateOpenAIStructuredJson<{ text: string }>({
    step: "openai-text",
    schemaName: "openai_text",
    schema: {
      type: "object",
      properties: {
        text: { type: "string" }
      },
      required: ["text"],
      additionalProperties: false
    },
    systemPrompt: "Return JSON only.",
    userPrompt: prompt,
    validate: (value): value is { text: string } =>
      typeof value === "object" && value !== null && typeof (value as { text?: unknown }).text === "string"
  });
  return result.mode === "real" ? { mode: "real", text: result.data.text } : { mode: "mock", text: prompt };
}

