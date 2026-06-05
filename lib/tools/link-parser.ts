import type { VideoInputArtifact } from "../types/input";
import type { SourceLinkInfo, SourceLinkPlatform } from "../types/source-link";
import { createErrorRecord, nowIso } from "../types/common";
import { getTask, readTaskArtifact, saveTask, setTaskStatus, writeTaskArtifact } from "./task-store";

const NEXT_ACTION = "请上传原视频，或补充原字幕、原文案、画面说明和复刻要求。";

function firstUrl(input: string): string | undefined {
  const match = input.match(/https?:\/\/[^\s"'<>]+/i);
  return match?.[0] ?? (input.trim().startsWith("http") ? input.trim() : undefined);
}

function cleanUrl(value: string): string {
  return value.trim().replace(/[，。),）\]]+$/u, "");
}

function platformFromHost(hostname: string): SourceLinkPlatform {
  const host = hostname.toLowerCase();
  if (host === "douyin.com" || host.endsWith(".douyin.com")) return "douyin";
  if (host === "kuaishou.com" || host.endsWith(".kuaishou.com")) return "kuaishou";
  if (host === "xiaohongshu.com" || host.endsWith(".xiaohongshu.com") || host === "xhslink.com" || host.endsWith(".xhslink.com")) return "xiaohongshu";
  if (host === "bilibili.com" || host.endsWith(".bilibili.com") || host === "b23.tv" || host.endsWith(".b23.tv")) return "bilibili";
  if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be" || host.endsWith(".youtu.be")) return "youtube";
  if (host === "tiktok.com" || host.endsWith(".tiktok.com") || host === "vt.tiktok.com") return "tiktok";
  if (host === "instagram.com" || host.endsWith(".instagram.com")) return "instagram";
  return "unknown";
}

function normalizeUrl(rawUrl: string): { normalizedUrl?: string; platform: SourceLinkPlatform; error?: string } {
  const urlCandidate = firstUrl(rawUrl);
  if (!urlCandidate) {
    return {
      platform: "unknown",
      error: "输入内容不是有效 URL。"
    };
  }

  try {
    const parsed = new URL(cleanUrl(urlCandidate));
    parsed.hash = "";
    return {
      normalizedUrl: parsed.toString(),
      platform: platformFromHost(parsed.hostname)
    };
  } catch {
    return {
      platform: "unknown",
      error: "URL 格式无法解析。"
    };
  }
}

function sourceStatusForPlatform(platform: SourceLinkPlatform, hasError: boolean): SourceLinkInfo["status"] {
  if (hasError) return "failed";
  if (platform === "unknown") return "unsupported";
  return "needs_user_input";
}

function parseTaskSourceStatus(status: SourceLinkInfo["status"]) {
  if (status === "parsed") return "success" as const;
  if (status === "failed") return "failed" as const;
  return "needs_user_input" as const;
}

async function readExistingInput(taskId: string): Promise<VideoInputArtifact | undefined> {
  try {
    return await readTaskArtifact<VideoInputArtifact>(taskId, "input.json");
  } catch {
    return undefined;
  }
}

export async function parseSourceLinkForTask(taskId: string, url: string): Promise<SourceLinkInfo> {
  const task = await getTask(taskId);
  const normalized = normalizeUrl(url);
  const status = sourceStatusForPlatform(normalized.platform, Boolean(normalized.error));
  const sourceLink: SourceLinkInfo = {
    url,
    normalized_url: normalized.normalizedUrl,
    platform: normalized.platform,
    status,
    extracted_at: nowIso(),
    error: normalized.error ?? (status === "unsupported" ? "当前平台不在支持识别范围内。" : undefined),
    user_next_action: NEXT_ACTION
  };

  const { relativePath } = await writeTaskArtifact(taskId, "source_link.json", sourceLink);
  const existing = await readExistingInput(taskId);
  const artifact: VideoInputArtifact = {
    task_id: taskId,
    status: status === "parsed" ? "success" : "needs_user_input",
    source: {
      ...task.source,
      input_type: task.source.upload_path ? "mixed" : "url",
      original_url: normalized.normalizedUrl ?? url,
      final_url: normalized.normalizedUrl,
      platform: normalized.platform,
      parse_status: parseTaskSourceStatus(status),
      parse_error: sourceLink.error,
      upload_path: task.source.upload_path
    },
    user_inputs: task.user_inputs,
    source_link: sourceLink,
    uploaded_video: existing?.uploaded_video,
    source_transcript: existing?.source_transcript ?? task.user_inputs.transcript ?? "",
    source_caption: existing?.source_caption ?? task.user_inputs.text_notes ?? "",
    screenshot_notes: existing?.screenshot_notes ?? task.user_inputs.screenshot_notes ?? "",
    remake_requirements: existing?.remake_requirements ?? "",
    materials: [
      ...(existing?.materials ?? []).filter((material) => material.type !== "url" && material.type !== "source_link"),
      {
        type: "url",
        status: parseTaskSourceStatus(status),
        value: normalized.normalizedUrl ?? url,
        note: sourceLink.user_next_action
      },
      {
        type: "source_link",
        status: parseTaskSourceStatus(status),
        value: normalized.normalizedUrl ?? url,
        note: `${sourceLink.platform} · ${sourceLink.status}`
      }
    ],
    available_materials: [],
    missing_materials: [],
    errors: [
      ...(existing?.errors ?? []),
      ...(sourceLink.error
        ? [
            createErrorRecord({
              step: "parse-link",
              message: sourceLink.error,
              code: sourceLink.status,
              recoverable: true
            })
          ]
        : [])
    ]
  };
  artifact.available_materials = artifact.materials
    .filter((material) => material.status === "success" && material.value)
    .map((material) => material.type);
  artifact.missing_materials = artifact.materials
    .filter((material) => material.status !== "success")
    .map((material) => material.type);

  const inputWrite = await writeTaskArtifact(taskId, "input.json", artifact);
  task.source = artifact.source;
  task.files.source_link_json = relativePath;
  task.files.input_json = inputWrite.relativePath;
  setTaskStatus(task, sourceLink.status === "parsed" ? "success" : "needs_user_input", "parse-link");
  await saveTask(task);
  return sourceLink;
}

export function linkParserNextAction(): string {
  return NEXT_ACTION;
}
