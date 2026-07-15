"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SubmitState = "idle" | "creating" | "uploading" | "error";

export function CreateTaskForm() {
  const router = useRouter();
  const [state, setState] = useState<SubmitState>("idle");
  const [error, setError] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [createdTaskId, setCreatedTaskId] = useState<string>();

  function uploadVideo(taskId: string, file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("POST", `/api/tasks/${taskId}/upload-video`);
      request.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          setUploadProgress(Math.round((event.loaded / event.total) * 100));
        }
      });
      request.addEventListener("load", () => {
        if (request.status >= 200 && request.status < 300) {
          setUploadProgress(100);
          resolve();
          return;
        }
        try {
          const payload = JSON.parse(request.responseText) as { error?: string };
          reject(new Error(payload.error ?? "视频上传失败"));
        } catch {
          reject(new Error("视频上传失败"));
        }
      });
      request.addEventListener("error", () => reject(new Error("视频上传连接中断")));
      const uploadData = new FormData();
      uploadData.set("video", file);
      request.send(uploadData);
    });
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("creating");
    setError("");
    setUploadProgress(0);
    const formData = new FormData(event.currentTarget);
    const selectedFile = formData.get("upload");
    formData.delete("upload");

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        body: formData
      });
      const payload = (await response.json().catch(() => ({ error: "创建任务失败" }))) as {
        task_id?: string;
        error?: string;
      };
      if (!response.ok || !payload.task_id) {
        throw new Error(payload.error ?? "创建任务失败");
      }

      setCreatedTaskId(payload.task_id);
      if (selectedFile instanceof File && selectedFile.size > 0) {
        setState("uploading");
        await uploadVideo(payload.task_id, selectedFile);
      }
      router.push(`/tasks/${payload.task_id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建任务失败");
      setState("error");
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <label className="text-sm font-medium" htmlFor="task_name">
          任务名称
        </label>
        <input
          id="task_name"
          name="task_name"
          maxLength={80}
          required
          className="h-11 rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-900"
          placeholder="例如：AI 工作流案例"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="url">参考链接</label>
          <input
            id="url"
            name="url"
            className="h-11 rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none"
            placeholder="粘贴短视频链接或分享文本"
          />
        </div>
        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="upload">原视频文件</label>
          <input id="upload" name="upload" type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" className="min-h-11 w-full min-w-0 text-sm" />
          <p className="text-xs text-neutral-500">上传后无需在任务页重复选择。</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          原视频平台
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
          <select name="target_platform" defaultValue="douyin" className="h-11 rounded-md border border-neutral-300 bg-white px-3 font-normal">
            <option value="douyin">抖音</option>
            <option value="kuaishou">快手</option>
            <option value="xiaohongshu">小红书</option>
            <option value="bilibili">Bilibili</option>
            <option value="youtube">YouTube</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          目标时长
          <select name="duration" defaultValue="30s" className="h-11 rounded-md border border-neutral-300 bg-white px-3 font-normal">
            <option value="15s">15 秒</option>
            <option value="30s">30 秒</option>
            <option value="60s">60 秒</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          风格
          <input
            name="style"
            defaultValue="清晰、快节奏、创作者风格"
            className="h-11 rounded-md border border-neutral-300 bg-white px-3 font-normal"
          />
        </label>
      </div>

      <label className="grid gap-2 text-sm font-medium">
        结构参考强度
        <select name="remake_strength" defaultValue="medium" className="h-11 rounded-md border border-neutral-300 bg-white px-3 font-normal">
          <option value="low">低：只参考选题与节奏</option>
          <option value="medium">中：参考结构与镜头推进</option>
          <option value="high">高：强结构参考，仍保持原创表达</option>
        </select>
      </label>
      <input type="hidden" name="is_original_remake" value="on" />

      <details className="rounded-md border border-neutral-300 bg-neutral-50 p-3">
        <summary className="cursor-pointer text-sm font-medium">补充材料（可选）</summary>
        <div className="mt-4 grid gap-4">
          <label className="grid gap-2 text-sm font-medium">
            原视频文案 / 创作要求
            <textarea name="text_notes" rows={3} className="rounded-md border border-neutral-300 bg-white p-3 font-normal" />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            原字幕 / 口播稿
            <textarea name="transcript" rows={3} className="rounded-md border border-neutral-300 bg-white p-3 font-normal" />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            画面说明 / 截图描述
            <textarea name="screenshot_notes" rows={3} className="rounded-md border border-neutral-300 bg-white p-3 font-normal" />
          </label>
        </div>
      </details>

      {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {state === "uploading" ? (
        <div className="grid gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          <p>任务已创建，正在上传原视频：{uploadProgress}%</p>
          <div className="h-2 overflow-hidden rounded bg-blue-100">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      ) : null}

      {state === "error" && createdTaskId ? (
        <a className="text-sm font-medium text-blue-700 underline" href={`/tasks/${createdTaskId}`}>
          任务已经创建，进入工作台重试上传
        </a>
      ) : null}

      <button
        type="submit"
        disabled={state === "creating" || state === "uploading"}
        className="h-12 rounded-md bg-neutral-950 px-4 text-sm font-semibold text-white disabled:bg-neutral-500"
      >
        {state === "creating" ? "正在创建任务..." : state === "uploading" ? `正在上传 ${uploadProgress}%` : "创建任务，进入工作台"}
      </button>
    </form>
  );
}
