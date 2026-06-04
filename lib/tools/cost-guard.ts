import type { ErrorRecord } from "../types/common";
import { createErrorRecord } from "../types/common";
import { loadDotEnvOnce } from "../api-clients/llm-client";

export type CostGuardResult =
  | {
      allowed: true;
      note: string;
    }
  | {
      allowed: false;
      error: ErrorRecord;
      note: string;
    };

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function assertKlingSingleSceneAllowed(input: {
  sceneCount: number;
  step?: string;
}): Promise<CostGuardResult> {
  await loadDotEnvOnce();

  const missingOrInvalid: string[] = [];
  const maxScenes = parsePositiveInteger(process.env.MAX_VIDEO_SCENES_PER_RUN, 1);

  if (process.env.VIDEO_PROVIDER !== "kling") missingOrInvalid.push("VIDEO_PROVIDER must be kling");
  if (!process.env.KLING_ACCESS_KEY) missingOrInvalid.push("KLING_ACCESS_KEY is missing");
  if (!process.env.KLING_SECRET_KEY) missingOrInvalid.push("KLING_SECRET_KEY is missing");
  if (!process.env.KLING_API_BASE_URL) missingOrInvalid.push("KLING_API_BASE_URL is missing");
  if (process.env.ENABLE_PAID_API_CALLS !== "true") missingOrInvalid.push("ENABLE_PAID_API_CALLS must be true");
  if (input.sceneCount !== 1) missingOrInvalid.push("scene count must equal 1");
  if (input.sceneCount > maxScenes) missingOrInvalid.push(`scene count exceeds MAX_VIDEO_SCENES_PER_RUN=${maxScenes}`);

  if (missingOrInvalid.length > 0) {
    const note = `Kling real generation was blocked by cost guard. No Kling credits were consumed. Reasons: ${missingOrInvalid.join("; ")}.`;
    return {
      allowed: false,
      note,
      error: createErrorRecord({
        step: input.step ?? "generate-assets",
        message: note,
        code: "KLING_COST_GUARD_BLOCKED",
        recoverable: true
      })
    };
  }

  return {
    allowed: true,
    note: "Kling real generation is allowed for exactly one scene by current cost guard settings."
  };
}

export async function assertLumaSingleSceneAllowed(input: {
  sceneCount: number;
  step?: string;
}): Promise<CostGuardResult> {
  await loadDotEnvOnce();

  const missingOrInvalid: string[] = [];
  const maxScenes = parsePositiveInteger(process.env.MAX_VIDEO_SCENES_PER_RUN, 1);

  if (process.env.VIDEO_PROVIDER !== "luma") missingOrInvalid.push("VIDEO_PROVIDER must be luma");
  if (!process.env.LUMA_API_KEY) missingOrInvalid.push("LUMA_API_KEY is missing");
  if (!process.env.LUMA_API_BASE_URL) missingOrInvalid.push("LUMA_API_BASE_URL is missing");
  if (process.env.ENABLE_PAID_API_CALLS !== "true") missingOrInvalid.push("ENABLE_PAID_API_CALLS must be true");
  if (input.sceneCount !== 1) missingOrInvalid.push("scene count must equal 1");
  if (input.sceneCount > maxScenes) missingOrInvalid.push(`scene count exceeds MAX_VIDEO_SCENES_PER_RUN=${maxScenes}`);

  if (missingOrInvalid.length > 0) {
    const note = `Luma real generation was blocked by cost guard. No Luma credits were consumed. Reasons: ${missingOrInvalid.join("; ")}.`;
    return {
      allowed: false,
      note,
      error: createErrorRecord({
        step: input.step ?? "generate-assets",
        message: note,
        code: "LUMA_COST_GUARD_BLOCKED",
        recoverable: true
      })
    };
  }

  return {
    allowed: true,
    note: "Luma real generation is allowed for exactly one scene by current cost guard settings."
  };
}

export async function assertSeedanceScenesAllowed(input: {
  sceneCount: number;
  step?: string;
}): Promise<CostGuardResult> {
  await loadDotEnvOnce();

  const missingOrInvalid: string[] = [];
  const maxScenes = parsePositiveInteger(process.env.MAX_VIDEO_SCENES_PER_RUN, 1);

  if (process.env.VIDEO_PROVIDER !== "seedance") missingOrInvalid.push("VIDEO_PROVIDER must be seedance");
  if (!process.env.SEEDANCE_API_KEY) missingOrInvalid.push("SEEDANCE_API_KEY is missing");
  if (!process.env.SEEDANCE_API_BASE_URL) missingOrInvalid.push("SEEDANCE_API_BASE_URL is missing");
  if (!process.env.SEEDANCE_MODEL) missingOrInvalid.push("SEEDANCE_MODEL is missing");
  if (process.env.ENABLE_PAID_API_CALLS !== "true") missingOrInvalid.push("ENABLE_PAID_API_CALLS must be true");
  if (input.sceneCount < 1) missingOrInvalid.push("scene count must be at least 1");
  if (input.sceneCount > maxScenes) missingOrInvalid.push(`scene count exceeds MAX_VIDEO_SCENES_PER_RUN=${maxScenes}`);

  if (missingOrInvalid.length > 0) {
    const note = `Seedance real generation was blocked by cost guard. No Seedance credits were consumed. Reasons: ${missingOrInvalid.join("; ")}.`;
    return {
      allowed: false,
      note,
      error: createErrorRecord({
        step: input.step ?? "generate-assets",
        message: note,
        code: "SEEDANCE_COST_GUARD_BLOCKED",
        recoverable: true
      })
    };
  }

  return {
    allowed: true,
    note: `Seedance real generation is allowed for ${input.sceneCount} scene(s) by current cost guard settings.`
  };
}
