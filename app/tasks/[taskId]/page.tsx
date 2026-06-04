import Link from "next/link";
import { RunFullPanel } from "../../../components/run-full-panel";
import { getRunFullRuntimeStatus } from "../../../lib/tools/run-full";
import { getTask, readJsonFile } from "../../../lib/tools/task-store";

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

export default async function TaskDetailPage({ params }: { params: { taskId: string } }) {
  const task = await getTask(params.taskId);
  const runtime = await getRunFullRuntimeStatus();
  const input = await optionalArtifact(task.files.input_json);
  const analysis = await optionalArtifact(task.files.analysis_json);
  const storyboard = await optionalArtifact(task.files.storyboard_json);
  const remakePlan = await optionalArtifact(task.files.remake_plan_json);
  const videoPrompts = await optionalArtifact(task.files.video_prompts_json);
  const assets = await optionalArtifact(task.files.assets_json);

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
          </div>
          {task.errors.length ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {task.errors.map((error) => (
                <p key={`${error.step}-${error.created_at}`}>{error.step}: {error.message}</p>
              ))}
            </div>
          ) : null}
        </section>

        <RunFullPanel task={task} runtime={runtime} />

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
