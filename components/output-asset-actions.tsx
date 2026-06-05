"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type CoverPayload = {
  cover_path?: string;
  error?: string;
};

export function OutputAssetActions({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function exportCover() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/tasks/${taskId}/export-cover`, { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as CoverPayload;
      if (!response.ok) {
        throw new Error(payload.error ?? "封面导出失败");
      }
      setMessage(`封面已导出：${payload.cover_path ?? "cover.jpg"}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "封面导出失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
      <button
        type="button"
        disabled={busy}
        onClick={exportCover}
        className="w-fit rounded-md bg-neutral-950 px-3 py-2 font-medium text-white disabled:bg-neutral-500"
      >
        {busy ? "导出中..." : "导出封面帧"}
      </button>
      <p className="text-neutral-500">封面帧从 final_subtitled.mp4 或 final.mp4 的第 1 秒本地抽取，不调用任何付费 API。</p>
      {message ? <p className="break-all text-neutral-700">{message}</p> : null}
    </div>
  );
}
