import type { VideoAnalysis } from "../types/analysis";
import type { RemakePlan } from "../types/remake-plan";
import type { StoryboardAnalysis } from "../types/storyboard";
import { fallbackMockMeta, mockMeta, realMeta } from "../types/common";
import { buildRemakePrompt, isRemakeModelOutput, remakeSchema } from "../prompts/remake";
import { generateLLMStructuredJson } from "../api-clients/llm-client";
import { getTask, readTaskArtifact, saveTask, setTaskStatus, writeTaskArtifact } from "../tools/task-store";
import { evaluateRemakeQuality } from "./quality-check-agent";

function buildMockRemakePlan(input: {
  taskId: string;
  task: Awaited<ReturnType<typeof getTask>>;
  analysis: VideoAnalysis;
  storyboard: StoryboardAnalysis;
  fallbackReason?: string;
  errors?: RemakePlan["errors"];
}): RemakePlan {
  const { task, analysis, storyboard } = input;
  const theme = analysis.topic.content_theme;

  const newStoryboard = storyboard.original_storyboard.map((scene, index) => ({
    scene_id: scene.scene_id,
    duration: scene.time_range,
    visual: `原创画面 ${index + 1}：围绕新主题重新设计，不使用原视频素材。`,
    action: scene.purpose,
    narration: `用新的案例和表达完成「${scene.purpose}」。`,
    caption: index === 0 ? "先给结论，再解释为什么" : "用新素材承接上一镜头的信息",
    asset_needed: `mock_${scene.scene_id}_video_clip`
  }));

  const script = [
    {
      section: "开头",
      narration: `如果你也在做 ${task.user_inputs.target_platform} 内容，先别急着照搬爆款。真正要复刻的是结构，不是原话。`,
      caption: "复刻结构，不复刻原话",
      visual_direction: "人物或产品近景，叠加大字标题。"
    },
    {
      section: "展开",
      narration: `这个视频的有效结构是：先抛结果，再连续给理由，最后用一个转折把观点钉住。`,
      caption: "结果 → 理由 → 转折",
      visual_direction: "用三段式画面或列表动画展示结构。"
    },
    {
      section: "转折",
      narration: `所以我们的改编会换成自己的主题、案例和素材，只保留节奏推进方式。`,
      caption: "素材和表达全部原创",
      visual_direction: "展示新脚本片段、素材清单或场景草图。"
    },
    {
      section: "结尾",
      narration: "最后得到的是一条同款节奏、原创内容的短视频制作方案。",
      caption: "同款节奏，原创内容",
      visual_direction: "收束到封面标题和发布文案。"
    }
  ];

  const draft: Omit<RemakePlan, "quality_check"> = {
    task_id: input.taskId,
    status: "mocked",
    mock: input.fallbackReason
      ? fallbackMockMeta(input.fallbackReason, "LLM content creation")
      : mockMeta("LLM content creation"),
    remake_strategy: {
      target_platform: task.user_inputs.target_platform,
      duration: task.user_inputs.duration,
      style: task.user_inputs.style,
      remake_strength: task.user_inputs.remake_strength,
      originality_rule: "只复刻结构、节奏、信息推进方式；脚本、素材、案例、表达和封面文案必须原创。"
    },
    new_concept: {
      title: "同款结构的原创短视频方案",
      theme,
      angle: "把爆款结构转译成自己的主题，而不是复制原视频内容。",
      audience: analysis.topic.audience
    },
    new_script: script,
    new_storyboard: newStoryboard,
    cover_titles: ["别再搬运爆款了", "爆款结构这样安全复刻", "同款节奏，原创内容"],
    publish_copy: "这条视频拆的是结构，不是搬运内容。用同款节奏做原创表达，才是真正可持续的短视频生产方式。",
    risk_notes: [
      "高复刻强度只代表结构接近，不代表文案、素材或观点可相似。",
      "发布前需要人工确认素材授权和平台规则。"
    ],
    errors: input.errors ?? []
  };

  return {
    ...draft,
    quality_check: evaluateRemakeQuality({
      planDraft: draft,
      userInputs: task.user_inputs
    })
  };
}

export async function generateRemakePlanForTask(taskId: string): Promise<RemakePlan> {
  const task = await getTask(taskId);
  const analysis = await readTaskArtifact<VideoAnalysis>(taskId, "analysis.json");
  const storyboard = await readTaskArtifact<StoryboardAnalysis>(taskId, "storyboard.json");
  const prompt = buildRemakePrompt(task, analysis, storyboard);
  const result = await generateLLMStructuredJson({
    step: "remake",
    schemaName: "remake_plan",
    schema: remakeSchema,
    systemPrompt: prompt.systemPrompt,
    userPrompt: prompt.userPrompt,
    validate: isRemakeModelOutput
  });

  const errors = result.mode === "mock" && result.error ? [result.error] : [];
  const remakePlan: RemakePlan = result.mode === "real"
    ? {
        task_id: taskId,
        status: "success",
        mock: realMeta("LLM content creation", result.provider),
        remake_strategy: {
          target_platform: task.user_inputs.target_platform,
          duration: task.user_inputs.duration,
          style: task.user_inputs.style,
          remake_strength: task.user_inputs.remake_strength,
          originality_rule: "只复刻结构、节奏、信息推进方式；脚本、素材、案例、表达和封面文案必须原创。"
        },
        ...result.data,
        errors: []
      }
    : buildMockRemakePlan({
        taskId,
        task,
        analysis,
        storyboard,
        fallbackReason: result.fallbackReason,
        errors
      });

  const { relativePath } = await writeTaskArtifact(taskId, "remake_plan.json", remakePlan);
  task.files.remake_plan_json = relativePath;
  task.errors.push(...errors);
  setTaskStatus(task, remakePlan.status, "remake");
  await saveTask(task);
  return remakePlan;
}
