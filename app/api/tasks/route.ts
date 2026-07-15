import { NextResponse } from "next/server";
import { parseSourceLinkForTask } from "../../../lib/tools/link-parser";
import { saveSourceNotesForTask, uploadSourceVideoForTask } from "../../../lib/tools/source-input";
import { createTask, getTask } from "../../../lib/tools/task-store";
import type { RemakeStrength, SupportedPlatform } from "../../../lib/types/common";

function getString(formData: FormData, key: string, fallback = ""): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : fallback;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const url = getString(formData, "url").trim();
    const textNotes = getString(formData, "text_notes");
    const transcript = getString(formData, "transcript");
    const screenshotNotes = getString(formData, "screenshot_notes");
    const task = await createTask({
      task_name: getString(formData, "task_name").trim() || undefined,
      original_url: url || undefined,
      source_platform: getString(formData, "platform", "unknown") as SupportedPlatform,
      target_platform: getString(formData, "target_platform", "douyin"),
      duration: getString(formData, "duration", "30s"),
      style: getString(formData, "style", "clean, fast-paced, creator-style short video"),
      remake_strength: getString(formData, "remake_strength", "medium") as RemakeStrength,
      is_original_remake: formData.get("is_original_remake") === "on",
      text_notes: textNotes,
      transcript,
      screenshot_notes: screenshotNotes
    });

    if (url) {
      await parseSourceLinkForTask(task.task_id, url);
    }

    const upload = formData.get("upload");
    if (upload instanceof File && upload.size > 0) {
      await uploadSourceVideoForTask({
        taskId: task.task_id,
        file: upload
      });
    }

    if (textNotes || transcript || screenshotNotes) {
      await saveSourceNotesForTask({
        taskId: task.task_id,
        source_caption: textNotes,
        source_transcript: transcript,
        screenshot_notes: screenshotNotes
      });
    }

    return NextResponse.json(await getTask(task.task_id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create task.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
