import type { StepStatus, SupportedPlatform } from "../types/common";
import { createErrorRecord } from "../types/common";
import { getTask, saveTask, setTaskStatus } from "./task-store";

export type LinkResolution = {
  original_url: string;
  final_url?: string;
  platform: SupportedPlatform;
  content_id?: string;
  parse_status: StepStatus;
  parse_error?: string;
};

const officialDomains: Record<SupportedPlatform, string[]> = {
  douyin: ["douyin.com", "iesdouyin.com"],
  kuaishou: ["kuaishou.com", "chenzhongtech.com"],
  xiaohongshu: ["xiaohongshu.com", "xhslink.com"],
  bilibili: ["bilibili.com", "b23.tv"],
  youtube: ["youtube.com", "youtu.be"],
  instagram: ["instagram.com"],
  tiktok: ["tiktok.com", "vt.tiktok.com"],
  unknown: []
};

function isOfficialHost(host: string, domains: string[]): boolean {
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export function extractFirstUrl(input: string): string | undefined {
  const matches = input.match(/https?:\/\/[^\s"'<>，。！？、)）\]]+/g) ?? [];
  for (const match of matches) {
    try {
      const url = new URL(match);
      const host = url.hostname.toLowerCase();
      const isOfficial = Object.values(officialDomains).some((domains) => isOfficialHost(host, domains));
      if (isOfficial) {
        return url.toString();
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

function detectPlatform(url: URL): SupportedPlatform {
  const host = url.hostname.toLowerCase();
  for (const [platform, domains] of Object.entries(officialDomains) as Array<[SupportedPlatform, string[]]>) {
    if (platform !== "unknown" && isOfficialHost(host, domains)) {
      return platform;
    }
  }
  return "unknown";
}

function extractContentId(url: URL, platform: SupportedPlatform): string | undefined {
  const cleanPath = url.pathname.replace(/\/+$/, "");
  if (platform === "douyin") {
    return cleanPath.match(/\/(?:video|note)\/([A-Za-z0-9_-]+)/)?.[1] ?? cleanPath.match(/\/([A-Za-z0-9_-]+)$/)?.[1];
  }
  if (platform === "kuaishou") {
    return cleanPath.match(/\/(?:short-video|photo)\/([A-Za-z0-9_-]+)/)?.[1] ?? url.searchParams.get("photoId") ?? undefined;
  }
  if (platform === "xiaohongshu") {
    return cleanPath.match(/\/(?:explore|discovery\/item)\/([A-Za-z0-9_-]+)/)?.[1] ?? cleanPath.match(/\/([A-Za-z0-9_-]+)$/)?.[1];
  }
  if (platform === "bilibili") {
    return cleanPath.match(/\/video\/(BV[A-Za-z0-9]+)/)?.[1] ?? cleanPath.match(/\/([A-Za-z0-9_-]+)$/)?.[1];
  }
  if (platform === "youtube") {
    return url.searchParams.get("v") ?? cleanPath.match(/\/(?:shorts\/)?([A-Za-z0-9_-]+)$/)?.[1];
  }
  return undefined;
}

export function resolveLink(input: string): LinkResolution {
  const extracted = extractFirstUrl(input.trim()) ?? input.trim();
  try {
    const url = new URL(extracted);
    const platform = detectPlatform(url);
    if (platform === "unknown") {
      return {
        original_url: extracted,
        platform: "unknown",
        parse_status: "needs_user_input",
        parse_error: "Only official short-video platform URLs are accepted in v0.1."
      };
    }

    return {
      original_url: extracted,
      final_url: url.toString(),
      platform,
      content_id: extractContentId(url, platform),
      parse_status: "success"
    };
  } catch {
    return {
      original_url: input,
      platform: "unknown",
      parse_status: "needs_user_input",
      parse_error: "No valid official short-video URL was found. Please upload owned material or provide transcript, copy, or screenshot notes."
    };
  }
}

export async function resolveLinkForTask(taskId: string, urlOrShareText: string): Promise<LinkResolution> {
  const task = await getTask(taskId);
  const result = resolveLink(urlOrShareText);

  task.source = {
    ...task.source,
    input_type: task.source.upload_path ? "mixed" : "url",
    original_url: result.original_url,
    final_url: result.final_url,
    platform: result.platform,
    content_id: result.content_id,
    parse_status: result.parse_status,
    parse_error: result.parse_error
  };
  setTaskStatus(task, result.parse_status === "success" ? "success" : "needs_user_input", "resolve-link");

  if (result.parse_error) {
    task.errors.push(
      createErrorRecord({
        step: "resolve-link",
        message: result.parse_error,
        code: "LINK_PARSE_NEEDS_USER_INPUT",
        recoverable: true
      })
    );
  }

  await saveTask(task);
  return result;
}
