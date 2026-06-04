type ClientMode = "mock" | "real";

function getMode(): ClientMode {
  return process.env.MOCK_MODE === "false" ? "real" : "mock";
}

export async function transcribeAudio(filePath: string): Promise<{ mode: ClientMode; transcript: string }> {
  if (getMode() === "mock") {
    return {
      mode: "mock",
      transcript: `[MOCK_ASR] Transcript placeholder for ${filePath}`
    };
  }
  if (!process.env.ASR_API_KEY) {
    throw new Error("ASR_API_KEY is required when MOCK_MODE=false.");
  }
  throw new Error("Real ASR integration is reserved for v0.2.");
}
