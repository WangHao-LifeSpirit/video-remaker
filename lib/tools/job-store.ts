import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertSafeStorageId, DATA_DIR } from "./task-store";
import { nowIso } from "../types/common";

export type JobStatus = "queued" | "running" | "success" | "failed";
export type JobStepStatus = "pending" | "running" | "success" | "failed" | "skipped";

export type JobStep = {
  name: string;
  status: JobStepStatus;
  message?: string;
  started_at?: string;
  finished_at?: string;
};

export type RunFullJob = {
  job_id: string;
  task_id: string;
  status: JobStatus;
  current_step: string;
  steps: JobStep[];
  created_at: string;
  updated_at: string;
  error?: string;
  output_paths?: {
    final_mp4?: string;
    production_package?: string;
    project_package?: string;
  };
};

export const JOBS_DIR = path.join(DATA_DIR, "jobs");
export const JOB_STALE_AFTER_MS = 30 * 60 * 1000;

const taskJobCreationLocks = new Map<string, Promise<void>>();

export const defaultRunFullJobSteps = ["analyze", "storyboard", "remake", "prompts", "generate-assets", "assemble", "export"];

function getJobPath(jobId: string): string {
  return path.join(JOBS_DIR, `${assertSafeStorageId(jobId, "job id")}.json`);
}

async function writeJob(job: RunFullJob): Promise<RunFullJob> {
  job.updated_at = nowIso();
  await mkdir(JOBS_DIR, { recursive: true });
  const jobPath = getJobPath(job.job_id);
  const tempPath = `${jobPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(job, null, 2)}\n`, "utf8");
    await rename(tempPath, jobPath);
  } finally {
    await rm(tempPath, { force: true }).catch(() => undefined);
  }
  return job;
}

export async function createRunFullJob(taskId: string): Promise<RunFullJob> {
  const createdAt = nowIso();
  const job: RunFullJob = {
    job_id: `job_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}_${randomUUID().slice(0, 8)}`,
    task_id: taskId,
    status: "queued",
    current_step: "queued",
    steps: defaultRunFullJobSteps.map((name) => ({
      name,
      status: "pending"
    })),
    created_at: createdAt,
    updated_at: createdAt
  };
  return writeJob(job);
}

export async function getJob(jobId: string): Promise<RunFullJob> {
  const content = await readFile(getJobPath(jobId), "utf8");
  return JSON.parse(content) as RunFullJob;
}

export async function listJobs(): Promise<RunFullJob[]> {
  try {
    const entries = await readdir(JOBS_DIR, { withFileTypes: true });
    const candidates = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map(async (entry) => {
          try {
            const content = await readFile(path.join(JOBS_DIR, entry.name), "utf8");
            return JSON.parse(content) as RunFullJob;
          } catch {
            return undefined;
          }
        })
    );
    const jobs = candidates.filter((job): job is RunFullJob => Boolean(job));
    return jobs.sort((a, b) => b.created_at.localeCompare(a.created_at));
  } catch {
    return [];
  }
}

export async function listJobsForTask(taskId: string, limit = 20): Promise<RunFullJob[]> {
  const jobs = await listJobs();
  const selected = jobs.filter((job) => job.task_id === taskId).slice(0, limit);
  return Promise.all(
    selected.map(async (job) => {
      if (job.status !== "queued" && job.status !== "running") {
        return job;
      }
      const updatedAt = Date.parse(job.updated_at);
      if (!Number.isFinite(updatedAt) || Date.now() - updatedAt <= JOB_STALE_AFTER_MS) {
        return job;
      }
      return markJobFailed(job.job_id, "后台任务超过 30 分钟没有更新，已自动标记为失败。可以使用 resume 重新运行。");
    })
  );
}

export async function findActiveJobForTask(taskId: string): Promise<RunFullJob | undefined> {
  const jobs = await listJobsForTask(taskId, 50);
  return jobs.find((job) => job.status === "queued" || job.status === "running");
}

async function withTaskJobCreationLock<T>(taskId: string, action: () => Promise<T>): Promise<T> {
  const safeTaskId = assertSafeStorageId(taskId, "task id");
  const previous = taskJobCreationLocks.get(safeTaskId) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const current = previous.catch(() => undefined).then(() => gate);
  taskJobCreationLocks.set(safeTaskId, current);
  await previous.catch(() => undefined);
  try {
    return await action();
  } finally {
    release();
    if (taskJobCreationLocks.get(safeTaskId) === current) {
      taskJobCreationLocks.delete(safeTaskId);
    }
  }
}

export async function createOrReuseRunFullJob(taskId: string): Promise<{
  job: RunFullJob;
  reused: boolean;
}> {
  return withTaskJobCreationLock(taskId, async () => {
    const active = await findActiveJobForTask(taskId);
    if (active) {
      return { job: active, reused: true };
    }
    return { job: await createRunFullJob(taskId), reused: false };
  });
}

export async function updateJob(jobId: string, updater: (job: RunFullJob) => void | RunFullJob): Promise<RunFullJob> {
  const job = await getJob(jobId);
  const updated = updater(job) ?? job;
  return writeJob(updated);
}

export async function markJobRunning(jobId: string): Promise<RunFullJob> {
  return updateJob(jobId, (job) => {
    job.status = "running";
    job.current_step = "running";
  });
}

export async function markJobSuccess(
  jobId: string,
  outputPaths?: RunFullJob["output_paths"]
): Promise<RunFullJob> {
  return updateJob(jobId, (job) => {
    job.status = "success";
    job.current_step = "complete";
    job.output_paths = outputPaths;
  });
}

export async function markJobFailed(jobId: string, error: string): Promise<RunFullJob> {
  return updateJob(jobId, (job) => {
    job.status = "failed";
    const failedStep = job.current_step;
    job.current_step = "failed";
    job.error = error;
    if (failedStep && failedStep !== "complete") {
      const current = job.steps.find((step) => step.name === failedStep);
      if (current && current.status === "running") {
        current.status = "failed";
        current.message = error;
        current.finished_at = nowIso();
      }
    }
  });
}

export async function updateJobStep(input: {
  jobId: string;
  name: string;
  status: JobStepStatus;
  message?: string;
}): Promise<RunFullJob> {
  return updateJob(input.jobId, (job) => {
    const timestamp = nowIso();
    job.status = job.status === "queued" ? "running" : job.status;
    job.current_step = input.name;
    const step = job.steps.find((candidate) => candidate.name === input.name);
    if (!step) {
      return;
    }
    step.status = input.status;
    step.message = input.message;
    if (input.status === "running" && !step.started_at) {
      step.started_at = timestamp;
    }
    if (["success", "failed", "skipped"].includes(input.status)) {
      step.finished_at = timestamp;
      if (!step.started_at) {
        step.started_at = timestamp;
      }
    }
  });
}
