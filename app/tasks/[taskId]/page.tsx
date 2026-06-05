import { stat } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { ClearErrorsButton } from "../../../components/clear-errors-button";
import { RunFullPanel } from "../../../components/run-full-panel";
import { VideoPreview } from "../../../components/video-preview";
import { listJobsForTask } from "../../../lib/tools/job-store";
import { getRunFullRuntimeStatus } from "../../../lib/tools/run-full";
import { getTask, getTaskOutputsDir, readJsonFile } from "../../../lib/tools/task-store";
import type { ErrorRecord } from "../../../lib/types/common";
import type { AssetsManifest } from "../../../lib/types/assets";

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

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <section className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="text-base font-semibold">{title}</h2>
      {value ? (
        <pre className="max-h-96 overflow-auto rounded-md bg-neutral-950 p-3 text-xs leading-5 text-neutral-100">
          {JSON.stringify(value, null, 2)}
        </pre>
      ) : (
        <p className="text-sm text-neutral-500">尚未生成</p>
      )}
    </section>
  );
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

async function finalMp4Info(taskId: string): Promise<{ exists: boolean; size?: number }> {
  try {
    const finalPath = path.join(getTaskOutputsDir(taskId), "final.mp4");
    const fileStat = await stat(finalPath);
    return {
      exists: fileStat.isFile(),
      size: fileStat.size
    };
  } catch {
    return { exists: false };
  }
}

export default async function TaskDetailPage({ params }: { params: { taskId: string } }) {
  const task = await getTask(params.taskId);
  const runtime = await getRunFullRuntimeStatus();
  const [latestJob] = await listJobsForTask(task.task_id, 1);
  const finalVideo = await finalMp4Info(params.taskId);
  const input = await optionalArtifact(task.files.input_json);
  const analysis = await optionalArtifact(task.files.analysis_json);
  const storyboard = await optionalArtifact(task.files.storyboard_json);
  const remakePlan = await optionalArtifact(task.files.remake_plan_json);
  const videoPrompts = await optionalArtifact(task.files.video_prompts_json);
  const assets = await optionalArtifact<AssetsManifest>(task.files.assets_json);
  const historicalErrors: HistoricalError[] = [
    ...task.errors.map((error) => ({ ...error, source: "task.json" as const })),
    ...(assets?.errors ?? []).map((error) => ({ ...error, source: "assets.json" as const }))
  ];

  return (
    <main className="min-h-screen px-5 py-8">
      <div className="mx-auto grid max-w-6xl gap-5">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium text-neutral-500">任务详情</p>
            <h1 className="break-all text-2xl font-semibold tracking-normal">{task.task_id}</h1>
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

        <section className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="text-base font-semibold">任务状态</h2>
          <div className="grid gap-2 text-sm text-neutral-700 md:grid-cols-3">
            <p>状态：{task.status}</p>
            <p>当前步骤：{task.current_step}</p>
            <p>解析状态：{task.source.parse_status}</p>
            <p>目标平台：{task.user_inputs.target_platform}</p>
            <p>时长：{task.user_inputs.duration}</p>
            <p>复刻强度：{task.user_inputs.remake_strength}</p>
            <p>最近 Job：{latestJob ? latestJob.status : "暂无"}</p>
            <p>Job 当前步骤：{latestJob ? latestJob.current_step : "暂无"}</p>
            <p>Job 更新时间：{latestJob ? latestJob.updated_at : "暂无"}</p>
          </div>
          {latestJob?.error ? (
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              最近 Job 错误：{latestJob.error}
            </p>
          ) : null}
          <HistoricalErrorLog taskId={task.task_id} errors={historicalErrors} />
        </section>

        <RunFullPanel task={task} runtime={runtime} />
        <VideoPreview taskId={task.task_id} exists={finalVideo.exists} size={finalVideo.size} />

        <JsonBlock title="输入材料" value={input} />
        <JsonBlock title="解析结果 / task.json" value={task} />
        <JsonBlock title="分析结果" value={analysis} />
        <JsonBlock title="分镜表" value={storyboard} />
        <JsonBlock title="原创改编脚本" value={remakePlan} />
        <JsonBlock title="视频模型提示词" value={videoPrompts} />
        <JsonBlock title="Mock 素材" value={assets} />
      </div>
    </main>
  );
}
