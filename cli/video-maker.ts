#!/usr/bin/env node
import { Command } from "commander";
import { generateRemakePlanForTask } from "../lib/agents/content-creator-agent";
import { runFullMockPipeline } from "../lib/agents/orchestrator";
import { generateStoryboardForTask } from "../lib/agents/storyboard-agent";
import { exportJsonForTask } from "../lib/export/json-exporter";
import { exportMarkdownForTask } from "../lib/export/markdown-exporter";
import { createTask, getTask } from "../lib/tools/task-store";
import { resolveLinkForTask } from "../lib/tools/link-resolver";
import { parseSourceLinkForTask } from "../lib/tools/link-parser";
import { ingestForTask } from "../lib/tools/video-ingest";
import { analyzeForTask } from "../lib/tools/video-analyzer";
import { generateVideoPromptsForTask } from "../lib/tools/prompt-generator";
import { generateAssetsForTask, generateMockAssetsForTask } from "../lib/tools/asset-generator";
import { assembleVideoForTask } from "../lib/tools/video-assembler";
import { normalizeBoolean, parseAssetProvider, parsePositiveInteger, runFullPipeline } from "../lib/tools/run-full";
import { clearTaskErrors } from "../lib/tools/error-log";
import { reviewTask } from "../lib/tools/review";
import { checkRuntimeConfig } from "../lib/tools/config-check";
import { generateVoiceoverForTask } from "../lib/tools/voiceover-generator";
import { generateSubtitlesForTask } from "../lib/tools/subtitle-generator";
import { generateAudioForTask, generateMockAudioForTask } from "../lib/tools/audio-generator";
import { burnSubtitlesForTask } from "../lib/tools/subtitle-burner";
import { analyzeSourceVideoForTask } from "../lib/tools/source-video-analyzer";
import { extractFramesForTask } from "../lib/tools/frame-extractor";
import { exportCoverForTask } from "../lib/tools/cover-exporter";
import { generateOutputsManifestForTask } from "../lib/tools/output-manifest";
import { saveSourceNotesForTask } from "../lib/tools/source-input";
import { inspectTtsConfig, parseTtsProvider } from "../lib/api-clients/tts-client";
import { inspectKlingAuthConfig } from "../lib/api-clients/kling-client";
import type { RemakeStrength } from "../lib/types/common";
import type { TaskUserInputs } from "../lib/types/task";

const program = new Command();

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

type CliUserOptions = {
  targetPlatform?: string;
  duration?: string;
  style?: string;
  remakeStrength?: string;
  originalRemake?: string | boolean;
  textNotes?: string;
  transcript?: string;
  screenshotNotes?: string;
};

function buildUserInputs(options: CliUserOptions): Partial<TaskUserInputs> {
  const userInputs: Partial<TaskUserInputs> = {};
  if (options.targetPlatform !== undefined) userInputs.target_platform = options.targetPlatform;
  if (options.duration !== undefined) userInputs.duration = options.duration;
  if (options.style !== undefined) userInputs.style = options.style;
  if (options.remakeStrength !== undefined) userInputs.remake_strength = options.remakeStrength as RemakeStrength;
  if (options.originalRemake !== undefined) userInputs.is_original_remake = normalizeBoolean(options.originalRemake, true);
  if (options.textNotes !== undefined) userInputs.text_notes = options.textNotes;
  if (options.transcript !== undefined) userInputs.transcript = options.transcript;
  if (options.screenshotNotes !== undefined) userInputs.screenshot_notes = options.screenshotNotes;
  return userInputs;
}

function commonTaskOptions(command: Command, useDefaults: boolean): Command {
  const withDefaults = useDefaults
    ? command
        .option("--target-platform <platform>", "Target publishing platform", "douyin")
        .option("--duration <duration>", "Target video duration", "30s")
        .option("--style <style>", "Creative style", "clean, fast-paced, creator-style short video")
        .option("--remake-strength <strength>", "low | medium | high", "medium")
        .option("--original-remake <boolean>", "Whether output must be original remake", "true")
    : command
        .option("--target-platform <platform>", "Target publishing platform")
        .option("--duration <duration>", "Target video duration")
        .option("--style <style>", "Creative style")
        .option("--remake-strength <strength>", "low | medium | high")
        .option("--original-remake <boolean>", "Whether output must be original remake");

  return withDefaults
    .option("--text-notes <text>", "Supplementary copy or notes")
    .option("--transcript <text>", "Supplementary transcript")
    .option("--screenshot-notes <text>", "Supplementary screenshot description");
}

