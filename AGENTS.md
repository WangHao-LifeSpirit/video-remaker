# AGENTS.md

## 1. Project goal

This project is a short-video original-remake automation workbench. It learns structure, rhythm, storyboard patterns, captions, hooks, and production requirements from user-authorized materials or public metadata, then produces an original remake package.

The goal is original adaptation, not downloading, copying, laundering, or reposting someone else's video.

## 2. Development priority

1. Build the CLI and tool layer first.
2. Keep web pages thin and call the same `/lib` functions as the CLI.
3. Keep v0.1 fully mock-based for generation.
4. Preserve clear JSON artifacts for every step.
5. Make every core capability callable from `video-maker`.

## 3. Safety boundaries

- Do not bypass login, captcha, anti-bot, paywall, or platform restrictions.
- Do not build hidden scraping or unauthorized downloading logic.
- Do not default to copying, moving, or washing source videos.
- Public links are used for structure learning and metadata parsing only.
- User uploads must be treated as materials the user has permission to use.
- High remake strength means similar structure and rhythm, not similar wording, footage, character identity, or copyrighted expression.

## 4. API key rules

- Never hard-code API keys.
- Read keys from `.env`.
- Keep `MOCK_MODE=true` as the default.
- Real OpenAI, Kling, Seedance, TTS, ASR, and FFmpeg assembly paths must require explicit configuration.
- Paid API calls, batch jobs, and dangerous operations need a confirmation mechanism before execution.

## 5. File structure rules

- Core code lives under `/lib`.
- Agent code lives under `/lib/agents`.
- Tool code lives under `/lib/tools`.
- API wrappers live under `/lib/api-clients`.
- Prompts live under `/lib/prompts`.
- Exporters live under `/lib/export`.
- Shared TypeScript types live under `/lib/types`.
- Task data lives under `/data/tasks/{task_id}`.
- Exported files live under `/data/outputs/{task_id}`.

## 6. Skill usage rules

Each skill must document a concrete workflow and map to a CLI command. Skills should describe how to use the tool layer; they should not invent separate behavior or duplicate implementation logic.

## 7. Testing rules

- Test the CLI path before web behavior.
- Check that every step writes a status and errors array.
- Check failed link parsing enters `needs_user_input`.
- Check every mock output is visibly marked as mock.
- Check exports include Markdown and JSON.

## 8. Forbidden actions

- No platform bypass.
- No credential leakage.
- No hidden real API call in v0.1.
- No fake claim that MP4 was generated when only a mock path exists.
- No duplicated CLI/web logic.
- No unmarked mock output.
