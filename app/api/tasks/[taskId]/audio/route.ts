import { NextResponse } from "next/server";
import { generateAudioForTask } from "../../../../../lib/tools/audio-generator";

export async function POST(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  try {
    const assets = await generateAudioForTask({
      taskId,
      provider: "mock"
    });
    const audio = assets.assets.find((asset) => asset.asset_id === "asset_mock_silent_audio");
    return NextResponse.json({
      task_id: taskId,
      status: audio?.generation_status ?? "mocked",
      provider: "mock",
      audio_path: audio?.file_path,
      generation_note: audio?.generation_note ?? "Mock/silent audio generated. No TTS credits were consumed."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate mock audio.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
