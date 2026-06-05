"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type AudioSubtitleAction = "voiceover" | "subtitles" | "audio" | "prepare-audio";

type ActionPayload = {
  status?: string;
  provider?: string;
  segment_count?: number;
  voiceover_segments?: number;
  subtitle_segments?: number;
  voiceover_script_path?: string;
  subtitles_json_path?: string;
  srt_path?: string;
  audio_path?: string;
  generation_note?: string;
  error?: string;
};

function successMessage(action: AudioSubtitleAction, payload: ActionPayload): string {
  if (action === "voiceover") {
    return `旁白稿已生成：${payload.segment_count ?? 0} 段。`;
  }
  if (action === "subtitles") {
    return `字幕稿已生成：${payload.segment_count ?? 0} 段；SRT：${payload.srt_path ?? "-"}`;
  }
  if (action === "audio") {
    return `mock 音频已生成：${payload.audio_path ?? "-"}。`;
  }
  return `音频与字幕准备完成：旁白 ${payload.voiceover_segments ?? 0} 段，字幕 ${payload.subtitle_segments ?? 0} 段，音频 ${payload.audio_path ?? "-"}。`;
}

export function AudioSubtitleActions({
  taskId,
  ttsProvider,
  paidTtsCalls
}: {
  taskId: string;
  ttsProvider: string;
  paidTtsCalls: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<AudioSubtitleAction | "idle">("idle");
  const [message, setMessage] = useState("");

  async function runAction(action: AudioSubtitleAction) {
    setMessage("");
    setBusy(action);
    try {
      const response = await fetch(`/api/tasks/${taskId}/${action}`, { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as ActionPayload;
      if (!response.ok) {
        throw new Error(payload.error ?? "旁白与字幕操作失败");
      }
      setMessage(successMessage(action, payload));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "旁白与字幕操作失败");
    } finally {
      setBusy("idle");
    }
  }

  return (
    <div className="grid gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
      <div className="grid gap-1 text-neutral-600">
        <p>TTS Provider：{ttsProvider}</p>
        <p>ENABLE_PAID_TTS_CALLS：{paidTtsCalls ? "true" : "false"}</p>
        <p>页面按钮默认只生成 mock/silent 音频，不会调用真实 TTS，也不会消耗费用。</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== "idle"}
          onClick={() => runAction("voiceover")}
          className="rounded-md bg-neutral-950 px-3 py-2 font-medium text-white disabled:bg-neutral-500"
        >
          {busy === "voiceover" ? "生成中..." : "生成旁白稿"}
        </button>
        <button
          type="button"
          disabled={busy !== "idle"}
          onClick={() => runAction("subtitles")}
          className="rounded-md border border-neutral-300 bg-white px-3 py-2 font-medium disabled:opacity-60"
        >
          {busy === "subtitles" ? "生成中..." : "生成字幕稿"}
        </button>
        <button
          type="button"
          disabled={busy !== "idle"}
          onClick={() => runAction("audio")}
          className="rounded-md border border-neutral-300 bg-white px-3 py-2 font-medium disabled:opacity-60"
        >
          {busy === "audio" ? "生成中..." : "生成 mock 音频"}
        </button>
        <button
          type="button"
          disabled={busy !== "idle"}
          onClick={() => runAction("prepare-audio")}
          className="rounded-md border border-neutral-300 bg-white px-3 py-2 font-medium disabled:opacity-60"
        >
          {busy === "prepare-audio" ? "准备中..." : "一键准备音频与字幕"}
        </button>
      </div>
      {message ? <p className="break-all text-neutral-700">{message}</p> : null}
    </div>
  );
}
