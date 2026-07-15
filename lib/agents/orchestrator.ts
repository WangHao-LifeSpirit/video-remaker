import { runFullPipeline, type RunFullInput, type RunFullResult } from "../tools/run-full";

/**
 * Single orchestration entry point shared by the CLI and web job layer.
 * Step implementations remain in /lib; callers should not duplicate workflow logic.
 */
export async function orchestrateTask(input: RunFullInput): Promise<RunFullResult> {
  return runFullPipeline(input);
}
