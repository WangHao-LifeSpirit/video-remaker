import { loadDotEnvOnce } from "./llm-client";

export type LumaSubmitInput = {
  prompt: string;
  aspectRatio?: string;
  externalTaskId?: string;
};

export type LumaSubmitResult = {
  generationId: string;
  state?: string;
};

export type LumaPollResult = {
  generationId: string;
  state?: string;
  videoUrl?: string;
  failureReason?: string;
};

type LumaConfig = {
  apiKey: string;
  baseUrl: string;
  model?: string;
};

type LumaGenerationResponse = {
  id?: unknown;
  state?: unknown;
  failure_reason?: unknown;
  assets?: {
    video?: unknown;
  };
};

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function redactSensitiveText(value: string): string {
  return value.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer <redacted>");
}

function responseSnippet(value: string): string {
  const trimmed = redactSensitiveText(value.trim());
  if (!trimmed) return "<empty response body>";
  return trimmed.length > 500 ? `${trimmed.slice(0, 500)}...` : trimmed;
}

function parseLumaJson(value: string): LumaGenerationResponse | undefined {
  if (!value.trim()) return undefined;
  try {
    return JSON.parse(value) as LumaGenerationResponse;
  } catch {
    return undefined;
  }
}

function normalizeAspectRatio(value: string | undefined): string {
  return value && value.trim() ? value.trim() : "9:16";
}

function getGenerationId(response: LumaGenerationResponse | undefined): string | undefined {
  return typeof response?.id === "string" ? response.id : undefined;
}

function getState(response: LumaGenerationResponse | undefined): string | undefined {
  return typeof response?.state === "string" ? response.state : undefined;
}

function getVideoUrl(response: LumaGenerationResponse | undefined): string | undefined {
  return typeof response?.assets?.video === "string" ? response.assets.video : undefined;
}

function getFailureReason(response: LumaGenerationResponse | undefined): string | undefined {
  return typeof response?.failure_reason === "string" ? response.failure_reason : undefined;
}

export async function getLumaConfig(): Promise<LumaConfig> {
  await loadDotEnvOnce();
  const missing: string[] = [];
  if (!process.env.LUMA_API_KEY) missing.push("LUMA_API_KEY");
  if (!process.env.LUMA_API_BASE_URL) missing.push("LUMA_API_BASE_URL");
  if (missing.length > 0) {
    throw new Error(`Missing Luma config: ${missing.join(", ")}`);
  }
  return {
    apiKey: process.env.LUMA_API_KEY!,
    baseUrl: trimTrailingSlash(process.env.LUMA_API_BASE_URL!),
    model: process.env.LUMA_MODEL || undefined
  };
}

async function fetchLumaJson(input: {
  config: LumaConfig;
  method: "GET" | "POST";
  path: string;
  body?: unknown;
}): Promise<LumaGenerationResponse> {
  const response = await fetch(`${input.config.baseUrl}${input.path}`, {
    method: input.method,
    headers: {
      Authorization: `Bearer ${input.config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: input.body === undefined ? undefined : JSON.stringify(input.body)
  });
  const responseText = await response.text().catch(() => "");
  const json = parseLumaJson(responseText);
  if (!response.ok) {
    throw new Error(
      [
        `Luma request failed with HTTP ${response.status}`,
        `body: ${responseSnippet(responseText)}`
      ].join(". ")
    );
  }
  return json ?? {};
}

export async function submitLumaVideoGeneration(input: LumaSubmitInput): Promise<LumaSubmitResult> {
  const config = await getLumaConfig();
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    aspect_ratio: normalizeAspectRatio(input.aspectRatio),
    loop: false
  };
  if (config.model) {
    body.model = config.model;
  }

  const response = await fetchLumaJson({
    config,
    method: "POST",
    path: "/dream-machine/v1/generations",
    body
  });
  const generationId = getGenerationId(response);
  if (!generationId) {
    throw new Error("Luma generation submission did not return an id.");
  }
  return {
    generationId,
    state: getState(response)
  };
}

export async function pollLumaGeneration(generationId: string): Promise<LumaPollResult> {
  const config = await getLumaConfig();
  const response = await fetchLumaJson({
    config,
    method: "GET",
    path: `/dream-machine/v1/generations/${encodeURIComponent(generationId)}`
  });
  return {
    generationId,
    state: getState(response),
    videoUrl: getVideoUrl(response),
    failureReason: getFailureReason(response)
  };
}

export async function waitForLumaGeneration(input: {
  generationId: string;
  pollIntervalMs?: number;
  maxPolls?: number;
}): Promise<LumaPollResult> {
  const maxPolls = input.maxPolls ?? 60;
  const pollIntervalMs = input.pollIntervalMs ?? 10_000;
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    const result = await pollLumaGeneration(input.generationId);
    if (result.state === "completed") {
      if (!result.videoUrl) {
        throw new Error("Luma generation completed but no video URL was returned.");
      }
      return result;
    }
    if (result.state === "failed") {
      throw new Error(result.failureReason ?? "Luma generation failed.");
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(`Luma generation polling timed out after ${maxPolls} attempts.`);
}
