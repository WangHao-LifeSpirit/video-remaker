import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { submitKlingTextToVideoTask, waitForKlingTask } from "../api-clients/kling-client";
import { submitLumaVideoGeneration, waitForLumaGeneration } from "../api-clients/luma-client";
import { submitSeedanceTextToVideoTask, waitForSeedanceTask } from "../api-clients/seedance-client";
import type { AssetsManifest } from "../types/assets";
import type { RemakePlan } from "../types/remake-plan";
import type { VideoPrompts } from "../types/video-prompts";
import { createErrorRecord, mockMeta } from "../types/common";
import {
  getTask,
  getTaskDir,
  readTaskArtifact,
  saveTask,
  setTaskStatus,
  toProjectRelativePath,
  writeTaskArtifact
} from "./task-store";
import { assertKlingSingleSceneAllowed, assertLumaSingleSceneAllowed, assertSeedanceScenesAllowed } from "./cost-guard";
import { runFfprobe } from "./ffmpeg";
import { generateMockSceneVideo, getMockSceneVideoPath } from "./video-generator";

function secondsFromTimeToken(value: string): number | undefined {
  const token = value.trim().toLowerCase().replace(/秒$/, "s");
  if (!token) return undefined;
  if (token.includes(":")) {
    const parts = token.split(":").map((part) => Number(part));
    if (parts.some((part) => Number.isNaN(part))) return undefined;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return undefined;
  }
  const match = token.match(/^(\d+(?:\.\d+)?)s?$/);
  return match ? Number(match[1]) : undefined;
}

