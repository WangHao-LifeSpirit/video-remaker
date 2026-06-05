import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { loadDotEnvOnce } from "./llm-client";

type VolcTtsConfig = {
  appId: string;
  accessToken: string;
  cluster: string;
  voiceType: string;
  baseUrl: string;
};

type VolcTtsResponse = {
  data?: unknown;
  message?: unknown;
  code?: unknown;
};

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export async function getVolcTtsConfig(): Promise<{ config?: VolcTtsConfig; missing: string[] }> {
  await loadDotEnvOnce();
  const appId = process.env.VOLC_TTS_APP_ID;
  const accessToken = process.env.VOLC_TTS_ACCESS_TOKEN;
  const cluster = process.env.VOLC_TTS_CLUSTER;
  const voiceType = process.env.VOLC_TTS_VOICE_TYPE;
  const baseUrl = process.env.VOLC_TTS_API_BASE_URL;
  const missing = [];
  if (!appId) missing.push("VOLC_TTS_APP_ID");
  if (!accessToken) missing.push("VOLC_TTS_ACCESS_TOKEN");
  if (!cluster) missing.push("VOLC_TTS_CLUSTER");
  if (!voiceType) missing.push("VOLC_TTS_VOICE_TYPE");
  if (!baseUrl) missing.push("VOLC_TTS_API_BASE_URL");
  if (missing.length || !appId || !accessToken || !cluster || !voiceType || !baseUrl) {
    return { missing };
  }
  return {
    config: {
      appId,
      accessToken,
      cluster,
      voiceType,
      baseUrl
    },
    missing
  };
}

function responseErrorMessage(value: VolcTtsResponse | undefined): string | undefined {
  if (typeof value?.message === "string") {
    return value.message;
  }
  if (value?.code !== undefined) {
    return `Volc TTS returned code ${String(value.code)}.`;
  }
  return undefined;
}

export async function synthesizeVolcTtsWav(input: {
  text: string;
  outputPath: string;
}): Promise<{ outputPath: string }> {
  const { config, missing } = await getVolcTtsConfig();
  if (!config) {
    throw new Error(`Missing Volc TTS config: ${missing.join(", ")}`);
  }

  const response = await fetch(trimTrailingSlash(config.baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer;${config.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      app: {
        appid: config.appId,
        token: config.accessToken,
        cluster: config.cluster
      },
      user: {
        uid: "video-remaker-local"
      },
      audio: {
        voice_type: config.voiceType,
        encoding: "wav"
      },
      request: {
        reqid: randomUUID(),
        text: input.text,
        operation: "query"
      }
    })
  });

  const json = (await response.json().catch(() => undefined)) as VolcTtsResponse | undefined;
  if (!response.ok) {
    throw new Error(responseErrorMessage(json) ?? `Volc TTS request failed with HTTP ${response.status}.`);
  }
  if (typeof json?.data !== "string" || !json.data) {
    throw new Error(responseErrorMessage(json) ?? "Volc TTS response did not include base64 audio data.");
  }

  await writeFile(input.outputPath, Buffer.from(json.data, "base64"));
  return { outputPath: input.outputPath };
}
