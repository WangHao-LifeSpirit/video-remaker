import { BurnSubtitlesButton } from "./burn-subtitles-button";

function formatBytes(value?: number): string {
  if (!value || value <= 0) {
    return "未知";
  }
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function VideoPreview({
  taskId,
  exists,
  size,
  version,
  hasOriginal,
  hasSubtitled,
  subtitledSize,
  isMock = false,
  isGenerating = false,
  isStale = false
}: {
  taskId: string;
  exists: boolean;
  size?: number;
  version: "original" | "subtitled" | "none";
  hasOriginal: boolean;
  hasSubtitled: boolean;
  subtitledSize?: number;
  isMock?: boolean;
  isGenerating?: boolean;
  isStale?: boolean;
}) {
  return (
    <section className="paper-panel paper-panel--padded grid gap-4">
      <div className="flex flex-col gap-1">
        <p className="section-kicker">STEP 5 · DELIVERY</p>
        <h2 className="section-title">成片预览与导出</h2>
        <p className="text-sm text-neutral-600">这里直接预览最终 MP4，并下载原始版、带字幕版和制作包。</p>
        <p className="text-sm text-neutral-600">
          当前预览版本：{version === "subtitled" ? "带字幕版" : version === "original" ? "原始版" : "无"}；文件大小：{exists ? formatBytes(size) : "无"}
        </p>
        <p className="text-sm text-neutral-500">
          final.mp4：{hasOriginal ? "已生成" : "尚未生成"}；final_subtitled.mp4：{hasSubtitled ? `已生成（${formatBytes(subtitledSize)}）` : "尚未生成"}
        </p>
      </div>

      <BurnSubtitlesButton taskId={taskId} />

      {exists ? (
        <>
          {isGenerating ? (
            <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
              当前任务仍在生成中，播放器里可能是上一次合成的旧版本。等后台 job 完成后再用于录屏展示。
            </p>
          ) : null}
          {isStale ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              输入材料、提示词、素材或字幕已更新，播放器仍是上一次合成的旧成片。请重新运行生成与合成流程后再用于交付。
            </p>
          ) : null}
          {isMock ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              当前成片包含 Mock 占位素材。彩色测试图案只用于验证时间轴和播放器，说明真实视频片段尚未生成，或部分 scene 已回退到 Mock。
            </p>
          ) : null}
          <video
            className="aspect-[9/16] w-full max-w-sm rounded-md border border-neutral-200 bg-black"
            controls
            preload="metadata"
            src={`/api/tasks/${taskId}/video`}
          >
            当前浏览器不支持视频预览。
          </video>
          <div className="flex flex-wrap gap-2">
            <a
              className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium"
              href={`/api/tasks/${taskId}/download?file=final.mp4`}
            >
              下载 final.mp4
            </a>
            {hasSubtitled ? (
              <a
                className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium"
                href={`/api/tasks/${taskId}/download?file=final_subtitled.mp4`}
              >
                下载 final_subtitled.mp4
              </a>
            ) : null}
          </div>
          <p className="text-sm text-neutral-500">如需更新成片，请在上方一键生成区域重新运行；本预览不会自动触发生成。若存在带字幕版，播放器会优先预览 final_subtitled.mp4。</p>
        </>
      ) : (
        <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
          尚未生成 final.mp4，请先运行一键生成。
        </p>
      )}
    </section>
  );
}
