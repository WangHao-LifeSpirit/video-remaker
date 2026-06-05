export type StepStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "needs_user_input"
  | "mocked";

export type RemakeStrength = "low" | "medium" | "high";

export type SupportedPlatform =
  | "douyin"
  | "kuaishou"
  | "xiaohongshu"
  | "bilibili"
  | "youtube"
  | "instagram"
  | "tiktok"
  | "unknown";

export type SourceInputType = "url" | "upload" | "manual" | "mixed";

export type ErrorRecord = {
  step: string;
  message: string;
  code?: string;
  created_at: string;
  recoverable: boolean;
};

export type MockMeta = {
  is_mock: boolean;
  mock_reason?: string;
  provider?: string;
  real_provider_reserved?: string;
};

export function nowIso(): string {
  return new Date().toISOString();
}

export function createErrorRecord(input: {
  step: string;
  message: string;
  code?: string;
  recoverable?: boolean;
}): ErrorRecord {
  return {
    step: input.step,
    message: input.message,
    code: input.code,
    created_at: nowIso(),
    recoverable: input.recoverable ?? true
  };
}

export function mockMeta(realProviderReserved?: string): MockMeta {
  return {
    is_mock: true,
    mock_reason: "v0.1 uses deterministic mock outputs and does not call paid or external generation APIs.",
    real_provider_reserved: realProviderReserved
  };
}

export function fallbackMockMeta(mockReason: string, realProviderReserved?: string): MockMeta {
  return {
    is_mock: true,
    mock_reason: mockReason,
    real_provider_reserved: realProviderReserved
  };
}

export function realMeta(realProviderReserved?: string, provider?: string): MockMeta {
  return {
    is_mock: false,
    provider,
    real_provider_reserved: realProviderReserved
  };
}
