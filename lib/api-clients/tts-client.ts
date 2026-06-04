type ClientMode = "mock" | "real";

function getMode(): ClientMode {
  return process.env.MOCK_MODE === "false" ? "real" : "mock";
}

export async function generateVoiceover(text: string): Promise<{ mode: ClientMode; file_path?: string; note: string }> {
  if (getMode() === "mock") {
    return {
      mode: "mock",
      note: `Mock TTS voiceover reserved for text: ${text.slice(0, 120)}`
    };
  }
  if (!process.env.TTS_API_KEY) {
    throw new Error("TTS_API_KEY is required when MOCK_MODE=false.");
  }
  throw new Error("Real TTS integration is reserved for v0.2.");
}
