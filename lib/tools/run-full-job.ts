import type { AssetProvider } from "./run-full";
import { orchestrateTask } from "../agents/orchestrator";
import { createOrReuseRunFullJob, markJobFailed, markJobRunning, markJobSuccess, updateJobStep } from "./job-store";

export type StartRunFullJobInput = {
  taskId: string;
  provider: AssetProvider;
  sceneLimit: number;
  assemble: boolean;
  export: boolean;
  force: boolean;
  resume: boolean;
};

async function executeRunFullJob(jobId: string, input: StartRunFullJobInput): Promise<void> {
  await markJobRunning(jobId);
  try {
    const result = await orchestrateTask({
      taskId: input.taskId,
      provider: input.provider,
      sceneLimit: input.sceneLimit,
      assemble: input.assemble,
      export: input.export,
      force: input.force,
      resume: input.resume,
      onStepUpdate: async (update) => {
        await updateJobStep({
          jobId,
          name: update.name,
          status: update.status,
          message: update.message
        });
      }
    });

    await markJobSuccess(jobId, {
      final_mp4: result.outputs?.final_mp4,
      production_package: result.outputs?.production_package_md,
      project_package: result.outputs?.project_package_json
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markJobFailed(jobId, message);
  }
}

export async function startRunFullJob(input: StartRunFullJobInput) {
  const result = await createOrReuseRunFullJob(input.taskId);
  if (!result.reused) {
    void executeRunFullJob(result.job.job_id, input);
  }
  return result;
}
