import path from "node:path";
import type { ErrorRecord } from "../types/common";
import type { AssetsManifest } from "../types/assets";
import { nowIso } from "../types/common";
import { getTask, getTaskDir, readJsonFile, saveTask, writeJsonFile } from "./task-store";

export type ClearTaskErrorsResult = {
  task_id: string;
  backup_path: string;
  cleared: {
    task_errors: number;
    assets_errors: number;
  };
};

function backupTimestamp(): string {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

export async function clearTaskErrors(taskId: string): Promise<ClearTaskErrorsResult> {
  const task = await getTask(taskId);
  const taskErrors = [...task.errors];
  let assets: AssetsManifest | undefined;
  let assetsErrors: ErrorRecord[] = [];

  if (task.files.assets_json) {
    try {
      assets = await readJsonFile<AssetsManifest>(task.files.assets_json);
      assetsErrors = [...(assets.errors ?? [])];
    } catch {
      assets = undefined;
      assetsErrors = [];
    }
  }

  const backup = {
    task_id: taskId,
    created_at: nowIso(),
    task_errors: taskErrors,
    assets_errors: assetsErrors
  };
  const backupPath = await writeJsonFile(
    path.join(getTaskDir(taskId), "backups", `errors-backup-${backupTimestamp()}.json`),
    backup
  );

  task.errors = [];
  await saveTask(task);

  if (assets && task.files.assets_json) {
    assets.errors = [];
    await writeJsonFile(task.files.assets_json, assets);
  }

  return {
    task_id: taskId,
    backup_path: backupPath,
    cleared: {
      task_errors: taskErrors.length,
      assets_errors: assetsErrors.length
    }
  };
}
