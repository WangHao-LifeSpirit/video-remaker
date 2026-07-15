import Link from "next/link";
import { SettingsPanel } from "../../components/settings-panel";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <main className="workbench-page">
      <div className="workbench-shell max-w-4xl">
        <header className="paper-panel paper-panel--accent paper-panel--padded grid gap-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="page-kicker">LOCAL SETTINGS</p>
              <h1 className="page-title text-3xl">模型与成本设置</h1>
            </div>
            <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900">
              ← 返回首页
            </Link>
          </div>
          <p className="text-sm leading-6 text-neutral-600">
            在这里切换文本模型和视频模型、填写本机密钥、测试连接，并控制真实生成的成本开关。保存后立即生效，无需重启本地服务。
            API Key 只写入本机 <code>.env</code>，页面不会回显已保存的密钥。
          </p>
        </header>
        <SettingsPanel />
      </div>
    </main>
  );
}
