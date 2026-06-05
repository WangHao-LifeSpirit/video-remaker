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

export default async function HomePage() {
  const tasks = await recentTasks();
  return (
    <main className="min-h-screen px-5 py-8">
      <div className="mx-auto grid max-w-6xl gap-6">
        <header className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-5">
          <div className="grid gap-2">
            <p className="text-sm font-medium text-neutral-500">v2.0 Local Video Remaker Workbench</p>
            <h1 className="text-3xl font-semibold tracking-normal">Video Remaker</h1>
            <p className="max-w-3xl text-sm leading-6 text-neutral-600">
              本地网页端短视频复刻自动化工作台。输入链接、上传自己有权限的素材或补充文案后，系统按 Agent 流程生成原创改编方案、视频片段、字幕、封面和成片资产。
            </p>
          </div>
          <div className="grid gap-2 text-sm text-neutral-700 md:grid-cols-5">
            {["链接/上传素材", "Agent 分析与分镜", "视频生成", "字幕/音频", "成片导出"].map((step, index) => (
              <div key={step} className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
                <p className="text-xs text-neutral-500">Step {index + 1}</p>
                <p className="font-medium">{step}</p>
              </div>
            ))}
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Provider 配置提醒：真实生成需要你自己的 `.env` Key；mock 不消耗费用。链接解析不会自动下载公开视频，也不会绕过平台限制。
          </div>
        </header>
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-lg border border-neutral-200 bg-white p-5">
            <div className="mb-4 grid gap-1">
              <h2 className="text-lg font-semibold">创建新任务</h2>
              <p className="text-sm text-neutral-600">先创建任务，再进入任务详情页上传原视频、解析链接、运行 Agent 和导出成片。</p>
            </div>
            <CreateTaskForm />
          </section>
          <aside className="grid gap-4">
            <section className="rounded-lg border border-neutral-200 bg-white p-5">
              <h2 className="text-lg font-semibold">最近任务</h2>
              <div className="mt-3 grid gap-2">
                {tasks.length ? tasks.map((task) => (
                  <Link key={task.task_id} href={`/tasks/${task.task_id}`} className="grid gap-1 rounded-md border border-neutral-200 p-3 text-sm hover:border-neutral-400">
                    <span className="break-all font-medium">{task.task_id}</span>
                    <span className="text-neutral-600">状态：{task.status}；步骤：{task.current_step}</span>
                    <span className="text-xs text-neutral-500">更新：{task.updated_at}</span>
                  </Link>
                )) : (
                  <p className="text-sm text-neutral-500">暂无任务。创建第一个任务后会显示在这里。</p>
                )}
              </div>
            </section>
            <section className="rounded-lg border border-neutral-200 bg-white p-5">
              <h2 className="text-lg font-semibold">使用说明</h2>
              <div className="mt-3 grid gap-2 text-sm">
                <Link className="rounded-md border border-neutral-200 px-3 py-2 hover:border-neutral-400" href="/docs">打开 v2.0 使用说明</Link>
                <p className="text-neutral-500">完整交付文档仍保存在项目根目录：README、USER_GUIDE、TROUBLESHOOTING、CUSTOMER_HANDOFF。</p>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
