import { stat } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { AudioSubtitleActions } from "../../../components/audio-subtitle-actions";
import { ClearErrorsButton } from "../../../components/clear-errors-button";
import { OutputAssetActions } from "../../../components/output-asset-actions";
import { ReviewActions } from "../../../components/review-actions";
import { RunFullPanel } from "../../../components/run-full-panel";
import { SourceMaterialActions } from "../../../components/source-material-actions";
import { VideoPreview } from "../../../components/video-preview";
import { listJobsForTask, type RunFullJob } from "../../../lib/tools/job-store";
import { getRunFullRuntimeStatus } from "../../../lib/tools/run-full";
import { getTask, getTaskDir, getTaskOutputsDir, readJsonFile } from "../../../lib/tools/task-store";
import type { ErrorRecord } from "../../../lib/types/common";
import type { AssetsManifest } from "../../../lib/types/assets";
import type { VoiceoverScript } from "../../../lib/types/audio";
import type { VideoInputArtifact } from "../../../lib/types/input";
import type { OutputsManifest } from "../../../lib/types/outputs-manifest";
import type { ReviewReport } from "../../../lib/types/review";
import type { SourceFramesArtifact } from "../../../lib/types/source-frames";
import type { SourceLinkInfo } from "../../../lib/types/source-link";
import type { SourceVideoMetadata } from "../../../lib/types/source-video";
import type { SubtitlePackage } from "../../../lib/types/subtitles";

async function optionalArtifact<T>(filePath?: string): Promise<T | null> {
  if (!filePath) {
    return null;
  }
  try {
    return await readJsonFile<T>(filePath);
  } catch {
    return null;
  }
}

type HistoricalError = ErrorRecord & {
  source: "task.json" | "assets.json";
};

