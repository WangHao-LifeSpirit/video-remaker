import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadDotEnvOnce } from "./llm-client";

export type KlingTaskStatus = "submitted" | "processing" | "succeed" | "failed" | string;

export type KlingSubmitInput = {
  prompt: string;
  negativePrompt?: string;
  duration?: string;
  aspectRatio?: string;
  externalTaskId?: string;
};

export type KlingSubmitResult = {
  taskId: string;
  status: KlingTaskStatus;
  requestId?: string;
};

export type KlingPollResult = {
  taskId: string;
  status: KlingTaskStatus;
  statusMessage?: string;
  videoUrl?: string;
  requestId?: string;
};

type KlingConfig = {
  accessKey: string;
  secretKey: string;
  baseUrl: string;
  mode: "omni" | "text2video" | "image2video";
  modelName: string;
  endpointPath: string;
  text2videoEndpointPath: string;
  image2videoEndpointPath: string;
  maxRetryPerScene: number;
};

type KlingApiResponse = {
  code?: unknown;
  message?: unknown;
  request_id?: unknown;
  data?: {
    task_id?: unknown;
    task_status?: unknown;
    task_status_msg?: unknown;
    task_result?: {
      videos?: Array<{
        url?: unknown;
        index?: unknown;
      }>;
      video?: {
        url?: unknown;
      };
    };
  };
};

type EnvValueCheck = {
  present: boolean;
  raw_length: number;
  trimmed_length: number;
  has_leading_or_trailing_space: boolean;
  trim_changes_length: boolean;
  contains_newline: boolean;
  contains_internal_whitespace: boolean;
  is_ascii: boolean;
  is_urlsafe_token_shape: boolean;
  starts_with_expected_access_prefix?: boolean;
};

export type KlingAuthCheckResult = {
  env: {
    KLING_ACCESS_KEY: EnvValueCheck;
    KLING_SECRET_KEY: EnvValueCheck;
    KLING_API_BASE_URL: {
      present: boolean;
      value: string;
      is_official_singapore_domain: boolean;
      is_official_china_domain: boolean;
      has_leading_or_trailing_space: boolean;
    };
    KLING_MODE: {
      present: boolean;
      value: string;
      is_supported_mode: boolean;
      has_leading_or_trailing_space: boolean;
    };
    KLING_MODEL_NAME: {
      present: boolean;
      value: string;
      has_leading_or_trailing_space: boolean;
    };
    KLING_ENDPOINT_PATH: {
      present: boolean;
      value: string;
      has_leading_slash: boolean;
      is_video_generation_endpoint: boolean;
      has_leading_or_trailing_space: boolean;
    };
    KLING_TEXT2VIDEO_ENDPOINT_PATH: {
      present: boolean;
      value: string;
      has_leading_slash: boolean;
      is_video_generation_endpoint: boolean;
      has_leading_or_trailing_space: boolean;
    };
    KLING_IMAGE2VIDEO_ENDPOINT_PATH: {
      present: boolean;
      value: string;
      has_leading_slash: boolean;
      is_video_generation_endpoint: boolean;
      has_leading_or_trailing_space: boolean;
    };
  };
  effective_runtime: {
    KLING_ACCESS_KEY_source: ".env" | "process.env" | "missing";
    KLING_SECRET_KEY_source: ".env" | "process.env" | "missing";
    KLING_ACCESS_KEY_matches_dotenv: boolean | null;
    KLING_SECRET_KEY_matches_dotenv: boolean | null;
    note: string;
  };
  key_safety: {
    access_key_and_secret_key_same_length: boolean;
    access_key_looks_like_access_key: boolean;
    secret_key_looks_like_access_key: boolean;
    suspected_swapped: boolean;
    notes: string[];
  };
  jwt: {
    can_generate: boolean;
    token_parts: number;
    header_alg?: string;
    header_typ?: string;
    alg_is_hs256: boolean;
    typ_is_jwt: boolean;
    has_iss: boolean;
    has_exp: boolean;
    has_nbf: boolean;
    iss_uses_access_key: boolean;
    exp_after_now: boolean;
    nbf_before_now: boolean;
    exp_is_seconds_timestamp: boolean;
    nbf_is_seconds_timestamp: boolean;
    exp_about_now_plus_1800: boolean;
    nbf_about_now_minus_5: boolean;
    ttl_seconds?: number;
    authorization_header_starts_with_bearer: boolean;
    token_not_printed: true;
    error?: string;
  };
  network: {
    ping_implemented: false;
    note: string;
  };
};

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function signJwtHs256(payload: Record<string, unknown>, secretKey: string): string {
  const header = {
    alg: "HS256",
    typ: "JWT"
  };
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", secretKey)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  return `${encodedHeader}.${encodedPayload}.${base64Url(signature)}`;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function ensureLeadingSlash(value: string): string {
  return value.startsWith("/") ? value : `/${value}`;
}

