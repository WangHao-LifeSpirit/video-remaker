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
  size
}: {
  taskId: string;
  exists: boolean;
  size?: number;
}) {
  return (
    <section className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">最终成片预览</h2>
        <p className="text-sm text-neutral-600">
          final.mp4：{exists ? "已生成" : "尚未生成"}；文件大小：{exists ? formatBytes(size) : "无"}
        </p>
      </div>

      {exists ? (
        <>
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
          </div>
          <p className="text-sm text-neutral-500">如需更新成片，请在上方一键生成区域重新运行；本预览不会自动触发生成。</p>
        </>
      ) : (
        <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
          尚未生成 final.mp4，请先运行一键生成。
        </p>
      )}
    </section>
  );
}
