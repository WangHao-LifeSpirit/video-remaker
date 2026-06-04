import Link from "next/link";
import { getTask } from "../../../lib/tools/task-store";

export default async function ExportPage({ params }: { params: { taskId: string } }) {
  const task = await getTask(params.taskId);

  return (
    <main className="min-h-screen px-5 py-8">
      <div className="mx-auto grid max-w-3xl gap-5">
        <header className="grid gap-2">
          <p className="text-sm font-medium text-neutral-500">结果导出</p>
          <h1 className="break-all text-2xl font-semibold tracking-normal">{task.task_id}</h1>
        </header>

        <section className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-5">
          <div>
            <h2 className="text-base font-semibold">Markdown 制作包</h2>
            <p className="break-all text-sm text-neutral-600">{task.export_paths.markdown ?? "尚未导出"}</p>
          </div>
          <div>
            <h2 className="text-base font-semibold">JSON 项目包</h2>
            <p className="break-all text-sm text-neutral-600">{task.export_paths.json ?? "尚未导出"}</p>
          </div>
          <div>
            <h2 className="text-base font-semibold">MP4 输出入口</h2>
            <p className="break-all text-sm text-neutral-600">{task.export_paths.mp4 ?? "v0.1 仅预留，尚未生成真实 MP4"}</p>
          </div>
        </section>

        <div className="flex gap-2">
          <Link className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium" href={`/tasks/${task.task_id}`}>
            返回任务
          </Link>
          <Link className="rounded-md bg-neutral-950 px-3 py-2 text-sm font-medium text-white" href="/">
            新建任务
          </Link>
        </div>
      </div>
    </main>
  );
}