function HistoricalErrorLog({
  taskId,
  errors
}: {
  taskId: string;
  errors: HistoricalError[];
}) {
  return (
    <details className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
      <summary className="cursor-pointer font-medium text-neutral-800">
        历史调试错误日志（共 {errors.length} 条历史错误）
      </summary>
      <div className="mt-3 grid gap-3">
        <ClearErrorsButton taskId={taskId} disabled={!errors.length} />
        {errors.length ? (
          <div className="grid max-h-72 gap-2 overflow-auto pr-2">
            {errors.map((error, index) => (
              <div key={`${error.source}-${error.step}-${error.created_at}-${index}`} className="rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-900">
                <p className="text-xs text-amber-700">{error.source} · {error.created_at}</p>
                <p className="font-medium">{error.step}{error.code ? ` · ${error.code}` : ""}</p>
                <p>{error.message}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-neutral-500">暂无历史错误。</p>
        )}
      </div>
    </details>
  );
}

function ReviewBlock({
  taskId,
  value,
  updatedAt,
  storyboardReady,
  remakeReady,
  promptsReady
}: {
  taskId: string;
  value: ReviewReport | null;
  updatedAt?: string;
  storyboardReady: boolean;
  remakeReady: boolean;
  promptsReady: boolean;
}) {
  return (
    <section className="paper-panel paper-panel--padded grid gap-3">
      <div className="flex flex-col gap-1">
        <p className="section-kicker">STEP 2 · AGENT STUDIO</p>
        <h2 className="section-title">三 Agent 创作与审稿</h2>
        <p className="text-sm text-neutral-600">这里检查分镜师、内容创作者和总控审稿的产物是否齐全，并允许你运行审稿或应用 prompt 修正。</p>
        <p className="text-sm text-neutral-500">
          review_report.json：{value ? "已生成" : "未生成"}；最近 review：{updatedAt ?? "暂无"}
        </p>
      </div>
      <div className="grid gap-2 text-sm text-neutral-700 md:grid-cols-3">
        <p>Storyboard Agent：{storyboardReady ? "已生成分镜" : "等待生成"}</p>
        <p>Content Creator Agent：{remakeReady ? "已生成改编方案" : "等待生成"}</p>
        <p>Video Prompts：{promptsReady ? "已生成提示词" : "等待生成"}</p>
      </div>
      <ReviewActions taskId={taskId} hasReviewReport={Boolean(value)} />
      {value ? (
        <div className="grid gap-3 text-sm text-neutral-700">
          <div className="grid gap-2 md:grid-cols-3">
            <p>整体分数：{value.overall_score}</p>
            <p>最终决策：{value.final_decision}</p>
            <p>问题数量：{value.issues.length}</p>
          </div>
          {value.issues.length ? (
            <details className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
              <summary className="cursor-pointer font-medium">审稿问题</summary>
              <div className="mt-3 grid gap-2">
                {value.issues.map((issue, index) => (
                  <div key={`${issue.scene_id ?? "global"}-${issue.type}-${index}`} className="rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-900">
                    <p className="text-xs text-amber-700">{issue.scene_id ?? "global"} · {issue.severity} · {issue.type}</p>
                    <p>{issue.message}</p>
                    <p className="text-xs">建议：{issue.suggestion}</p>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
          <div className="grid gap-2">
            {value.scene_reviews.map((scene) => (
              <div key={scene.scene_id} className="grid gap-2 rounded-md border border-neutral-200 p-3">
                <div className="grid gap-1 md:grid-cols-4">
                  <p>Scene：{scene.scene_id}</p>
                  <p>分数：{scene.score}</p>
                  <p>可生成：{scene.can_generate ? "是" : "否"}</p>
                  <p>Prompt：{scene.prompt_quality}</p>
                </div>
                {scene.suggested_prompt ? (
                  <details className="rounded-md bg-neutral-50 p-2">
                    <summary className="cursor-pointer font-medium">suggested_prompt</summary>
                    <p className="mt-2 whitespace-pre-wrap text-neutral-700">{scene.suggested_prompt}</p>
                  </details>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-neutral-500">尚未运行总控审稿</p>
      )}
    </section>
  );
}

function ProviderConfigBlock({
  llmProvider,
  videoProvider,
  mockMode
}: {
  llmProvider: string;
  videoProvider: string;
  mockMode: boolean;
}) {
  return (
    <section className="paper-panel paper-panel--padded grid gap-3">
      <h2 className="text-base font-semibold">模型配置说明</h2>
      <div className="grid gap-2 text-sm text-neutral-700 md:grid-cols-3">
        <p>文本模型：当前 LLM_PROVIDER = {llmProvider}</p>
        <p>视频模型：当前 VIDEO_PROVIDER = {videoProvider}</p>
        <p>Mock 模式：{mockMode ? "开启" : "关闭"}</p>
      </div>
      <div className="grid gap-1 text-sm text-neutral-600">
        <p>LLM Provider 影响分析、分镜、改编、video prompts 和 review。</p>
        <p>Video Provider 影响视频片段生成，不影响文本分析。</p>
        <p>在设置页保存后会对后续操作生效；页面不会显示任何 API Key。</p>
      </div>
    </section>
  );
}

function SourceMaterialBlock({
  taskId,
  input,
  sourceLink,
  sourceVideo,
  sourceFrames,
  visionInputAvailable
}: {
  taskId: string;
  input: VideoInputArtifact | null;
  sourceLink: SourceLinkInfo | null;
  sourceVideo: SourceVideoMetadata | null;
  sourceFrames: SourceFramesArtifact | null;
  visionInputAvailable: boolean;
}) {
  return (
    <section className="paper-panel paper-panel--padded grid gap-3">
      <div className="grid gap-1">
        <p className="section-kicker">STEP 1 · SOURCE</p>
        <h2 className="section-title">输入材料</h2>
        <p className="text-sm text-neutral-600">先提供链接、上传原视频，或补充原字幕、文案、画面说明和复刻要求。解析失败也可以继续靠上传和手动材料推进。</p>
      </div>
      <SourceMaterialActions
        taskId={taskId}
        uploadedVideo={input?.uploaded_video}
        initialNotes={{
          source_link: sourceLink ?? input?.source_link,
          source_transcript: input?.source_transcript,
          source_caption: input?.source_caption,
          screenshot_notes: input?.screenshot_notes,
          remake_requirements: input?.remake_requirements
        }}
      />
      <div className="grid gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
        <p className="font-medium">链接解析结果</p>
        <div className="grid gap-2 md:grid-cols-3">
          <p>平台：{sourceLink?.platform ?? input?.source_link?.platform ?? "暂无"}</p>
          <p>状态：{sourceLink?.status ?? input?.source_link?.status ?? "暂无"}</p>
          <p>提取时间：{sourceLink?.extracted_at ?? input?.source_link?.extracted_at ?? "暂无"}</p>
        </div>
        <p className="break-all">原链接：{sourceLink?.url ?? input?.source_link?.url ?? "暂无"}</p>
        <p className="break-all">规范化链接：{sourceLink?.normalized_url ?? input?.source_link?.normalized_url ?? "暂无"}</p>
        {(sourceLink?.error ?? input?.source_link?.error) ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-900">
            提示：{sourceLink?.error ?? input?.source_link?.error}
          </p>
        ) : null}
        <p className="rounded-md border border-blue-200 bg-blue-50 p-2 text-blue-900">
          {sourceLink?.user_next_action ?? input?.source_link?.user_next_action ?? "链接只是输入辅助。推荐继续上传原视频，或补充字幕、文案、画面说明和复刻要求。"}
        </p>
        {(sourceLink?.status ?? input?.source_link?.status) === "needs_user_input" ? (
          <p className="text-amber-700">当前链接无法稳定自动解析。请上传原视频，或补充原字幕、文案、画面说明和复刻要求。</p>
        ) : null}
      </div>
      <div className="grid gap-2 text-sm text-neutral-700 md:grid-cols-3">
        <p>原视频：{input?.uploaded_video?.uploaded_video_path ? "已上传" : "未上传"}</p>
        <p>原始文件名：{input?.uploaded_video?.original_filename ?? "暂无"}</p>
        <p>上传时间：{input?.uploaded_video?.upload_time ?? "暂无"}</p>
        <p>时长：{sourceVideo?.duration_seconds ? `${sourceVideo.duration_seconds}s` : "暂无"}</p>
        <p>分辨率：{sourceVideo?.width && sourceVideo.height ? `${sourceVideo.width}x${sourceVideo.height}` : "暂无"}</p>
        <p>帧率：{sourceVideo?.fps ?? "暂无"}</p>
        <p>视频编码：{sourceVideo?.codec ?? "暂无"}</p>
        <p>音轨：{sourceVideo ? sourceVideo.has_audio ? "有" : "无" : "暂无"}</p>
        <p>音频编码：{sourceVideo?.audio_codec ?? "暂无"}</p>
      </div>
      {input?.uploaded_video?.uploaded_video_path && sourceFrames?.frames.length && !visionInputAvailable && !(
        input.source_transcript || input.source_caption || input.screenshot_notes || input.remake_requirements
      ) ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          关键帧已经抽取，但当前文本模型不能直接看见这些画面。请至少补充原字幕、原文案或画面说明，否则系统会暂停生成，避免产出与原视频无关的内容。
        </p>
      ) : null}
      <div className="grid gap-2 text-sm">
        <p className="font-medium">补充材料</p>
        <p className="whitespace-pre-wrap rounded-md bg-neutral-50 p-2">原视频字幕：{input?.source_transcript || "暂无"}</p>
        <p className="whitespace-pre-wrap rounded-md bg-neutral-50 p-2">原视频文案：{input?.source_caption || "暂无"}</p>
        <p className="whitespace-pre-wrap rounded-md bg-neutral-50 p-2">画面说明：{input?.screenshot_notes || "暂无"}</p>
        <p className="whitespace-pre-wrap rounded-md bg-neutral-50 p-2">复刻要求：{input?.remake_requirements || "暂无"}</p>
      </div>
      {sourceFrames?.frames.length ? (
        <div className="grid gap-2">
          <p className="text-sm font-medium">关键帧缩略图（{sourceFrames.frames.length}）</p>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            {sourceFrames.frames.map((frame) => (
              <figure key={frame.frame_id} className="grid gap-1 rounded-md border border-neutral-200 p-2">
                <img
                  alt={`${frame.frame_id} at ${frame.timestamp_seconds}s`}
                  className="aspect-video w-full rounded bg-neutral-100 object-cover"
                  src={`/api/tasks/${taskId}/source-frame?file=${path.basename(frame.file_path)}`}
                />
                <figcaption className="text-xs text-neutral-500">{frame.frame_id} · {frame.timestamp_seconds}s</figcaption>
              </figure>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-neutral-500">尚未抽取关键帧。</p>
      )}
    </section>
  );
}

function VoiceoverSubtitleBlock({
  taskId,
  voiceover,
  subtitles,
  audioProvider,
  ttsProvider,
  paidTtsCalls,
  voiceoverWav,
  silentWav
}: {
  taskId: string;
  voiceover: VoiceoverScript | null;
  subtitles: SubtitlePackage | null;
  audioProvider: string;
  ttsProvider: string;
  paidTtsCalls: boolean;
  voiceoverWav: { exists: boolean; path: string };
  silentWav: { exists: boolean; path: string };
}) {
  const hasRealVoiceover = voiceoverWav.exists;
  return (
    <section className="paper-panel paper-panel--padded grid gap-3">
      <div className="grid gap-1">
        <p className="section-kicker">STEP 4 · VOICE & CAPTIONS</p>
        <h2 className="section-title">旁白与字幕</h2>
        <p className="text-sm text-neutral-600">生成旁白稿、字幕稿、SRT 和 mock 音频；字幕烧录会把 SRT 写进成片画面。</p>
      </div>
      <AudioSubtitleActions
        taskId={taskId}
        ttsProvider={ttsProvider}
        paidTtsCalls={paidTtsCalls}
      />
      <div className="grid gap-2 text-sm text-neutral-700 md:grid-cols-3">
        <p>旁白稿：{voiceover ? "已生成" : "尚未生成"}</p>
        <p>SRT：{subtitles?.srt_path ? "已生成" : "尚未生成"}</p>
        <p>TTS Provider：{ttsProvider}</p>
        <p>音频 provider：{audioProvider}</p>
        <p>voiceover.wav：{voiceoverWav.exists ? "存在" : "不存在"}</p>
        <p>silent.wav：{silentWav.exists ? "存在" : "不存在"}</p>
        <p>旁白段数：{voiceover?.segments.length ?? 0}</p>
        <p>字幕段数：{subtitles?.segments.length ?? 0}</p>
        <p>当前使用音频：{hasRealVoiceover ? "voiceover.wav" : silentWav.exists ? "silent.wav" : "暂无"}</p>
      </div>
      <p className="text-sm text-neutral-600">
        {hasRealVoiceover ? "真实旁白音频已生成。" : silentWav.exists ? "当前为 mock/silent audio。" : "尚未生成音频。"}
      </p>
      {subtitles?.srt_path ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-neutral-500">SRT 字幕文件已就绪。</p>
          <a
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium"
            href={`/api/tasks/${taskId}/download?file=subtitles.srt`}
          >
            下载 subtitles.srt
          </a>
        </div>
      ) : null}
      {voiceover ? (
        <details className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
          <summary className="cursor-pointer font-medium">旁白 segments（{voiceover.segments.length}）</summary>
          <div className="mt-3 grid gap-2">
            {voiceover.segments.map((segment) => (
              <div key={segment.scene_id} className="rounded-md border border-neutral-200 bg-white p-2">
                <p className="text-xs text-neutral-500">{segment.scene_id} · {segment.start}s - {segment.end}s · {segment.speed ?? "normal"}</p>
                <p>{segment.text}</p>
              </div>
            ))}
          </div>
        </details>
      ) : null}
      {subtitles ? (
        <details className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
          <summary className="cursor-pointer font-medium">字幕 segments（{subtitles.segments.length}）</summary>
          <div className="mt-3 grid gap-2">
            {subtitles.segments.map((segment) => (
              <div key={segment.index} className="rounded-md border border-neutral-200 bg-white p-2">
                <p className="text-xs text-neutral-500">#{segment.index} · {segment.scene_id} · {segment.start}s - {segment.end}s</p>
                <p>{segment.text}</p>
              </div>
            ))}
          </div>
        </details>
      ) : null}
      {!voiceover && !subtitles ? (
        <p className="text-sm text-neutral-500">尚未生成旁白稿和字幕稿。可使用 CLI 的 prepare-audio 命令生成。</p>
      ) : null}
    </section>
  );
}

function OutputAssetsBlock({
  taskId,
  manifest
}: {
  taskId: string;
  manifest: OutputsManifest | null;
}) {
  return (
    <section className="paper-panel paper-panel--padded grid gap-3">
      <div className="grid gap-1">
        <h2 className="text-base font-semibold">成片资产</h2>
        <p className="text-sm text-neutral-600">这里集中管理最终交付物：原始成片、带字幕成片、封面图、制作包和 JSON 项目包。</p>
      </div>
      <OutputAssetActions taskId={taskId} />
      <p className="text-sm text-neutral-600">
        推荐预览版本：{manifest?.recommended_preview ?? "暂无 outputs_manifest.json"}
      </p>
      {manifest ? (
        <div className="grid gap-2">
          {manifest.outputs.map((item) => (
            <div key={item.key} className="flex flex-col gap-2 rounded-md border border-neutral-200 p-3 text-sm md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium">{item.label}</p>
                <p className="text-neutral-500">状态：{item.exists ? "存在" : "缺失"}；大小：{item.size_bytes ? `${Math.round(item.size_bytes / 1024)} KB` : "暂无"}；更新时间：{item.updated_at ?? "暂无"}</p>
              </div>
              {item.exists && item.download_file ? (
                <a
                  className="w-fit rounded-md border border-neutral-300 bg-white px-3 py-2 font-medium"
                  href={`/api/tasks/${taskId}/download?file=${item.download_file}`}
                >
                  下载
                </a>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-neutral-500">尚未生成 outputs_manifest.json。导出封面帧后会自动生成。</p>
      )}
    </section>
  );
}

async function finalMp4Info(taskId: string): Promise<{
  exists: boolean;
  size?: number;
  version: "original" | "subtitled" | "none";
  hasOriginal: boolean;
  hasSubtitled: boolean;
  subtitledSize?: number;
  updatedAtMs?: number;
}> {
  const outputDir = getTaskOutputsDir(taskId);
  const originalPath = path.join(outputDir, "final.mp4");
  const subtitledPath = path.join(outputDir, "final_subtitled.mp4");
  const [originalStat, subtitledStat] = await Promise.all([
    stat(originalPath).catch(() => undefined),
    stat(subtitledPath).catch(() => undefined)
  ]);
  const hasOriginal = Boolean(originalStat?.isFile());
  const hasSubtitled = Boolean(subtitledStat?.isFile());
  if (hasSubtitled) {
    return {
      exists: true,
      size: subtitledStat?.size,
      version: "subtitled",
      hasOriginal,
      hasSubtitled,
      subtitledSize: subtitledStat?.size,
      updatedAtMs: subtitledStat?.mtimeMs
    };
  }
  if (hasOriginal) {
    return {
      exists: true,
      size: originalStat?.size,
      version: "original",
      hasOriginal,
      hasSubtitled,
      subtitledSize: subtitledStat?.size,
      updatedAtMs: originalStat?.mtimeMs
    };
  }
  return {
    exists: false,
    version: "none",
    hasOriginal,
    hasSubtitled
  };
}

async function optionalFileUpdatedAt(filePath?: string): Promise<string | undefined> {
  if (!filePath) {
    return undefined;
  }
  try {
    const fileStat = await stat(filePath);
    return fileStat.mtime.toISOString();
  } catch {
    return undefined;
  }
}

async function newestFileUpdatedAtMs(filePaths: Array<string | undefined>): Promise<number | undefined> {
  const timestamps = await Promise.all(
    filePaths.map(async (filePath) => {
      if (!filePath) return undefined;
      const fileStat = await stat(filePath).catch(() => undefined);
      return fileStat?.isFile() ? fileStat.mtimeMs : undefined;
    })
  );
  const existing = timestamps.filter((value): value is number => value !== undefined);
  return existing.length ? Math.max(...existing) : undefined;
}

async function taskFileExists(relativePath: string): Promise<boolean> {
  try {
    const fileStat = await stat(path.join(process.cwd(), relativePath));
    return fileStat.isFile();
  } catch {
    return false;
  }
}

function recommendNextStep(input: {
  hasUploadedVideo: boolean;
  hasSourceNotes: boolean;
  hasStoryboard: boolean;
  hasRemakePlan: boolean;
  hasVideoPrompts: boolean;
  hasReview: boolean;
  hasFinalSubtitled: boolean;
  hasFinal: boolean;
  hasMockAssets: boolean;
}) {
  if (!input.hasUploadedVideo && !input.hasSourceNotes) {
    return "先在 Step 1 输入链接、上传原视频，或补充原字幕 / 文案 / 画面说明。";
  }
  if (!input.hasStoryboard || !input.hasRemakePlan || !input.hasVideoPrompts) {
    return "下一步运行 Step 3 的 dry-run 或一键生成，让 Agent 生成分镜、改编方案和 prompts。";
  }
  if (!input.hasReview) {
    return "建议在 Step 2 运行总控审稿，先检查 prompt 质量再生成更多视频片段。";
  }
  if (!input.hasFinal) {
    return "下一步在 Step 3 运行一键生成并合成 final.mp4。";
  }
  if (input.hasMockAssets) {
    return "当前成片仍含 Mock 占位片段。需要正式成片时，请在 Step 3 选择已配置的真实视频 Provider 后重新生成。";
  }
  if (!input.hasFinalSubtitled) {
    return "下一步在 Step 4 或 Step 5 烧录字幕，生成 final_subtitled.mp4。";
  }
  return "当前任务已有带字幕成片，可以在 Step 5 预览并下载交付物。";
}

function TaskOverviewBlock({
  taskId,
  taskName,
  taskStatus,
  nextStep,
  hasUploadedVideo,
  hasFinalSubtitled,
  hasMockAssets,
  previewVersion,
  latestJobStatus,
  latestJobStep
}: {
  taskId: string;
  taskName?: string;
  taskStatus: string;
  nextStep: string;
  hasUploadedVideo: boolean;
  hasFinalSubtitled: boolean;
  hasMockAssets: boolean;
  previewVersion: string;
  latestJobStatus: string;
  latestJobStep: string;
}) {
  return (
    <section className="paper-panel paper-panel--accent paper-panel--padded grid gap-4">
      <div className="grid gap-1">
        <p className="section-kicker">TASK OVERVIEW</p>
        <h2 className="section-title break-all">{taskName ?? taskId}</h2>
        {taskName ? <p className="break-all text-xs text-neutral-500">任务编号：{taskId}</p> : null}
        <p className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">推荐下一步：{nextStep}</p>
        {taskStatus === "mocked" || hasMockAssets ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            当前任务是 Mock 预览：文件可以播放，但仍含测试占位片段，不是完整真实生成成片。
          </p>
        ) : null}
      </div>
      <div className="grid gap-2 text-sm text-neutral-700 md:grid-cols-6">
        <p>任务状态：{taskStatus}</p>
        <p>原视频：{hasUploadedVideo ? "已有" : "未上传"}</p>
        <p>带字幕成片：{hasFinalSubtitled ? "已有" : "未生成"}</p>
        <p>预览版本：{previewVersion}</p>
        <p>最近 Job：{latestJobStatus}</p>
        <p>Job 步骤：{latestJobStep}</p>
      </div>
    </section>
  );
}

function HistoryJobsBlock({ jobs }: { jobs: RunFullJob[] }) {
  return (
    <section className="grid gap-3">
      <h3 className="text-sm font-semibold">历史 Jobs</h3>
      {jobs.length ? (
        <div className="grid gap-2">
          {jobs.map((job) => (
            <div key={job.job_id} className="grid gap-1 rounded-md border border-neutral-200 bg-white p-3 text-sm">
              <p className="break-all font-medium">{job.job_id}</p>
              <p className="text-neutral-600">状态：{job.status}；当前步骤：{job.current_step}</p>
              <p className="text-xs text-neutral-500">创建：{job.created_at}；更新：{job.updated_at}</p>
              {job.error ? <p className="text-xs text-red-600">{job.error}</p> : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-neutral-500">暂无后台 job 记录。</p>
      )}
    </section>
  );
}

export default async function TaskDetailPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const task = await getTask(taskId);
  const runtime = await getRunFullRuntimeStatus();
  const jobs = await listJobsForTask(task.task_id, 8);
  const [latestJob] = jobs;
  const finalVideo = await finalMp4Info(taskId);
  const input = await optionalArtifact<VideoInputArtifact>(task.files.input_json);
  const sourceLink = await optionalArtifact<SourceLinkInfo>(
    task.files.source_link_json ?? path.join(getTaskDir(task.task_id), "source_link.json")
  );
  const sourceVideo = await optionalArtifact<SourceVideoMetadata>(
    task.files.source_video_json ?? path.join(getTaskDir(task.task_id), "source_video.json")
  );
  const sourceFrames = await optionalArtifact<SourceFramesArtifact>(
    task.files.source_frames_json ?? path.join(getTaskDir(task.task_id), "source_frames.json")
  );
  const analysis = await optionalArtifact(task.files.analysis_json);
  const storyboard = await optionalArtifact(task.files.storyboard_json);
  const remakePlan = await optionalArtifact(task.files.remake_plan_json);
  const videoPrompts = await optionalArtifact(task.files.video_prompts_json);
  const reviewReportPath = task.files.review_report_json ?? path.join(getTaskDir(task.task_id), "review_report.json");
  const reviewReport = await optionalArtifact<ReviewReport>(reviewReportPath);
  const reviewUpdatedAt = await optionalFileUpdatedAt(reviewReportPath);
  const voiceover = await optionalArtifact<VoiceoverScript>(
    task.files.voiceover_script_json ?? path.join(getTaskDir(task.task_id), "voiceover_script.json")
  );
  const subtitles = await optionalArtifact<SubtitlePackage>(
    task.files.subtitles_json ?? path.join(getTaskDir(task.task_id), "subtitles.json")
  );
  const assets = await optionalArtifact<AssetsManifest>(task.files.assets_json);
  const outputsManifest = await optionalArtifact<OutputsManifest>(
    task.files.outputs_manifest_json ?? path.join(getTaskOutputsDir(task.task_id), "outputs_manifest.json")
  );
  const newestDependencyUpdatedAtMs = await newestFileUpdatedAtMs([
    task.files.input_json,
    task.files.analysis_json,
    task.files.storyboard_json,
    task.files.remake_plan_json,
    task.files.video_prompts_json,
    task.files.voiceover_script_json,
    task.files.subtitles_json,
    ...(assets?.assets.map((asset) => asset.file_path) ?? [])
  ]);
  const audioProvider =
    assets?.assets.find((asset) => asset.asset_id === "asset_volc_tts_voiceover")?.provider
    ?? assets?.assets.find((asset) => asset.file_path?.endsWith("/voiceover.wav"))?.provider
    ?? assets?.assets.find((asset) => asset.asset_id === "asset_mock_silent_audio")?.provider
    ?? assets?.assets.find((asset) => asset.type === "voiceover")?.provider
    ?? "none";
  const voiceoverWavPath = `data/tasks/${task.task_id}/assets/audio/voiceover.wav`;
  const silentWavPath = `data/tasks/${task.task_id}/assets/audio/silent.wav`;
  const [voiceoverWavExists, silentWavExists] = await Promise.all([
    taskFileExists(voiceoverWavPath),
    taskFileExists(silentWavPath)
  ]);
  const historicalErrors: HistoricalError[] = [
    ...task.errors.map((error) => ({ ...error, source: "task.json" as const })),
    ...(assets?.errors ?? []).map((error) => ({ ...error, source: "assets.json" as const }))
  ];
  const hasSourceNotes = Boolean(input?.source_transcript || input?.source_caption || input?.screenshot_notes || input?.remake_requirements || sourceLink);
  const nextStep = recommendNextStep({
    hasUploadedVideo: Boolean(input?.uploaded_video?.uploaded_video_path),
    hasSourceNotes,
    hasStoryboard: Boolean(storyboard),
    hasRemakePlan: Boolean(remakePlan),
    hasVideoPrompts: Boolean(videoPrompts),
    hasReview: Boolean(reviewReport),
    hasFinalSubtitled: finalVideo.hasSubtitled,
    hasFinal: finalVideo.hasOriginal,
    hasMockAssets: Boolean(assets?.mock.is_mock)
  });
  const previewVersion = finalVideo.version === "subtitled" ? "带字幕版" : finalVideo.version === "original" ? "原始版" : "暂无";
  const latestJobIsRunning = latestJob ? latestJob.status === "queued" || latestJob.status === "running" : false;
  const finalIsStale = Boolean(
    finalVideo.exists &&
    finalVideo.updatedAtMs &&
    newestDependencyUpdatedAtMs &&
    newestDependencyUpdatedAtMs > finalVideo.updatedAtMs
  );

  return (
    <main className="workbench-page">
      <div className="workbench-shell">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="page-kicker">CREATION WORKBENCH</p>
            <h1 className="page-title break-all">{task.task_name ?? task.task_id}</h1>
            {task.task_name ? <p className="break-all text-xs text-neutral-500">任务编号：{task.task_id}</p> : null}
          </div>
          <div className="flex gap-2">
            <Link className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium" href="/">
              新建任务
            </Link>
            <Link className="rounded-md bg-neutral-950 px-3 py-2 text-sm font-medium text-white" href={`/export/${task.task_id}`}>
              查看导出
            </Link>
          </div>
        </header>

        <TaskOverviewBlock
          taskId={task.task_id}
          taskName={task.task_name}
          taskStatus={task.status}
          nextStep={nextStep}
          hasUploadedVideo={Boolean(input?.uploaded_video?.uploaded_video_path)}
          hasFinalSubtitled={finalVideo.hasSubtitled}
          hasMockAssets={Boolean(assets?.mock.is_mock)}
          previewVersion={previewVersion}
          latestJobStatus={latestJob ? latestJob.status : "暂无"}
          latestJobStep={latestJob ? latestJob.current_step : "暂无"}
        />
        <SourceMaterialBlock
          taskId={task.task_id}
          input={input}
          sourceLink={sourceLink}
          sourceVideo={sourceVideo}
          sourceFrames={sourceFrames}
          visionInputAvailable={runtime.vision_input_available}
        />
        <ReviewBlock
          taskId={task.task_id}
          value={reviewReport}
          updatedAt={reviewUpdatedAt}
          storyboardReady={Boolean(storyboard)}
          remakeReady={Boolean(remakePlan)}
          promptsReady={Boolean(videoPrompts)}
        />
        <RunFullPanel task={task} runtime={runtime} showJobHistory={false} />
        <VoiceoverSubtitleBlock
          taskId={task.task_id}
          voiceover={voiceover}
          subtitles={subtitles}
          audioProvider={audioProvider}
          ttsProvider={runtime.tts_provider}
          paidTtsCalls={runtime.paid_tts_calls}
          voiceoverWav={{ exists: voiceoverWavExists, path: voiceoverWavPath }}
          silentWav={{ exists: silentWavExists, path: silentWavPath }}
        />
        <VideoPreview
          taskId={task.task_id}
          exists={finalVideo.exists}
          size={finalVideo.size}
          version={finalVideo.version}
          hasOriginal={finalVideo.hasOriginal}
          hasSubtitled={finalVideo.hasSubtitled}
          subtitledSize={finalVideo.subtitledSize}
          isMock={Boolean(assets?.mock?.is_mock)}
          isGenerating={latestJobIsRunning}
          isStale={finalIsStale}
        />
        <OutputAssetsBlock taskId={task.task_id} manifest={outputsManifest} />

        <details className="paper-panel paper-panel--padded">
          <summary className="cursor-pointer text-base font-semibold">高级信息与调试记录</summary>
          <div className="mt-4 grid gap-4">
            <p className="text-sm text-neutral-600">这里保留历史 jobs、错误日志和 Provider 配置，默认折叠，避免影响日常操作。</p>
            <HistoryJobsBlock jobs={jobs} />
            <HistoricalErrorLog taskId={task.task_id} errors={historicalErrors} />
            <ProviderConfigBlock llmProvider={runtime.llm_provider} videoProvider={runtime.video_provider} mockMode={runtime.mock_mode} />
            <div className="rounded-md border border-neutral-200 bg-white p-3 text-sm">
              <p className="font-semibold">JSON 调试产物</p>
              <p className="mt-1 text-neutral-600">完整 JSON 改为按需打开，避免大型分镜和提示词长期占用任务页内存。</p>
              <a
                className="mt-3 inline-flex rounded-md border border-neutral-300 bg-white px-3 py-2 font-medium"
                href={`/api/tasks/${task.task_id}`}
                rel="noreferrer"
                target="_blank"
              >
                在新窗口查看完整 JSON
              </a>
            </div>
          </div>
        </details>
      </div>
    </main>
  );
}
