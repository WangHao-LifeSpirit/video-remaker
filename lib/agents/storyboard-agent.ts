import type { VideoAnalysis } from "../types/analysis";
import type { StoryboardAnalysis } from "../types/storyboard";
import { fallbackMockMeta, mockMeta, realMeta } from "../types/common";
import {
  buildStoryboardPrompt,
  isStoryboardModelOutput,
  storyboardSchema
} from "../prompts/storyboard";
import { generateLLMStructuredJson } from "../api-clients/llm-client";
import { getTask, readTaskArtifact, saveTask, setTaskStatus, writeTaskArtifact } from "../tools/task-store";

function targetDurationSeconds(value: string): number {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(?:s|秒)?$/i);
  const parsed = match ? Number(match[1]) : 30;
  return Number.isFinite(parsed) ? Math.min(180, Math.max(4, parsed)) : 30;
}

function formatSecond(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function mockSceneRanges(durationValue: string): string[] {
  const total = targetDurationSeconds(durationValue);
  const boundaries = [0, total * 0.15, total * 0.4, total * 0.75, total];
  return boundaries.slice(0, -1).map(
    (start, index) => `${formatSecond(start)}-${formatSecond(boundaries[index + 1])}s`
  );
}

function buildMockStoryboard(input: {
  taskId: string;
  analysis: VideoAnalysis;
  fallbackReason?: string;
  errors?: StoryboardAnalysis["errors"];
}): StoryboardAnalysis {
  const { analysis } = input;
  const ranges = mockSceneRanges(analysis.structure.total_duration_estimate);
  const scenes = [
    {
      scene_id: "s1",
      time_range: ranges[0],
      shot_type: "hook close-up / bold text",
      visual_description: analysis.structure.opening_hook,
      narration_or_caption: "先给用户一个必须继续看的结果或冲突。",
      purpose: "建立观看理由",
      pacing_note: "快速切入，不做长铺垫。"
    },
    {
      scene_id: "s2",
      time_range: ranges[1],
      shot_type: "medium shot / evidence insert",
      visual_description: analysis.structure.development,
      narration_or_caption: "提出第一个支撑点，并用画面或字幕解释。",
      purpose: "开始信息推进",
      pacing_note: "2-3 秒一组短句，避免信息堆积。"
    },
    {
      scene_id: "s3",
      time_range: ranges[2],
      shot_type: "sequence / comparison / demo",
      visual_description: analysis.structure.climax_or_turning_point,
      narration_or_caption: "展示最强观点、转折或关键证明。",
      purpose: "制造爆点和记忆点",
      pacing_note: "提高镜头密度，字幕突出关键词。"
    },
    {
      scene_id: "s4",
      time_range: ranges[3],
      shot_type: "summary shot / CTA",
      visual_description: analysis.structure.ending,
      narration_or_caption: "总结新观点，并给出评论或行动入口。",
      purpose: "收束并提高互动",
      pacing_note: "结尾短促，留下清晰动作。"
    }
  ];

  return {
    task_id: input.taskId,
    status: "mocked",
    mock: input.fallbackReason
      ? fallbackMockMeta(input.fallbackReason, "LLM storyboard decomposition")
      : mockMeta("LLM storyboard decomposition"),
    original_storyboard: scenes,
    rhythm_analysis: analysis.pacing.rhythm,
    visual_language: "以结构学习为主：开头强钩子，中段信息递进，后段转折/证明，结尾收束互动。",
    bgm_and_sound_notes: "当前流程不识别原片 BGM，仅建议使用低侵权、可授权的节奏型背景音乐。",
    subtitle_style_notes: analysis.pacing.subtitle_density,
    errors: input.errors ?? []
  };
}

export async function generateStoryboardForTask(taskId: string): Promise<StoryboardAnalysis> {
  const task = await getTask(taskId);
  const analysis = await readTaskArtifact<VideoAnalysis>(taskId, "analysis.json");
  const prompt = buildStoryboardPrompt(task, analysis);
  const result = await generateLLMStructuredJson({
    step: "storyboard",
    schemaName: "storyboard",
    schema: storyboardSchema,
    systemPrompt: prompt.systemPrompt,
    userPrompt: prompt.userPrompt,
    validate: isStoryboardModelOutput
  });

  const errors = result.mode === "mock" && result.error ? [result.error] : [];
  const storyboard: StoryboardAnalysis = result.mode === "real"
    ? {
        task_id: taskId,
        status: "success",
        mock: realMeta("LLM storyboard decomposition", result.provider),
        ...result.data,
        errors: []
      }
    : buildMockStoryboard({
        taskId,
        analysis,
        fallbackReason: result.fallbackReason,
        errors
      });

  const { relativePath } = await writeTaskArtifact(taskId, "storyboard.json", storyboard);
  task.files.storyboard_json = relativePath;
  task.errors.push(...errors);
  setTaskStatus(task, storyboard.status, "storyboard");
  await saveTask(task);
  return storyboard;
}
