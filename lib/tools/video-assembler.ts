import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import type { AssetsManifest } from "../types/assets";
import { createErrorRecord } from "../types/common";
import { generateSilentAudio } from "./audio-generator";
import { assertFfmpegAvailable, runFfmpeg, runFfprobe } from "./ffmpeg";
import { timelineDurationSeconds, totalTimelineSeconds, writeSrtForTimeline } from "./subtitle-renderer";
import {
  getTask,
  getTaskDir,
  getTaskOutputsDir,
  readTaskArtifact,
  resolveProjectPath,
  saveTask,
  setTaskStatus,
  toProjectRelativePath,
  writeTaskArtifact
} from "./task-store";
import { fileExists, generateMockSceneVideo } from "./video-generator";

// Target canvas for the assembled video. Matches the mock generator (720x1280)
// and is a standard vertical 9:16 frame at 30fps.
const TARGET_WIDTH = 720;
const TARGET_HEIGHT = 1280;
const TARGET_FPS = 30;

/**
 * Builds an ffmpeg filter_complex that normalizes every scene clip to the same
 * resolution / SAR / fps / pixel format, then concatenates them. This is what
 * lets real provider clips (e.g. Seedance 704x1248@24fps) and mock placeholder
 * clips (720x1280@30fps) play back seamlessly in a single re-encoded output.
 * Using "-c copy" across mismatched clips caused stretching, frozen frames and
 * audio/video duration drift.
 */
function buildNormalizeConcatFilter(count: number): string {
  const norm = `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease,` +
    `pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=${TARGET_FPS},format=yuv420p`;
  const labels: string[] = [];
  const steps: string[] = [];
  for (let index = 0; index < count; index += 1) {
    steps.push(`[${index}:v]${norm}[v${index}]`);
    labels.push(`[v${index}]`);
  }
  steps.push(`${labels.join("")}concat=n=${count}:v=1:a=0[outv]`);
  return steps.join(";");
}

function findTimelineItem(assets: AssetsManifest, sceneId: string) {
  return assets.timeline.find((item) => item.scene_id === sceneId);
}

function hasMockSceneClips(assets: AssetsManifest): boolean {
  return assets.assets.some(
    (asset) =>
      (asset.type === "mock_video" || asset.type === "placeholder") &&
      (asset.provider === "mock" || asset.generation_status === "mocked")
  );
}

async function ensureSceneVideos(taskId: string, assets: AssetsManifest): Promise<string[]> {
  const videoPaths: string[] = [];

  for (const asset of assets.assets) {
    if (asset.type !== "mock_video" && asset.type !== "placeholder") {
      continue;
    }

    const timelineItem = findTimelineItem(assets, asset.scene_id);
    const durationSeconds = timelineItem ? timelineDurationSeconds(timelineItem) : 4;
    if (!asset.file_path || !(await fileExists(asset.file_path))) {
      asset.file_path = await generateMockSceneVideo({
        taskId,
        sceneId: asset.scene_id,
        durationSeconds
      });
      asset.generation_status = "mocked";
      asset.provider = "mock";
      asset.description = `${asset.description} Regenerated locally as an FFmpeg mock placeholder.`;
    }

    videoPaths.push(resolveProjectPath(asset.file_path));
  }

  return videoPaths;
}

async function existingProjectFile(relativePath: string): Promise<string | undefined> {
  try {
    await access(resolveProjectPath(relativePath));
    return relativePath;
  } catch {
    return undefined;
  }
}

async function selectAudioTrack(taskId: string, assets: AssetsManifest): Promise<string> {
  const preferred = [
    `data/tasks/${taskId}/assets/audio/voiceover.wav`,
    `data/tasks/${taskId}/assets/audio/silent.wav`
  ];

  for (const filePath of preferred) {
    const existing = await existingProjectFile(filePath);
    if (existing) {
      return existing;
    }
  }

  const existingAssetAudio = assets.assets.find(
    (asset) => asset.type === "voiceover" && asset.file_path
  );
  if (existingAssetAudio?.file_path) {
    const existing = await existingProjectFile(existingAssetAudio.file_path);
    if (existing) {
      return existing;
    }
  }

  return generateSilentAudio({
    taskId,
    durationSeconds: totalTimelineSeconds(assets.timeline)
  });
}

async function selectSubtitleTrack(taskId: string, assets: AssetsManifest): Promise<string> {
  const existing = await existingProjectFile(`data/tasks/${taskId}/assets/subtitles/subtitles.srt`);
  if (existing) {
    return existing;
  }
  return writeSrtForTimeline(taskId, assets.timeline);
}

