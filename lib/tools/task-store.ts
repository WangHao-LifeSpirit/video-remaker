import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ErrorRecord, StepStatus, SupportedPlatform } from "../types/common";
import { createErrorRecord, nowIso } from "../types/common";
import type { TaskUserInputs, VideoRemakeTask } from "../types/task";
import { defaultUserInputs } from "../types/task";

export const PROJECT_ROOT = process.cwd();
export const DATA_DIR = path.join(PROJECT_ROOT, "data");
export const TASKS_DIR = path.join(DATA_DIR, "tasks");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
export const OUTPUTS_DIR = path.join(DATA_DIR, "outputs");

const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function assertSafeStorageId(value: string, label = "id"): string {
  if (!SAFE_ID_PATTERN.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}

export type CreateTaskInput = Partial<TaskUserInputs> & {
  task_name?: string;
  original_url?: string;
  upload_path?: string;
  source_platform?: SupportedPlatform;
};

export function pickUserInputs(input: Partial<TaskUserInputs>): Partial<TaskUserInputs> {
  const userInputs: Partial<TaskUserInputs> = {};
  if (input.target_platform !== undefined) userInputs.target_platform = input.target_platform;
  if (input.duration !== undefined) userInputs.duration = input.duration;
  if (input.style !== undefined) userInputs.style = input.style;
  if (input.remake_strength !== undefined) userInputs.remake_strength = input.remake_strength;
  if (input.is_original_remake !== undefined) userInputs.is_original_remake = input.is_original_remake;
  if (input.text_notes !== undefined) userInputs.text_notes = input.text_notes;
  if (input.transcript !== undefined) userInputs.transcript = input.transcript;
  if (input.screenshot_notes !== undefined) userInputs.screenshot_notes = input.screenshot_notes;
  return userInputs;
}

export function toProjectRelativePath(absoluteOrRelativePath: string): string {
  const absolutePath = path.isAbsolute(absoluteOrRelativePath)
    ? absoluteOrRelativePath
    : path.join(PROJECT_ROOT, absoluteOrRelativePath);
  return path.relative(PROJECT_ROOT, absolutePath).replaceAll(path.sep, "/");
}

export function resolveProjectPath(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(PROJECT_ROOT, filePath);
}

export function getTaskDir(taskId: string): string {
  return path.join(TASKS_DIR, assertSafeStorageId(taskId, "task id"));
}

export function getTaskOutputsDir(taskId: string): string {
  return path.join(OUTPUTS_DIR, assertSafeStorageId(taskId, "task id"));
}

export function getTaskJsonPath(taskId: string): string {
  return path.join(getTaskDir(taskId), "task.json");
}

export async function ensureProjectDirs(): Promise<void> {
  await Promise.all([
    mkdir(TASKS_DIR, { recursive: true }),
    mkdir(UPLOADS_DIR, { recursive: true }),
    mkdir(OUTPUTS_DIR, { recursive: true })
  ]);
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const content = await readFile(resolveProjectPath(filePath), "utf8");
  return JSON.parse(content) as T;
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<string> {
  return writeTextFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function writeTextFile(filePath: string, content: string): Promise<string> {
  const absolutePath = resolveProjectPath(filePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  const tempPath = `${absolutePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempPath, content, "utf8");
    await rename(tempPath, absolutePath);
  } finally {
    await rm(tempPath, { force: true }).catch(() => undefined);
  }
  return toProjectRelativePath(absolutePath);
}

export async function createTask(input: CreateTaskInput = {}): Promise<VideoRemakeTask> {
  await ensureProjectDirs();
  const taskId = `task_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}_${randomUUID().slice(0, 8)}`;
  const createdAt = nowIso();
  const taskName = input.task_name?.trim().slice(0, 80);
  const task: VideoRemakeTask = {
    task_id: taskId,
    task_name: taskName || undefined,
    created_at: createdAt,
    updated_at: createdAt,
    status: "pending",
    current_step: "init-task",
    source: {
      input_type: input.original_url && input.upload_path ? "mixed" : input.original_url ? "url" : input.upload_path ? "upload" : "manual",
      original_url: input.original_url,
      upload_path: input.upload_path,
      platform: input.source_platform,
      parse_status: input.original_url ? "pending" : "needs_user_input"
    },
    user_inputs: {
      ...defaultUserInputs,
      ...pickUserInputs(input)
    },
    files: {},
    export_paths: {},
    errors: []
  };
  await writeJsonFile(getTaskJsonPath(taskId), task);
  return task;
}

export async function getTask(taskId: string): Promise<VideoRemakeTask> {
  return readJsonFile<VideoRemakeTask>(getTaskJsonPath(taskId));
}

export async function saveTask(task: VideoRemakeTask): Promise<VideoRemakeTask> {
  task.updated_at = nowIso();
  await writeJsonFile(getTaskJsonPath(task.task_id), task);
  return task;
}

export async function updateTask(
  taskId: string,
  updater: (task: VideoRemakeTask) => VideoRemakeTask | void
): Promise<VideoRemakeTask> {
  const task = await getTask(taskId);
  const updated = updater(task) ?? task;
  return saveTask(updated);
}

export async function appendTaskError(taskId: string, error: ErrorRecord): Promise<VideoRemakeTask> {
  return updateTask(taskId, (task) => {
    task.errors.push(error);
    task.status = error.recoverable ? "needs_user_input" : "failed";
  });
}

export async function recordStepError(input: {
  taskId: string;
  step: string;
  message: string;
  code?: string;
  recoverable?: boolean;
}): Promise<VideoRemakeTask> {
  return appendTaskError(
    input.taskId,
    createErrorRecord({
      step: input.step,
      message: input.message,
      code: input.code,
      recoverable: input.recoverable
    })
  );
}

export async function writeTaskArtifact<T>(
  taskId: string,
  fileName: string,
  value: T
): Promise<{ artifact: T; relativePath: string }> {
  const relativePath = await writeJsonFile(path.join(getTaskDir(taskId), fileName), value);
  return { artifact: value, relativePath };
}

export async function readTaskArtifact<T>(taskId: string, fileName: string): Promise<T> {
  return readJsonFile<T>(path.join(getTaskDir(taskId), fileName));
}

export function setTaskStatus(task: VideoRemakeTask, status: StepStatus, currentStep: string): void {
  task.status = status;
  task.current_step = currentStep;
}
