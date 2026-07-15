import { readdir } from "node:fs/promises";
import Link from "next/link";
import { CreateTaskForm } from "../components/create-task-form";
import { getTask, TASKS_DIR } from "../lib/tools/task-store";
import type { VideoRemakeTask } from "../lib/types/task";

async function recentTasks(): Promise<VideoRemakeTask[]> {
  try {
    const entries = await readdir(TASKS_DIR, { withFileTypes: true });
    const tasks = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith("task_"))
        .map((entry) => getTask(entry.name).catch(() => null))
    );
    return tasks
      .filter((task): task is VideoRemakeTask => Boolean(task))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 6);
  } catch {
    return [];
  }
}

const workflowSteps = ["链接 / 上传素材", "Agent 分析与分镜", "视频生成", "字幕 / 音频", "成片导出"];

export default async function HomePage() {
  const tasks = await recentTasks();
  return (
    <main className="workbench-page">
      <div className="workbench-shell">
        <header className="grid gap-6 border-b border-neutral-300 pb-7">
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="page-kicker">v2.1 · Local Video Remaker Workbench</p>
              <p className="text-xs text-neutral-500">本地运行 · 私有素材 · 成本可控</p>
            </div>
            <h1 className="page-title">短视频原创改编工作台</h1>
            <p className="page-lead">
              从一条链接、一段原视频或一份文案开始，让三个 Agent 完成结构分析、原创分镜、提示词审稿与成片组织。所有素材保存在本机，真实生成前先经过成本保护。
            </p>
          </div>

          <div className="workflow-strip" aria-label="工作流程">
            {workflowSteps.map((step, index) => (
              <div key={step} className="workflow-strip__item">
                <span>步骤 {index + 1}</span>
                <strong>{step}</strong>
              </div>
            ))}
          </div>

          <div className="notice-paper">
            真实生成使用你自己的模型额度；Mock 模式不产生费用。链接仅用于识别来源，不会自动下载公开视频或绕过平台限制。
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
          <section className="paper-panel paper-panel--padded paper-panel--accent">
            <div className="mb-6 grid gap-1">
              <p className="section-kicker">Create</p>
              <h2 className="section-title">创建新任务</h2>
              <p className="text-sm leading-6 text-neutral-600">先写清任务目标。视频可在这里上传，也可以进入任务后再补充。</p>
            </div>
            <CreateTaskForm />
          </section>

          <aside className="grid content-start gap-4">
            <section className="paper-panel paper-panel--padded">
              <p className="section-kicker">Recent</p>
              <h2 className="section-title">最近任务</h2>
              <div className="mt-4 grid">
                {tasks.length ? tasks.map((task) => (
                  <Link key={task.task_id} href={`/tasks/${task.task_id}`} className="task-row text-sm">
                    <span className="break-all font-medium">{task.task_name ?? task.task_id}</span>
                    {task.task_name ? <span className="break-all text-xs text-neutral-500">{task.task_id}</span> : null}
                    <span className="text-neutral-600">状态：{task.status} · 当前步骤：{task.current_step}</span>
                    <span className="text-xs text-neutral-500">更新：{task.updated_at}</span>
                  </Link>
                )) : (
                  <p className="py-4 text-sm text-neutral-500">暂无任务。创建第一个任务后会显示在这里。</p>
                )}
              </div>
            </section>

            <section className="paper-panel paper-panel--padded">
              <p className="section-kicker">Guide</p>
              <h2 className="section-title">开始之前</h2>
              <div className="mt-4 grid gap-2 text-sm">
                <Link className="rounded-md border border-neutral-300 bg-white px-3 py-2 font-medium hover:border-neutral-500" href="/docs">
                  打开使用说明
                </Link>
                <Link className="rounded-md border border-neutral-300 bg-white px-3 py-2 font-medium hover:border-neutral-500" href="/settings">
                  检查模型配置
                </Link>
                <p className="mt-2 leading-6 text-neutral-500">建议先用 Mock 模式熟悉流程，再打开真实视频生成。</p>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
