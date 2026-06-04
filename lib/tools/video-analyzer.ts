import type { VideoAnalysis } from "../types/analysis";
import type { VideoInputArtifact } from "../types/input";
import { createErrorRecord, fallbackMockMeta, mockMeta, realMeta } from "../types/common";
import {
  analyzeSchema,
  buildAnalyzePrompt,
  isAnalysisModelOutput
} from "../prompts/analyze";
import { generateLLMStructuredJson } from "../api-clients/llm-client";
import { getTask, readTaskArtifact, saveTask, setTaskStatus, writeTaskArtifact } from "./task-store";

function compactText(value?: string, fallback = "未提供明确文本"): string {
  const text = (value ?? "").trim().replace(/\s+/g, " ");
  return text ? text.slice(0, 120) : fallback;
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
    risk_notes: [
      "此结果为 mock 分析，不代表已真实获取原视频字幕、关键帧或音频。",
      "后续生成必须保持原创表达，不搬运原片素材。"
    ],
    errors: input.errors ?? []
  };
}

export async function analyzeForTask(taskId: string): Promise<VideoAnalysis> {
  const task = await getTask(taskId);
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
      risk_notes: ["v0.1 没有真实读取平台视频，只基于用户提供材料和链接元信息生成 mock 分析。"],
      errors: [error]
    };
    const { relativePath } = await writeTaskArtifact(taskId, "analysis.json", failed);
    task.files.analysis_json = relativePath;
    task.errors.push(error);
    setTaskStatus(task, "needs_user_input", "analyze");
    await saveTask(task);
    return failed;
  }

  const prompt = buildAnalyzePrompt(task, input);
  const result = await generateLLMStructuredJson({
    step: "analyze",
    schemaName: "analysis",
    schema: analyzeSchema,
    systemPrompt: prompt.systemPrompt,
    userPrompt: prompt.userPrompt,
    validate: isAnalysisModelOutput
  });

  const errors = result.mode === "mock" && result.error ? [result.error] : [];
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
        errors: []
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
