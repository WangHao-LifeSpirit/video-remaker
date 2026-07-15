# Name
asset-generator

# Description
Create a guarded asset manifest and timeline from video prompts and the remake storyboard.

# When to use
Use after `video_prompts.json` exists.

# Inputs
- `video_prompts.json`
- `remake_plan.json`

# Workflow
1. Read the selected provider, cost guard, scene limit, and existing successful assets.
2. Generate bounded Seedance/Kling assets when explicitly allowed, otherwise create visible Mock placeholders.
3. Build a timeline from scene durations.
4. Reuse successful provider scenes unless force regeneration was requested.
5. Write `assets.json` with per-scene provider and generation truth.

# Output format
`assets.json` with assets, timeline, assemble status, mock metadata, and errors.

# Safety rules
- Mark every fallback asset as Mock and keep mixed manifests in `mocked` status.
- Do not claim real Kling or Seedance assets exist unless local files and successful provider results are present.

# Related CLI command
`video-maker generate-assets --task <task_id> --provider <mock|seedance|kling> --scene-limit <n>`

# Failure handling
If prompts are missing, stop and report the missing artifact.