function secondsFromDuration(value: string): { seconds: number; warning?: string } {
  const normalized = value.trim().replace(/[–—~至到]/g, "-");
  const rangeParts = normalized.split("-").map((part) => part.trim()).filter(Boolean);
  if (rangeParts.length === 2) {
    const start = secondsFromTimeToken(rangeParts[0]);
    const end = secondsFromTimeToken(rangeParts[1]);
    if (start !== undefined && end !== undefined && end > start) {
      return { seconds: end - start };
    }
  }

  const single = secondsFromTimeToken(normalized);
  if (single !== undefined && single > 0) {
    return { seconds: single };
  }

  return {
    seconds: 4,
    warning: `Could not parse scene duration "${value}". Used 4s fallback.`
  };
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export async function generateMockAssetsForTask(taskId: string): Promise<AssetsManifest> {
  const task = await getTask(taskId);
  const prompts = await readTaskArtifact<VideoPrompts>(taskId, "video_prompts.json");
  const remakePlan = await readTaskArtifact<RemakePlan>(taskId, "remake_plan.json");
  const warnings = [...prompts.errors];

  let cursor = 0;
  const sceneDurations = new Map<string, number>();
  const timeline = remakePlan.new_storyboard.map((scene) => {
    const parsedDuration = secondsFromDuration(scene.duration);
    if (parsedDuration.warning) {
      warnings.push(
        createErrorRecord({
          step: "mock-assets",
          message: parsedDuration.warning,
          code: "DURATION_PARSE_FALLBACK",
          recoverable: true
        })
      );
    }
    const duration = parsedDuration.seconds;
    sceneDurations.set(scene.scene_id, duration);
    const start = cursor;
    cursor += duration;
    return {
      scene_id: scene.scene_id,
      start: formatTime(start),
      end: formatTime(cursor),
      asset_ids: [`asset_${scene.scene_id}_mock_video`],
      narration: scene.narration,
      subtitle: scene.caption
    };
  });

  const assets = [];
  for (const scene of remakePlan.new_storyboard) {
    let filePath = toProjectRelativePath(getMockSceneVideoPath(taskId, scene.scene_id));
    let generationStatus: AssetsManifest["assets"][number]["generation_status"] = "mocked";
    try {
      filePath = await generateMockSceneVideo({
        taskId,
        sceneId: scene.scene_id,
        durationSeconds: sceneDurations.get(scene.scene_id) ?? 4
      });
    } catch (error) {
      generationStatus = "failed";
      warnings.push(
        createErrorRecord({
          step: "mock-assets",
          message: `Failed to generate FFmpeg mock video for ${scene.scene_id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          code: "MOCK_VIDEO_GENERATION_FAILED",
          recoverable: true
        })
      );
    }

    assets.push({
      asset_id: `asset_${scene.scene_id}_mock_video`,
      scene_id: scene.scene_id,
      type: "mock_video" as const,
      provider: "mock" as const,
      file_path: filePath,
      description: `FFmpeg placeholder MP4 for ${scene.asset_needed}. The file is real, but the video content is mock and no paid video API was called.`,
      generation_status: generationStatus
    });
  }

  const artifact: AssetsManifest = {
    task_id: taskId,
    status: "mocked",
    mock: mockMeta("Kling / Seedance / TTS / ASR"),
    assets,
    timeline,
    assemble_status: {
      status: "mocked",
      mp4_reserved_path: `data/outputs/${taskId}/final.mp4`,
      note: "Mock video scene files were prepared. Run assemble to create a real MP4 from these mock placeholders."
    },
    errors: warnings
  };

  const { relativePath } = await writeTaskArtifact(taskId, "assets.json", artifact);
  task.files.assets_json = relativePath;
  setTaskStatus(task, "mocked", "mock-assets");
  await saveTask(task);
  return artifact;
}

async function writeAssetsAndTask(input: {
  taskId: string;
  assets: AssetsManifest;
  currentStep: string;
}): Promise<AssetsManifest> {
  const task = await getTask(input.taskId);
  const { relativePath } = await writeTaskArtifact(input.taskId, "assets.json", input.assets);
  task.files.assets_json = relativePath;
  task.errors.push(...input.assets.errors.filter((error) => error.step === input.currentStep));
  setTaskStatus(task, input.assets.status, input.currentStep);
  await saveTask(task);
  return input.assets;
}

async function downloadVideo(input: {
  url: string;
  outputPath: string;
}): Promise<void> {
  const response = await fetch(input.url);
  if (!response.ok) {
    throw new Error(`Kling video download failed with HTTP ${response.status}.`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await mkdir(path.dirname(input.outputPath), { recursive: true });
  await writeFile(input.outputPath, bytes);
}

function klingDurationForCall(value: string): {
  duration: string;
  note?: string;
} {
  const parsed = secondsFromDuration(value);
  const cappedSeconds = Math.min(5, Math.max(3, parsed.seconds));
  const notes: string[] = [];
  if (parsed.warning) {
    notes.push(parsed.warning);
  }
  if (parsed.seconds > 5) {
    notes.push(`Kling scene duration was capped from ${parsed.seconds}s to 5s for P4-mini single-scene real-run.`);
  }
  return {
    duration: `${cappedSeconds}s`,
    note: notes.length > 0 ? notes.join(" ") : undefined
  };
}

async function runKlingSingleScene(input: {
  taskId: string;
  assets: AssetsManifest;
  prompts: VideoPrompts;
  sceneLimit: number;
}): Promise<AssetsManifest> {
  const guard = await assertKlingSingleSceneAllowed({
    sceneCount: input.sceneLimit,
    step: "generate-assets"
  });

  const firstKlingPrompt = input.prompts.prompts.find((prompt) => prompt.provider === "kling");
  const firstAsset = firstKlingPrompt
    ? input.assets.assets.find((asset) => asset.scene_id === firstKlingPrompt.scene_id)
    : undefined;

  if (!firstKlingPrompt || !firstAsset) {
    input.assets.errors.push(
      createErrorRecord({
        step: "generate-assets",
        message: "No first Kling prompt or matching asset was found. Falling back to mock assets. No Kling credits were consumed.",
        code: "KLING_PROMPT_NOT_FOUND",
        recoverable: true
      })
    );
    return writeAssetsAndTask({
      taskId: input.taskId,
      assets: input.assets,
      currentStep: "generate-assets"
    });
  }

  if (!guard.allowed) {
    input.assets.errors.push(guard.error);
    firstAsset.generation_note = guard.note;
    firstAsset.description = `${firstAsset.description} ${guard.note}`;
    return writeAssetsAndTask({
      taskId: input.taskId,
      assets: input.assets,
      currentStep: "generate-assets"
    });
  }

  const klingDuration = klingDurationForCall(firstKlingPrompt.duration);
  let lastError: unknown;

  try {
    const submitted = await submitKlingTextToVideoTask({
      prompt: firstKlingPrompt.prompt,
      negativePrompt: firstKlingPrompt.negative_prompt,
      duration: klingDuration.duration,
      aspectRatio: firstKlingPrompt.aspect_ratio,
      externalTaskId: `${input.taskId}_${firstKlingPrompt.scene_id}`
    });
    firstAsset.remote_task_id = submitted.taskId;
    const completed = await waitForKlingTask({
      taskId: submitted.taskId
    });
    if (!completed.videoUrl) {
      throw new Error("Kling task succeeded but did not return a video URL.");
    }

    const outputPath = path.join(getTaskDir(input.taskId), "assets", "videos", `${firstKlingPrompt.scene_id}.mp4`);
    await downloadVideo({
      url: completed.videoUrl,
      outputPath
    });
    await runFfprobe(["-v", "error", "-show_format", "-show_streams", outputPath]);

    firstAsset.asset_id = `asset_${firstKlingPrompt.scene_id}_kling_video`;
    firstAsset.provider = "kling";
    firstAsset.file_path = toProjectRelativePath(outputPath);
    firstAsset.remote_task_id = completed.taskId;
    firstAsset.remote_url = undefined;
    firstAsset.generation_note = [
      klingDuration.note,
      "Real Kling video was downloaded locally. Remote result URL was not persisted."
    ]
      .filter(Boolean)
      .join(" ");
    firstAsset.description = `Real Kling generated video for scene ${firstKlingPrompt.scene_id}.`;
    firstAsset.generation_status = "success";
    for (const timelineItem of input.assets.timeline) {
      if (timelineItem.scene_id === firstKlingPrompt.scene_id) {
        timelineItem.asset_ids = [firstAsset.asset_id];
      }
    }
    input.assets.status = "success";
    input.assets.mock = {
      is_mock: false,
      provider: "kling",
      real_provider_reserved: "Kling single-scene video generation"
    };
    return writeAssetsAndTask({
      taskId: input.taskId,
      assets: input.assets,
      currentStep: "generate-assets"
    });
  } catch (error) {
    lastError = error;
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  input.assets.errors.push(
    createErrorRecord({
      step: "generate-assets",
      message: `Kling single-scene generation failed. Falling back to mock asset. Reason: ${message}`,
      code: "KLING_GENERATION_FAILED",
      recoverable: true
    })
  );
  firstAsset.generation_note = [
    firstAsset.remote_task_id ? `Kling remote_task_id: ${firstAsset.remote_task_id}.` : undefined,
    klingDuration.note,
    "Kling generation failed. Mock asset remains in use. No additional Kling task was submitted."
  ]
    .filter(Boolean)
    .join(" ");
  firstAsset.provider = "mock";
  firstAsset.generation_status = "mocked";
  return writeAssetsAndTask({
    taskId: input.taskId,
    assets: input.assets,
    currentStep: "generate-assets"
  });
}

async function runLumaSingleScene(input: {
  taskId: string;
  assets: AssetsManifest;
  prompts: VideoPrompts;
  sceneLimit: number;
}): Promise<AssetsManifest> {
  const guard = await assertLumaSingleSceneAllowed({
    sceneCount: input.sceneLimit,
    step: "generate-assets"
  });

  const firstPrompt = input.prompts.prompts[0];
  const firstAsset = firstPrompt
    ? input.assets.assets.find((asset) => asset.scene_id === firstPrompt.scene_id)
    : undefined;

  if (!firstPrompt || !firstAsset) {
    input.assets.errors.push(
      createErrorRecord({
        step: "generate-assets",
        message: "No first video prompt or matching asset was found. Falling back to mock assets. No Luma credits were consumed.",
        code: "LUMA_PROMPT_NOT_FOUND",
        recoverable: true
      })
    );
    return writeAssetsAndTask({
      taskId: input.taskId,
      assets: input.assets,
      currentStep: "generate-assets"
    });
  }

  if (!guard.allowed) {
    input.assets.errors.push(guard.error);
    firstAsset.generation_note = guard.note;
    firstAsset.description = `${firstAsset.description} ${guard.note}`;
    return writeAssetsAndTask({
      taskId: input.taskId,
      assets: input.assets,
      currentStep: "generate-assets"
    });
  }

  let lastError: unknown;

  try {
    const submitted = await submitLumaVideoGeneration({
      prompt: firstPrompt.prompt,
      aspectRatio: firstPrompt.aspect_ratio,
      externalTaskId: `${input.taskId}_${firstPrompt.scene_id}`
    });
    firstAsset.remote_task_id = submitted.generationId;
    const completed = await waitForLumaGeneration({
      generationId: submitted.generationId
    });
    if (!completed.videoUrl) {
      throw new Error("Luma generation completed but did not return a video URL.");
    }

    const outputPath = path.join(getTaskDir(input.taskId), "assets", "videos", `${firstPrompt.scene_id}.mp4`);
    await downloadVideo({
      url: completed.videoUrl,
      outputPath
    });
    await runFfprobe(["-v", "error", "-show_format", "-show_streams", outputPath]);

    firstAsset.asset_id = `asset_${firstPrompt.scene_id}_luma_video`;
    firstAsset.provider = "luma";
    firstAsset.file_path = toProjectRelativePath(outputPath);
    firstAsset.remote_task_id = completed.generationId;
    firstAsset.remote_url = undefined;
    firstAsset.generation_note = "Real Luma video was downloaded locally. Remote result URL was not persisted.";
    firstAsset.description = `Real Luma generated video for scene ${firstPrompt.scene_id}.`;
    firstAsset.generation_status = "success";
    for (const timelineItem of input.assets.timeline) {
      if (timelineItem.scene_id === firstPrompt.scene_id) {
        timelineItem.asset_ids = [firstAsset.asset_id];
      }
    }
    input.assets.status = "success";
    input.assets.mock = {
      is_mock: false,
      provider: "luma",
      real_provider_reserved: "Luma single-scene video generation"
    };
    return writeAssetsAndTask({
      taskId: input.taskId,
      assets: input.assets,
      currentStep: "generate-assets"
    });
  } catch (error) {
    lastError = error;
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  input.assets.errors.push(
    createErrorRecord({
      step: "generate-assets",
      message: `Luma single-scene generation failed. Falling back to mock asset. Reason: ${message}`,
      code: "LUMA_GENERATION_FAILED",
      recoverable: true
    })
  );
  firstAsset.generation_note = [
    firstAsset.remote_task_id ? `Luma remote generation id: ${firstAsset.remote_task_id}.` : undefined,
    "Luma generation failed. Mock asset remains in use. No additional Luma task was submitted."
  ]
    .filter(Boolean)
    .join(" ");
  firstAsset.provider = "mock";
  firstAsset.generation_status = "mocked";
  return writeAssetsAndTask({
    taskId: input.taskId,
    assets: input.assets,
    currentStep: "generate-assets"
  });
}

async function readExistingAssetsForTask(taskId: string): Promise<AssetsManifest | undefined> {
  try {
    return await readTaskArtifact<AssetsManifest>(taskId, "assets.json");
  } catch {
    return undefined;
  }
}

function selectSeedancePrompts(prompts: VideoPrompts, sceneLimit: number): VideoPrompts["prompts"] {
  const selected: VideoPrompts["prompts"] = [];
  const seen = new Set<string>();
  for (const prompt of prompts.prompts) {
    if (prompt.provider !== "seedance") continue;
    if (seen.has(prompt.scene_id)) continue;
    selected.push(prompt);
    seen.add(prompt.scene_id);
    if (selected.length >= sceneLimit) break;
  }
  return selected;
}

function markRealAssetOnTimeline(assets: AssetsManifest, sceneId: string, assetId: string): void {
  for (const timelineItem of assets.timeline) {
    if (timelineItem.scene_id === sceneId) {
      timelineItem.asset_ids = [assetId];
    }
  }
}

async function existingRealAssetIsUsable(asset: AssetsManifest["assets"][number]): Promise<boolean> {
  if (asset.provider !== "seedance" || asset.generation_status !== "success" || !asset.file_path || !asset.remote_task_id) {
    return false;
  }
  try {
    await runFfprobe(["-v", "error", "-show_format", "-show_streams", asset.file_path]);
    return true;
  } catch {
    return false;
  }
}

async function generateSeedanceScene(input: {
  taskId: string;
  assets: AssetsManifest;
  prompt: VideoPrompts["prompts"][number];
}): Promise<void> {
  const asset = input.assets.assets.find((candidate) => candidate.scene_id === input.prompt.scene_id);
  if (!asset) {
    input.assets.errors.push(
      createErrorRecord({
        step: "generate-assets",
        message: `No matching asset was found for Seedance scene ${input.prompt.scene_id}.`,
        code: "SEEDANCE_ASSET_NOT_FOUND",
        recoverable: true
      })
    );
    return;
  }

  if (await existingRealAssetIsUsable(asset)) {
    asset.generation_note = `${asset.generation_note ?? "Real Seedance video is already available."} Reused existing local Seedance video; no new Seedance task was submitted for this scene.`;
    markRealAssetOnTimeline(input.assets, input.prompt.scene_id, asset.asset_id);
    return;
  }

  try {
    const submitted = await submitSeedanceTextToVideoTask({
      prompt: input.prompt.prompt,
      duration: input.prompt.duration,
      aspectRatio: input.prompt.aspect_ratio,
      externalTaskId: `${input.taskId}_${input.prompt.scene_id}`
    });
    asset.remote_task_id = submitted.taskId;
    const completed = await waitForSeedanceTask({
      taskId: submitted.taskId
    });
    if (!completed.videoUrl) {
      throw new Error("Seedance task completed but did not return a video URL.");
    }

    const outputPath = path.join(getTaskDir(input.taskId), "assets", "videos", `${input.prompt.scene_id}.mp4`);
    await downloadVideo({
      url: completed.videoUrl,
      outputPath
    });
    await runFfprobe(["-v", "error", "-show_format", "-show_streams", outputPath]);

    asset.asset_id = `asset_${input.prompt.scene_id}_seedance_video`;
    asset.provider = "seedance";
    asset.file_path = toProjectRelativePath(outputPath);
    asset.remote_task_id = completed.taskId;
    asset.remote_url = undefined;
    asset.generation_note = "Real Seedance video was downloaded locally. Remote result URL was not persisted.";
    asset.description = `Real Seedance generated video for scene ${input.prompt.scene_id}.`;
    asset.generation_status = "success";
    markRealAssetOnTimeline(input.assets, input.prompt.scene_id, asset.asset_id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    input.assets.errors.push(
      createErrorRecord({
        step: "generate-assets",
        message: `Seedance scene ${input.prompt.scene_id} generation failed. Falling back to mock asset. Reason: ${message}`,
        code: "SEEDANCE_GENERATION_FAILED",
        recoverable: true
      })
    );
    asset.generation_note = [
      asset.remote_task_id ? `Seedance remote task id: ${asset.remote_task_id}.` : undefined,
      "Seedance generation failed. Mock asset remains in use. No automatic retry was submitted."
    ]
      .filter(Boolean)
      .join(" ");
    asset.provider = "mock";
    asset.generation_status = "mocked";
  }
}

async function runSeedanceScenes(input: {
  taskId: string;
  assets: AssetsManifest;
  prompts: VideoPrompts;
  sceneLimit: number;
}): Promise<AssetsManifest> {
  const selectedPrompts = selectSeedancePrompts(input.prompts, input.sceneLimit);
  const guard = await assertSeedanceScenesAllowed({
    sceneCount: input.sceneLimit,
    step: "generate-assets"
  });

  if (selectedPrompts.length === 0) {
    input.assets.errors.push(
      createErrorRecord({
        step: "generate-assets",
        message: "No Seedance prompt was found. Falling back to mock assets. No Seedance credits were consumed.",
        code: "SEEDANCE_PROMPT_NOT_FOUND",
        recoverable: true
      })
    );
    return writeAssetsAndTask({
      taskId: input.taskId,
      assets: input.assets,
      currentStep: "generate-assets"
    });
  }

  if (!guard.allowed) {
    input.assets.errors.push(guard.error);
    for (const prompt of selectedPrompts) {
      const asset = input.assets.assets.find((candidate) => candidate.scene_id === prompt.scene_id);
      if (asset) {
        asset.generation_note = guard.note;
        asset.description = `${asset.description} ${guard.note}`;
      }
    }
    return writeAssetsAndTask({
      taskId: input.taskId,
      assets: input.assets,
      currentStep: "generate-assets"
    });
  }

  for (const prompt of selectedPrompts) {
    await generateSeedanceScene({
      taskId: input.taskId,
      assets: input.assets,
      prompt
    });
  }

  const successfulSeedanceAssets = input.assets.assets.filter(
    (asset) => asset.provider === "seedance" && asset.generation_status === "success"
  );
  if (successfulSeedanceAssets.length > 0) {
    input.assets.status = "success";
    input.assets.mock = {
      is_mock: false,
      provider: "seedance",
      real_provider_reserved: `Seedance ${successfulSeedanceAssets.length}-scene video generation`
    };
  }
  return writeAssetsAndTask({
    taskId: input.taskId,
    assets: input.assets,
    currentStep: "generate-assets"
  });
}

export async function generateAssetsForTask(input: {
  taskId: string;
  provider: "mock" | "kling" | "luma" | "seedance";
  sceneLimit?: number;
  force?: boolean;
}): Promise<AssetsManifest> {
  const existingAssets = input.provider === "seedance" && !input.force ? await readExistingAssetsForTask(input.taskId) : undefined;
  const assets = existingAssets ?? (await generateMockAssetsForTask(input.taskId));
  if (input.provider === "mock") {
    return assets;
  }

  const prompts = await readTaskArtifact<VideoPrompts>(input.taskId, "video_prompts.json");
  if (input.provider === "luma") {
    return runLumaSingleScene({
      taskId: input.taskId,
      assets,
      prompts,
      sceneLimit: input.sceneLimit ?? 1
    });
  }

  if (input.provider === "seedance") {
    return runSeedanceScenes({
      taskId: input.taskId,
      assets,
      prompts,
      sceneLimit: input.sceneLimit ?? 1
    });
  }

  return runKlingSingleScene({
    taskId: input.taskId,
    assets,
    prompts,
    sceneLimit: input.sceneLimit ?? 1
  });
}
