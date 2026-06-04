"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type RunFullResult = {
  task_id?: string;
  mode?: "dry-run";
  status?: string;
  current_step?: string;
  provider: string;
  scene_limit: number;
  resume: boolean;
  force: boolean;
  paid_api_calls: boolean;
  max_video_scenes_per_run: number;
  cost_guard_note: string;
  steps: string[];
  outputs?: {
    final_mp4?: string;
    production_package_md?: string;
    project_package_json?: string;
  };
};

type RuntimeStatus = {
  video_provider: string;
  paid_api_calls: boolean;
  max_video_scenes_per_run: number;
  enable_paid_api_calls_raw: string;
};

type TaskSummary = {
  task_id: string;
  status: string;
  current_step: string;
  export_paths: {
    mp4?: string;
    markdown?: string;
    json?: string;
  };
};

const visibleSteps = ["analyze", "storyboard", "remake", "prompts", "generate-assets", "assemble", "export"];

function stepState(step: string, result?: RunFullResult): "pending" | "done" | "skipped" | "planned" {
  if (!result) return "pending";
  const entries = result.steps ?? [];
  if (entries.some((entry) => entry === `${step}-skipped` || entry.includes(`${step} would be skipped`))) {
    return "skipped";
  }
  if (entries.some((entry) => entry === step || entry.startsWith(`${step} `) || entry.includes(`${step} would run`))) {
    return result.mode === "dry-run" ? "planned" : "done";
  }
  return "pending";
}

function statusLabel(value: ReturnType<typeof stepState>) {
  if (value === "done") return "完成";
  if (value === "skipped") return "跳过";
  if (value === "planned") return "将执行";
  return "等待";
}

export function RunFullPanel({
  task,
  runtime
}: {
  task: TaskSummary;
  runtime: RuntimeStatus;
}) {
  const router = useRouter();
  const [provider, setProvider] = useState(runtime.video_provider === "seedance" ? "seedance" : "seedance");
  const [sceneLimit, setSceneLimit] = useState(Math.min(3, runtime.max_video_scenes_per_run));
  const [assemble, setAssemble] = useState(true);
  const [shouldExport, setShouldExport] = useState(true);
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState<"idle" | "dry-run" | "run">("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<RunFullResult | undefined>();

  const outputs = useMemo(
    () => ({
      final_mp4: result?.outputs?.final_mp4 ?? task.export_paths.mp4,
      production_package_md: result?.outputs?.production_package_md ?? task.export_paths.markdown,
      project_package_json: result?.outputs?.project_package_json ?? task.export_paths.json
    }),
    [result, task.export_paths.json, task.export_paths.markdown, task.export_paths.mp4]
  );

  async function submit(dryRun: boolean) {
    setError("");
    if (sceneLimit > runtime.max_video_scenes_per_run) {
      setError(`scene-limit 不能超过 ${runtime.max_video_scenes_per_run}`);
      return;
    }
    setBusy(dryRun ? "dry-run" : "run");
    try {
      const response = await fetch(`/api/tasks/${task.task_id}/run-full`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          sceneLimit,
          assemble,
          export: shouldExport,
          dryRun,
          force
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "运行失败");
      }
      setResult(payload as RunFullResult);
      if (!dryRun) {
        router.refresh();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "运行失败");
    } finally {
      setBusy("idle");
    }
  }

  const paidDisabled = provider !== "mock" && !runtime.paid_api_calls;

  return (
    <section className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">一键生成</h2>
        <p className="text-sm text-neutral-600">
          当前 provider：{provider}；scene-limit：{sceneLimit}；付费 API：{runtime.paid_api_calls ? "已开启" : "已关闭"}
        </p>
        {paidDisabled ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            真实视频生成被成本保护关闭，运行将 fallback mock 或 dry-run。
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="grid gap-2 text-sm font-medium">
          Provider
          <select
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
            className="h-10 rounded-md border border-neutral-300 bg-white px-3 font-normal"
          >
            <option value="seedance">seedance</option>
            <option value="mock">mock</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Scene limit
          <input
            type="number"
            min={1}
            max={runtime.max_video_scenes_per_run}
            value={sceneLimit}
            onChange={(event) => setSceneLimit(Number(event.target.value))}
            className="h-10 rounded-md border border-neutral-300 bg-white px-3 font-normal"
          />
        </label>
        <div className="grid gap-2 text-sm font-medium">
          上限
          <p className="flex h-10 items-center rounded-md border border-neutral-200 bg-neutral-50 px-3 font-normal text-neutral-700">
            {runtime.max_video_scenes_per_run} scenes
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={assemble} onChange={(event) => setAssemble(event.target.checked)} />
          合成 MP4
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={shouldExport} onChange={(event) => setShouldExport(event.target.checked)} />
          导出制作包
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} />
          Force
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== "idle"}
          onClick={() => submit(true)}
          className="h-10 rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium disabled:opacity-60"
        >
          {busy === "dry-run" ? "预估中..." : "Dry-run 预估"}
        </button>
        <button
          type="button"
          disabled={busy !== "idle"}
          onClick={() => submit(false)}
          className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white disabled:bg-neutral-500"
        >
          {busy === "run" ? "生成中..." : "一键生成"}
        </button>
      </div>

      {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-2">
        <h3 className="text-sm font-semibold">步骤状态</h3>
        <div className="grid gap-2 md:grid-cols-2">
          {visibleSteps.map((step) => {
            const state = stepState(step, result);
            return (
              <div key={step} className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2 text-sm">
                <span>{step}</span>
                <span className="text-neutral-600">{statusLabel(state)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {result ? (
        <pre className="max-h-56 overflow-auto rounded-md bg-neutral-950 p-3 text-xs leading-5 text-neutral-100">
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}

      <div className="grid gap-2">
        <h3 className="text-sm font-semibold">下载结果</h3>
        <div className="flex flex-wrap gap-2">
          <a
            className={`rounded-md border px-3 py-2 text-sm font-medium ${outputs.final_mp4 ? "border-neutral-300 bg-white" : "pointer-events-none border-neutral-200 bg-neutral-100 text-neutral-400"}`}
            href={`/api/tasks/${task.task_id}/download?file=final.mp4`}
          >
            final.mp4
          </a>
          <a
            className={`rounded-md border px-3 py-2 text-sm font-medium ${outputs.production_package_md ? "border-neutral-300 bg-white" : "pointer-events-none border-neutral-200 bg-neutral-100 text-neutral-400"}`}
            href={`/api/tasks/${task.task_id}/download?file=production-package.md`}
          >
            production-package.md
          </a>
          <a
            className={`rounded-md border px-3 py-2 text-sm font-medium ${outputs.project_package_json ? "border-neutral-300 bg-white" : "pointer-events-none border-neutral-200 bg-neutral-100 text-neutral-400"}`}
            href={`/api/tasks/${task.task_id}/download?file=project-package.json`}
          >
            project-package.json
          </a>
        </div>
      </div>
    </section>
  );
}
