"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SourceLinkInfo } from "../lib/types/source-link";

type SourceAction = "parse-link" | "upload" | "analyze-source" | "extract-frames" | "source-notes";

type ActionPayload = {
  status?: string;
  uploaded_video?: {
    uploaded_video_path?: string;
    original_filename?: string;
  };
  duration_seconds?: number;
  frames?: Array<unknown>;
  input_json_path?: string;
  source_link?: SourceLinkInfo;
  next_action?: string;
  error?: string;
};

export function SourceMaterialActions({
  taskId,
  initialNotes
}: {
  taskId: string;
  initialNotes: {
    source_link?: SourceLinkInfo;
    source_transcript?: string;
    source_caption?: string;
    screenshot_notes?: string;
    remake_requirements?: string;
  };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<SourceAction | "idle">("idle");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState(initialNotes.source_link?.normalized_url ?? initialNotes.source_link?.url ?? "");
  const [sourceTranscript, setSourceTranscript] = useState(initialNotes.source_transcript ?? "");
  const [sourceCaption, setSourceCaption] = useState(initialNotes.source_caption ?? "");
  const [screenshotNotes, setScreenshotNotes] = useState(initialNotes.screenshot_notes ?? "");
  const [remakeRequirements, setRemakeRequirements] = useState(initialNotes.remake_requirements ?? "");

  async function parseResponse(response: Response): Promise<ActionPayload> {
    const payload = (await response.json().catch(() => ({}))) as ActionPayload;
    if (!response.ok) {
      throw new Error(payload.error ?? "操作失败");
    }
    return payload;
  }

  async function uploadVideo() {
    if (!file) {
      setMessage("请选择 mp4 / mov / webm 文件。");
      return;
    }
    setBusy("upload");
    setMessage("");
    try {
      const formData = new FormData();
      formData.set("video", file);
      const payload = await parseResponse(await fetch(`/api/tasks/${taskId}/upload-video`, {
        method: "POST",
        body: formData
      }));
      setMessage(`上传完成：${payload.uploaded_video?.uploaded_video_path ?? payload.uploaded_video?.original_filename ?? "source video"}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上传失败");
    } finally {
      setBusy("idle");
    }
  }

  async function parseLink() {
    if (!sourceUrl.trim()) {
      setMessage("请输入短视频链接。");
      return;
    }
    setBusy("parse-link");
    setMessage("");
    try {
      const payload = await parseResponse(await fetch(`/api/tasks/${taskId}/parse-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sourceUrl })
      }));
      setMessage(`链接解析完成：${payload.source_link?.platform ?? "unknown"} · ${payload.source_link?.status ?? "needs_user_input"}。${payload.next_action ?? ""}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "解析失败");
    } finally {
      setBusy("idle");
    }
  }

  async function postJson(action: Exclude<SourceAction, "upload" | "parse-link">, body?: unknown) {
    setBusy(action);
    setMessage("");
    try {
      const payload = await parseResponse(await fetch(`/api/tasks/${taskId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {})
      }));
      if (action === "analyze-source") {
        setMessage(`元信息读取完成：${payload.duration_seconds ?? "-"} 秒。`);
      } else if (action === "extract-frames") {
        setMessage(`关键帧抽取完成：${payload.frames?.length ?? 0} 张。`);
      } else {
        setMessage(`补充材料已保存：${payload.input_json_path ?? "input.json"}`);
      }
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusy("idle");
    }
  }

  return (
    <div className="grid gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
      <div className="grid gap-2">
        <label className="grid gap-1">
          <span className="font-medium text-neutral-700">短视频链接</span>
          <input
            type="url"
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="https://v.douyin.com/... 或 https://www.bilibili.com/video/..."
            className="rounded-md border border-neutral-300 bg-white p-2"
          />
        </label>
        <button type="button" disabled={busy !== "idle"} onClick={parseLink} className="w-fit rounded-md border border-neutral-300 bg-white px-3 py-2 font-medium disabled:opacity-60">
          {busy === "parse-link" ? "解析中..." : "解析链接"}
        </button>
        <p className="text-neutral-500">链接解析只识别平台和安全状态，不下载公开视频，不处理登录、cookie、验证码或反爬。</p>
      </div>

      <div className="grid gap-2">
        <input
          type="file"
          accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="block w-full text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy !== "idle"} onClick={uploadVideo} className="rounded-md bg-neutral-950 px-3 py-2 font-medium text-white disabled:bg-neutral-500">
            {busy === "upload" ? "上传中..." : "上传原视频"}
          </button>
          <button type="button" disabled={busy !== "idle"} onClick={() => postJson("analyze-source")} className="rounded-md border border-neutral-300 bg-white px-3 py-2 font-medium disabled:opacity-60">
            {busy === "analyze-source" ? "读取中..." : "读取元信息"}
          </button>
          <button type="button" disabled={busy !== "idle"} onClick={() => postJson("extract-frames", { max: 8 })} className="rounded-md border border-neutral-300 bg-white px-3 py-2 font-medium disabled:opacity-60">
            {busy === "extract-frames" ? "抽帧中..." : "抽取关键帧"}
          </button>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <textarea className="min-h-24 rounded-md border border-neutral-300 p-2" value={sourceTranscript} onChange={(event) => setSourceTranscript(event.target.value)} placeholder="原视频字幕 / 口播稿" />
        <textarea className="min-h-24 rounded-md border border-neutral-300 p-2" value={sourceCaption} onChange={(event) => setSourceCaption(event.target.value)} placeholder="原视频文案 / 标题 / 发布文案" />
        <textarea className="min-h-24 rounded-md border border-neutral-300 p-2" value={screenshotNotes} onChange={(event) => setScreenshotNotes(event.target.value)} placeholder="画面说明 / 截图描述" />
        <textarea className="min-h-24 rounded-md border border-neutral-300 p-2" value={remakeRequirements} onChange={(event) => setRemakeRequirements(event.target.value)} placeholder="复刻要求 / 改编边界 / 禁止事项" />
      </div>
      <button
        type="button"
        disabled={busy !== "idle"}
        onClick={() => postJson("source-notes", {
          source_transcript: sourceTranscript,
          source_caption: sourceCaption,
          screenshot_notes: screenshotNotes,
          remake_requirements: remakeRequirements
        })}
        className="w-fit rounded-md border border-neutral-300 bg-white px-3 py-2 font-medium disabled:opacity-60"
      >
        {busy === "source-notes" ? "保存中..." : "保存补充材料"}
      </button>
      <p className="text-neutral-500">本模块只处理用户上传和手动补充材料，不抓取公开视频，不调用 ASR 或任何模型 API。</p>
      {message ? <p className="break-all text-neutral-700">{message}</p> : null}
    </div>
  );
}
