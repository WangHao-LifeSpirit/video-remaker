"use client";

import { useEffect, useMemo, useState } from "react";
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
  mock_mode: boolean;
  llm_provider: string;
  tts_provider: string;
  paid_tts_calls: boolean;
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

type JobStep = {
  name: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  message?: string;
  started_at?: string;
  finished_at?: string;
};

type RunFullJob = {
  job_id: string;
  task_id: string;
  status: "queued" | "running" | "success" | "failed";
  current_step: string;
  created_at?: string;
  updated_at?: string;
  steps: JobStep[];
  error?: string;
  reused?: boolean;
  message?: string;
  output_paths?: {
    final_mp4?: string;
    production_package?: string;
    project_package?: string;
  };
};

type JobHistoryItem = {
  job_id: string;
  task_id: string;
  status: "queued" | "running" | "success" | "failed";
  current_step: string;
  created_at: string;
  updated_at: string;
  error?: string;
  has_final_mp4: boolean;
  possibly_stuck: boolean;
  output_paths?: RunFullJob["output_paths"];
};

const visibleSteps = ["analyze", "storyboard", "remake", "prompts", "generate-assets", "assemble", "export"];

function dryRunStepState(step: string, result?: RunFullResult): "pending" | "done" | "skipped" | "planned" {
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

function jobStepState(step: string, job?: RunFullJob): "pending" | "running" | "done" | "skipped" | "failed" {
  const match = job?.steps.find((candidate) => candidate.name === step);
  if (!match) return "pending";
  if (match.status === "success") return "done";
  return match.status;
}

function statusLabel(value: ReturnType<typeof dryRunStepState> | ReturnType<typeof jobStepState>) {
  if (value === "done") return "完成";
  if (value === "running") return "运行中";
  if (value === "failed") return "失败";
  if (value === "skipped") return "跳过";
  if (value === "planned") return "将执行";
  return "等待";
}

export function RunFullPanel({
  task,
  runtime,
  showJobHistory = true
}: {
  task: TaskSummary;
  runtime: RuntimeStatus;
  showJobHistory?: boolean;
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
  const [job, setJob] = useState<RunFullJob | undefined>();
  const [jobHistory, setJobHistory] = useState<JobHistoryItem[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);

  const outputs = useMemo(
    () => ({
      final_mp4: job?.output_paths?.final_mp4 ?? result?.outputs?.final_mp4 ?? task.export_paths.mp4,
      production_package_md: job?.output_paths?.production_package ?? result?.outputs?.production_package_md ?? task.export_paths.markdown,
      project_package_json: job?.output_paths?.project_package ?? result?.outputs?.project_package_json ?? task.export_paths.json
    }),
    [job, result, task.export_paths.json, task.export_paths.markdown, task.export_paths.mp4]
  );

  const activeJob = useMemo(
    () => job ?? jobHistory.find((candidate) => candidate.status === "queued" || candidate.status === "running"),
    [job, jobHistory]
  );
  const jobIsActive = !!activeJob && (activeJob.status === "queued" || activeJob.status === "running");

  async function loadJobs() {
    setJobsLoading(true);
    try {
      const response = await fetch(`/api/tasks/${task.task_id}/jobs`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "读取历史 job 失败");
      }
      const jobs = (payload.jobs ?? []) as JobHistoryItem[];
      setJobHistory(jobs);
      const runningJob = jobs.find((candidate) => candidate.status === "queued" || candidate.status === "running");
      if (runningJob && (!job || job.job_id !== runningJob.job_id)) {
        setJob({
          job_id: runningJob.job_id,
          task_id: runningJob.task_id,
          status: runningJob.status,
          current_step: runningJob.current_step,
          created_at: runningJob.created_at,
          updated_at: runningJob.updated_at,
          steps: visibleSteps.map((name) => ({
            name,
            status: name === runningJob.current_step ? "running" : "pending"
          })),
          error: runningJob.error,
          output_paths: runningJob.output_paths
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "读取历史 job 失败");
    } finally {
      setJobsLoading(false);
    }
  }

  useEffect(() => {
    void loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.task_id]);

  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) {
      return;
    }

    let cancelled = false;
    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${job.job_id}`, { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error ?? "读取 job 状态失败");
        }
        if (cancelled) return;
        const nextJob = payload as RunFullJob;
        setJob(nextJob);
        if (nextJob.status === "success") {
          setBusy("idle");
          void loadJobs();
          router.refresh();
          window.clearInterval(interval);
        }
        if (nextJob.status === "failed") {
          setBusy("idle");
          setError(nextJob.error ?? "后台任务失败");
          void loadJobs();
          window.clearInterval(interval);
        }
      } catch (caught) {
        if (!cancelled) {
          setBusy("idle");
          setError(caught instanceof Error ? caught.message : "读取 job 状态失败");
          window.clearInterval(interval);
        }
      }
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [job, router]);

  async function submit(dryRun: boolean) {
    setError("");
    if (sceneLimit > runtime.max_video_scenes_per_run) {
      setError(`scene-limit 不能超过 ${runtime.max_video_scenes_per_run}`);
      return;
    }
    if (!dryRun && jobIsActive) {
      setJob(activeJob as RunFullJob);
      setError("任务运行中，已继续跟踪当前 job。");
      return;
    }
    setBusy(dryRun ? "dry-run" : "run");
    try {
      const response = await fetch(dryRun ? `/api/tasks/${task.task_id}/run-full` : `/api/tasks/${task.task_id}/jobs/run-full`, {
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
      if (dryRun) {
        setJob(undefined);
        setResult(payload as RunFullResult);
        setBusy("idle");
      } else {
        setResult(undefined);
        const nextJob = payload as RunFullJob;
        setJob(nextJob);
        if (nextJob.reused) {
          setError(nextJob.message ?? "任务运行中，已继续跟踪当前 job。");
        }
        void loadJobs();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "运行失败");
      setBusy("idle");
    } finally {
      if (dryRun) {
        setBusy("idle");
      }
    }
  }

  const paidDisabled = provider !== "mock" && !runtime.paid_api_calls;
  const canRun = busy === "idle" && !jobIsActive;

  return (
    <section className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">Step 3：视频生成与合成</h2>
        <p className="text-sm text-neutral-600">确认 provider、scene-limit 和成本保护后，使用 dry-run 预估或启动后台一键生成。</p>
        <p className="text-sm text-neutral-600">
          当前 LLM Provider：{runtime.llm_provider}；当前 Video Provider：{provider}；scene-limit：{sceneLimit}；付费 API：{runtime.paid_api_calls ? "已开启" : "已关闭"}
        </p>
        <div className="grid gap-1 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-600">
          <p>LLM Provider 影响分析、分镜、改编、prompt 和 review。</p>
          <p>Video Provider 影响视频片段生成；mock 不消耗费用，seedance 是当前稳定交付链路。</p>
          <p>实验性 provider：kling 已有部分 client 但未稳定验收；luma 预留配置，未作为稳定链路。</p>
        </div>
        {jobIsActive ? (
          <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
            任务运行中：{activeJob.job_id}；当前步骤：{activeJob.current_step}；最近更新：{activeJob.updated_at ?? "等待刷新"}
          </p>
        ) : null}
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
          disabled={!canRun}
          onClick={() => submit(false)}
          className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white disabled:bg-neutral-500"
        >
          {jobIsActive ? "任务运行中" : busy === "run" ? "生成中..." : "一键生成"}
        </button>
      </div>

      {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {job ? (
        <div className="grid gap-1 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
          <p>Job：{job.job_id}；状态：{job.status}；当前步骤：{job.current_step}</p>
          {job.updated_at ? <p>最近更新：{job.updated_at}</p> : null}
        </div>
      ) : null}

      <div className="grid gap-2">
        <h3 className="text-sm font-semibold">步骤状态</h3>
        <div className="grid gap-2 md:grid-cols-2">
          {visibleSteps.map((step) => {
            const state = job ? jobStepState(step, job) : dryRunStepState(step, result);
            const stepMessage = job?.steps.find((candidate) => candidate.name === step)?.message;
            return (
              <div key={step} className="grid gap-1 rounded-md border border-neutral-200 px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>{step}</span>
                  <span className="text-neutral-600">{statusLabel(state)}</span>
                </div>
                {stepMessage ? <p className="text-xs text-red-600">{stepMessage}</p> : null}
              </div>
            );
          })}
        </div>
      </div>

      {result || job ? (
        <pre className="max-h-56 overflow-auto rounded-md bg-neutral-950 p-3 text-xs leading-5 text-neutral-100">
          {JSON.stringify(job ?? result, null, 2)}
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

      {showJobHistory ? (
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">最近 Jobs</h3>
          <button
            type="button"
            disabled={jobsLoading}
            onClick={() => loadJobs()}
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-60"
          >
            {jobsLoading ? "刷新中..." : "刷新"}
          </button>
        </div>
        {jobHistory.length ? (
          <div className="grid gap-2">
            {jobHistory.slice(0, 8).map((item) => (
              <div key={item.job_id} className="grid gap-2 rounded-md border border-neutral-200 px-3 py-2 text-sm">
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div className="grid gap-1">
                    <p className="break-all font-medium">{item.job_id}</p>
                    <p className="text-neutral-600">
                      状态：{item.status}；当前步骤：{item.current_step}；final.mp4：{item.has_final_mp4 ? "有" : "无"}
                    </p>
                    <p className="text-xs text-neutral-500">
                      创建：{item.created_at}；更新：{item.updated_at}
                    </p>
                  </div>
                  {item.status === "failed" ? (
                    <button
                      type="button"
                      disabled={!canRun}
                      onClick={() => submit(false)}
                      className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm font-medium disabled:opacity-60"
                    >
                      重新运行
                    </button>
                  ) : null}
                </div>
                {item.possibly_stuck ? (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                    这个 job 超过 30 分钟没有更新，可能已卡住。
                  </p>
                ) : null}
                {item.error ? <p className="text-xs text-red-600">{item.error}</p> : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">暂无后台 job 记录。</p>
        )}
      </div>
      ) : null}
    </section>
  );
}
