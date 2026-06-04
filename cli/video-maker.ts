#!/usr/bin/env node
import { Command } from "commander";
import { generateRemakePlanForTask } from "../lib/agents/content-creator-agent";
import { runFullMockPipeline } from "../lib/agents/orchestrator";
import { generateStoryboardForTask } from "../lib/agents/storyboard-agent";
import { exportJsonForTask } from "../lib/export/json-exporter";
import { exportMarkdownForTask } from "../lib/export/markdown-exporter";
import { createTask, getTask } from "../lib/tools/task-store";
import { resolveLinkForTask } from "../lib/tools/link-resolver";
import { ingestForTask } from "../lib/tools/video-ingest";
import { analyzeForTask } from "../lib/tools/video-analyzer";
import { generateVideoPromptsForTask } from "../lib/tools/prompt-generator";
import { generateAssetsForTask, generateMockAssetsForTask } from "../lib/tools/asset-generator";
import { assembleVideoForTask } from "../lib/tools/video-assembler";
import { normalizeBoolean, parseAssetProvider, parsePositiveInteger, runFullPipeline } from "../lib/tools/run-full";
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
  .version("0.1.0");

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

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
