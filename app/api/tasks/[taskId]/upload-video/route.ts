import { NextResponse } from "next/server";
import { uploadSourceVideoForTask } from "../../../../../lib/tools/source-input";

export async function POST(request: Request, { params }: { params: { taskId: string } }) {
  try {
    const formData = await request.formData();
    const file = formData.get("video");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "No video file uploaded." }, { status: 400 });
    }
    const artifact = await uploadSourceVideoForTask({
      taskId: params.taskId,
      file
    });
    return NextResponse.json({
      task_id: params.taskId,
      status: artifact.status,
      uploaded_video: artifact.uploaded_video,
      input_json_path: `data/tasks/${params.taskId}/input.json`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload video.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
