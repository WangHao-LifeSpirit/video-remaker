import { loadDotEnvOnce } from "./llm-client";

export type TtsProvider = "mock" | "volcengine" | "openai" | "elevenlabs";

type ProviderStatus = {
  key_present: boolean;
  token_present?: boolean;
  app_id_present?: boolean;
  base_url_present?: boolean;
  model_present?: boolean;
  voice_present?: boolean;
  cluster_present?: boolean;
  stable: boolean;
  notes: string[];
};

export type TtsConfigStatus = {
  tts_provider: string;
  tts_provider_supported: boolean;
  tts_providers: {
    mock: {
      available: true;
      stable: true;
      notes: string[];
    };
    volcengine: ProviderStatus;
    openai: ProviderStatus;
    elevenlabs: ProviderStatus;
  };
  paid_tts_calls: boolean;
};

function hasValue(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

export function parseTtsProvider(value: unknown): TtsProvider {
  const provider = String(value ?? "mock").toLowerCase();
  if (!["mock", "volcengine", "openai", "elevenlabs"].includes(provider)) {
    throw new Error("TTS provider must be one of: mock, volcengine, openai, elevenlabs.");
  }
  return provider as TtsProvider;
}

export async function getTtsProvider(): Promise<TtsProvider> {
  await loadDotEnvOnce();
  return parseTtsProvider(process.env.TTS_PROVIDER ?? "mock");
}

export async function inspectTtsConfig(): Promise<TtsConfigStatus> {
  await loadDotEnvOnce();
  const provider = process.env.TTS_PROVIDER ?? "mock";
  return {
    tts_provider: provider,
    tts_provider_supported: ["mock", "volcengine", "openai", "elevenlabs"].includes(provider),
    tts_providers: {
      mock: {
        available: true,
        stable: true,
        notes: ["Always available. Generates local mock/silent audio and does not call a TTS API."]
      },
      volcengine: {
        key_present: hasValue(process.env.VOLC_TTS_API_KEY),
        token_present: hasValue(process.env.VOLC_TTS_ACCESS_TOKEN),
        app_id_present: hasValue(process.env.VOLC_TTS_APP_ID),
        base_url_present: hasValue(process.env.VOLC_TTS_API_BASE_URL),
        voice_present: hasValue(process.env.VOLC_TTS_VOICE_TYPE),
        cluster_present: hasValue(process.env.VOLC_TTS_CLUSTER),
        stable: true,
        notes: ["Current real TTS main provider. Requires ENABLE_PAID_TTS_CALLS=true before any network call."]
      },
      openai: {
        key_present: hasValue(process.env.OPENAI_TTS_API_KEY),
        model_present: hasValue(process.env.OPENAI_TTS_MODEL),
        voice_present: hasValue(process.env.OPENAI_TTS_VOICE),
        stable: false,
        notes: ["Reserved TTS provider. Not wired into real synthesis yet."]
      },
      elevenlabs: {
        key_present: hasValue(process.env.ELEVENLABS_API_KEY),
        voice_present: hasValue(process.env.ELEVENLABS_VOICE_ID),
        stable: false,
        notes: ["Reserved TTS provider. Not wired into real synthesis yet."]
      }
    },
    paid_tts_calls: process.env.ENABLE_PAID_TTS_CALLS === "true"
  };
}
