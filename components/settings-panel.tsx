"use client";

import { useEffect, useState } from "react";

type SettingsValue = { kind: "secret"; present: boolean } | { kind: "plain"; value: string };
type SettingsSnapshot = Record<string, SettingsValue>;
type Runtime = {
  mock_mode: boolean;
  llm_provider: string;
  video_provider: string;
  paid_api_calls: boolean;
  max_video_scenes_per_run: number;
};
type TestResult = { ok: boolean; message: string; tested: boolean };

const PLAIN_DEFAULTS: Record<string, string> = {
  LLM_PROVIDER: "deepseek",
  VIDEO_PROVIDER: "seedance",
  TTS_PROVIDER: "mock",
  MOCK_MODE: "false",
  ENABLE_PAID_API_CALLS: "false",
  ENABLE_PAID_TTS_CALLS: "false",
  MAX_VIDEO_SCENES_PER_RUN: "3",
  MAX_RETRY_PER_SCENE: "1",
  MAX_ANALYSIS_FRAMES: "6"
};

const inputClass =
  "h-11 rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-900";
const cardClass = "paper-panel paper-panel--padded grid gap-4";

export function SettingsPanel() {
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [tests, setTests] = useState<Record<string, TestResult | "loading">>({});

  function hydrate(payload: { settings: SettingsSnapshot; runtime: Runtime }) {
    setSnapshot(payload.settings);
    setRuntime(payload.runtime);
    const next: Record<string, string> = {};
    for (const [key, value] of Object.entries(payload.settings)) {
      next[key] = value.kind === "plain" ? value.value || PLAIN_DEFAULTS[key] || "" : "";
    }
    setForm(next);
  }

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((payload) => {
        if (payload.error) {
          setError(payload.error);
          setStatus("error");
        } else {
          hydrate(payload);
        }
      })
      .catch((e) => {
        setError(String(e));
        setStatus("error");
      });
  }, []);

  function set(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setStatus("idle");
  }

  async function save(overrides?: Record<string, string>) {
    setStatus("saving");
    setError("");
    const body = { ...form, ...(overrides ?? {}) };
    // Drop empty secret fields so existing secrets are not wiped.
    for (const [key, value] of Object.entries(body)) {
      if (snapshot?.[key]?.kind === "secret" && value.trim() === "") delete body[key];
    }
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({ error: "保存失败" }));
    if (!response.ok || payload.error) {
      setError(payload.error ?? "保存失败");
      setStatus("error");
      return;
    }
    hydrate(payload);
    setStatus("saved");
  }

  async function applyPreset(preset: "mock" | "real") {
    const overrides: Record<string, string> =
      preset === "mock"
        ? {
            MOCK_MODE: "true",
            LLM_PROVIDER: "mock",
            VIDEO_PROVIDER: "mock",
            TTS_PROVIDER: "mock",
            ENABLE_PAID_API_CALLS: "false",
            ENABLE_PAID_TTS_CALLS: "false"
          }
        : {
            MOCK_MODE: "false",
            LLM_PROVIDER: "deepseek",
            VIDEO_PROVIDER: "seedance",
            ENABLE_PAID_API_CALLS: "false",
            MAX_VIDEO_SCENES_PER_RUN: "3"
          };
    setForm((prev) => ({ ...prev, ...overrides }));
    await save(overrides);
  }

  async function runTest(provider: string) {
    setTests((prev) => ({ ...prev, [provider]: "loading" }));
    const response = await fetch("/api/settings/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider })
    });
    const payload = (await response.json().catch(() => ({ ok: false, message: "测试失败", tested: false }))) as TestResult;
    setTests((prev) => ({ ...prev, [provider]: payload }));
  }

  if (!snapshot) {
    return <p className="text-sm text-neutral-500">{error ? `加载失败：${error}` : "加载配置中…"}</p>;
  }

  const secretBadge = (key: string) => {
    const present = snapshot[key]?.kind === "secret" && snapshot[key].present;
    return (
      <span className={`text-xs ${present ? "text-emerald-600" : "text-neutral-400"}`}>
        {present ? "已配置（留空则不修改）" : "未配置"}
      </span>
    );
  };

  const testButton = (provider: string) => {
    const result = tests[provider];
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => runTest(provider)}
          className="h-9 rounded-md border border-neutral-300 px-3 text-xs font-medium hover:border-neutral-900"
        >
          {result === "loading" ? "测试中…" : "测试连接"}
        </button>
        {result && result !== "loading" ? (
          <span className={`text-xs ${result.ok ? "text-emerald-600" : "text-red-600"}`}>
            {result.ok ? "✅ " : "❌ "}
            {result.message}
          </span>
        ) : null}
      </div>
    );
  };

  return (
    <div className="grid gap-6">
      {runtime ? (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
          当前生效：模式 <b>{runtime.mock_mode ? "Mock（免费）" : "真实"}</b> · LLM <b>{runtime.llm_provider}</b> · 视频{" "}
          <b>{runtime.video_provider}</b> · 付费调用 <b>{runtime.paid_api_calls ? "开" : "关"}</b> · 每次最多{" "}
          <b>{runtime.max_video_scenes_per_run}</b> 个场景。保存后立即生效，无需重启。
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => applyPreset("mock")}
          className="h-10 rounded-md border border-neutral-300 px-4 text-sm font-medium hover:border-neutral-900"
        >
          预设：Mock（免费测试）
        </button>
        <button
          type="button"
          onClick={() => applyPreset("real")}
          className="h-10 rounded-md border border-neutral-300 px-4 text-sm font-medium hover:border-neutral-900"
        >
          预设：真实模型（仍关闭付费生成）
        </button>
      </div>

      <p className="text-xs leading-5 text-neutral-500">
        真实模型预设只切换 Provider，不会代你打开付费调用。填好 Key 并测试连接后，再在下方显式开启付费视频生成。
      </p>

      {/* 模式 */}
      <section className={cardClass}>
        <h2 className="text-base font-semibold">运行模式</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.MOCK_MODE !== "false"}
            onChange={(e) => set("MOCK_MODE", e.target.checked ? "true" : "false")}
          />
          Mock 模式（免费测试，不调用任何付费 API）
        </label>
      </section>

      {/* LLM */}
      <section className={cardClass}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">文本模型（LLM）</h2>
        </div>
        <label className="grid gap-1 text-sm font-medium">
          Provider
          <select value={form.LLM_PROVIDER || "deepseek"} onChange={(e) => set("LLM_PROVIDER", e.target.value)} className={inputClass}>
            <option value="mock">mock</option>
            <option value="deepseek">deepseek</option>
            <option value="openai">openai</option>
            <option value="claude">claude</option>
          </select>
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium">
            DeepSeek API Key {secretBadge("DEEPSEEK_API_KEY")}
            <input type="password" value={form.DEEPSEEK_API_KEY || ""} onChange={(e) => set("DEEPSEEK_API_KEY", e.target.value)} className={inputClass} placeholder="留空则不修改" />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            DeepSeek Model
            <input value={form.DEEPSEEK_MODEL || ""} onChange={(e) => set("DEEPSEEK_MODEL", e.target.value)} className={inputClass} placeholder="deepseek-chat" />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            OpenAI API Key {secretBadge("OPENAI_API_KEY")}
            <input type="password" value={form.OPENAI_API_KEY || ""} onChange={(e) => set("OPENAI_API_KEY", e.target.value)} className={inputClass} placeholder="留空则不修改" />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            OpenAI 文本 Model
            <input value={form.OPENAI_MODEL || ""} onChange={(e) => set("OPENAI_MODEL", e.target.value)} className={inputClass} placeholder="gpt-4o" />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            OpenAI 视觉 Model（分析原视频用）
            <input value={form.OPENAI_VISION_MODEL || ""} onChange={(e) => set("OPENAI_VISION_MODEL", e.target.value)} className={inputClass} placeholder="留空默认 gpt-4o" />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Anthropic API Key {secretBadge("ANTHROPIC_API_KEY")}
            <input type="password" value={form.ANTHROPIC_API_KEY || ""} onChange={(e) => set("ANTHROPIC_API_KEY", e.target.value)} className={inputClass} placeholder="留空则不修改" />
          </label>
        </div>
        <div className="flex flex-wrap gap-4">
          {testButton("openai")}
          {testButton("deepseek")}
          {testButton("claude")}
        </div>
        <p className="text-xs text-neutral-500">提示：分析原视频关键帧需要视觉模型（OpenAI）。即使 LLM Provider 选 deepseek，只要填了 OpenAI Key，分析步骤会自动用 OpenAI 视觉，其余文本步骤仍用 deepseek。</p>
      </section>

      {/* 视频 */}
      <section className={cardClass}>
        <h2 className="text-base font-semibold">视频生成（Seedance）</h2>
        <label className="grid gap-1 text-sm font-medium">
          Provider
          <select value={form.VIDEO_PROVIDER || "seedance"} onChange={(e) => set("VIDEO_PROVIDER", e.target.value)} className={inputClass}>
            <option value="mock">mock</option>
            <option value="seedance">seedance</option>
          </select>
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium">
            Seedance API Key {secretBadge("SEEDANCE_API_KEY")}
            <input type="password" value={form.SEEDANCE_API_KEY || ""} onChange={(e) => set("SEEDANCE_API_KEY", e.target.value)} className={inputClass} placeholder="留空则不修改" />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Seedance Model
            <input value={form.SEEDANCE_MODEL || ""} onChange={(e) => set("SEEDANCE_MODEL", e.target.value)} className={inputClass} placeholder="doubao-seedance-1-0-pro-250528" />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            分辨率
            <input value={form.SEEDANCE_RESOLUTION || ""} onChange={(e) => set("SEEDANCE_RESOLUTION", e.target.value)} className={inputClass} placeholder="720p" />
          </label>
        </div>
        {testButton("seedance")}
      </section>

      {/* 成本 */}
      <section className={cardClass}>
        <h2 className="text-base font-semibold">成本与行为</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.ENABLE_PAID_API_CALLS === "true"} onChange={(e) => set("ENABLE_PAID_API_CALLS", e.target.checked ? "true" : "false")} />
            允许付费视频生成（Seedance）
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.ENABLE_PAID_TTS_CALLS === "true"} onChange={(e) => set("ENABLE_PAID_TTS_CALLS", e.target.checked ? "true" : "false")} />
            允许付费 TTS
          </label>
          <label className="grid gap-1 text-sm font-medium">
            每次最多生成场景数
            <input value={form.MAX_VIDEO_SCENES_PER_RUN || ""} onChange={(e) => set("MAX_VIDEO_SCENES_PER_RUN", e.target.value)} className={inputClass} placeholder="3" />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            分析最多送入帧数
            <input value={form.MAX_ANALYSIS_FRAMES || ""} onChange={(e) => set("MAX_ANALYSIS_FRAMES", e.target.value)} className={inputClass} placeholder="6" />
          </label>
        </div>
      </section>

      {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {status === "saved" ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">已保存并立即生效。</p> : null}

      <div>
        <button
          type="button"
          onClick={() => save()}
          disabled={status === "saving"}
          className="h-11 rounded-md bg-neutral-950 px-5 text-sm font-medium text-white disabled:bg-neutral-500"
        >
          {status === "saving" ? "保存中…" : "保存配置"}
        </button>
      </div>
    </div>
  );
}
