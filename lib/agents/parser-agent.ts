import type { LinkResolution } from "../tools/link-resolver";
import { resolveLinkForTask } from "../tools/link-resolver";
import type { IngestInput } from "../tools/video-ingest";
import { ingestForTask } from "../tools/video-ingest";
import type { VideoInputArtifact } from "../types/input";

export async function parserResolveLink(taskId: string, urlOrShareText: string): Promise<LinkResolution> {
  return resolveLinkForTask(taskId, urlOrShareText);
}

export async function parserIngest(taskId: string, input: IngestInput): Promise<VideoInputArtifact> {
  return ingestForTask(taskId, input);
}
