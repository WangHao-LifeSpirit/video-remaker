import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { reloadEnv } from "../api-clients/llm-client";

/**
 * In-app settings store: lets the Settings page read and write a whitelisted
 * subset of .env, then hot-reload it without restarting the dev server.
 * Secrets are never returned to the client; they are only reported as present
 * or absent, and only overwritten when a new non-empty value is supplied.
 */

// Keys the settings page is allowed to write. Anything else in .env is left
// untouched. Experimental providers such as Kling are intentionally omitted.
export const EDITABLE_KEYS = [
  "MOCK_MODE",
  // LLM
  "LLM_PROVIDER",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "DEEPSEEK_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "OPENAI_VISION_MODEL",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  // Video
  "VIDEO_PROVIDER",
  "SEEDANCE_API_KEY",
  "SEEDANCE_API_BASE_URL",
  "SEEDANCE_MODEL",
  "SEEDANCE_RESOLUTION",
  // TTS
  "TTS_PROVIDER",
  "VOLC_TTS_APP_ID",
  "VOLC_TTS_ACCESS_TOKEN",
  "VOLC_TTS_CLUSTER",
  "VOLC_TTS_VOICE_TYPE",
  // Cost / behavior
  "ENABLE_PAID_API_CALLS",
  "ENABLE_PAID_TTS_CALLS",
  "MAX_VIDEO_SCENES_PER_RUN",
  "MAX_RETRY_PER_SCENE",
  "MAX_ANALYSIS_FRAMES"
] as const;

export type EditableKey = (typeof EDITABLE_KEYS)[number];

// Secret keys are masked on read and only overwritten with a non-empty value.
export const SECRET_KEYS: ReadonlySet<string> = new Set([
  "DEEPSEEK_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "SEEDANCE_API_KEY",
  "VOLC_TTS_APP_ID",
  "VOLC_TTS_ACCESS_TOKEN"
]);

export type SettingsValue =
  | { kind: "secret"; present: boolean }
  | { kind: "plain"; value: string };

export type SettingsSnapshot = Record<EditableKey, SettingsValue>;

function envPath(): string {
  return path.join(process.cwd(), ".env");
}

async function readEnvText(): Promise<string> {
  try {
    return await readFile(envPath(), "utf8");
  } catch {
    return "";
  }
}

function parseEnvText(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) map.set(key, value);
  }
  return map;
}

/** Current config for the settings page. Secrets reported as present/absent only. */
export async function readSettings(): Promise<SettingsSnapshot> {
  const map = parseEnvText(await readEnvText());
  const snapshot = {} as SettingsSnapshot;
  for (const key of EDITABLE_KEYS) {
    const raw = map.get(key) ?? "";
    if (SECRET_KEYS.has(key)) {
      snapshot[key] = { kind: "secret", present: raw.trim().length > 0 };
    } else {
      snapshot[key] = { kind: "plain", value: raw };
    }
  }
  return snapshot;
}

function formatEnvValue(value: string): string {
  // Quote values containing whitespace or comment characters so they round-trip.
  return /[\s#]/.test(value) ? `"${value}"` : value;
}

/**
 * Rewrites .env applying `updates`, preserving comments, ordering and unknown
 * keys. Existing key lines are replaced in place; new keys are appended.
 */
function applyUpdatesToText(text: string, updates: Record<string, string>): string {
  const lines = text.split(/\r?\n/);
  const remaining = new Set(Object.keys(updates));

  const rewritten = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) return line;
    const key = trimmed.slice(0, equalsIndex).trim();
    if (key in updates) {
      remaining.delete(key);
      return `${key}=${formatEnvValue(updates[key])}`;
    }
    return line;
  });

  const appended: string[] = [];
  for (const key of Object.keys(updates)) {
    if (remaining.has(key)) {
      appended.push(`${key}=${formatEnvValue(updates[key])}`);
    }
  }
  if (appended.length > 0) {
    if (rewritten.length > 0 && rewritten[rewritten.length - 1].trim() !== "") {
      rewritten.push("");
    }
    rewritten.push(...appended);
  }
  return rewritten.join("\n");
}

export type WriteSettingsInput = Record<string, string>;

/**
 * Validates and applies settings updates, then hot-reloads env. Secret keys
 * with an empty value are skipped so the existing secret is not wiped. Returns
 * the keys that were actually written.
 */
export async function writeSettings(input: WriteSettingsInput): Promise<{ updatedKeys: string[] }> {
  const updates: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!(EDITABLE_KEYS as readonly string[]).includes(key)) continue;
    if (typeof value !== "string") continue;
    if (SECRET_KEYS.has(key) && value.trim() === "") continue; // keep existing secret
    updates[key] = value;
  }

  const updatedKeys = Object.keys(updates);
  if (updatedKeys.length === 0) {
    return { updatedKeys };
  }

  const current = await readEnvText();
  const next = applyUpdatesToText(current, updates);
  await writeFile(envPath(), next.endsWith("\n") ? next : `${next}\n`, "utf8");
  await reloadEnv();
  return { updatedKeys };
}
