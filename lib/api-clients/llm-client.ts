import { readFile } from "node:fs/promises";
import path from "node:path";
import { generateOpenAIStructuredJson } from "./openai-client";
import { generateDeepSeekStructuredJson } from "./deepseek-client";
import type { ErrorRecord } from "../types/common";
import { createErrorRecord } from "../types/common";

export type ClientMode = "mock" | "real";
export type LlmProvider = "mock" | "openai" | "deepseek";

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
      provider: Exclude<LlmProvider, "mock">;
      data: T;
    }
  | {
      mode: "mock";
      provider: "mock";
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

export async function loadDotEnvOnce(): Promise<void> {
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

export function getLlmMode(): ClientMode {
  return process.env.MOCK_MODE === "false" ? "real" : "mock";
}

export function getLlmProvider(): LlmProvider {
  const provider = (process.env.LLM_PROVIDER || "openai").toLowerCase();
  if (provider === "deepseek") return "deepseek";
  if (provider === "openai") return "openai";
  if (provider === "mock") return "mock";
  return "mock";
}

function unsupportedProviderResult<T>(step: string, provider: string): StructuredOutputResult<T> {
  const error = createErrorRecord({
    step,
    message: `Unsupported LLM_PROVIDER "${provider}". Falling back to mock output.`,
    code: "LLM_PROVIDER_UNSUPPORTED",
    recoverable: true
  });
  return {
    mode: "mock",
    provider: "mock",
    fallbackReason: error.message,
    error
  };
}

export async function generateLLMStructuredJson<T>(
  request: StructuredOutputRequest<T>
): Promise<StructuredOutputResult<T>> {
  await loadDotEnvOnce();

  if (getLlmMode() === "mock") {
    return { mode: "mock", provider: "mock" };
  }

  const provider = getLlmProvider();
  if (provider === "deepseek") {
    return generateDeepSeekStructuredJson(request);
  }
  if (provider === "openai") {
    const result = await generateOpenAIStructuredJson(request);
    return result.mode === "real"
      ? { ...result, provider: "openai" }
      : { ...result, provider: "mock" };
  }
  return unsupportedProviderResult(request.step, process.env.LLM_PROVIDER || provider);
}

