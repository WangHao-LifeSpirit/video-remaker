import type { RemakePlan } from "../types/remake-plan";
import type { TaskUserInputs } from "../types/task";

export function evaluateRemakeQuality(input: {
  planDraft: Pick<RemakePlan, "new_storyboard" | "new_script" | "risk_notes">;
  userInputs: TaskUserInputs;
}): RemakePlan["quality_check"] {
  const tooSimilarRisk = input.userInputs.remake_strength === "high" ? "medium" : "low";
  const missingAssets = input.planDraft.new_storyboard
    .filter((scene) => !scene.asset_needed.trim())
    .map((scene) => scene.scene_id);

  return {
    too_similar_risk: tooSimilarRisk,
    executable: missingAssets.length === 0,
    missing_assets: missingAssets,
    suggestions: [
      "保持结构节奏相似，但更换具体素材、表达和案例。",
      "避免复用原视频字幕、口播和封面文案。",
      "真实 API 接入前，所有视频片段均保持 mock 标记。"
    ]
  };
}
