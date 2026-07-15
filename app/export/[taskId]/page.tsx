import Link from "next/link";
import { getTask } from "../../../lib/tools/task-store";

export default async function ExportPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const task = await getTask(taskId);
  const deliverables = [
    {
      label: "原始成片",
      path: task.export_paths.mp4,
      file: "final.mp4"
    },
    {
      label: "带字幕成片",
      path: task.export_paths.subtitled_mp4,
      file: "final_subtitled.mp4"
    },
    {
      label: "Markdown 制作包",
      path: task.export_paths.markdown,
      file: "production-package.md"
    },
    {
      label: "JSON 项目包",
      path: task.export_paths.json,
      file: "project-package.json"
    },
    {
      label: "封面图",
      path: task.export_paths.cover,
      file: "cover.jpg"
    }
  ];

  return (
    <main className="workbench-page">
      <div className="workbench-shell max-w-3xl">
        <header className="grid gap-2">
          <p className="page-kicker">DELIVERY PACKAGE</p>
          <h1 className="page-title break-all">{task.task_name ?? task.task_id}</h1>
          {task.task_name ? <p className="break-all text-xs text-neutral-500">任务编号：{task.task_id}</p> : null}
        </header>

        {task.status === "mocked" ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            当前任务包含 Mock 占位素材。文件可以预览和验证流程，但不应作为完整真实生成的交付成片。
          </p>
        ) : null}

        <section className="paper-panel paper-panel--accent paper-panel--padded grid gap-2">
          <div className="mb-2">
            <h2 className="section-title">交付文件</h2>
            <p className="mt-1 text-sm text-neutral-600">只有已生成的文件才会开放下载；缺失项可回到任务页继续生成。</p>
          </div>
          {deliverables.map((item) => (
            <div key={item.file} className="flex flex-col gap-2 border-t border-neutral-200 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">{item.label}</h3>
                <p className="break-all text-xs text-neutral-500">{item.path ?? "尚未生成"}</p>
              </div>
              {item.path ? (
                <a
                  className="w-fit rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium"
                  href={`/api/tasks/${task.task_id}/download?file=${item.file}`}
                >
                  下载
                </a>
              ) : (
                <span className="text-xs text-neutral-400">缺失</span>
              )}
            </div>
          ))}
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
