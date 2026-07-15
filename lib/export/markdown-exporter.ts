import path from "node:path";
import type { VideoAnalysis } from "../types/analysis";
import type { AssetsManifest } from "../types/assets";
import type { RemakePlan } from "../types/remake-plan";
import type { StoryboardAnalysis } from "../types/storyboard";
import type { VideoPrompts } from "../types/video-prompts";
import {
  getTask,
  getTaskOutputsDir,
  readTaskArtifact,
  saveTask,
  toProjectRelativePath,
  writeTextFile
} from "../tools/task-store";

function list(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- 无";
}

export async function exportMarkdownForTask(taskId: string): Promise<string> {
  const task = await getTask(taskId);
  const analysis = await readTaskArtifact<VideoAnalysis>(taskId, "analysis.json");
  const storyboard = await readTaskArtifact<StoryboardAnalysis>(taskId, "storyboard.json");
  const remake = await readTaskArtifact<RemakePlan>(taskId, "remake_plan.json");
  const prompts = await readTaskArtifact<VideoPrompts>(taskId, "video_prompts.json");
  const assets = await readTaskArtifact<AssetsManifest>(taskId, "assets.json");
  const realLlmProviders = Array.from(
    new Set([analysis.mock, storyboard.mock, remake.mock, prompts.mock].map((mock) => mock.provider).filter(Boolean))
  );
  const videoAssets = assets.assets.filter((asset) => asset.type === "mock_video");
  const realVideoProviders = Array.from(
    new Set(videoAssets.filter((asset) => asset.provider !== "mock").map((asset) => asset.provider))
  );
  const mockVideoCount = videoAssets.filter((asset) => asset.provider === "mock").length;
  const providerNote = `LLM：${realLlmProviders.length ? realLlmProviders.join(", ") : "mock"}；视频片段：${
    realVideoProviders.length ? realVideoProviders.join(", ") : "无真实 provider"
  }；Mock 占位片段：${mockVideoCount} 个。`;

  const content = `# 短视频原创改编制作包

> 任务 ID：${task.task_id}
> Provider 标记：${providerNote}
> 真实性：${assets.mock.is_mock ? "当前含 Mock 占位素材，只能作为流程预览。" : "当前素材清单未标记 Mock 占位片段。"}

## 1. 原视频信息
- 输入类型：${task.source.input_type}
- 平台：${task.source.platform ?? "unknown"}
- 原始链接：${task.source.original_url ?? "未提供"}
- 解析链接：${task.source.final_url ?? "未解析"}
- 内容 ID：${task.source.content_id ?? "未识别"}
- 上传文件：${task.source.upload_path ?? "未提供"}

## 2. 内容主题判断
- 标题判断：${analysis.topic.title_guess}
- 主题：${analysis.topic.content_theme}
- 受众：${analysis.topic.audience}
- 核心信息：${analysis.topic.core_message}

## 3. 爆点拆解
${list(analysis.viral_points)}

## 4. 原视频结构
- 开头：${analysis.structure.opening_hook}
- 发展：${analysis.structure.development}
- 转折/爆点：${analysis.structure.climax_or_turning_point}
- 结尾：${analysis.structure.ending}

## 5. 原视频分镜拆解
${storyboard.original_storyboard
  .map(
    (scene) =>
      `- ${scene.scene_id} ${scene.time_range}｜${scene.shot_type}｜${scene.visual_description}｜目的：${scene.purpose}`
  )
  .join("\n")}

## 6. 原创改编方向
- 标题：${remake.new_concept.title}
- 主题：${remake.new_concept.theme}
- 角度：${remake.new_concept.angle}
- 原创规则：${remake.remake_strategy.originality_rule}

## 7. 新口播脚本
${remake.new_script.map((item) => `### ${item.section}\n${item.narration}\n\n字幕：${item.caption}`).join("\n\n")}

## 8. 新分镜表
${remake.new_storyboard
  .map(
    (scene) =>
      `- ${scene.scene_id}｜${scene.duration}｜画面：${scene.visual}｜动作：${scene.action}｜素材：${scene.asset_needed}`
  )
  .join("\n")}

## 9. Kling prompt
${prompts.prompts
  .filter((prompt) => prompt.provider === "kling")
  .map((prompt) => `### ${prompt.scene_id}\n${prompt.prompt}`)
  .join("\n\n")}

## 10. Seedance prompt
${prompts.prompts
  .filter((prompt) => prompt.provider === "seedance")
  .map((prompt) => `### ${prompt.scene_id}\n${prompt.prompt}`)
  .join("\n\n")}

## 11. 素材清单
${assets.assets.map((asset) => `- ${asset.asset_id}｜${asset.type}｜${asset.description}`).join("\n")}

## 12. 剪辑时间轴
${assets.timeline
  .map((item) => `- ${item.start}-${item.end}｜${item.scene_id}｜字幕：${item.subtitle}`)
  .join("\n")}

## 13. 字幕稿
${assets.timeline.map((item) => `- ${item.subtitle}`).join("\n")}

## 14. 配音稿
${assets.timeline.map((item) => `- ${item.narration}`).join("\n")}

## 15. 封面标题
${list(remake.cover_titles)}

## 16. 发布文案
${remake.publish_copy}

## 17. 下一步执行清单
- 人工确认原视频材料来源和授权边界。
- 用真实素材替换 mock assets。
- 配置 API Key 后再切换真实 OpenAI / 视频生成 / TTS / ASR。
- 如需发布，先替换 mock 视频片段、真实配音和授权 BGM，再重新 assemble。

## 18. 风险提示
${list([...analysis.risk_notes, ...remake.risk_notes, ...remake.quality_check.suggestions])}
`;

  const outputDir = getTaskOutputsDir(taskId);
  const outputPath = path.join(outputDir, "production-package.md");
  await writeTextFile(outputPath, content);
  task.export_paths.markdown = toProjectRelativePath(outputPath);
  task.current_step = "export-markdown";
  await saveTask(task);
  return task.export_paths.markdown;
}
