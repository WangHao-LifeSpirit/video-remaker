import { readFile } from "node:fs/promises";
import path from "node:path";
import type { VideoAnalysis } from "../types/analysis";
import type { VideoInputArtifact } from "../types/input";
import type { SourceFramesArtifact } from "../types/source-frames";
import type { SourceVideoMetadata } from "../types/source-video";
import { createErrorRecord, fallbackMockMeta, mockMeta, realMeta } from "../types/common";
import {
  analyzeSchema,
  buildAnalyzePrompt,
  isAnalysisModelOutput
} from "../prompts/analyze";
import {
  generateLLMStructuredJson,
  getLlmMode,
  loadDotEnvOnce,
  type StructuredOutputImage
} from "../api-clients/llm-client";
import { getTask, readTaskArtifact, resolveProjectPath, saveTask, setTaskStatus, writeTaskArtifact } from "./task-store";
import { analyzeSourceVideoForTask } from "./source-video-analyzer";
import { extractFramesForTask } from "./frame-extractor";

const DEFAULT_MAX_ANALYSIS_FRAMES = 6;

async function prepareUploadedSource(taskId: string, sourceInput: VideoInputArtifact): Promise<{
  sourceVideo?: SourceVideoMetadata;
  preparationErrors: VideoAnalysis["errors"];
}> {
  const uploadedPath = sourceInput.uploaded_video?.uploaded_video_path ?? sourceInput.source.upload_path;
  if (!uploadedPath) {
    return { preparationErrors: [] };
  }

  const preparationErrors: VideoAnalysis["errors"] = [];
  let sourceVideo: SourceVideoMetadata | undefined;
  try {
    sourceVideo = await readTaskArtifact<SourceVideoMetadata>(taskId, "source_video.json");
  } catch {
    // Generated below.
  }

  try {
    if (!sourceVideo || sourceVideo.status !== "success" || sourceVideo.uploaded_video_path !== uploadedPath) {
      sourceVideo = await analyzeSourceVideoForTask(taskId);
    }
    if (sourceVideo.status === "success") {
      let frames: SourceFramesArtifact | undefined;
      try {
        frames = await readTaskArtifact<SourceFramesArtifact>(taskId, "source_frames.json");
      } catch {
        // Generated below.
      }
      if (!frames || frames.status !== "success" || frames.source_video_path !== uploadedPath || frames.frames.length === 0) {
        await extractFramesForTask({ taskId, maxFrames: 8 });
      }
    }
  } catch (error) {
    preparationErrors.push(
      createErrorRecord({
        step: "analyze",
        message: `Uploaded video preprocessing failed; continuing with text-only material. Reason: ${
          error instanceof Error ? error.message : String(error)
        }`,
        code: "SOURCE_PREPROCESS_FAILED",
        recoverable: true
      })
    );
  }

  return { sourceVideo, preparationErrors };
}