program
  .name("video-maker")
  .description("Short-video original-remake automation CLI")
  .version("2.0.0");

commonTaskOptions(
  program
    .command("init-task")
    .description("Create a task directory and task.json")
    .option("--url <url>", "Optional source URL")
    .option("--upload <path>", "Optional owned upload path"),
  true
).action(async (options) => {
  const task = await createTask({
    ...buildUserInputs(options),
    original_url: options.url,
    upload_path: options.upload
  });
  printJson(task);
});

program
  .command("resolve-link")
  .description("Safely parse an official short-video URL without downloading content")
  .requiredOption("--task <taskId>", "Task ID")
  .requiredOption("--url <url>", "URL or noisy share text")
  .action(async (options) => {
    const result = await resolveLinkForTask(options.task, options.url);
    printJson(result);
  });

program
  .command("parse-link")
  .description("Identify a source short-video link safely without downloading or bypassing platform limits")
  .requiredOption("--task <taskId>", "Task ID")
  .requiredOption("--url <url>", "Source URL or noisy share text")
  .action(async (options) => {
    printJson(await parseSourceLinkForTask(options.task, options.url));
  });

commonTaskOptions(
  program
    .command("ingest")
    .description("Ingest upload path and supplementary user materials")
    .requiredOption("--task <taskId>", "Task ID")
    .option("--upload <path>", "Owned upload path"),
  false
).action(async (options) => {
  const result = await ingestForTask(options.task, {
    ...buildUserInputs(options),
    upload: options.upload,
  });
  printJson(result);
});

program
  .command("analyze")
  .description("Generate mock original-video structure analysis")
  .requiredOption("--task <taskId>", "Task ID")
  .action(async (options) => {
    printJson(await analyzeForTask(options.task));
  });

program
  .command("storyboard")
  .description("Generate mock storyboard analysis")
  .requiredOption("--task <taskId>", "Task ID")
  .action(async (options) => {
    printJson(await generateStoryboardForTask(options.task));
  });

program
  .command("remake")
  .description("Generate original remake plan")
  .requiredOption("--task <taskId>", "Task ID")
  .action(async (options) => {
    printJson(await generateRemakePlanForTask(options.task));
  });

program
  .command("prompts")
  .description("Generate Kling and Seedance prompts")
  .requiredOption("--task <taskId>", "Task ID")
  .action(async (options) => {
    printJson(await generateVideoPromptsForTask(options.task));
  });

program
  .command("mock-assets")
  .description("Generate mock video asset manifest and local placeholder video clips")
  .requiredOption("--task <taskId>", "Task ID")
  .action(async (options) => {
    printJson(await generateMockAssetsForTask(options.task));
  });

program
  .command("generate-assets")
  .description("Generate local video assets for prompts. Supports guarded single-scene provider generation.")
  .requiredOption("--task <taskId>", "Task ID")
  .option("--provider <provider>", "mock | kling | luma | seedance", "mock")
  .option("--scene-limit <count>", "Maximum scenes to generate with a real provider", "1")
  .option("--force", "Regenerate provider assets instead of reusing existing successful assets", false)
  .action(async (options) => {
    printJson(
      await generateAssetsForTask({
        taskId: options.task,
        provider: parseAssetProvider(options.provider),
        sceneLimit: parsePositiveInteger(options.sceneLimit, 1),
        force: normalizeBoolean(options.force, false)
      })
    );
  });

program
  .command("kling-auth-check")
  .description("Check local Kling env and JWT structure without network requests or video generation")
  .action(async () => {
    printJson(await inspectKlingAuthConfig());
  });