function getSupportedKlingMode(value: string | undefined): KlingConfig["mode"] {
  const mode = (value ?? "omni").trim().toLowerCase();
  if (mode === "text2video" || mode === "image2video" || mode === "omni") {
    return mode;
  }
  return "omni";
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeDuration(value: string | undefined): string {
  const match = (value ?? "").match(/\d+/);
  const duration = match ? Number(match[0]) : 5;
  return String(Math.min(5, Math.max(3, duration)));
}

function getMessage(response: KlingApiResponse | undefined): string | undefined {
  return typeof response?.message === "string" ? response.message : undefined;
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer <redacted>")
    .replace(/(authorization["']?\s*:\s*["']?)Bearer\s+[A-Za-z0-9._-]+/gi, "$1Bearer <redacted>");
}

function responseSnippet(value: string): string {
  const trimmed = redactSensitiveText(value.trim());
  if (!trimmed) return "<empty response body>";
  return trimmed.length > 500 ? `${trimmed.slice(0, 500)}...` : trimmed;
}

function parseKlingJson(value: string): KlingApiResponse | undefined {
  if (!value.trim()) return undefined;
  try {
    return JSON.parse(value) as KlingApiResponse;
  } catch {
    return undefined;
  }
}

function getRequestId(response: KlingApiResponse | undefined): string | undefined {
  return typeof response?.request_id === "string" ? response.request_id : undefined;
}

function getTaskId(response: KlingApiResponse | undefined): string | undefined {
  return typeof response?.data?.task_id === "string" ? response.data.task_id : undefined;
}

function getTaskStatus(response: KlingApiResponse | undefined): KlingTaskStatus {
  return typeof response?.data?.task_status === "string" ? response.data.task_status : "unknown";
}

function getVideoUrl(response: KlingApiResponse | undefined): string | undefined {
  const firstVideoUrl = response?.data?.task_result?.videos?.find((video) => typeof video.url === "string")?.url;
  if (typeof firstVideoUrl === "string") return firstVideoUrl;
  const videoUrl = response?.data?.task_result?.video?.url;
  return typeof videoUrl === "string" ? videoUrl : undefined;
}

function getTaskStatusMessage(response: KlingApiResponse | undefined): string | undefined {
  return typeof response?.data?.task_status_msg === "string" ? response.data.task_status_msg : undefined;
}

async function readRawEnvValues(): Promise<Record<string, string>> {
  try {
    const content = await readFile(path.join(process.cwd(), ".env"), "utf8");
    const values: Record<string, string> = {};
    for (const line of content.split(/\n/)) {
      const withoutCarriageReturn = line.endsWith("\r") ? line.slice(0, -1) : line;
      const trimmedStart = withoutCarriageReturn.trimStart();
      if (!trimmedStart || trimmedStart.startsWith("#")) continue;
      const equalsIndex = withoutCarriageReturn.indexOf("=");
      if (equalsIndex === -1) continue;
      const key = withoutCarriageReturn.slice(0, equalsIndex).trim();
      if (key) {
        values[key] = withoutCarriageReturn.slice(equalsIndex + 1);
      }
    }
    return values;
  } catch {
    return {};
  }
}

function cleanEnvValue(value: string | undefined): string {
  const trimmed = (value ?? "").trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function inspectSecretLikeValue(value: string | undefined, expectedAccessPrefix?: string): EnvValueCheck {
  const raw = value ?? "";
  const cleaned = cleanEnvValue(raw);
  return {
    present: cleaned.length > 0,
    raw_length: raw.length,
    trimmed_length: cleaned.length,
    has_leading_or_trailing_space: raw !== raw.trim(),
    trim_changes_length: raw.length !== raw.trim().length,
    contains_newline: raw.includes("\n") || raw.includes("\r"),
    contains_internal_whitespace: /\s/.test(cleaned),
    is_ascii: /^[\x20-\x7E]*$/.test(cleaned),
    is_urlsafe_token_shape: /^[A-Za-z0-9_-]*$/.test(cleaned),
    starts_with_expected_access_prefix: expectedAccessPrefix ? cleaned.startsWith(expectedAccessPrefix) : undefined
  };
}

function decodeBase64UrlJson(value: string): unknown {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as unknown;
}

export async function inspectKlingAuthConfig(): Promise<KlingAuthCheckResult> {
  await loadDotEnvOnce();
  const rawEnv = await readRawEnvValues();

  const rawAccessKey = process.env.KLING_ACCESS_KEY ?? rawEnv.KLING_ACCESS_KEY ?? "";
  const rawSecretKey = process.env.KLING_SECRET_KEY ?? rawEnv.KLING_SECRET_KEY ?? "";
  const accessKey = cleanEnvValue(rawAccessKey);
  const secretKey = cleanEnvValue(rawSecretKey);
  const runtimeAccessKey = process.env.KLING_ACCESS_KEY ?? "";
  const runtimeSecretKey = process.env.KLING_SECRET_KEY ?? "";
  const baseUrlRaw = process.env.KLING_API_BASE_URL ?? rawEnv.KLING_API_BASE_URL ?? "";
  const modeRaw = process.env.KLING_MODE ?? rawEnv.KLING_MODE ?? "";
  const modelNameRaw = process.env.KLING_MODEL_NAME ?? rawEnv.KLING_MODEL_NAME ?? "";
  const endpointPathRaw = process.env.KLING_ENDPOINT_PATH ?? rawEnv.KLING_ENDPOINT_PATH ?? "";
  const text2videoEndpointPathRaw = process.env.KLING_TEXT2VIDEO_ENDPOINT_PATH ?? rawEnv.KLING_TEXT2VIDEO_ENDPOINT_PATH ?? "";
  const image2videoEndpointPathRaw = process.env.KLING_IMAGE2VIDEO_ENDPOINT_PATH ?? rawEnv.KLING_IMAGE2VIDEO_ENDPOINT_PATH ?? "";
  const baseUrl = cleanEnvValue(baseUrlRaw);
  const mode = cleanEnvValue(modeRaw);
  const modelName = cleanEnvValue(modelNameRaw);
  const endpointPath = cleanEnvValue(endpointPathRaw);
  const text2videoEndpointPath = cleanEnvValue(text2videoEndpointPathRaw);
  const image2videoEndpointPath = cleanEnvValue(image2videoEndpointPathRaw);

  const accessKeyLooksLikeAccessKey = accessKey.startsWith("AK");
  const secretKeyLooksLikeAccessKey = secretKey.startsWith("AK");
  const notes: string[] = [];
  if (!accessKey || !secretKey) {
    notes.push("Access Key or Secret Key is missing.");
  }
  if (!accessKeyLooksLikeAccessKey) {
    notes.push("Access Key does not start with the common AK prefix. This is heuristic only.");
  }
  if (secretKeyLooksLikeAccessKey) {
    notes.push("Secret Key starts with AK, which may indicate Access/Secret were swapped.");
  }

  let jwt: KlingAuthCheckResult["jwt"] = {
    can_generate: false,
    token_parts: 0,
    alg_is_hs256: false,
    typ_is_jwt: false,
    has_iss: false,
    has_exp: false,
    has_nbf: false,
    iss_uses_access_key: false,
    exp_after_now: false,
    nbf_before_now: false,
    exp_is_seconds_timestamp: false,
    nbf_is_seconds_timestamp: false,
    exp_about_now_plus_1800: false,
    nbf_about_now_minus_5: false,
    authorization_header_starts_with_bearer: false,
    token_not_printed: true
  };

  if (runtimeAccessKey && runtimeSecretKey) {
    try {
      const token = createKlingJwt({ accessKey: runtimeAccessKey, secretKey: runtimeSecretKey });
      const parts = token.split(".");
      const header = decodeBase64UrlJson(parts[0] ?? "") as { alg?: unknown; typ?: unknown };
      const payload = decodeBase64UrlJson(parts[1] ?? "") as {
        iss?: unknown;
        exp?: unknown;
        nbf?: unknown;
      };
      const now = Math.floor(Date.now() / 1000);
      const exp = typeof payload.exp === "number" ? payload.exp : undefined;
      const nbf = typeof payload.nbf === "number" ? payload.nbf : undefined;
      const authorizationHeader = `Bearer ${token}`;
      jwt = {
        can_generate: true,
        token_parts: parts.length,
        header_alg: typeof header.alg === "string" ? header.alg : undefined,
        header_typ: typeof header.typ === "string" ? header.typ : undefined,
        alg_is_hs256: header.alg === "HS256",
        typ_is_jwt: header.typ === "JWT",
        has_iss: typeof payload.iss === "string",
        has_exp: typeof exp === "number",
        has_nbf: typeof nbf === "number",
        iss_uses_access_key: payload.iss === runtimeAccessKey,
        exp_after_now: typeof exp === "number" && exp > now,
        nbf_before_now: typeof nbf === "number" && nbf <= now,
        exp_is_seconds_timestamp: typeof exp === "number" && exp > 1_000_000_000 && exp < 10_000_000_000,
        nbf_is_seconds_timestamp: typeof nbf === "number" && nbf > 1_000_000_000 && nbf < 10_000_000_000,
        exp_about_now_plus_1800: typeof exp === "number" && Math.abs(exp - (now + 1800)) <= 3,
        nbf_about_now_minus_5: typeof nbf === "number" && Math.abs(nbf - (now - 5)) <= 3,
        ttl_seconds: typeof exp === "number" ? exp - now : undefined,
        authorization_header_starts_with_bearer: authorizationHeader.startsWith("Bearer "),
        token_not_printed: true
      };
    } catch (error) {
      jwt = {
        ...jwt,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  return {
    env: {
      KLING_ACCESS_KEY: inspectSecretLikeValue(rawAccessKey, "AK"),
      KLING_SECRET_KEY: inspectSecretLikeValue(rawSecretKey),
      KLING_API_BASE_URL: {
        present: baseUrl.length > 0,
        value: baseUrl,
        is_official_singapore_domain: baseUrl === "https://api-singapore.klingai.com",
        is_official_china_domain: baseUrl === "https://api.klingai.com",
        has_leading_or_trailing_space: baseUrlRaw !== baseUrlRaw.trim()
      },
      KLING_MODE: {
        present: mode.length > 0,
        value: mode,
        is_supported_mode: ["omni", "text2video", "image2video"].includes(mode),
        has_leading_or_trailing_space: modeRaw !== modeRaw.trim()
      },
      KLING_MODEL_NAME: {
        present: modelName.length > 0,
        value: modelName,
        has_leading_or_trailing_space: modelNameRaw !== modelNameRaw.trim()
      },
      KLING_ENDPOINT_PATH: {
        present: endpointPath.length > 0,
        value: endpointPath,
        has_leading_slash: endpointPath.startsWith("/"),
        is_video_generation_endpoint: endpointPath.includes("/videos/"),
        has_leading_or_trailing_space: endpointPathRaw !== endpointPathRaw.trim()
      },
      KLING_TEXT2VIDEO_ENDPOINT_PATH: {
        present: text2videoEndpointPath.length > 0,
        value: text2videoEndpointPath,
        has_leading_slash: text2videoEndpointPath.startsWith("/"),
        is_video_generation_endpoint: text2videoEndpointPath.includes("/videos/"),
        has_leading_or_trailing_space: text2videoEndpointPathRaw !== text2videoEndpointPathRaw.trim()
      },
      KLING_IMAGE2VIDEO_ENDPOINT_PATH: {
        present: image2videoEndpointPath.length > 0,
        value: image2videoEndpointPath,
        has_leading_slash: image2videoEndpointPath.startsWith("/"),
        is_video_generation_endpoint: image2videoEndpointPath.includes("/videos/"),
        has_leading_or_trailing_space: image2videoEndpointPathRaw !== image2videoEndpointPathRaw.trim()
      }
    },
    effective_runtime: {
      KLING_ACCESS_KEY_source: runtimeAccessKey
        ? rawEnv.KLING_ACCESS_KEY === undefined || runtimeAccessKey !== cleanEnvValue(rawEnv.KLING_ACCESS_KEY)
          ? "process.env"
          : ".env"
        : "missing",
      KLING_SECRET_KEY_source: runtimeSecretKey
        ? rawEnv.KLING_SECRET_KEY === undefined || runtimeSecretKey !== cleanEnvValue(rawEnv.KLING_SECRET_KEY)
          ? "process.env"
          : ".env"
        : "missing",
      KLING_ACCESS_KEY_matches_dotenv:
        rawEnv.KLING_ACCESS_KEY === undefined ? null : runtimeAccessKey === cleanEnvValue(rawEnv.KLING_ACCESS_KEY),
      KLING_SECRET_KEY_matches_dotenv:
        rawEnv.KLING_SECRET_KEY === undefined ? null : runtimeSecretKey === cleanEnvValue(rawEnv.KLING_SECRET_KEY),
      note: "Real Kling calls use the effective runtime values above. No key values are printed."
    },
    key_safety: {
      access_key_and_secret_key_same_length: accessKey.length === secretKey.length,
      access_key_looks_like_access_key: accessKeyLooksLikeAccessKey,
      secret_key_looks_like_access_key: secretKeyLooksLikeAccessKey,
      suspected_swapped: !accessKeyLooksLikeAccessKey && secretKeyLooksLikeAccessKey,
      notes
    },
    jwt,
    network: {
      ping_implemented: false,
      note: "No safe official no-cost auth ping endpoint is configured. This check does not send network requests."
    }
  };
}

export async function getKlingConfig(): Promise<KlingConfig> {
  await loadDotEnvOnce();
  const missing: string[] = [];
  if (!process.env.KLING_ACCESS_KEY) missing.push("KLING_ACCESS_KEY");
  if (!process.env.KLING_SECRET_KEY) missing.push("KLING_SECRET_KEY");
  if (!process.env.KLING_API_BASE_URL) missing.push("KLING_API_BASE_URL");
  if (missing.length > 0) {
    throw new Error(`Missing Kling config: ${missing.join(", ")}`);
  }

  return {
    accessKey: process.env.KLING_ACCESS_KEY!,
    secretKey: process.env.KLING_SECRET_KEY!,
    baseUrl: trimTrailingSlash(process.env.KLING_API_BASE_URL!),
    mode: getSupportedKlingMode(process.env.KLING_MODE),
    modelName: process.env.KLING_MODEL_NAME || "",
    endpointPath: ensureLeadingSlash(process.env.KLING_ENDPOINT_PATH || "/v1/videos/omni-video"),
    text2videoEndpointPath: ensureLeadingSlash(process.env.KLING_TEXT2VIDEO_ENDPOINT_PATH || "/v1/videos/text2video"),
    image2videoEndpointPath: ensureLeadingSlash(process.env.KLING_IMAGE2VIDEO_ENDPOINT_PATH || "/v1/videos/image2video"),
    maxRetryPerScene: parsePositiveInteger(process.env.MAX_RETRY_PER_SCENE, 1)
  };
}

export function createKlingJwt(input: {
  accessKey: string;
  secretKey: string;
}): string {
  const now = Math.floor(Date.now() / 1000);
  return signJwtHs256(
    {
      iss: input.accessKey,
      exp: now + 1800,
      nbf: now - 5
    },
    input.secretKey
  );
}

async function fetchKlingJson(input: {
  config: KlingConfig;
  method: "GET" | "POST";
  path: string;
  body?: unknown;
}): Promise<KlingApiResponse> {
  const token = createKlingJwt({
    accessKey: input.config.accessKey,
    secretKey: input.config.secretKey
  });
  const response = await fetch(`${input.config.baseUrl}${input.path}`, {
    method: input.method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: input.body === undefined ? undefined : JSON.stringify(input.body)
  });
  const responseText = await response.text().catch(() => "");
  const json = parseKlingJson(responseText);
  if (!response.ok) {
    const requestId = getRequestId(json);
    const message = getMessage(json);
    throw new Error(
      [
        `Kling request failed with HTTP ${response.status}`,
        message ? `message: ${message}` : undefined,
        requestId ? `request_id: ${requestId}` : undefined,
        `body: ${responseSnippet(responseText)}`
      ]
        .filter(Boolean)
        .join(". ")
    );
  }
  if (typeof json?.code === "number" && json.code !== 0) {
    const requestId = getRequestId(json);
    const message = getMessage(json);
    throw new Error(
      [
        `Kling API returned code ${json.code}`,
        message ? `message: ${message}` : undefined,
        requestId ? `request_id: ${requestId}` : undefined,
        `body: ${responseSnippet(responseText)}`
      ]
        .filter(Boolean)
        .join(". ")
    );
  }
  return json ?? {};
}

export async function submitKlingTextToVideoTask(input: KlingSubmitInput): Promise<KlingSubmitResult> {
  const config = await getKlingConfig();
  if (config.mode === "image2video") {
    throw new Error("KLING_MODE=image2video requires image input, which is not connected in this text-prompt POC.");
  }
  const endpointPath = config.mode === "text2video" ? config.text2videoEndpointPath : config.endpointPath;
  const requestBody = {
    model_name: config.modelName,
    prompt: input.prompt,
    negative_prompt: input.negativePrompt ?? "",
    mode: "pro",
    aspect_ratio: input.aspectRatio ?? "9:16",
    duration: normalizeDuration(input.duration),
    external_task_id: input.externalTaskId ?? "",
    callback_url: ""
  };
  const response = await fetchKlingJson({
    config,
    method: "POST",
    path: endpointPath,
    body: requestBody
  });
  const taskId = getTaskId(response);
  if (!taskId) {
    throw new Error("Kling task submission did not return a task_id.");
  }
  return {
    taskId,
    status: getTaskStatus(response),
    requestId: getRequestId(response)
  };
}

export async function pollKlingTask(taskId: string): Promise<KlingPollResult> {
  const config = await getKlingConfig();
  const endpointPath =
    config.mode === "text2video"
      ? config.text2videoEndpointPath
      : config.mode === "image2video"
        ? config.image2videoEndpointPath
        : config.endpointPath;
  const response = await fetchKlingJson({
    config,
    method: "GET",
    path: `${endpointPath}/${encodeURIComponent(taskId)}`
  });
  return {
    taskId,
    status: getTaskStatus(response),
    statusMessage: getTaskStatusMessage(response),
    videoUrl: getVideoUrl(response),
    requestId: getRequestId(response)
  };
}

export async function waitForKlingTask(input: {
  taskId: string;
  pollIntervalMs?: number;
  maxPolls?: number;
}): Promise<KlingPollResult> {
  const maxPolls = input.maxPolls ?? 20;
  const pollIntervalMs = input.pollIntervalMs ?? 10_000;
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    const result = await pollKlingTask(input.taskId);
    if (result.status === "succeed") {
      if (!result.videoUrl) {
        throw new Error("Kling task succeeded but no video URL was returned.");
      }
      return result;
    }
    if (result.status === "failed") {
      throw new Error(result.statusMessage ?? "Kling task failed.");
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(`Kling task polling timed out after ${maxPolls} attempts.`);
}
