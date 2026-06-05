import { access } from "node:fs/promises";
import { generateRemakePlanForTask } from "../agents/content-creator-agent";
import { generateStoryboardForTask } from "../agents/storyboard-agent";
import { exportJsonForTask } from "../export/json-exporter";
import { exportMarkdownForTask } from "../export/markdown-exporter";
import type { TaskUserInputs, VideoRemakeTask } from "../types/task";
import { loadDotEnvOnce } from "../api-clients/llm-client";
import { generateAssetsForTask } from "./asset-generator";
import { assembleVideoForTask } from "./video-assembler";
import { analyzeForTask } from "./video-analyzer";
import { generateVideoPromptsForTask } from "./prompt-generator";
import { reviewTask } from "./review";
import { generateVoiceoverForTask } from "./voiceover-generator";
import { generateSubtitlesForTask } from "./subtitle-generator";
import { generateMockAudioForTask } from "./audio-generator";
import { createTask, getTask, getTaskDir, resolveProjectPath } from "./task-store";
import { ingestForTask } from "./video-ingest";
import { resolveLinkForTask } from "./link-resolver";

export type VideoProvider = "mock" | "seedance" | "kling" | "luma";
export type StableVideoProvider = "mock" | "seedance";
export type ExperimentalVideoProvider = "kling" | "luma";
export type AssetProvider = VideoProvider;

export type RunFullInput = Partial<TaskUserInputs> & {
  taskId?: string;
  url?: string;
  upload?: string;
  provider?: AssetProvider;
  sceneLimit?: number;
  assemble?: boolean;
  export?: boolean;
  force?: boolean;
  resume?: boolean;
  review?: boolean;
  reviewApply?: boolean;
  prepareAudio?: boolean;
  dryRun?: boolean;
  onStepUpdate?: (update: RunFullStepUpdate) => void | Promise<void>;
};

export type RunFullStepUpdate = {
  name: string;
  status: "running" | "success" | "failed" | "skipped";
  message?: string;
};

export type RunFullResult = {
  task_id?: string;
  mode?: "dry-run";
  status?: string;
  current_step?: string;
  provider: AssetProvider;
  scene_limit: number;
  resume: boolean;
  force: boolean;
  paid_api_calls: boolean;
  max_video_scenes_per_run: number;
  cost_guard_note: string;
  steps: string[];
  existing_artifacts?: Record<string, boolean>;
  outputs?: {
    final_mp4?: string;
    production_package_md?: string;
    project_package_json?: string;
  };
};

export function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return !["false", "0", "no", "off"].includes(value.toLowerCase());
  }
  return fallback;
}

export function parsePositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseAssetProvider(value: unknown): AssetProvider {
  const provider = String(value ?? "mock");
  if (!["mock", "kling", "luma", "seedance"].includes(provider)) {
    throw new Error("provider must be one of: mock, kling, luma, seedance.");
  }
  return provider as AssetProvider;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(resolveProjectPath(filePath));
    return true;
  } catch {
    return false;
  }
}

async function taskArtifactExists(taskId: string, fileName: string): Promise<boolean> {
  return fileExists(`${getTaskDir(taskId)}/${fileName}`);
}

function hasIngestMaterial(input: Pick<RunFullInput, "upload" | "text_notes" | "transcript" | "screenshot_notes">): boolean {
  return Boolean(input.upload || input.text_notes || input.transcript || input.screenshot_notes);
}

function hasInputUpdate(input: Pick<RunFullInput, "url" | "upload" | "text_notes" | "transcript" | "screenshot_notes">): boolean {
  return Boolean(input.url || hasIngestMaterial(input));
}

async function shouldRunArtifactStep(input: {
  taskId: string;
  fileName: string;
  resume: boolean;
  force: boolean;
}): Promise<boolean> {
  if (input.force || !input.resume) {
    return true;
  }
  return !(await taskArtifactExists(input.taskId, input.fileName));
}

