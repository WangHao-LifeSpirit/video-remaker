import { NextResponse } from "next/server";
import { getTask, readJsonFile } from "../../../../lib/tools/task-store";

async function optionalArtifact<T>(filePath?: string): Promise<T | null> {
  if (!filePath) {
    return null;
  }
  try {
    return await readJsonFile<T>(filePath);
  } catch {
    return null;
  }
}

export async function GET(_request: Request, { params }: { params: { taskId: string } }) {
  try {
    const task = await getTask(params.taskId);
    const artifacts = {
      input: await optionalArtifact(task.files.input_json),
      analysis: await optionalArtifact(task.files.analysis_json),
      storyboard: await optionalArtifact(task.files.storyboard_json),
      remake_plan: await optionalArtifact(task.files.remake_plan_json),
      video_prompts: await optionalArtifact(task.files.video_prompts_json),
      assets: await optionalArtifact(task.files.assets_json)
    };
    return NextResponse.json({ task, artifacts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Task not found.";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