function mimeForFrame(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

/**
 * Loads up to MAX_ANALYSIS_FRAMES extracted source frames as base64 data URLs so
 * the analyze step can be sent to a vision model. Missing frames / missing
 * source_frames.json simply yield an empty list (text-only analysis fallback).
 */
async function loadSourceFrameImages(taskId: string): Promise<StructuredOutputImage[]> {
  let manifest: SourceFramesArtifact;
  try {
    manifest = await readTaskArtifact<SourceFramesArtifact>(taskId, "source_frames.json");
  } catch {
    return [];
  }
  const frames = Array.isArray(manifest.frames) ? manifest.frames : [];
  if (frames.length === 0) return [];

  const maxFrames = (() => {
    const parsed = Number(process.env.MAX_ANALYSIS_FRAMES);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_ANALYSIS_FRAMES;
  })();

  // Evenly sample across the timeline when there are more frames than the cap.
  const step = Math.max(1, Math.ceil(frames.length / maxFrames));
  const sampled = frames.filter((_, index) => index % step === 0).slice(0, maxFrames);

  const images: StructuredOutputImage[] = [];
  for (const frame of sampled) {
    if (!frame.file_path) continue;
    try {
      const bytes = await readFile(resolveProjectPath(frame.file_path));
      images.push({
        dataUrl: `data:${mimeForFrame(frame.file_path)};base64,${bytes.toString("base64")}`
      });
    } catch {
      // Skip unreadable frames; remaining frames still help.
    }
  }
  return images;
}

function compactText(value?: string, fallback = "未提供明确文本"): string {
  const text = (value ?? "").trim().replace(/\s+/g, " ");
  return text ? text.slice(0, 120) : fallback;
}

function hasDescriptiveSourceText(task: Awaited<ReturnType<typeof getTask>>, input: VideoInputArtifact): boolean {
  return [
    input.source_transcript,
    input.source_caption,
    input.screenshot_notes,
    input.remake_requirements,
    task.user_inputs.transcript,
    task.user_inputs.text_notes,
    task.user_inputs.screenshot_notes
  ].some((value) => Boolean(value?.trim()));
}

function buildMockAnalysis(input: {
  taskId: string;
  task: Awaited<ReturnType<typeof getTask>>;
  sourceInput: VideoInputArtifact;
  fallbackReason?: string;
  errors?: VideoAnalysis["errors"];
}): VideoAnalysis {
  const { task, sourceInput } = input;
  const notes = compactText(task.user_inputs.text_notes || task.user_inputs.transcript || task.user_inputs.screenshot_notes);
  const platform = task.source.platform ?? "unknown";
  return {
    task_id: input.taskId,
    status: "mocked",
    mock: input.fallbackReason
      ? fallbackMockMeta(input.fallbackReason, "LLM multimodal analysis")
      : mockMeta("LLM multimodal analysis"),
    source_summary: {
      platform,
      available_materials: sourceInput.available_materials,
      missing_materials: sourceInput.missing_materials
    },
    topic: {
      title_guess: task.source.content_id ? `基于 ${platform} 内容 ${task.source.content_id} 的结构学习` : "基于用户材料的短视频结构学习",
      content_theme: `围绕「${notes}」提炼可原创改编的主题`,
      audience: `目标平台 ${task.user_inputs.target_platform} 的短视频浏览用户`,
      core_message: "保留原视频的节奏和信息推进方式，但替换表达、素材、脚本和具体观点。"
    },
    structure: {
      total_duration_estimate: task.user_inputs.duration,
      opening_hook: "前 3 秒给出反常识、强结果或明确痛点，快速建立继续观看理由。",
      development: "中段用 2-3 个连续信息点推进，保持字幕短句和镜头变化。",
      climax_or_turning_point: "在 60%-75% 位置放置关键转折、证明或最强观点。",
      ending: "结尾给出总结、行动提示或可评论的问题，避免照搬原视频话术。"
    },
    viral_points: [
      "开头先抛结果或冲突，减少铺垫。",
      "每个镜头只承载一个信息点，便于快速理解。",
      "用可复用结构学习节奏，不复制原素材和原文案。"
    ],
    pacing: {
      rhythm: "快节奏，镜头与字幕保持 2-4 秒一次信息更新。",
      hook_timing: "0-3 秒完成钩子，5-8 秒给出第一个有效信息。",
      subtitle_density: "中高密度，短句、关键词突出。",
      visual_density: "中高密度，画面变化服务信息递进。"
    },
    visual_style: {
      shot_types: "未提供画面，无法确认；建议以特写与中近景交替的竖屏短视频常见景别为参考。",
      composition: "竖屏 9:16，主体居中或三分法构图。",
      color_tone: "平台原生、高对比、明快色调。",
      lighting: "明亮、均匀，主体清晰。",
      camera_movement: "轻微推拉或快速剪辑，服务信息递进。",
      text_overlay_style: "底部短句字幕，关键词突出。",
      subject: `围绕「${notes}」的主体对象。`
    },
    shot_breakdown: [],
    risk_notes: [
      "此结果为 mock 分析，不代表已真实获取原视频字幕、关键帧或音频。",
      "后续生成必须保持原创表达，不搬运原片素材。"
    ],
    errors: input.errors ?? []
  };
}

export async function analyzeForTask(taskId: string): Promise<VideoAnalysis> {
  let task = await getTask(taskId);
  const input = await readTaskArtifact<VideoInputArtifact>(taskId, "input.json");

  if (input.available_materials.length === 0) {
    const error = createErrorRecord({
      step: "analyze",
      message: "No usable URL, upload, transcript, copy, or screenshot notes are available for analysis.",
      code: "ANALYSIS_NEEDS_INPUT",
      recoverable: true
    });
    const failed: VideoAnalysis = {
      task_id: taskId,
      status: "needs_user_input",
      mock: mockMeta("OpenAI vision/audio/text analysis"),
      source_summary: {
        platform: task.source.platform,
        available_materials: [],
        missing_materials: input.missing_materials
      },
      topic: {
        title_guess: "待补充原视频信息",
        content_theme: "待补充",
        audience: "待补充",
        core_message: "需要用户补充视频、字幕、文案或截图描述。"
      },
      structure: {
        total_duration_estimate: task.user_inputs.duration,
        opening_hook: "待补充",
        development: "待补充",
        climax_or_turning_point: "待补充",
        ending: "待补充"
      },
      viral_points: [],
      pacing: {
        rhythm: "待补充",
        hook_timing: "待补充",
        subtitle_density: "待补充",
        visual_density: "待补充"
      },
      risk_notes: ["当前没有可用材料可供分析；系统不会下载平台视频或假装已经理解原片。"],
      errors: [error]
    };
    const { relativePath } = await writeTaskArtifact(taskId, "analysis.json", failed);
    task.files.analysis_json = relativePath;
    task.errors.push(error);
    setTaskStatus(task, "needs_user_input", "analyze");
    await saveTask(task);
    return failed;
  }

  const { sourceVideo, preparationErrors } = await prepareUploadedSource(taskId, input);
  task = await getTask(taskId);
  await loadDotEnvOnce();
  const frameImages = await loadSourceFrameImages(taskId);
  const visionCanSeeFrames = getLlmMode() === "real" && Boolean(process.env.OPENAI_API_KEY) && frameImages.length > 0;
  if (!visionCanSeeFrames && !hasDescriptiveSourceText(task, input) && (
    input.uploaded_video?.uploaded_video_path || input.source.upload_path
  )) {
    const error = createErrorRecord({
      step: "analyze",
      message: "原视频已上传并抽取关键帧，但当前 LLM 无法直接查看画面，且没有字幕、文案或画面说明。为避免生成不相关内容，流程已暂停。",
      code: "VISION_OR_SOURCE_TEXT_REQUIRED",
      recoverable: true
    });
    const analysis: VideoAnalysis = {
      ...buildMockAnalysis({
        taskId,
        task,
        sourceInput: input,
        fallbackReason: error.message,
        errors: [...preparationErrors, error]
      }),
      status: "needs_user_input",
      risk_notes: [
        "当前分析没有直接读取关键帧画面，不能据此生成与原视频高度相关的分镜。",
        "请补充原字幕、原文案或画面说明；也可以配置 OpenAI 视觉能力后重新分析。"
      ]
    };
    const { relativePath } = await writeTaskArtifact(taskId, "analysis.json", analysis);
    task.files.analysis_json = relativePath;
    task.errors.push(error);
    setTaskStatus(task, "needs_user_input", "analyze");
    await saveTask(task);
    return analysis;
  }
  const prompt = buildAnalyzePrompt(task, input, {
    visionCanSeeFrames,
    extractedFrameCount: frameImages.length,
    sourceVideo
  });
  const result = await generateLLMStructuredJson({
    step: "analyze",
    schemaName: "analysis",
    schema: analyzeSchema,
    systemPrompt: prompt.systemPrompt,
    userPrompt: prompt.userPrompt,
    validate: isAnalysisModelOutput,
    images: visionCanSeeFrames ? frameImages : undefined,
    visionPreferred: visionCanSeeFrames
  });

  const errors = [
    ...preparationErrors,
    ...(result.mode === "mock" && result.error ? [result.error] : [])
  ];
  const analysis: VideoAnalysis = result.mode === "real"
    ? {
        task_id: taskId,
        status: "success",
        mock: realMeta("LLM structured analysis", result.provider),
        source_summary: {
          platform: task.source.platform ?? "unknown",
          available_materials: input.available_materials,
          missing_materials: input.missing_materials
        },
        ...result.data,
        risk_notes: [
          ...result.data.risk_notes,
          ...(!visionCanSeeFrames && frameImages.length > 0
            ? ["关键帧已抽取，但当前没有可用的 OpenAI 视觉配置；本次没有直接读取关键帧画面。"]
            : [])
        ],
        errors
      }
    : buildMockAnalysis({
        taskId,
        task,
        sourceInput: input,
        fallbackReason: result.fallbackReason,
        errors
      });

  const { relativePath } = await writeTaskArtifact(taskId, "analysis.json", analysis);
  task.files.analysis_json = relativePath;
  task.errors.push(...errors);
  setTaskStatus(task, analysis.status, "analyze");
  await saveTask(task);
  return analysis;
}