export async function getRunFullRuntimeStatus(): Promise<{
  mock_mode: boolean;
  llm_provider: string;
  tts_provider: string;
  paid_tts_calls: boolean;
  video_provider: string;
  paid_api_calls: boolean;
  max_video_scenes_per_run: number;
  enable_paid_api_calls_raw: string;
}> {
  await loadDotEnvOnce();
  return {
    mock_mode: process.env.MOCK_MODE !== "false",
    llm_provider: process.env.LLM_PROVIDER ?? "deepseek",
    tts_provider: process.env.TTS_PROVIDER ?? "mock",
    paid_tts_calls: process.env.ENABLE_PAID_TTS_CALLS === "true",
    video_provider: process.env.VIDEO_PROVIDER ?? "mock",
    paid_api_calls: process.env.ENABLE_PAID_API_CALLS === "true",
    max_video_scenes_per_run: parsePositiveInteger(process.env.MAX_VIDEO_SCENES_PER_RUN, 3),
    enable_paid_api_calls_raw: process.env.ENABLE_PAID_API_CALLS ?? "false"
  };
}

function buildCostGuardNote(input: {
  provider: AssetProvider;
  paidApiCalls: boolean;
  sceneLimit: number;
  maxScenes: number;
}): string {
  if (input.sceneLimit > input.maxScenes) {
    return `scene-limit exceeds MAX_VIDEO_SCENES_PER_RUN=${input.maxScenes}.`;
  }
  if (input.provider !== "mock" && !input.paidApiCalls) {
    return "真实视频生成被成本保护关闭，运行将 fallback mock 或 dry-run。";
  }
  return "成本保护检查通过；真实 provider 仍会复用已成功 scene，除非开启 force。";
}

async function getExistingArtifacts(taskId: string): Promise<Record<string, boolean>> {
  return {
    input_json: await taskArtifactExists(taskId, "input.json"),
    analysis_json: await taskArtifactExists(taskId, "analysis.json"),
    storyboard_json: await taskArtifactExists(taskId, "storyboard.json"),
    remake_plan_json: await taskArtifactExists(taskId, "remake_plan.json"),
    video_prompts_json: await taskArtifactExists(taskId, "video_prompts.json"),
    assets_json: await taskArtifactExists(taskId, "assets.json")
  };
}

async function buildRunFullDryRun(input: {
  taskId?: string;
  options: RunFullInput;
  provider: AssetProvider;
  sceneLimit: number;
  resume: boolean;
  force: boolean;
  runAssemble: boolean;
  runExport: boolean;
  runReview: boolean;
  reviewApply: boolean;
  prepareAudio: boolean;
  paidApiCalls: boolean;
  maxScenes: number;
}): Promise<RunFullResult> {
  const base = {
    mode: "dry-run" as const,
    provider: input.provider,
    scene_limit: input.sceneLimit,
    resume: input.resume,
    force: input.force,
    paid_api_calls: false,
    max_video_scenes_per_run: input.maxScenes,
    cost_guard_note: buildCostGuardNote({
      provider: input.provider,
      paidApiCalls: input.paidApiCalls,
      sceneLimit: input.sceneLimit,
      maxScenes: input.maxScenes
    })
  };

  if (!input.taskId) {
    return {
      ...base,
      steps: [
        "init-task",
        "ingest",
        "analyze",
        "storyboard",
        "remake",
        "prompts",
        input.runReview
          ? input.reviewApply
            ? "review and apply prompt suggestions"
            : "review"
          : "review skipped by option",
        input.prepareAudio ? "voiceover, subtitles, and mock audio" : "prepare-audio skipped by option",
        `generate-assets (${input.provider}, scene-limit=${input.sceneLimit})`,
        input.runAssemble || input.prepareAudio ? "assemble" : "assemble skipped by option",
        input.runExport ? "export" : "export skipped by option"
      ]
    };
  }

  const task = await getTask(input.taskId);
  const artifacts = await getExistingArtifacts(input.taskId);
  const ingestWouldRun = !artifacts.input_json || hasInputUpdate(input.options) || input.force || !input.resume;
  return {
    ...base,
    task_id: input.taskId,
    status: task.status,
    current_step: task.current_step,
    existing_artifacts: artifacts,
    steps: [
      ingestWouldRun
        ? artifacts.input_json
          ? "ingest would refresh input.json"
          : hasInputUpdate(input.options)
            ? "ingest would run from provided material"
            : "input.json missing: run-full would stop unless input material is provided"
        : "ingest would be skipped",
      (await shouldRunArtifactStep({ taskId: input.taskId, fileName: "analysis.json", resume: input.resume, force: input.force }))
        ? "analyze would run"
        : "analyze would be skipped",
      (await shouldRunArtifactStep({ taskId: input.taskId, fileName: "storyboard.json", resume: input.resume, force: input.force }))
        ? "storyboard would run"
        : "storyboard would be skipped",
      (await shouldRunArtifactStep({ taskId: input.taskId, fileName: "remake_plan.json", resume: input.resume, force: input.force }))
        ? "remake would run"
        : "remake would be skipped",
        (await shouldRunArtifactStep({ taskId: input.taskId, fileName: "video_prompts.json", resume: input.resume, force: input.force }))
        ? "prompts would run"
        : "prompts would be skipped",
      input.runReview
        ? input.reviewApply
          ? "review would run and apply prompt suggestions before asset generation"
          : "review would run before asset generation"
        : "review skipped by option",
      input.prepareAudio
        ? "voiceover, subtitles, and mock audio would run before assembly"
        : "prepare-audio skipped by option",
      `generate-assets would run with provider=${input.provider}, scene-limit=${input.sceneLimit}; existing successful Seedance scenes are reused unless force is enabled`,
      input.runAssemble || input.prepareAudio ? "assemble would run" : "assemble skipped by option",
      input.runExport ? "export would run" : "export skipped by option"
    ]
  };
}

