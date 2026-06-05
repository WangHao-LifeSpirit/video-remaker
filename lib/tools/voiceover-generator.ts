import type { VoiceoverScript, VoiceoverSegment } from "../types/audio";
import type { RemakePlan } from "../types/remake-plan";
import type { StoryboardAnalysis } from "../types/storyboard";
import type { VideoPrompts } from "../types/video-prompts";
import { getTask, readTaskArtifact, saveTask, setTaskStatus, writeTaskArtifact } from "./task-store";

function parseDurationSeconds(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase().replace(/秒$/, "s");
  const range = normalized.match(/(\d+(?:\.\d+)?)\s*s?\s*-\s*(\d+(?:\.\d+)?)\s*s?/);
  if (range) {
    return Math.max(0.5, Number(range[2]) - Number(range[1]));
  }
  const simple = normalized.match(/^(\d+(?:\.\d+)?)s?$/);
  return simple ? Math.max(0.5, Number(simple[1])) : fallback;
}

function cleanText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function compactNarration(input: {
  remakeScene?: RemakePlan["new_storyboard"][number];
  scriptLine?: RemakePlan["new_script"][number];
  storyboardScene?: StoryboardAnalysis["original_storyboard"][number];
  sceneIndex: number;
}): string {
  const direct = cleanText(input.remakeScene?.narration)
    || cleanText(input.scriptLine?.narration)
    || cleanText(input.remakeScene?.caption)
    || cleanText(input.storyboardScene?.narration_or_caption);
  if (direct) {
    return direct.length > 38 ? `${direct.slice(0, 38)}…` : direct;
  }
  return `第 ${input.sceneIndex + 1} 步，把想法推进到可执行。`;
}

export async function generateVoiceoverForTask(taskId: string): Promise<VoiceoverScript> {
  const [remakePlan, storyboard, videoPrompts] = await Promise.all([
    readTaskArtifact<RemakePlan>(taskId, "remake_plan.json"),
    readTaskArtifact<StoryboardAnalysis>(taskId, "storyboard.json"),
    readTaskArtifact<VideoPrompts>(taskId, "video_prompts.json")
  ]);

  let cursor = 0;
  const segments: VoiceoverSegment[] = remakePlan.new_storyboard.map((scene, index) => {
    const prompt = videoPrompts.prompts.find((candidate) => candidate.scene_id === scene.scene_id);
    const duration = parseDurationSeconds(scene.duration || prompt?.duration, 2);
    const start = Number(cursor.toFixed(3));
    cursor += duration;
    const end = Number(cursor.toFixed(3));

    return {
      scene_id: scene.scene_id,
      start,
      end,
      text: compactNarration({
        remakeScene: scene,
        scriptLine: remakePlan.new_script[index],
        storyboardScene: storyboard.original_storyboard.find((candidate) => candidate.scene_id === scene.scene_id),
        sceneIndex: index
      }),
      tone: index === 0 ? "hook" : index === remakePlan.new_storyboard.length - 1 ? "closing" : "clear",
      speed: duration <= 1.5 ? "fast" : "normal"
    };
  });

  const script: VoiceoverScript = {
    task_id: taskId,
    status: "success",
    provider: "mock",
    language: "zh",
    total_duration_seconds: Number(cursor.toFixed(3)),
    segments,
    errors: []
  };

  const { relativePath } = await writeTaskArtifact(taskId, "voiceover_script.json", script);
  const task = await getTask(taskId);
  task.files.voiceover_script_json = relativePath;
  setTaskStatus(task, "success", "voiceover");
  await saveTask(task);
  return script;
}
