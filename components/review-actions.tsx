"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ReviewActionPayload = {
  status?: string;
  overall_score?: number;
  final_decision?: string;
  issue_count?: number;
  review_report_path?: string;
  video_prompts_backup_path?: string;
  updated_scene_ids?: string[];
  message?: string;
  error?: string;
};

export function ReviewActions({
  taskId,
  hasReviewReport
}: {
  taskId: string;
  hasReviewReport: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"idle" | "review" | "apply">("idle");
  const [message, setMessage] = useState("");

  async function postReview(path: "review" | "review/apply") {
    setMessage("");
    setBusy(path === "review" ? "review" : "apply");
    try {
      const response = await fetch(`/api/tasks/${taskId}/${path}`, { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as ReviewActionPayload;
      if (!response.ok) {
        throw new Error(payload.error ?? "总控审稿操作失败");
      }

      if (path === "review") {
        setMessage(
          `审稿完成：分数 ${payload.overall_score ?? "-"}，决策 ${payload.final_decision ?? "-"}，问题 ${payload.issue_count ?? 0} 条。`
        );
      } else {
        const backup = payload.video_prompts_backup_path ? `备份：${payload.video_prompts_backup_path}` : "未返回备份路径";
        setMessage(`${payload.message ?? "应用完成。"} ${backup}`);
      }
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "总控审稿操作失败");
    } finally {
      setBusy("idle");
    }
  }

  return (
    <div className="grid gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== "idle"}
          onClick={() => postReview("review")}
          className="rounded-md bg-neutral-950 px-3 py-2 font-medium text-white disabled:bg-neutral-500"
        >
          {busy === "review" ? "审稿中..." : "运行总控审稿"}
        </button>
        <button
          type="button"
          disabled={busy !== "idle"}
          onClick={() => postReview("review/apply")}
          className="rounded-md border border-neutral-300 bg-white px-3 py-2 font-medium disabled:opacity-60"
        >
          {busy === "apply" ? "应用中..." : "应用 prompt 修正"}
        </button>
      </div>
      {!hasReviewReport ? (
        <p className="text-neutral-500">尚未生成 review_report.json。建议先运行总控审稿。</p>
      ) : null}
      <p className="text-neutral-500">
        审稿和应用修正不会生成视频；如需用修正后的 prompt 重新生成素材，请手动运行一键生成，且仍受成本保护控制。
      </p>
      {message ? <p className="break-all text-neutral-700">{message}</p> : null}
    </div>
  );
}
