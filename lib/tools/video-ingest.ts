import { access } from "node:fs/promises";
import type { StepStatus } from "../types/common";
import { createErrorRecord } from "../types/common";
import type { VideoInputArtifact, InputMaterial } from "../types/input";
import type { TaskUserInputs } from "../types/task";
import {
  getTask,
  resolveProjectPath,
  saveTask,
  setTaskStatus,
  toProjectRelativePath,
  writeTaskArtifact,
  pickUserInputs
} from "./task-store";

export type IngestInput = Partial<TaskUserInputs> & {
  upload?: string;
};

async function checkUpload(upload?: string): Promise<{ status: StepStatus; path?: string; note?: string }> {
  if (!upload) {
    return { status: "pending", note: "No upload path provided." };
  }
  try {
    await access(resolveProjectPath(upload));
    return { status: "success", path: toProjectRelativePath(upload) };
  } catch {
    return { status: "failed", path: upload, note: "Upload path was provided but cannot be read." };
  }
}

export async function ingestForTask(taskId: string, input: IngestInput = {}): Promise<VideoInputArtifact> {
  const task = await getTask(taskId);
  const uploadCheck = await checkUpload(input.upload);
  const mergedInputs: TaskUserInputs = {
    ...task.user_inputs,
    ...pickUserInputs(input),
    text_notes: input.text_notes ?? task.user_inputs.text_notes ?? "",
    transcript: input.transcript ?? task.user_inputs.transcript ?? "",
    screenshot_notes: input.screenshot_notes ?? task.user_inputs.screenshot_notes ?? ""
  };

  const materials: InputMaterial[] = [
    {
      type: "url",
      status: task.source.parse_status,
      value: task.source.final_url ?? task.source.original_url,
      note: task.source.parse_error
    },
    {
      type: "upload",
      status: uploadCheck.status,
      value: uploadCheck.path,
      note: uploadCheck.note
    },
    {
      type: "text_notes",
      status: mergedInputs.text_notes ? "success" : "pending",
      value: mergedInputs.text_notes
    },
    {
      type: "transcript",
      status: mergedInputs.transcript ? "success" : "pending",
      value: mergedInputs.transcript
    },
    {
      type: "screenshot_notes",
      status: mergedInputs.screenshot_notes ? "success" : "pending",
      value: mergedInputs.screenshot_notes
    }
  ];

  const availableMaterials = materials.filter((material) => material.status === "success" && material.value).map((material) => material.type);
  const missingMaterials = materials.filter((material) => material.status !== "success").map((material) => material.type);
  const errors = uploadCheck.status === "failed"
    ? [
        createErrorRecord({
          step: "ingest",
          message: uploadCheck.note ?? "Upload failed.",
          code: "UPLOAD_NOT_READABLE",
          recoverable: true
        })
      ]
    : [];

  const status: StepStatus = availableMaterials.length > 0 ? "success" : "needs_user_input";
  const artifact: VideoInputArtifact = {
    task_id: taskId,
    status,
    source: {
      ...task.source,
      input_type: task.source.original_url && uploadCheck.path ? "mixed" : uploadCheck.path ? "upload" : task.source.original_url ? "url" : "manual",
      upload_path: uploadCheck.path ?? task.source.upload_path
    },
    user_inputs: mergedInputs,
    materials,
    available_materials: availableMaterials,
    missing_materials: missingMaterials,
    errors
  };

  const { relativePath } = await writeTaskArtifact(taskId, "input.json", artifact);
  task.user_inputs = mergedInputs;
  task.source = artifact.source;
  task.files.input_json = relativePath;
  task.errors.push(...errors);
  setTaskStatus(task, status, "ingest");
  await saveTask(task);
  return artifact;
}
