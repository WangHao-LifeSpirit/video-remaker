import { access } from "node:fs/promises";
import type { StepStatus } from "../types/common";
import { createErrorRecord } from "../types/common";
import type { VideoInputArtifact, InputMaterial } from "../types/input";
import type { TaskUserInputs } from "../types/task";
import {
  getTask,
  readTaskArtifact,
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
  const existing = await readTaskArtifact<VideoInputArtifact>(taskId, "input.json").catch(() => undefined);
  const effectiveUpload = input.upload
    ?? existing?.uploaded_video?.uploaded_video_path
    ?? existing?.source.upload_path
    ?? task.source.upload_path;
  const uploadCheck = await checkUpload(effectiveUpload);
  const mergedInputs: TaskUserInputs = {
    ...task.user_inputs,
    ...pickUserInputs(input),
    text_notes: input.text_notes ?? existing?.source_caption ?? task.user_inputs.text_notes ?? "",
    transcript: input.transcript ?? existing?.source_transcript ?? task.user_inputs.transcript ?? "",
    screenshot_notes: input.screenshot_notes ?? existing?.screenshot_notes ?? task.user_inputs.screenshot_notes ?? ""
  };

  const sourceTranscript = input.transcript ?? existing?.source_transcript ?? mergedInputs.transcript ?? "";
  const sourceCaption = input.text_notes ?? existing?.source_caption ?? mergedInputs.text_notes ?? "";
  const screenshotNotes = input.screenshot_notes ?? existing?.screenshot_notes ?? mergedInputs.screenshot_notes ?? "";
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
      status: sourceCaption ? "success" : "pending",
      value: sourceCaption
    },
    {
      type: "transcript",
      status: sourceTranscript ? "success" : "pending",
      value: sourceTranscript
    },
    {
      type: "screenshot_notes",
      status: screenshotNotes ? "success" : "pending",
      value: screenshotNotes
    },
    {
      type: "source_caption",
      status: sourceCaption ? "success" : "pending",
      value: sourceCaption
    },
    {
      type: "remake_requirements",
      status: existing?.remake_requirements ? "success" : "pending",
      value: existing?.remake_requirements ?? ""
    }
  ];
  for (const material of existing?.materials ?? []) {
    if (!materials.some((candidate) => candidate.type === material.type)) {
      materials.push(material);
    }
  }

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
    source_link: existing?.source_link,
    uploaded_video: existing?.uploaded_video,
    source_transcript: sourceTranscript,
    source_caption: sourceCaption,
    screenshot_notes: screenshotNotes,
    remake_requirements: existing?.remake_requirements ?? "",
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
