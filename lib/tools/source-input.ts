import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { VideoInputArtifact } from "../types/input";
import { nowIso } from "../types/common";
import { getTask, readTaskArtifact, saveTask, setTaskStatus, toProjectRelativePath, UPLOADS_DIR, writeTaskArtifact } from "./task-store";

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
const allowedVideoTypes = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const allowedExtensions = new Set([".mp4", ".mov", ".webm"]);

export function isAllowedUploadVideo(file: File): boolean {
  const extension = path.extname(file.name).toLowerCase();
  return allowedVideoTypes.has(file.type) || allowedExtensions.has(extension);
}

function destinationName(file: File): string {
  const extension = path.extname(file.name).toLowerCase();
  if (extension === ".mov" || extension === ".webm") {
    return `source${extension}`;
  }
  return "source.mp4";
}

async function readExistingInput(taskId: string): Promise<VideoInputArtifact | undefined> {
  try {
    return await readTaskArtifact<VideoInputArtifact>(taskId, "input.json");
  } catch {
    return undefined;
  }
}

export async function uploadSourceVideoForTask(input: {
  taskId: string;
  file: File;
  maxBytes?: number;
}): Promise<VideoInputArtifact> {
  const maxBytes = input.maxBytes ?? MAX_UPLOAD_BYTES;
  if (!isAllowedUploadVideo(input.file)) {
    throw new Error("Only mp4, mov, and webm uploads are supported.");
  }
  if (input.file.size > maxBytes) {
    throw new Error(`Upload is too large. Max size is ${Math.round(maxBytes / 1024 / 1024)}MB.`);
  }

  const task = await getTask(input.taskId);
  const uploadDir = path.join(UPLOADS_DIR, input.taskId);
  await mkdir(uploadDir, { recursive: true });
  const destination = path.join(uploadDir, destinationName(input.file));
  await writeFile(destination, Buffer.from(await input.file.arrayBuffer()));
  const uploadedPath = toProjectRelativePath(destination);
  const existing = await readExistingInput(input.taskId);
  const uploadedVideo = {
    uploaded_video_path: uploadedPath,
    original_filename: input.file.name,
    upload_time: nowIso(),
    content_type: input.file.type || undefined,
    size_bytes: input.file.size
  };

  const artifact: VideoInputArtifact = {
    task_id: input.taskId,
    status: "success",
    source: {
      ...task.source,
      input_type: task.source.original_url ? "mixed" : "upload",
      upload_path: uploadedPath,
      parse_status: task.source.parse_status
    },
    user_inputs: task.user_inputs,
    uploaded_video: uploadedVideo,
    source_transcript: existing?.source_transcript ?? task.user_inputs.transcript ?? "",
    source_caption: existing?.source_caption ?? task.user_inputs.text_notes ?? "",
    screenshot_notes: existing?.screenshot_notes ?? task.user_inputs.screenshot_notes ?? "",
    remake_requirements: existing?.remake_requirements ?? "",
    materials: [
      ...(existing?.materials ?? []).filter((material) => material.type !== "upload"),
      {
        type: "upload",
        status: "success",
        value: uploadedPath,
        note: `Uploaded ${input.file.name}`
      }
    ],
    available_materials: Array.from(new Set([...(existing?.available_materials ?? []), "upload"])),
    missing_materials: (existing?.missing_materials ?? []).filter((material) => material !== "upload"),
    errors: existing?.errors ?? []
  };

  const { relativePath } = await writeTaskArtifact(input.taskId, "input.json", artifact);
  task.source = artifact.source;
  task.files.input_json = relativePath;
  setTaskStatus(task, "success", "upload-video");
  await saveTask(task);
  return artifact;
}

export async function saveSourceNotesForTask(input: {
  taskId: string;
  source_transcript?: string;
  source_caption?: string;
  screenshot_notes?: string;
  remake_requirements?: string;
}): Promise<VideoInputArtifact> {
  const task = await getTask(input.taskId);
  const existing = await readExistingInput(input.taskId);
  const artifact: VideoInputArtifact = {
    task_id: input.taskId,
    status: existing?.status ?? "success",
    source: existing?.source ?? task.source,
    user_inputs: {
      ...task.user_inputs,
      transcript: input.source_transcript ?? task.user_inputs.transcript,
      text_notes: input.source_caption ?? task.user_inputs.text_notes,
      screenshot_notes: input.screenshot_notes ?? task.user_inputs.screenshot_notes
    },
    uploaded_video: existing?.uploaded_video,
    source_transcript: input.source_transcript ?? existing?.source_transcript ?? task.user_inputs.transcript ?? "",
    source_caption: input.source_caption ?? existing?.source_caption ?? task.user_inputs.text_notes ?? "",
    screenshot_notes: input.screenshot_notes ?? existing?.screenshot_notes ?? task.user_inputs.screenshot_notes ?? "",
    remake_requirements: input.remake_requirements ?? existing?.remake_requirements ?? "",
    materials: existing?.materials ?? [],
    available_materials: existing?.available_materials ?? [],
    missing_materials: existing?.missing_materials ?? [],
    errors: existing?.errors ?? []
  };

  for (const material of [
    { type: "transcript" as const, value: artifact.source_transcript },
    { type: "source_caption" as const, value: artifact.source_caption },
    { type: "screenshot_notes" as const, value: artifact.screenshot_notes },
    { type: "remake_requirements" as const, value: artifact.remake_requirements }
  ]) {
    const existingMaterial = artifact.materials.find((candidate) => candidate.type === material.type);
    if (existingMaterial) {
      existingMaterial.status = material.value ? "success" : "pending";
      existingMaterial.value = material.value;
    } else {
      artifact.materials.push({
        type: material.type,
        status: material.value ? "success" : "pending",
        value: material.value
      });
    }
  }
  artifact.available_materials = artifact.materials
    .filter((material) => material.status === "success" && material.value)
    .map((material) => material.type);
  artifact.missing_materials = artifact.materials
    .filter((material) => material.status !== "success")
    .map((material) => material.type);

  const { relativePath } = await writeTaskArtifact(input.taskId, "input.json", artifact);
  task.user_inputs = artifact.user_inputs;
  task.files.input_json = relativePath;
  setTaskStatus(task, "success", "source-notes");
  await saveTask(task);
  return artifact;
}
