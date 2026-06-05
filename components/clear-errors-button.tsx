"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ClearErrorsButton({
  taskId,
  disabled
}: {
  taskId: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function clearErrors() {
    setMessage("");
    const confirmed = window.confirm("会先备份历史错误日志，然后清空 task.json 和 assets.json 中的 errors。不会删除视频或导出文件。");
    if (!confirmed) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/tasks/${taskId}/clear-errors`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "清理失败");
      }
      setMessage(`已清理，备份：${payload.backup_path}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "清理失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      <button
        type="button"
        disabled={disabled || busy}
        onClick={clearErrors}
        className="w-fit rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium disabled:opacity-60"
      >
        {busy ? "清理中..." : "清理历史错误日志"}
      </button>
      {message ? <p className="text-xs text-neutral-600">{message}</p> : null}
    </div>
  );
}
