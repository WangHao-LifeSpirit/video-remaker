import { generateRemakePlanForTask } from "./content-creator-agent";
import { parserIngest, parserResolveLink } from "./parser-agent";
import { generateStoryboardForTask } from "./storyboard-agent";
import { exportJsonForTask } from "../export/json-exporter";
import { exportMarkdownForTask } from "../export/markdown-exporter";
import { generateMockAssetsForTask } from "../tools/asset-generator";
import { generateVideoPromptsForTask } from "../tools/prompt-generator";
import { analyzeForTask } from "../tools/video-analyzer";
import { assembleVideoForTask } from "../tools/video-assembler";
import type { IngestInput } from "../tools/video-ingest";
import { getTask } from "../tools/task-store";

export type OrchestratorRunInput = IngestInput & {
  url?: string;
  assemble?: boolean;
  export?: boolean;
};

export async function runFullMockPipeline(taskId: string, input: OrchestratorRunInput = {}) {
  if (input.url) {
    await parserResolveLink(taskId, input.url);
  }
  const ingested = await parserIngest(taskId, input);
  if (ingested.status === "needs_user_input" || ingested.status === "failed") {
    return getTask(taskId);
  }
  const analysis = await analyzeForTask(taskId);
  if (analysis.status === "needs_user_input" || analysis.status === "failed") {
    return getTask(taskId);
  }
  await generateStoryboardForTask(taskId);
  await generateRemakePlanForTask(taskId);
  await generateVideoPromptsForTask(taskId);
  await generateMockAssetsForTask(taskId);
  if (input.assemble) {
    await assembleVideoForTask(taskId);
  }
  if (input.export ?? true) {
    await exportMarkdownForTask(taskId);
    await exportJsonForTask(taskId);
  }
  return getTask(taskId);
}
