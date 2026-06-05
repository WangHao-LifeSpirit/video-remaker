import { NextResponse } from "next/server";
import { getRunFullRuntimeStatus, parseAssetProvider, parsePositiveInteger } from "../../../../../../lib/tools/run-full";
import { startRunFullJob } from "../../../../../../lib/tools/run-full-job";
import { findActiveJobForTask } from "../../../../../../lib/tools/job-store";

type RunFullJobRequestBody = {
  provider?: "mock" | "seedance";
  sceneLimit?: number;
  assemble?: boolean;
  export?: boolean;
  force?: boolean;
  resume?: boolean;
};

export async function POST(request: Request, { params }: { params: { taskId: string } }) {
  try {
    const body = (await request.json().catch(() => ({}))) as RunFullJobRequestBody;
    const runtime = await getRunFullRuntimeStatus();
    const provider = parseAssetProvider(body.provider ?? "seedance");
    const sceneLimit = parsePositiveInteger(body.sceneLimit, 3);

    if (!["mock", "seedance"].includes(provider)) {
      return NextResponse.json({ error: "Web background jobs currently support provider mock or seedance only." }, { status: 400 });
    }
    if (sceneLimit > runtime.max_video_scenes_per_run) {
      return NextResponse.json(
        { error: `sceneLimit ${sceneLimit} exceeds MAX_VIDEO_SCENES_PER_RUN=${runtime.max_video_scenes_per_run}.` },
        { status: 400 }
      );
    }

    const activeJob = await findActiveJobForTask(params.taskId);
    if (activeJob) {
      return NextResponse.json({
        ...activeJob,
        reused: true,
        message: "A queued or running job already exists for this task."
      });
    }

    const job = await startRunFullJob({
      taskId: params.taskId,
      provider,
      sceneLimit,
      assemble: body.assemble ?? true,
      export: body.export ?? true,
      force: body.force ?? false,
      resume: body.resume ?? true
    });

    return NextResponse.json({
      job_id: job.job_id,
      task_id: job.task_id,
      status: job.status,
      current_step: job.current_step,
      steps: job.steps
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create run-full job.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
