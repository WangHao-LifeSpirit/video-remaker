import { loadDotEnvOnce } from "./llm-client";

export type SeedanceSubmitInput = {
  prompt: string;
  aspectRatio?: string;
  duration?: string;
  externalTaskId?: string;
};

export type SeedanceSubmitResult = {
  taskId: string;
  status?: string;
  requestId?: string;
};

export type SeedancePollResult = {
  taskId: string;
  status?: string;
  videoUrl?: string;
  requestId?: string;
  failureReason?: string;
};

type SeedanceConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  resolution: string;
  watermark: boolean;
  cameraFixed: boolean;
};

type UnknownRecord = Record<string, unknown>;

type SeedanceResponse = {
  id?: unknown;
  task_id?: unknown;
  status?: unknown;
  request_id?: unknown;
  code?: unknown;
  message?: unknown;
  error?: unknown;
  data?: UnknownRecord;
  content?: UnknownRecord;
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
  return trimmed.length > 700 ? `${trimmed.slice(0, 700)}...` : trimmed;
}

function parseSeedanceJson(value: string): SeedanceResponse | undefined {
  if (!value.trim()) return undefined;
  try {
    return JSON.parse(value) as SeedanceResponse;
  } catch {
    return undefined;
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function normalizeAspectRatio(value: string | undefined): string {
  return value && value.trim() ? value.trim() : "9:16";
}

function normalizeDuration(value: string | undefined): string {
  const match = (value ?? "").match(/\d+/);
  const duration = match ? Number(match[0]) : 5;
  return String(Math.min(12, Math.max(2, duration)));
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ["true", "1", "yes", "on"].includes(value.toLowerCase());
}

function promptWithSeedanceOptions(input: {
  prompt: string;
  aspectRatio?: string;
  duration?: string;
  resolution: string;
  watermark: boolean;
  cameraFixed: boolean;
}): string {
  const cleanedPrompt = input.prompt.trim();
  const ratio = normalizeAspectRatio(input.aspectRatio);
  const duration = normalizeDuration(input.duration);
  return [
    cleanedPrompt,
    `--ratio ${ratio}`,
    `--resolution ${input.resolution}`,
    `--duration ${duration}`,
    `--camerafixed ${input.cameraFixed ? "true" : "false"}`,
    `--watermark ${input.watermark ? "true" : "false"}`
  ].join(" ");
}

function getTaskId(response: SeedanceResponse | undefined): string | undefined {
  return (
    readString(response?.id) ??
    readString(response?.task_id) ??
    readString(response?.data?.id) ??
    readString(response?.data?.task_id)
  );
}

function getStatus(response: SeedanceResponse | undefined): string | undefined {
  return (
    readString(response?.status) ??
    readString(response?.data?.status) ??
    readString(response?.data?.state) ??
    readString(response?.data?.task_status)
  );
}

function getRequestId(response: SeedanceResponse | undefined): string | undefined {
  return readString(response?.request_id) ?? readString(response?.data?.request_id);
}

function getMessage(response: SeedanceResponse | undefined): string | undefined {
  return readString(response?.message) ?? readString(response?.data?.message) ?? readString(response?.error);
}

function getVideoUrl(response: SeedanceResponse | undefined): string | undefined {
  const data = response?.data;
  const content = response?.content;
  const videoUrls = data?.video_urls;
  const videoUrlList = data?.video_url_list;
  if (Array.isArray(videoUrls)) return videoUrls.find((item) => typeof item === "string") as string | undefined;
  if (Array.isArray(videoUrlList)) return videoUrlList.find((item) => typeof item === "string") as string | undefined;
  return (
    readString(content?.video_url) ??
    readString(content?.videoUrl) ??
    readString(content?.url) ??
    readString(data?.video_url) ??
    readString(data?.videoUrl) ??
    readString(data?.url) ??
    readString(data?.output_url) ??
    readString(response?.data?.content as unknown)
  );
}

function isCompleted(status: string | undefined): boolean {
  return ["succeeded", "success", "completed", "done"].includes((status ?? "").toLowerCase());
}

function isFailed(status: string | undefined): boolean {
  return ["failed", "error", "canceled", "cancelled"].includes((status ?? "").toLowerCase());
}

export async function getSeedanceConfig(): Promise<SeedanceConfig> {
  await loadDotEnvOnce();
  const missing: string[] = [];
  if (!process.env.SEEDANCE_API_KEY) missing.push("SEEDANCE_API_KEY");
  if (!process.env.SEEDANCE_API_BASE_URL) missing.push("SEEDANCE_API_BASE_URL");
  if (!process.env.SEEDANCE_MODEL) missing.push("SEEDANCE_MODEL");
  if (missing.length > 0) {
    throw new Error(`Missing Seedance config: ${missing.join(", ")}`);
  }
  return {
    apiKey: process.env.SEEDANCE_API_KEY!,
    baseUrl: trimTrailingSlash(process.env.SEEDANCE_API_BASE_URL!),
    model: process.env.SEEDANCE_MODEL!,
    resolution: process.env.SEEDANCE_RESOLUTION || "720p",
    watermark: parseBoolean(process.env.SEEDANCE_WATERMARK, false),
    cameraFixed: parseBoolean(process.env.SEEDANCE_CAMERA_FIXED, false)
  };
}

async function fetchSeedanceJson(input: {
  config: SeedanceConfig;
  method: "GET" | "POST";
  path: string;
  body?: unknown;
}): Promise<SeedanceResponse> {
  let response: Response;
  try {
    response = await fetch(`${input.config.baseUrl}${input.path}`, {
      method: input.method,
      headers: {
        Authorization: `Bearer ${input.config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body)
    });
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? ` Cause: ${error.cause.message}` : "";
    throw new Error(`Seedance network request failed before receiving an HTTP response.${cause}`);
  }
  const responseText = await response.text().catch(() => "");
  const json = parseSeedanceJson(responseText);
  if (!response.ok) {
    throw new Error(
      [
        `Seedance request failed with HTTP ${response.status}`,
        getMessage(json) ? `message: ${getMessage(json)}` : undefined,
        getRequestId(json) ? `request_id: ${getRequestId(json)}` : undefined,
        `body: ${responseSnippet(responseText)}`
      ]
        .filter(Boolean)
        .join(". ")
    );
  }
  if (typeof json?.code === "number" && json.code !== 0) {
    throw new Error(
      [
        `Seedance API returned code ${json.code}`,
        getMessage(json) ? `message: ${getMessage(json)}` : undefined,
        getRequestId(json) ? `request_id: ${getRequestId(json)}` : undefined,
        `body: ${responseSnippet(responseText)}`
      ]
        .filter(Boolean)
        .join(". ")
    );
  }
  return json ?? {};
}

export async function submitSeedanceTextToVideoTask(input: SeedanceSubmitInput): Promise<SeedanceSubmitResult> {
  const config = await getSeedanceConfig();
  const response = await fetchSeedanceJson({
    config,
    method: "POST",
    path: "/api/v3/contents/generations/tasks",
    body: {
      model: config.model,
      content: [
        {
          type: "text",
          text: promptWithSeedanceOptions({
            prompt: input.prompt,
            aspectRatio: input.aspectRatio,
            duration: input.duration,
            resolution: config.resolution,
            watermark: config.watermark,
            cameraFixed: config.cameraFixed
          })
        }
      ]
    }
  });
  const taskId = getTaskId(response);
  if (!taskId) {
    throw new Error("Seedance task submission did not return a task id.");
  }
  return {
    taskId,
    status: getStatus(response),
    requestId: getRequestId(response)
  };
}

export async function pollSeedanceTask(taskId: string): Promise<SeedancePollResult> {
  const config = await getSeedanceConfig();
  const response = await fetchSeedanceJson({
    config,
    method: "GET",
    path: `/api/v3/contents/generations/tasks/${encodeURIComponent(taskId)}`
  });
  return {
    taskId,
    status: getStatus(response),
    videoUrl: getVideoUrl(response),
    requestId: getRequestId(response),
    failureReason: getMessage(response)
  };
}

export async function waitForSeedanceTask(input: {
  taskId: string;
  pollIntervalMs?: number;
  maxPolls?: number;
}): Promise<SeedancePollResult> {
  const maxPolls = input.maxPolls ?? 60;
  const pollIntervalMs = input.pollIntervalMs ?? 10_000;
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    const result = await pollSeedanceTask(input.taskId);
    if (isCompleted(result.status)) {
      if (!result.videoUrl) {
        throw new Error("Seedance task completed but no video URL was returned.");
      }
      return result;
    }
    if (isFailed(result.status)) {
      throw new Error(result.failureReason ?? "Seedance task failed.");
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(`Seedance task polling timed out after ${maxPolls} attempts.`);
}
