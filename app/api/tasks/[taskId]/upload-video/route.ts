import { NextResponse } from "next/server";
import { SourceVideoUploadError, uploadSourceVideoForTask } from "../../../../../lib/tools/source-input";

export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  try {
    const formData = await request.formData();
    const file = formData.get("video");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "No video file uploaded." }, { status: 400 });
    }
    const artifact = await uploadSourceVideoForTask({
      taskId,
      file
    });
    return NextResponse.json({
      task_id: taskId,
      status: artifact.status,
      uploaded_video: artifact.uploaded_video,
      input_json_path: `data/tasks/${taskId}/input.json`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload video.";
    const status = error instanceof SourceVideoUploadError ? error.statusCode : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
