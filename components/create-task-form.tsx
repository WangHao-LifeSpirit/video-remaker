"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SubmitState = "idle" | "submitting" | "error";

export function CreateTaskForm() {
  const router = useRouter();
  const [state, setState] = useState<SubmitState>("idle");
  const [error, setError] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setError("");
    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/tasks", {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "创建任务失败" }));
      setError(payload.error ?? "创建任务失败");
      setState("error");
      return;
    }

    const payload = (await response.json()) as { task_id: string };
    router.push(`/tasks/${payload.task_id}`);
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      <div className="grid gap-2">
        <label className="text-sm font-medium" htmlFor="url">
          视频链接
        </label>
        <input
          id="url"
          name="url"
          className="h-11 rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-900"
          placeholder="粘贴官方短视频链接或分享文本"
        />
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium" htmlFor="upload">
          上传视频
        </label>
        <input id="upload" name="upload" type="file" className="text-sm" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          平台
          <select name="platform" className="h-11 rounded-md border border-neutral-300 bg-white px-3 font-normal">
            <option value="douyin">抖音</option>
            <option value="kuaishou">快手</option>
            <option value="xiaohongshu">小红书</option>
            <option value="bilibili">Bilibili</option>
            <option value="youtube">YouTube</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          目标平台
          <input name="target_platform" defaultValue="douyin" className="h-11 rounded-md border border-neutral-300 bg-white px-3 font-normal" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          视频时长
          <input name="duration" defaultValue="30s" className="h-11 rounded-md border border-neutral-300 bg-white px-3 font-normal" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          风格
          <input
            name="style"
            defaultValue="clean, fast-paced, creator-style short video"
            className="h-11 rounded-md border border-neutral-300 bg-white px-3 font-normal"
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          复刻强度
          <select name="remake_strength" defaultValue="medium" className="h-11 rounded-md border border-neutral-300 bg-white px-3 font-normal">
            <option value="low">低</option>
            <option value="medium">中</option>
            <option value="high">高</option>
          </select>
        </label>
        <label className="flex items-center gap-2 pt-7 text-sm font-medium">
          <input type="checkbox" name="is_original_remake" defaultChecked />
          是否原创改编
        </label>
      </div>

      <label className="grid gap-2 text-sm font-medium">
        补充文案
        <textarea name="text_notes" rows={4} className="rounded-md border border-neutral-300 bg-white p-3 font-normal" />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        补充字幕
        <textarea name="transcript" rows={4} className="rounded-md border border-neutral-300 bg-white p-3 font-normal" />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        补充截图描述
        <textarea name="screenshot_notes" rows={4} className="rounded-md border border-neutral-300 bg-white p-3 font-normal" />
      </label>

      {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <button
        type="submit"
        disabled={state === "submitting"}
        className="h-11 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white disabled:bg-neutral-500"
      >
        {state === "submitting" ? "正在创建..." : "创建任务"}
      </button>
    </form>
  );
}
