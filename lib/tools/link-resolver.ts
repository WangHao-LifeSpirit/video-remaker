import type { StepStatus, SupportedPlatform } from "../types/common";
import { createErrorRecord } from "../types/common";
import { parseSourceLink } from "./link-parser";
import { getTask, saveTask, setTaskStatus } from "./task-store";

export type LinkResolution = {
  original_url: string;
  final_url?: string;
  platform: SupportedPlatform;
  content_id?: string;
  parse_status: StepStatus;
  parse_error?: string;
};

export function resolveLink(input: string): LinkResolution {
  const parsed = parseSourceLink(input);
  const recognized = parsed.platform !== "unknown" && Boolean(parsed.normalized_url);
  return {
    original_url: parsed.normalized_url ?? input,
    final_url: parsed.normalized_url,
    platform: parsed.platform,
    content_id: parsed.content_id,
    parse_status: recognized ? "success" : "needs_user_input",
    parse_error: recognized ? undefined : parsed.error ?? parsed.user_next_action
  };
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