function upsertAssembleAudioAsset(assets: AssetsManifest, audioPath: string): void {
  const existingRealAudio = assets.assets.find(
    (asset) =>
      asset.type === "voiceover" &&
      asset.file_path === audioPath &&
      asset.provider !== "mock" &&
      asset.generation_status === "success"
  );
  if (existingRealAudio) {
    return;
  }
  const isMockWav = audioPath.endsWith("/silent.wav") || audioPath.endsWith("/voiceover.wav");
  const assetId = isMockWav ? "asset_mock_silent_audio" : "asset_silent_audio";
  const existing = assets.assets.find((asset) => asset.asset_id === assetId);
  const record = {
    asset_id: assetId,
    scene_id: "global",
    type: "voiceover" as const,
    provider: isMockWav ? "mock" as const : "ffmpeg" as const,
    file_path: audioPath,
    description: isMockWav
      ? "Mock/silent audio generated for voiceover timing. Real TTS is not connected yet."
      : "Silent audio track generated by FFmpeg because no TTS or voiceover asset exists.",
    generation_status: isMockWav ? "mocked" as const : "success" as const,
    generation_note: isMockWav
      ? "Mock/silent audio generated. Real TTS not connected yet."
      : undefined
  };

  if (existing) {
    Object.assign(existing, record);
  } else {
    assets.assets.push(record);
  }
}

export async function assembleVideoForTask(taskId: string): Promise<AssetsManifest> {
  const task = await getTask(taskId);
  const assets = await readTaskArtifact<AssetsManifest>(taskId, "assets.json");
  const outputDir = getTaskOutputsDir(taskId);
  const finalDir = path.join(getTaskDir(taskId), "final");
  const finalVideoOnlyPath = path.join(finalDir, "video-only.mp4");
  const outputPath = path.join(outputDir, "final.mp4");
  const outputRelativePath = toProjectRelativePath(outputPath);

  try {
    await assertFfmpegAvailable();
    await mkdir(finalDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });

    const sceneVideoPaths = await ensureSceneVideos(taskId, assets);
    if (sceneVideoPaths.length === 0) {
      throw new Error("No mock scene video assets are available for assembly.");
    }

    const concatInputs = sceneVideoPaths.flatMap((filePath) => ["-i", filePath]);
    await runFfmpeg([
      "-y",
      ...concatInputs,
      "-filter_complex",
      buildNormalizeConcatFilter(sceneVideoPaths.length),
      "-map",
      "[outv]",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      finalVideoOnlyPath
    ]);

    const subtitlePath = await selectSubtitleTrack(taskId, assets);
    const audioPath = await selectAudioTrack(taskId, assets);
    upsertAssembleAudioAsset(assets, audioPath);

    await runFfmpeg([
      "-y",
      "-i",
      finalVideoOnlyPath,
      "-i",
      resolveProjectPath(audioPath),
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-shortest",
      "-movflags",
      "+faststart",
      outputPath
    ]);

    await runFfprobe(["-v", "error", "-show_format", "-show_streams", outputPath]);

    const containsMockScenes = hasMockSceneClips(assets);

    assets.assemble_status = {
      ...assets.assemble_status,
      status: containsMockScenes ? "mocked" : "success",
      mode: "ffmpeg",
      mp4_reserved_path: outputRelativePath,
      mp4_path: outputRelativePath,
      subtitle_path: subtitlePath,
      audio_path: audioPath,
      note: containsMockScenes
        ? "FFmpeg assembled a playable preview MP4, but one or more scenes are explicit mock placeholders. Do not treat this file as a finished generated video."
        : "FFmpeg assembled a real MP4 from generated scene clips and the selected audio track. The file is playable."
    };

    const { relativePath } = await writeTaskArtifact(taskId, "assets.json", assets);
    task.files.assets_json = relativePath;
    task.export_paths.mp4 = outputRelativePath;
    setTaskStatus(task, containsMockScenes ? "mocked" : "success", "assemble");
    await saveTask(task);
    return assets;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorRecord = createErrorRecord({
      step: "assemble",
      message,
      code: "FFMPEG_ASSEMBLE_FAILED",
      recoverable: true
    });
    assets.errors.push(errorRecord);
    assets.assemble_status = {
      ...assets.assemble_status,
      status: "failed",
      mode: "ffmpeg",
      mp4_reserved_path: outputRelativePath,
      note: `FFmpeg assembly failed: ${message}`
    };

    const { relativePath } = await writeTaskArtifact(taskId, "assets.json", assets);
    task.files.assets_json = relativePath;
    task.export_paths.mp4 = outputRelativePath;
    task.errors.push(errorRecord);
    setTaskStatus(task, "failed", "assemble");
    await saveTask(task);
    throw new Error(`FFmpeg assembly failed: ${message}`);
  }
}
