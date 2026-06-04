import { NextResponse } from "next/server";
import { getRunFullRuntimeStatus, parsePositiveInteger, runFullPipeline } from "../../../../../lib/tools/run-full";

type RunFullRequestBody = {
  provider?: "mock" | "seedance";
  sceneLimit?: number;
  assemble?: boolean;
  export?: boolean;
  dryRun?: boolean;
  force?: boolean;
  resume?: boolean;
};

export async function GET() {
  try {
    const runtime = await getRunFullRuntimeStatus();
    return NextResponse.json(runtime);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read run-full runtime status.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: { taskId: string } }) {
  try {
    const body = (await request.json().catch(() => ({}))) as RunFullRequestBody;
    const runtime = await getRunFullRuntimeStatus();
    const provider = body.provider ?? "seedance";
    const sceneLimit = parsePositiveInteger(body.sceneLimit, 3);

    if (!["mock", "seedance"].includes(provider)) {
      return NextResponse.json({ error: "Web run-full currently supports provider mock or seedance only." }, { status: 400 });
    }
    if (sceneLimit > runtime.max_video_scenes_per_run) {
      return NextResponse.json(
        { error: `sceneLimit ${sceneLimit} exceeds MAX_VIDEO_SCENES_PER_RUN=${runtime.max_video_scenes_per_run}.` },
        { status: 400 }
      );
    }

    const result = await runFullPipeline({
      taskId: params.taskId,
      provider,
      sceneLimit,
      assemble: body.assemble ?? true,
      export: body.export ?? true,
      dryRun: body.dryRun ?? false,
      force: body.force ?? false,
      resume: body.resume ?? true
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run full task.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
