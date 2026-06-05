import Link from "next/link";

const workflow = [
  "创建任务，输入链接或上传自己有权限的原视频。",
  "在任务详情页补充原字幕、原文案、画面说明和复刻要求。",
  "运行 dry-run 预估，确认成本保护和 scene-limit。",
  "运行一键生成，让 Storyboard / Content Creator / Review Agent 产出脚本、分镜和 prompts。",
  "生成或准备字幕、旁白稿和 mock 音频。",
  "合成 final.mp4，必要时烧录字幕生成 final_subtitled.mp4。",
  "在成片资产区下载 MP4、封面图、制作包和 JSON 项目包。"
];

export default function DocsPage() {
  return (
    <main className="min-h-screen px-5 py-8">
      <div className="mx-auto grid max-w-4xl gap-6">
        <header className="grid gap-2">
          <Link className="text-sm font-medium text-neutral-500" href="/">返回首页</Link>
          <p className="text-sm font-medium text-neutral-500">v2.0 Local Video Remaker Workbench</p>
          <h1 className="text-3xl font-semibold tracking-normal">使用说明</h1>
          <p className="text-sm leading-6 text-neutral-600">
            这是本地运行的短视频复刻自动化工作台。它学习视频结构并生成原创改编内容，不自动下载公开视频，也不绕过平台限制。
          </p>
        </header>

        <section className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="text-lg font-semibold">推荐流程</h2>
          <div className="grid gap-2">
            {workflow.map((item, index) => (
              <div key={item} className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
                <p className="text-xs text-neutral-500">Step {index + 1}</p>
                <p>{item}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Provider 说明</h2>
          <div className="grid gap-2 text-sm text-neutral-700">
            <p>LLM Provider 负责分析、分镜、改编、prompt 和审稿；可配置 mock / deepseek / openai / claude。</p>
            <p>Video Provider 负责生成视频片段；稳定链路是 mock / seedance，kling / luma 是实验性架构。</p>
            <p>真实生成需要你自己的 API Key 和成本保护开关；mock 不消耗费用。</p>
            <p>修改 `.env` 后需要重启本地服务。</p>
          </div>
        </section>

        <section className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="text-lg font-semibold">更多文档</h2>
          <div className="grid gap-2 text-sm text-neutral-700">
            <p>README.md：安装、配置和完整能力说明。</p>
            <p>USER_GUIDE.md：面向使用者的操作手册。</p>
            <p>TROUBLESHOOTING.md：常见问题和修复方式。</p>
            <p>CUSTOMER_HANDOFF.md：面向客户的交付说明。</p>
            <p>AGENT_CONTEXT.md：给后续 Agent / Codex 继续开发的上下文。</p>
          </div>
        </section>
      </div>
    </main>
  );
}
