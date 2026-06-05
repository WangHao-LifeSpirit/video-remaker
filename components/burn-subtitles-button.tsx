"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type BurnSubtitlesPayload = {
  output_mp4?: string;
  error?: string;
};

export function BurnSubtitlesButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function burnSubtitles() {
    setMessage("");
    setBusy(true);
    try {
      const response = await fetch(`/api/tasks/${taskId}/burn-subtitles`, { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as BurnSubtitlesPayload;
      if (!response.ok) {
        throw new Error(payload.error ?? "字幕烧录失败");
      }
      setMessage(`字幕烧录完成：${payload.output_mp4 ?? "final_subtitled.mp4"}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "字幕烧录失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={burnSubtitles}
          className="rounded-md bg-neutral-950 px-3 py-2 font-medium text-white disabled:bg-neutral-500"
        >
          {busy ? "烧录中..." : "烧录字幕"}
        </button>
      </div>
      <p className="text-neutral-500">字幕烧录只使用本地 FFmpeg，不调用 Seedance、DeepSeek 或 TTS。</p>
      {message ? <p className="break-all text-neutral-700">{message}</p> : null}
    </div>
  );
}
