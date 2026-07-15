# AGENTS.md

## Product goal

This repository is a local short-video original-remake workbench. Its core loop is:

`authorized input -> source understanding -> storyboard/content/review agents -> original video prompts -> guarded video generation -> FFmpeg assembly -> preview and export`

The product learns structure and pacing. It does not copy source footage, wording, identity, or copyrighted expression.

## Development priority

1. Protect the end-to-end loop above before adding features.
2. Keep all behavior in `/lib`; CLI and web routes are thin adapters.
3. Make input truth explicit: an uploaded file is not “understood” until metadata, frames, transcript, or user descriptions are available to the active model.
4. Make output truth explicit: mock placeholders are previews, not finished generated scenes.
5. Keep paid calls opt-in, bounded, resumable, and visible.
6. Prefer deleting obsolete experiments and duplicated flows over adding another layer.

## Stable and experimental providers

- LLM: `mock`, `deepseek`, `openai`, `claude` through the shared LLM client.
- Stable video path: `mock`, `seedance`.
- Experimental video path: `kling`; never expose it as stable without a fresh acceptance run.
- Real TTS is optional and not part of the stable delivery path.

Provider type support does not mean product readiness. The web interface should expose only accepted stable providers.

## Safety boundaries

- Never bypass login, captcha, anti-bot, paywall, cookie, or platform restrictions.
- Never add hidden scraping or unauthorized video download behavior.
- Public links are input hints only. Continue through upload or manual materials when parsing is unavailable.
- Treat uploads as material the user states they are authorized to use.
- Never hard-code or print API keys, secrets, JWTs, or signed result URLs.
- Read secrets from `.env`; keep `.env` and generated task/output data out of Git and clean packages.

## Cost and fallback rules

- No real video call unless `ENABLE_PAID_API_CALLS=true` and provider configuration passes the cost guard.
- Respect scene limits and retry limits. Never submit unbounded jobs.
- Missing configuration or provider failure must produce a recoverable error and an explicit mock fallback.
- A mixed real/mock asset set remains `mocked`; assembled output is a preview until every required scene is real.
- Do not continue to paid video generation when source understanding is insufficient.

## Data and state rules

- Core task code lives in `/lib/agents`, `/lib/tools`, `/lib/api-clients`, `/lib/prompts`, `/lib/export`, and `/lib/types`.
- Task artifacts live in `/data/tasks/{task_id}`; deliverables live in `/data/outputs/{task_id}`; background jobs live in `/data/jobs`.
- JSON writes must be atomic. A corrupt job file must not hide every other job.
- Input changes invalidate downstream artifacts by freshness; `resume` may skip only artifacts newer than their dependencies.
- Only one queued/running job may exist per task. Stale jobs must fail visibly instead of blocking forever.
- Preserve existing outputs and source assets unless the user explicitly requests deletion.

## Agent and tool rules

- Parser Agent owns link/material normalization.
- Storyboard Agent owns source structure and scene language.
- Content Creator Agent owns the original remake plan and generation prompts.
- Quality Check Agent owns review and revision recommendations.
- Orchestrator owns the ordered workflow and is the shared entry point for CLI and web jobs.
- Skills document how to use these tools; they must not duplicate implementation.

## Testing rules

Before finishing a behavior change:

1. Run `npm run typecheck`.
2. Run `npm run build`.
3. Run a mock-only CLI flow when the pipeline changed.
4. Verify stale input reruns dependent analysis.
5. Verify mock output is visibly marked and playable.
6. Verify no real provider was called unless the user explicitly authorized that exact run.
7. For UI changes, verify the real page at mobile and desktop widths.

## Forbidden actions

- Duplicating CLI logic inside API routes or React components.
- Reporting a mock or mixed output as a real finished video.
- Reusing analysis/prompts after source input changed.
- Leaving background jobs permanently `running` without a recovery path.
- Adding a provider only to `.env.example` and claiming it is implemented.
- Reintroducing deleted experimental providers or legacy routes without a concrete product need.
