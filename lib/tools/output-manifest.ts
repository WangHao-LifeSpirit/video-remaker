import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OutputsManifest, OutputManifestItem } from "../types/outputs-manifest";
import { nowIso } from "../types/common";
import { getTask, getTaskOutputsDir, saveTask, toProjectRelativePath } from "./task-store";

async function outputItem(input: {
  key: OutputManifestItem["key"];
  label: string;
  taskId: string;
  fileName: string;
  downloadFile: OutputManifestItem["download_file"];
}): Promise<OutputManifestItem> {
  const filePath = path.join(getTaskOutputsDir(input.taskId), input.fileName);
  const relativePath = toProjectRelativePath(filePath);
  try {
    const fileStat = await stat(filePath);
    return {
      key: input.key,
      label: input.label,
      file_path: relativePath,
      exists: fileStat.isFile(),
      size_bytes: fileStat.size,
      updated_at: fileStat.mtime.toISOString(),
      download_file: input.downloadFile
    };
  } catch {
    return {
      key: input.key,
      label: input.label,
      file_path: relativePath,
      exists: false,
      download_file: input.downloadFile
    };
  }
}

export async function generateOutputsManifestForTask(taskId: string): Promise<OutputsManifest> {
  const items = await Promise.all([
    outputItem({ taskId, key: "final_mp4", label: "原始成片", fileName: "final.mp4", downloadFile: "final.mp4" }),
    outputItem({ taskId, key: "final_subtitled_mp4", label: "带字幕成片", fileName: "final_subtitled.mp4", downloadFile: "final_subtitled.mp4" }),
    outputItem({ taskId, key: "cover_jpg", label: "封面图", fileName: "cover.jpg", downloadFile: "cover.jpg" }),
    outputItem({ taskId, key: "production_package_md", label: "制作包 Markdown", fileName: "production-package.md", downloadFile: "production-package.md" }),
    outputItem({ taskId, key: "project_package_json", label: "项目包 JSON", fileName: "project-package.json", downloadFile: "project-package.json" })
  ]);
  const hasSubtitled = items.find((item) => item.key === "final_subtitled_mp4")?.exists;
  const hasOriginal = items.find((item) => item.key === "final_mp4")?.exists;
  const manifest: OutputsManifest = {
    task_id: taskId,
    status: "success",
    generated_at: nowIso(),
    recommended_preview: hasSubtitled ? "final_subtitled.mp4" : hasOriginal ? "final.mp4" : "none",
    outputs: items
  };
  const outputsDir = getTaskOutputsDir(taskId);
  await mkdir(outputsDir, { recursive: true });
  const manifestPath = path.join(outputsDir, "outputs_manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const relativePath = toProjectRelativePath(manifestPath);
  const task = await getTask(taskId);
  task.files.outputs_manifest_json = relativePath;
  task.export_paths.manifest = relativePath;
  await saveTask(task);
  return manifest;
}
