import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "./task-store";
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

export const defaultRunFullJobSteps = ["analyze", "storyboard", "remake", "prompts", "generate-assets", "assemble", "export"];

function getJobPath(jobId: string): string {
  return path.join(JOBS_DIR, `${jobId}.json`);
}

async function writeJob(job: RunFullJob): Promise<RunFullJob> {
  job.updated_at = nowIso();
  await mkdir(JOBS_DIR, { recursive: true });
  await writeFile(getJobPath(job.job_id), `${JSON.stringify(job, null, 2)}\n`, "utf8");
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
    const jobs = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map(async (entry) => {
          const content = await readFile(path.join(JOBS_DIR, entry.name), "utf8");
          return JSON.parse(content) as RunFullJob;
        })
    );
    return jobs.sort((a, b) => b.created_at.localeCompare(a.created_at));
  } catch {
    return [];
  }
}

export async function listJobsForTask(taskId: string, limit = 20): Promise<RunFullJob[]> {
  const jobs = await listJobs();
  return jobs.filter((job) => job.task_id === taskId).slice(0, limit);
}

export async function findActiveJobForTask(taskId: string): Promise<RunFullJob | undefined> {
  const jobs = await listJobsForTask(taskId, 50);
  return jobs.find((job) => job.status === "queued" || job.status === "running");
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
