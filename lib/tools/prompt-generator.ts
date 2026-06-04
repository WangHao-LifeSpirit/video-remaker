import type { RemakePlan } from "../types/remake-plan";
import type { VideoPrompts } from "../types/video-prompts";
import { fallbackMockMeta, mockMeta, realMeta } from "../types/common";
import {
  buildVideoPromptsPrompt,
  isVideoPromptsModelOutput,
  videoPromptsSchema
} from "../prompts/video-prompts";
import { generateLLMStructuredJson } from "../api-clients/llm-client";
import { getTask, readTaskArtifact, saveTask, setTaskStatus, writeTaskArtifact } from "./task-store";

function buildMockVideoPrompts(input: {
  taskId: string;
  task: Awaited<ReturnType<typeof getTask>>;
  remakePlan: RemakePlan;
  fallbackReason?: string;
  errors?: VideoPrompts["errors"];
}): VideoPrompts {
  const { task, remakePlan } = input;
  const prompts = remakePlan.new_storyboard.flatMap((scene) => {
    const basePrompt = `${scene.visual}. Action: ${scene.action}. Narration mood: ${scene.narration}. Style: ${task.user_inputs.style}. Original material must not be copied.`;
    return [
      {
        scene_id: scene.scene_id,
        provider: "kling" as const,
        prompt: basePrompt,
        negative_prompt: "logos, watermarks, copied footage, copyrighted characters, platform UI",
        duration: scene.duration,
        aspect_ratio: "9:16",
        camera_motion: "subtle handheld push-in",
        style_tags: ["short-video", "original-remake", "mock"],
        safety_note: "Prompt is for original generation only and must not recreate identifiable original footage."
      },
      {
        scene_id: scene.scene_id,
        provider: "seedance" as const,
        prompt: basePrompt,
        negative_prompt: "watermark, duplicated source video, unsafe imitation",
        duration: scene.duration,
        aspect_ratio: "9:16",
        camera_motion: "fast editorial cut",
        style_tags: ["ugc", "vertical", "mock"],
        safety_note: "Use structure learning only; do not reproduce source visuals."
      }
    ];
  });

  return {
    task_id: input.taskId,
    status: "mocked",
    mock: input.fallbackReason
      ? fallbackMockMeta(input.fallbackReason, "Kling / Seedance video generation prompt creation")
      : mockMeta("Kling / Seedance video generation APIs"),
    prompts,
    global_style: {
      visual_style: task.user_inputs.style,
      color_tone: "clean, high contrast, platform-native",
      pacing: "fast opening, clear mid-section, concise ending"
    },
    errors: input.errors ?? []
  };
}

export async function generateVideoPromptsForTask(taskId: string): Promise<VideoPrompts> {
  const task = await getTask(taskId);
  const remakePlan = await readTaskArtifact<RemakePlan>(taskId, "remake_plan.json");
  const prompt = buildVideoPromptsPrompt(task, remakePlan);
  const result = await generateLLMStructuredJson({
    step: "prompts",
    schemaName: "video_prompts",
    schema: videoPromptsSchema,
    systemPrompt: prompt.systemPrompt,
    userPrompt: prompt.userPrompt,
    validate: isVideoPromptsModelOutput
  });

  const errors = result.mode === "mock" && result.error ? [result.error] : [];
  const artifact: VideoPrompts = result.mode === "real"
    ? {
        task_id: taskId,
        status: "success",
        mock: realMeta("LLM video prompt generation", result.provider),
        ...result.data,
        errors: []
      }
    : buildMockVideoPrompts({
        taskId,
        task,
        remakePlan,
        fallbackReason: result.fallbackReason,
        errors
      });

  const { relativePath } = await writeTaskArtifact(taskId, "video_prompts.json", artifact);
  task.files.video_prompts_json = relativePath;
  task.errors.push(...errors);
  setTaskStatus(task, artifact.status, "prompts");
  await saveTask(task);
  return artifact;
}
