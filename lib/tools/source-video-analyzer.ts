import type { VideoInputArtifact } from "../types/input";
import type { SourceVideoMetadata } from "../types/source-video";
import { createErrorRecord } from "../types/common";
import { runFfprobe } from "./ffmpeg";
import { getTask, readTaskArtifact, resolveProjectPath, saveTask, setTaskStatus, writeTaskArtifact } from "./task-store";

type FfprobeJson = {
  streams?: Array<{
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    avg_frame_rate?: string;
    r_frame_rate?: string;
    duration?: string;
  }>;
  format?: {
    duration?: string;
    format_name?: string;
  };
};

function parseFps(value?: string): number | undefined {
  if (!value || value === "0/0") return undefined;
  const [left, right] = value.split("/").map(Number);
  if (!right) return Number.isFinite(left) && left > 0 ? Number(left.toFixed(3)) : undefined;
  return Number.isFinite(left / right) ? Number((left / right).toFixed(3)) : undefined;
}

export async function analyzeSourceVideoForTask(taskId: string): Promise<SourceVideoMetadata> {
  const task = await getTask(taskId);
  const input = await readTaskArtifact<VideoInputArtifact>(taskId, "input.json");
  const uploadedPath = input.uploaded_video?.uploaded_video_path ?? input.source.upload_path;
  if (!uploadedPath) {
    const error = createErrorRecord({
      step: "analyze-source",
      message: "No uploaded source video is available.",
      code: "SOURCE_VIDEO_MISSING",
      recoverable: true
    });
    const failed: SourceVideoMetadata = {
      task_id: taskId,
      status: "failed",
      has_audio: false,
      errors: [error]
    };
    await writeTaskArtifact(taskId, "source_video.json", failed);
    task.errors.push(error);
    setTaskStatus(task, "needs_user_input", "analyze-source");
    await saveTask(task);
    return failed;
  }

  const result = await runFfprobe([
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    resolveProjectPath(uploadedPath)
  ]);
  const parsed = JSON.parse(result.stdout) as FfprobeJson;
  const video = parsed.streams?.find((stream) => stream.codec_type === "video");
  const audio = parsed.streams?.find((stream) => stream.codec_type === "audio");
  const duration = Number(video?.duration ?? parsed.format?.duration);
  const metadata: SourceVideoMetadata = {
    task_id: taskId,
    status: "success",
    uploaded_video_path: uploadedPath,
    duration_seconds: Number.isFinite(duration) ? Number(duration.toFixed(3)) : undefined,
    width: video?.width,
    height: video?.height,
    fps: parseFps(video?.avg_frame_rate) ?? parseFps(video?.r_frame_rate),
    codec: video?.codec_name,
    has_audio: Boolean(audio),
    audio_codec: audio?.codec_name,
    format_name: parsed.format?.format_name,
    errors: []
  };

  const { relativePath } = await writeTaskArtifact(taskId, "source_video.json", metadata);
  task.files.source_video_json = relativePath;
  setTaskStatus(task, "success", "analyze-source");
  await saveTask(task);
  return metadata;
}