program
  .command("config-check")
  .description("Print local LLM/video provider config status without showing keys or calling APIs")
  .action(async () => {
    printJson(await checkRuntimeConfig());
  });

program
  .command("tts-check")
  .description("Print local TTS provider config status without showing keys or calling APIs")
  .action(async () => {
    printJson(await inspectTtsConfig());
  });

program
  .command("review")
  .description("Run local Agent review cycle for storyboard/remake/video prompts without video generation")
  .requiredOption("--task <taskId>", "Task ID")
  .option("--apply", "Apply prompt suggestions to video_prompts.json after backing up the original file", false)
  .action(async (options) => {
    printJson(await reviewTask({
      taskId: options.task,
      apply: normalizeBoolean(options.apply, false)
    }));
  });

program
  .command("voiceover")
  .description("Generate local-rule voiceover_script.json without calling an LLM or TTS API")
  .requiredOption("--task <taskId>", "Task ID")
  .action(async (options) => {
    printJson(await generateVoiceoverForTask(options.task));
  });

program
  .command("subtitles")
  .description("Generate subtitles.json and assets/subtitles/subtitles.srt from voiceover_script.json")
  .requiredOption("--task <taskId>", "Task ID")
  .action(async (options) => {
    printJson(await generateSubtitlesForTask(options.task));
  });

program
  .command("audio")
  .description("Generate task audio with mock fallback. Volcengine is guarded by ENABLE_PAID_TTS_CALLS.")
  .requiredOption("--task <taskId>", "Task ID")
  .option("--provider <provider>", "mock | volcengine | openai | elevenlabs", "mock")
  .action(async (options) => {
    printJson(await generateAudioForTask({
      taskId: options.task,
      provider: parseTtsProvider(options.provider)
    }));
  });

program
  .command("prepare-audio")
  .description("Run voiceover, subtitles, and mock audio generation")
  .requiredOption("--task <taskId>", "Task ID")
  .action(async (options) => {
    const voiceover = await generateVoiceoverForTask(options.task);
    const subtitles = await generateSubtitlesForTask(options.task);
    const assets = await generateMockAudioForTask({ taskId: options.task, provider: "mock" });
    printJson({ voiceover, subtitles, assets });
  });

program
  .command("analyze-source")
  .description("Read uploaded source video metadata with ffprobe")
  .requiredOption("--task <taskId>", "Task ID")
  .action(async (options) => {
    printJson(await analyzeSourceVideoForTask(options.task));
  });

program
  .command("extract-frames")
  .description("Extract key frames from the uploaded source video")
  .requiredOption("--task <taskId>", "Task ID")
  .option("--max <count>", "Maximum frames to extract, capped at 8", "8")
  .action(async (options) => {
    printJson(await extractFramesForTask({
      taskId: options.task,
      maxFrames: parsePositiveInteger(options.max, 8)
    }));
  });

program
  .command("source-notes")
  .description("Save source transcript, caption, screenshot notes, and remake requirements into input.json")
  .requiredOption("--task <taskId>", "Task ID")
  .option("--source-transcript <text>", "Source transcript")
  .option("--source-caption <text>", "Source caption or copy")
  .option("--screenshot-notes <text>", "Visual notes")
  .option("--remake-requirements <text>", "Remake requirements")
  .action(async (options) => {
    printJson(await saveSourceNotesForTask({
      taskId: options.task,
      source_transcript: options.sourceTranscript,
      source_caption: options.sourceCaption,
      screenshot_notes: options.screenshotNotes,
      remake_requirements: options.remakeRequirements
    }));
  });

program
  .command("export-cover")
  .description("Export cover.jpg from final_subtitled.mp4 or final.mp4")
  .requiredOption("--task <taskId>", "Task ID")
  .action(async (options) => {
    printJson(await exportCoverForTask(options.task));
  });

program
  .command("outputs-manifest")
  .description("Generate outputs_manifest.json for final assets")
  .requiredOption("--task <taskId>", "Task ID")
  .action(async (options) => {
    printJson(await generateOutputsManifestForTask(options.task));
  });

