import { stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { listJobsForTask } from "../../../../../lib/tools/job-store";
import { getTaskOutputsDir } from "../../../../../lib/tools/task-store";

const STALE_AFTER_MS = 30 * 60 * 1000;

async function hasFinalMp4(taskId: string): Promise<boolean> {
  try {
    const fileStat = await stat(path.join(getTaskOutputsDir(taskId), "final.mp4"));
    return fileStat.isFile();
  } catch {
    return false;
  }
}

function isPossiblyStuck(updatedAt: string): boolean {
  const updatedTime = new Date(updatedAt).getTime();
  if (!Number.isFinite(updatedTime)) {
    return false;
  }
  return Date.now() - updatedTime > STALE_AFTER_MS;
}

export async function GET(_request: Request, { params }: { params: { taskId: string } }) {
  const jobs = await listJobsForTask(params.taskId, 20);
  const finalMp4Exists = await hasFinalMp4(params.taskId);

  return NextResponse.json({
    task_id: params.taskId,
    jobs: jobs.map((job) => ({
      job_id: job.job_id,
      task_id: job.task_id,
      status: job.status,
      current_step: job.current_step,
      created_at: job.created_at,
      updated_at: job.updated_at,
      error: job.error,
      has_final_mp4: finalMp4Exists,
      possibly_stuck: (job.status === "queued" || job.status === "running") && isPossiblyStuck(job.updated_at),
      output_paths: job.output_paths
    }))
  });
}
