import { CreateTaskForm } from "../components/create-task-form";

export default function HomePage() {
  return (
    <main className="min-h-screen px-5 py-8">
      <div className="mx-auto grid max-w-4xl gap-6">
        <header className="grid gap-2">
          <p className="text-sm font-medium text-neutral-500">v0.1 local mock workflow</p>
          <h1 className="text-3xl font-semibold tracking-normal">短视频复刻自动化工作台</h1>
          <p className="max-w-2xl text-sm leading-6 text-neutral-600">
            输入链接或上传你有权限的素材，系统会生成结构拆解、原创改编脚本、视频模型提示词和制作包。
          </p>
        </header>
        <section className="rounded-lg border border-neutral-200 bg-white p-5">
          <CreateTaskForm />
        </section>
      </div>
    </main>
  );
}