program
  .command("export")
  .description("Export Markdown production package and JSON project package")
  .requiredOption("--task <taskId>", "Task ID")
  .action(async (options) => {
    const markdown = await exportMarkdownForTask(options.task);
    const json = await exportJsonForTask(options.task);
    printJson({ markdown, json });
  });

program
  .command("assemble")
  .description("Assemble a real MP4 from local mock placeholder assets using FFmpeg")
  .requiredOption("--task <taskId>", "Task ID")
  .action(async (options) => {
    printJson(await assembleVideoForTask(options.task));
  });

program
  .command("burn-subtitles")
  .description("Burn subtitles.srt into final.mp4 and write final_subtitled.mp4 without overwriting the original")
  .requiredOption("--task <taskId>", "Task ID")
  .option("--input <file>", "Input MP4 inside data/outputs/<task_id>", "final.mp4")
  .option("--output <file>", "Output MP4 inside data/outputs/<task_id>", "final_subtitled.mp4")
  .action(async (options) => {
    printJson(await burnSubtitlesForTask({
      taskId: options.task,
      input: options.input,
      output: options.output
    }));
  });

commonTaskOptions(
  program
    .command("run")
    .description("Run the full v0.1 mock pipeline")
    .requiredOption("--task <taskId>", "Task ID")
    .option("--url <url>", "Optional URL or noisy share text")
    .option("--upload <path>", "Optional owned upload path")
    .option("--assemble", "Also run mock assemble", false),
  false
).action(async (options) => {
  const task = await runFullMockPipeline(options.task, {
    ...buildUserInputs(options),
    url: options.url,
    upload: options.upload,
    assemble: options.assemble,
    export: true
  });
  printJson(task);
});

commonTaskOptions(
  program
    .command("run-full")
    .description("Run or resume the full pipeline with guarded provider asset generation")
    .option("--task <taskId>", "Existing task ID. Omit to create a new task.")
    .option("--url <url>", "Optional URL or noisy share text")
    .option("--upload <path>", "Optional owned upload path")
    .option("--provider <provider>", "mock | kling | luma | seedance", "mock")
    .option("--scene-limit <count>", "Maximum real-provider scenes to generate", "3")
    .option("--assemble", "Assemble final.mp4 after asset generation", false)
    .option("--export", "Export Markdown and JSON packages after assembly", false)
    .option("--force", "Rerun completed steps and regenerate provider assets", false)
    .option("--resume <boolean>", "Skip completed artifacts when true", "true")
    .option("--review", "Run Agent review after prompt generation", false)
    .option("--review-apply", "Apply review prompt suggestions before asset generation", false)
    .option("--prepare-audio", "Generate voiceover_script.json, subtitles.json, SRT, and mock audio before assembly", false)
    .option("--dry-run", "Preview steps without creating tasks, writing files, or calling provider APIs", false),
  false
).action(async (options) => {
  printJson(
    await runFullPipeline({
      ...buildUserInputs(options),
      taskId: options.task,
      url: options.url,
      upload: options.upload,
      provider: parseAssetProvider(options.provider),
      sceneLimit: parsePositiveInteger(options.sceneLimit, 3),
      assemble: normalizeBoolean(options.assemble, false),
      export: normalizeBoolean(options.export, false),
      force: normalizeBoolean(options.force, false),
      resume: normalizeBoolean(options.resume, true),
      review: normalizeBoolean(options.review, false),
      reviewApply: normalizeBoolean(options.reviewApply, false),
      prepareAudio: normalizeBoolean(options.prepareAudio, false),
      dryRun: normalizeBoolean(options.dryRun, false)
    })
  );
});

program
  .command("show")
  .description("Print task.json")
  .requiredOption("--task <taskId>", "Task ID")
  .action(async (options) => {
    printJson(await getTask(options.task));
  });

program
  .command("clear-errors")
  .description("Back up and clear task.json/assets.json historical error logs without deleting outputs or videos")
  .requiredOption("--task <taskId>", "Task ID")
  .action(async (options) => {
    printJson(await clearTaskErrors(options.task));
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
