import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { runFullMockPipeline } from "../../../lib/agents/orchestrator";
import { createTask, toProjectRelativePath, UPLOADS_DIR } from "../../../lib/tools/task-store";
import type { RemakeStrength } from "../../../lib/types/common";

function getString(formData: FormData, key: string, fallback = ""): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : fallback;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const url = getString(formData, "url");
    const task = await createTask({
      original_url: url || undefined,
      target_platform: getString(formData, "target_platform", "douyin"),
      duration: getString(formData, "duration", "30s"),
      style: getString(formData, "style", "clean, fast-paced, creator-style short video"),
      remake_strength: getString(formData, "remake_strength", "medium") as RemakeStrength,
      is_original_remake: formData.get("is_original_remake") === "on",
      text_notes: getString(formData, "text_notes"),
      transcript: getString(formData, "transcript"),
      screenshot_notes: getString(formData, "screenshot_notes")
    });

    let uploadPath: string | undefined;
    const upload = formData.get("upload");
    if (upload instanceof File && upload.size > 0) {
      const uploadDir = path.join(UPLOADS_DIR, task.task_id);
      await mkdir(uploadDir, { recursive: true });
      const safeName = upload.name.replace(/[^\w.-]+/g, "_");
      const destination = path.join(uploadDir, safeName || "upload.bin");
      await writeFile(destination, Buffer.from(await upload.arrayBuffer()));
      uploadPath = toProjectRelativePath(destination);
    }

    const updatedTask = await runFullMockPipeline(task.task_id, {
      url: url || undefined,
      upload: uploadPath,
      target_platform: task.user_inputs.target_platform,
      duration: task.user_inputs.duration,
      style: task.user_inputs.style,
      remake_strength: task.user_inputs.remake_strength,
      is_original_remake: task.user_inputs.is_original_remake,
      text_notes: task.user_inputs.text_notes,
      transcript: task.user_inputs.transcript,
      screenshot_notes: task.user_inputs.screenshot_notes,
      assemble: true,
      export: true
    });

    return NextResponse.json(updatedTask);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create task.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
