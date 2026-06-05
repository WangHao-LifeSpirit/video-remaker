import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { AssetsManifest } from "../types/assets";
import type { VoiceoverScript } from "../types/audio";
import type { TtsProvider } from "../api-clients/tts-client";
import { synthesizeVolcTtsWav } from "../api-clients/volc-tts-client";
import { runFfmpeg } from "./ffmpeg";
import { createErrorRecord } from "../types/common";
import { assertVolcTtsAllowed } from "./cost-guard";
import {
  getTask,
  getTaskDir,
  readTaskArtifact,
  saveTask,
  setTaskStatus,
  toProjectRelativePath,
  writeTaskArtifact
} from "./task-store";

export async function generateSilentAudio(input: {
  taskId: string;
  durationSeconds: number;
}): Promise<string> {
  const audioDir = path.join(getTaskDir(input.taskId), "assets", "audio");
  await mkdir(audioDir, { recursive: true });
  const outputPath = path.join(audioDir, "silent.m4a");
  const duration = Math.max(0.5, input.durationSeconds);

  await runFfmpeg([
    "-y",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=48000:cl=stereo",
    "-t",
    duration.toFixed(3),
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    outputPath
  ]);

  return toProjectRelativePath(outputPath);
}

export async function generateSilentWav(input: {
  taskId: string;
  durationSeconds: number;
  fileName?: "silent.wav" | "voiceover.wav";
}): Promise<string> {
  const audioDir = path.join(getTaskDir(input.taskId), "assets", "audio");
  await mkdir(audioDir, { recursive: true });
  const outputPath = path.join(audioDir, input.fileName ?? "silent.wav");
  const duration = Math.max(0.5, input.durationSeconds);

  await runFfmpeg([
    "-y",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=48000:cl=mono",
    "-t",
    duration.toFixed(3),
    "-c:a",
    "pcm_s16le",
    outputPath
  ]);

  return toProjectRelativePath(outputPath);
}

export async function generateMockAudioForTask(input: {
  taskId: string;
  provider?: "mock";
  fallbackNote?: string;
  error?: AssetsManifest["errors"][number];
}): Promise<AssetsManifest> {
  const [voiceover, assets] = await Promise.all([
    readTaskArtifact<VoiceoverScript>(input.taskId, "voiceover_script.json"),
    readTaskArtifact<AssetsManifest>(input.taskId, "assets.json")
  ]);
  const audioPath = await generateSilentWav({
    taskId: input.taskId,
    durationSeconds: voiceover.total_duration_seconds,
    fileName: "silent.wav"
  });

  const existing = assets.assets.find((asset) => asset.asset_id === "asset_mock_silent_audio");
  const audioAsset = {
    asset_id: "asset_mock_silent_audio",
    scene_id: "global",
    type: "voiceover" as const,
    provider: "mock" as const,
    file_path: audioPath,
    description: "Mock/silent audio generated for voiceover timing. Real TTS is not connected yet.",
    generation_status: "mocked" as const,
    generation_note: input.fallbackNote ?? "Mock/silent audio generated. Real TTS not connected yet."
  };

  if (input.error) {
    assets.errors.push(input.error);
  }

  if (existing) {
    Object.assign(existing, audioAsset);
  } else {
    assets.assets.push(audioAsset);
  }

  if (assets.assemble_status) {
    assets.assemble_status.audio_path = audioPath;
  }

  const { relativePath } = await writeTaskArtifact(input.taskId, "assets.json", assets);
  const task = await getTask(input.taskId);
  task.files.assets_json = relativePath;
  setTaskStatus(task, "mocked", "audio");
  await saveTask(task);
  return assets;
}

function voiceoverText(voiceover: VoiceoverScript): string {
  return voiceover.segments
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join(" ");
}

async function generateVolcAudioForTask(taskId: string): Promise<AssetsManifest> {
  const [voiceover, assets] = await Promise.all([
    readTaskArtifact<VoiceoverScript>(taskId, "voiceover_script.json"),
    readTaskArtifact<AssetsManifest>(taskId, "assets.json")
  ]);
  const guard = await assertVolcTtsAllowed({
    segmentCount: voiceover.segments.length,
    step: "audio"
  });

  if (!guard.allowed) {
    return generateMockAudioForTask({
      taskId,
      provider: "mock",
      fallbackNote: guard.note,
      error: guard.error
    });
  }

  const audioDir = path.join(getTaskDir(taskId), "assets", "audio");
  await mkdir(audioDir, { recursive: true });
  const outputPath = path.join(audioDir, "voiceover.wav");

  try {
    await synthesizeVolcTtsWav({
      text: voiceoverText(voiceover),
      outputPath
    });
    const audioPath = toProjectRelativePath(outputPath);
    const existing = assets.assets.find((asset) => asset.asset_id === "asset_volc_tts_voiceover");
    const audioAsset = {
      asset_id: "asset_volc_tts_voiceover",
      scene_id: "global",
      type: "voiceover" as const,
      provider: "volcengine" as const,
      file_path: audioPath,
      description: "Real Volcengine TTS voiceover audio generated from voiceover_script.json.",
      generation_status: "success" as const,
      generation_note: "Real Volcengine TTS audio generated. API keys and remote details were not persisted."
    };
    if (existing) {
      Object.assign(existing, audioAsset);
    } else {
      assets.assets.push(audioAsset);
    }
    assets.assemble_status.audio_path = audioPath;

    const { relativePath } = await writeTaskArtifact(taskId, "assets.json", assets);
    const task = await getTask(taskId);
    task.files.assets_json = relativePath;
    setTaskStatus(task, "success", "audio");
    await saveTask(task);
    return assets;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorRecord = createErrorRecord({
      step: "audio",
      message: `Volcengine TTS failed. Falling back to mock/silent audio. Reason: ${message}`,
      code: "VOLC_TTS_FAILED",
      recoverable: true
    });
    return generateMockAudioForTask({
      taskId,
      provider: "mock",
      fallbackNote: "Volcengine TTS failed after the request attempt. Mock/silent audio remains in use.",
      error: errorRecord
    });
  }
}

export async function generateAudioForTask(input: {
  taskId: string;
  provider: TtsProvider;
}): Promise<AssetsManifest> {
  if (input.provider === "mock") {
    return generateMockAudioForTask({ taskId: input.taskId, provider: "mock" });
  }
  if (input.provider === "volcengine") {
    return generateVolcAudioForTask(input.taskId);
  }

  const error = createErrorRecord({
    step: "audio",
    message: `${input.provider} TTS is reserved but not connected. Falling back to mock/silent audio. No TTS credits were consumed.`,
    code: "TTS_PROVIDER_RESERVED",
    recoverable: true
  });
  return generateMockAudioForTask({
    taskId: input.taskId,
    provider: "mock",
    fallbackNote: error.message,
    error
  });
}
