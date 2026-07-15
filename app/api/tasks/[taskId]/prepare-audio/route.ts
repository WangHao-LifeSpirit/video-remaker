import { NextResponse } from "next/server";
import { generateAudioForTask } from "../../../../../lib/tools/audio-generator";
import { generateSubtitlesForTask } from "../../../../../lib/tools/subtitle-generator";
import { generateVoiceoverForTask } from "../../../../../lib/tools/voiceover-generator";

export async function POST(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  try {
    const voiceover = await generateVoiceoverForTask(taskId);
    const subtitles = await generateSubtitlesForTask(taskId);
    const assets = await generateAudioForTask({
      taskId,
      provider: "mock"
    });
    const audio = assets.assets.find((asset) => asset.asset_id === "asset_mock_silent_audio");

    return NextResponse.json({
      task_id: taskId,
      status: "success",
      voiceover_script_path: `data/tasks/${taskId}/voiceover_script.json`,
      voiceover_segments: voiceover.segments.length,
      subtitles_json_path: `data/tasks/${taskId}/subtitles.json`,
      srt_path: subtitles.srt_path,
      subtitle_segments: subtitles.segments.length,
      audio_provider: "mock",
      audio_path: audio?.file_path,
      generation_note: "Prepared voiceover, subtitles, and mock/silent audio. No real TTS or video provider was called."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to prepare audio and subtitles.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