function createTaskInput(input: RunFullInput): Partial<TaskUserInputs> & {
  original_url?: string;
  upload_path?: string;
} {
  return {
    target_platform: input.target_platform,
    duration: input.duration,
    style: input.style,
    remake_strength: input.remake_strength,
    is_original_remake: input.is_original_remake,
    text_notes: input.text_notes,
    transcript: input.transcript,
    screenshot_notes: input.screenshot_notes,
    original_url: input.url,
    upload_path: input.upload
  };
}

async function emitStep(input: RunFullInput, update: RunFullStepUpdate): Promise<void> {
  if (input.onStepUpdate) {
    await input.onStepUpdate(update);
  }
}

async function runTrackedStep<T>(
  input: RunFullInput,
  name: string,
  action: () => Promise<T>,
  skipped = false
): Promise<T | undefined> {
  if (skipped) {
    await emitStep(input, { name, status: "skipped", message: "Skipped by resume." });
    return undefined;
  }
  await emitStep(input, { name, status: "running" });
  try {
    const result = await action();
    await emitStep(input, { name, status: "success" });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await emitStep(input, { name, status: "failed", message });
    throw error;
  }
}

export async function runFullPipeline(input: RunFullInput): Promise<RunFullResult> {
  const provider = parseAssetProvider(input.provider ?? "mock");
  const sceneLimit = parsePositiveInteger(input.sceneLimit, 3);
  const resume = input.resume ?? true;
  const force = input.force ?? false;
  const runPrepareAudio = Boolean(input.prepareAudio);
  const runAssemble = (input.assemble ?? false) || runPrepareAudio;
  const runExport = input.export ?? false;
  const runReview = Boolean(input.review || input.reviewApply);
  const reviewApply = Boolean(input.reviewApply);
  const runtime = await getRunFullRuntimeStatus();

  if (sceneLimit > runtime.max_video_scenes_per_run) {
    throw new Error(`sceneLimit ${sceneLimit} exceeds MAX_VIDEO_SCENES_PER_RUN=${runtime.max_video_scenes_per_run}.`);
  }

  if (input.dryRun) {
    return buildRunFullDryRun({
      taskId: input.taskId,
      options: input,
      provider,
      sceneLimit,
      resume,
      force,
      runAssemble,
      runExport,
      runReview,
      reviewApply,
      prepareAudio: runPrepareAudio,
      paidApiCalls: runtime.paid_api_calls,
      maxScenes: runtime.max_video_scenes_per_run
    });
  }

  let task: VideoRemakeTask;
  const steps: string[] = [];
  if (input.taskId) {
    task = await getTask(input.taskId);
    steps.push("task-loaded");
  } else {
    task = await createTask(createTaskInput(input));
    steps.push("init-task");
  }

  if (input.url) {
    await resolveLinkForTask(task.task_id, input.url);
    steps.push("resolve-link");
  }

  const inputExists = await taskArtifactExists(task.task_id, "input.json");
  if (!input.taskId || !inputExists || hasInputUpdate(input) || force || !resume) {
    await ingestForTask(task.task_id, {
      target_platform: input.target_platform,
      duration: input.duration,
      style: input.style,
      remake_strength: input.remake_strength,
      is_original_remake: input.is_original_remake,
      text_notes: input.text_notes,
      transcript: input.transcript,
      screenshot_notes: input.screenshot_notes,
      upload: input.upload
    });
    steps.push("ingest");
  } else {
    steps.push("ingest-skipped");
  }

  if (!(await taskArtifactExists(task.task_id, "input.json"))) {
    throw new Error("input.json is missing. Provide text notes, transcript, screenshot notes, or an owned upload before running.");
  }

  if (await shouldRunArtifactStep({ taskId: task.task_id, fileName: "analysis.json", resume, force })) {
    await runTrackedStep(input, "analyze", () => analyzeForTask(task.task_id));
    steps.push("analyze");
  } else {
    await runTrackedStep(input, "analyze", async () => undefined, true);
    steps.push("analyze-skipped");
  }

  if (await shouldRunArtifactStep({ taskId: task.task_id, fileName: "storyboard.json", resume, force })) {
    await runTrackedStep(input, "storyboard", () => generateStoryboardForTask(task.task_id));
    steps.push("storyboard");
  } else {
    await runTrackedStep(input, "storyboard", async () => undefined, true);
    steps.push("storyboard-skipped");
  }

  if (await shouldRunArtifactStep({ taskId: task.task_id, fileName: "remake_plan.json", resume, force })) {
    await runTrackedStep(input, "remake", () => generateRemakePlanForTask(task.task_id));
    steps.push("remake");
  } else {
    await runTrackedStep(input, "remake", async () => undefined, true);
    steps.push("remake-skipped");
  }

  if (await shouldRunArtifactStep({ taskId: task.task_id, fileName: "video_prompts.json", resume, force })) {
    await runTrackedStep(input, "prompts", () => generateVideoPromptsForTask(task.task_id));
    steps.push("prompts");
  } else {
    await runTrackedStep(input, "prompts", async () => undefined, true);
    steps.push("prompts-skipped");
  }

  if (runReview) {
    const reviewResult = await runTrackedStep(input, "review", () =>
      reviewTask({
        taskId: task.task_id,
        apply: reviewApply
      })
    );
    steps.push(reviewApply ? "review-apply" : "review");
    if (reviewResult?.report.final_decision === "manual_review") {
      throw new Error("Agent review requires manual review before generation.");
    }
  } else {
    steps.push("review-skipped");
  }

  await runTrackedStep(input, "generate-assets", () =>
    generateAssetsForTask({
      taskId: task.task_id,
      provider,
      sceneLimit,
      force
    })
  );
  steps.push("generate-assets");

  if (runPrepareAudio) {
    await runTrackedStep(input, "voiceover", () => generateVoiceoverForTask(task.task_id));
    steps.push("voiceover");
    await runTrackedStep(input, "subtitles", () => generateSubtitlesForTask(task.task_id));
    steps.push("subtitles");
    await runTrackedStep(input, "audio", () => generateMockAudioForTask({ taskId: task.task_id, provider: "mock" }));
    steps.push("audio");
  } else {
    steps.push("prepare-audio-skipped");
  }

  if (runAssemble) {
    await runTrackedStep(input, "assemble", () => assembleVideoForTask(task.task_id));
    steps.push("assemble");
  } else {
    await runTrackedStep(input, "assemble", async () => undefined, true);
  }

  let markdown: string | undefined;
  let json: string | undefined;
  if (runExport) {
    await runTrackedStep(input, "export", async () => {
      markdown = await exportMarkdownForTask(task.task_id);
      json = await exportJsonForTask(task.task_id);
    });
    steps.push("export");
  } else {
    await runTrackedStep(input, "export", async () => undefined, true);
  }

  const latestTask = await getTask(task.task_id);
  return {
    task_id: latestTask.task_id,
    status: latestTask.status,
    current_step: latestTask.current_step,
    provider,
    scene_limit: sceneLimit,
    resume,
    force,
    paid_api_calls: runtime.paid_api_calls,
    max_video_scenes_per_run: runtime.max_video_scenes_per_run,
    cost_guard_note: buildCostGuardNote({
      provider,
      paidApiCalls: runtime.paid_api_calls,
      sceneLimit,
      maxScenes: runtime.max_video_scenes_per_run
    }),
    steps,
    outputs: {
      final_mp4: latestTask.export_paths.mp4,
      production_package_md: markdown ?? latestTask.export_paths.markdown,
      project_package_json: json ?? latestTask.export_paths.json
    }
  };
}
