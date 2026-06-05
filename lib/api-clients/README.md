# API client rules

All API clients default to mock mode. Set `MOCK_MODE=false` only when the matching API key and model/provider config are present in `.env`.

- `openai-client.ts` can call OpenAI Responses API for structured JSON outputs when `MOCK_MODE=false`, `LLM_PROVIDER=openai`, `OPENAI_API_KEY` is set, and `OPENAI_MODEL` is set. `OPENAI_BASE_URL` is configurable.
- `deepseek-client.ts` can call DeepSeek's OpenAI-compatible chat API when `MOCK_MODE=false`, `LLM_PROVIDER=deepseek`, `DEEPSEEK_API_KEY` is set, and `DEEPSEEK_MODEL` is set.
- `claude-client.ts` can call Anthropic Messages API for structured JSON outputs when `MOCK_MODE=false`, `LLM_PROVIDER=claude`, `ANTHROPIC_API_KEY` is set, and `ANTHROPIC_MODEL` is set.
- `llm-client.ts` routes structured JSON requests to the selected provider and falls back to mock on recoverable errors.
- `kling-client.ts` reserves Kling video generation.
- `seedance-client.ts` reserves Seedance video generation.
- `tts-client.ts` routes TTS provider configuration and safe status checks.
- `volc-tts-client.ts` can call Volcengine TTS when `TTS_PROVIDER=volcengine`, required Volc env vars are present, and `ENABLE_PAID_TTS_CALLS=true`.
- `asr-client.ts` reserves transcription.

Real LLM mode may create API charges. Missing config, API failure, non-JSON output, or schema validation failure must fall back to mock and write a recoverable error. LLM Provider controls analysis/planning/review; Video Provider controls scene generation. Never write API keys into source code or logs.
