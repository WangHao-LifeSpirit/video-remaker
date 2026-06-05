import { getLlmMode, getLlmProvider, loadDotEnvOnce } from "../api-clients/llm-client";
import { inspectTtsConfig, type TtsConfigStatus } from "../api-clients/tts-client";

export type ConfigCheckResult = {
  mock_mode: boolean;
  llm_provider: string;
  llm_provider_supported: boolean;
  llm_providers: {
    mock: {
      available: true;
      stable: true;
    };
    deepseek: ProviderStatus;
    openai: ProviderStatus;
    claude: ProviderStatus;
  };
  selected_llm_config: {
    key_present: boolean;
    model_present: boolean;
    base_url_present?: boolean;
    notes: string[];
  };
  video_provider: string;
  video_provider_supported: boolean;
  video_providers: {
    mock: {
      available: true;
      stable: true;
      notes: string[];
    };
    seedance: VideoProviderStatus;
    kling: VideoProviderStatus;
    luma: VideoProviderStatus;
  };
  paid_api_calls: boolean;
  tts: TtsConfigStatus;
  max_video_scenes_per_run: number;
  max_retry_per_scene: number;
};

type ProviderStatus = {
  key_present: boolean;
  model_present: boolean;
  base_url_present?: boolean;
  stable: boolean;
  notes: string[];
};

type VideoProviderStatus = {
  key_present: boolean;
  secret_present?: boolean;
  base_url_present: boolean;
  model_present: boolean;
  endpoint_present?: boolean;
  resolution_present?: boolean;
  stable: boolean;
  notes: string[];
};

function hasValue(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function llmProviders(): ConfigCheckResult["llm_providers"] {
  return {
    mock: {
      available: true,
      stable: true
    },
    deepseek: {
      key_present: hasValue(process.env.DEEPSEEK_API_KEY),
      model_present: hasValue(process.env.DEEPSEEK_MODEL),
      base_url_present: hasValue(process.env.DEEPSEEK_BASE_URL),
      stable: true,
      notes: ["Uses DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, and DEEPSEEK_MODEL."]
    },
    openai: {
      key_present: hasValue(process.env.OPENAI_API_KEY),
      model_present: hasValue(process.env.OPENAI_MODEL),
      base_url_present: hasValue(process.env.OPENAI_BASE_URL),
      stable: true,
      notes: ["Uses OPENAI_API_KEY, OPENAI_BASE_URL, and OPENAI_MODEL."]
    },
    claude: {
      key_present: hasValue(process.env.ANTHROPIC_API_KEY),
      model_present: hasValue(process.env.ANTHROPIC_MODEL),
      stable: true,
      notes: ["Uses ANTHROPIC_API_KEY and ANTHROPIC_MODEL."]
    }
  };
}

function llmConfigFor(provider: string): ConfigCheckResult["selected_llm_config"] {
  if (provider === "mock") {
    return {
      key_present: false,
      model_present: false,
      notes: ["Mock LLM mode does not require an API key or model."]
    };
  }
  if (provider === "deepseek") {
    return {
      key_present: hasValue(process.env.DEEPSEEK_API_KEY),
      model_present: hasValue(process.env.DEEPSEEK_MODEL),
      base_url_present: hasValue(process.env.DEEPSEEK_BASE_URL),
      notes: ["Uses DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, and DEEPSEEK_MODEL."]
    };
  }
  if (provider === "openai") {
    return {
      key_present: hasValue(process.env.OPENAI_API_KEY),
      model_present: hasValue(process.env.OPENAI_MODEL),
      base_url_present: hasValue(process.env.OPENAI_BASE_URL),
      notes: ["Uses OPENAI_API_KEY, OPENAI_BASE_URL, and OPENAI_MODEL."]
    };
  }
  if (provider === "claude") {
    return {
      key_present: hasValue(process.env.ANTHROPIC_API_KEY),
      model_present: hasValue(process.env.ANTHROPIC_MODEL),
      notes: ["Uses ANTHROPIC_API_KEY and ANTHROPIC_MODEL."]
    };
  }
  return {
    key_present: false,
    model_present: false,
    notes: [`Unsupported LLM_PROVIDER "${provider}". The pipeline will fallback mock.`]
  };
}

function videoProviders(): ConfigCheckResult["video_providers"] {
  return {
    mock: {
      available: true,
      stable: true,
      notes: ["Always available. Does not call any video generation API."]
    },
    seedance: {
      key_present: hasValue(process.env.SEEDANCE_API_KEY),
      base_url_present: hasValue(process.env.SEEDANCE_API_BASE_URL),
      model_present: hasValue(process.env.SEEDANCE_MODEL),
      resolution_present: hasValue(process.env.SEEDANCE_RESOLUTION),
      stable: true,
      notes: ["Current stable real video provider. Also requires ENABLE_PAID_API_CALLS=true and cost guard approval."]
    },
    kling: {
      key_present: hasValue(process.env.KLING_ACCESS_KEY),
      secret_present: hasValue(process.env.KLING_SECRET_KEY),
      base_url_present: hasValue(process.env.KLING_API_BASE_URL),
      model_present: hasValue(process.env.KLING_MODEL_NAME),
      endpoint_present: hasValue(process.env.KLING_ENDPOINT_PATH),
      stable: false,
      notes: ["Experimental provider. Client exists, but it is not part of the stable v1.x delivery path."]
    },
    luma: {
      key_present: hasValue(process.env.LUMA_API_KEY),
      base_url_present: hasValue(process.env.LUMA_API_BASE_URL),
      model_present: hasValue(process.env.LUMA_MODEL),
      stable: false,
      notes: ["Experimental provider. Configuration is reserved and not exposed as a stable page option."]
    }
  };
}

export async function checkRuntimeConfig(): Promise<ConfigCheckResult> {
  await loadDotEnvOnce();
  const rawLlmProvider = (process.env.LLM_PROVIDER || getLlmProvider()).toLowerCase();
  const supportedLlmProviders = ["mock", "deepseek", "openai", "claude"];
  const videoProvider = process.env.VIDEO_PROVIDER || "mock";
  const supportedVideoProviders = ["mock", "seedance", "kling", "luma"];
  const tts = await inspectTtsConfig();

  return {
    mock_mode: getLlmMode() === "mock",
    llm_provider: rawLlmProvider,
    llm_provider_supported: supportedLlmProviders.includes(rawLlmProvider),
    llm_providers: llmProviders(),
    selected_llm_config: llmConfigFor(rawLlmProvider),
    video_provider: videoProvider,
    video_provider_supported: supportedVideoProviders.includes(videoProvider),
    video_providers: videoProviders(),
    paid_api_calls: process.env.ENABLE_PAID_API_CALLS === "true",
    tts,
    max_video_scenes_per_run: parsePositiveInteger(process.env.MAX_VIDEO_SCENES_PER_RUN, 3),
    max_retry_per_scene: parsePositiveInteger(process.env.MAX_RETRY_PER_SCENE, 1)
  };
}
