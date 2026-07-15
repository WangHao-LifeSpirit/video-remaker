import { loadDotEnvOnce } from "../api-clients/llm-client";

/**
 * Lightweight connectivity checks for the Settings page. These verify that a
 * provider's key/endpoint are valid WITHOUT triggering any paid generation:
 * LLM providers use a free models-list / auth ping; Seedance only probes auth
 * reachability (a real video generation would cost money and is never run here).
 */

export type ConnectionTestResult = {
  ok: boolean;
  message: string;
  tested: boolean; // false => only a config check was possible, no live call
};

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function redact(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer <redacted>")
    .replace(/sk-[A-Za-z0-9._-]+/g, "sk-<redacted>");
}

async function testOpenAI(): Promise<ConnectionTestResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, message: "缺少 OPENAI_API_KEY", tested: false };
  const baseUrl = trimTrailingSlash(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1");
  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (response.ok) return { ok: true, message: "连接成功，API Key 有效。", tested: true };
    const body = await response.text().catch(() => "");
    return { ok: false, message: redact(`HTTP ${response.status}: ${body.slice(0, 200)}`), tested: true };
  } catch (error) {
    return { ok: false, message: redact(error instanceof Error ? error.message : String(error)), tested: true };
  }
}

async function testDeepSeek(): Promise<ConnectionTestResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return { ok: false, message: "缺少 DEEPSEEK_API_KEY", tested: false };
  const baseUrl = trimTrailingSlash(process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com");
  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (response.ok) return { ok: true, message: "连接成功，API Key 有效。", tested: true };
    const body = await response.text().catch(() => "");
    return { ok: false, message: redact(`HTTP ${response.status}: ${body.slice(0, 200)}`), tested: true };
  } catch (error) {
    return { ok: false, message: redact(error instanceof Error ? error.message : String(error)), tested: true };
  }
}

async function testClaude(): Promise<ConnectionTestResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, message: "缺少 ANTHROPIC_API_KEY", tested: false };
  try {
    const response = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      }
    });
    if (response.ok) return { ok: true, message: "连接成功，API Key 有效。", tested: true };
    const body = await response.text().catch(() => "");
    return { ok: false, message: redact(`HTTP ${response.status}: ${body.slice(0, 200)}`), tested: true };
  } catch (error) {
    return { ok: false, message: redact(error instanceof Error ? error.message : String(error)), tested: true };
  }
}

async function testSeedance(): Promise<ConnectionTestResult> {
  const apiKey = process.env.SEEDANCE_API_KEY;
  const baseUrl = process.env.SEEDANCE_API_BASE_URL;
  const model = process.env.SEEDANCE_MODEL;
  const missing = [
    !apiKey && "SEEDANCE_API_KEY",
    !baseUrl && "SEEDANCE_API_BASE_URL",
    !model && "SEEDANCE_MODEL"
  ].filter(Boolean) as string[];
  if (missing.length > 0) {
    return { ok: false, message: `缺少配置：${missing.join("、")}`, tested: false };
  }
  // Probe auth without generating: query a non-existent task id. A valid key
  // returns 4xx "not found"; an invalid key returns 401/403. No video is made.
  try {
    const response = await fetch(
      `${trimTrailingSlash(baseUrl!)}/api/v3/contents/generations/tasks/connection-probe-nonexistent`,
      { method: "GET", headers: { Authorization: `Bearer ${apiKey}` } }
    );
    if (response.status === 401 || response.status === 403) {
      return { ok: false, message: `鉴权失败（HTTP ${response.status}），请检查 SEEDANCE_API_KEY。`, tested: true };
    }
    return {
      ok: true,
      message: "配置完整、鉴权可达（未做真实视频生成测试，真实生成会计费）。",
      tested: true
    };
  } catch (error) {
    return { ok: false, message: redact(error instanceof Error ? error.message : String(error)), tested: true };
  }
}

export async function testConnection(provider: string): Promise<ConnectionTestResult> {
  await loadDotEnvOnce();
  switch (provider) {
    case "openai":
      return testOpenAI();
    case "deepseek":
      return testDeepSeek();
    case "claude":
      return testClaude();
    case "seedance":
      return testSeedance();
    default:
      return { ok: false, message: `不支持的测试目标：${provider}`, tested: false };
  }
}
