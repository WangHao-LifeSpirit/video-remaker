# API client rules

All API clients default to mock mode. Set `MOCK_MODE=false` only when the matching API key and model/provider config are present in `.env`.

- `openai-client.ts` can call OpenAI Responses API for structured JSON outputs when `MOCK_MODE=false`, `OPENAI_API_KEY` is set, and `OPENAI_MODEL` is set.
- `deepseek-client.ts` can call DeepSeek's OpenAI-compatible chat API when `MOCK_MODE=false`, `LLM_PROVIDER=deepseek`, `DEEPSEEK_API_KEY` is set, and `DEEPSEEK_MODEL` is set.
- `llm-client.ts` routes structured JSON requests to the selected provider and falls back to mock on recoverable errors.
- `kling-client.ts` reserves Kling video generation.
- `seedance-client.ts` reserves Seedance video generation.
- `tts-client.ts` reserves voiceover generation.
- `asr-client.ts` reserves transcription.

Real LLM mode may create API charges. Missing config, API failure, non-JSON output, or schema validation failure must fall back to mock and write a recoverable error. Kling, Seedance, TTS, and ASR remain reserved/mock only. Never write API keys into source code or logs.
