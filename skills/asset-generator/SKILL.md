# Name
asset-generator

# Description
Create a v0.1 mock asset manifest and timeline from video prompts and remake storyboard.

# When to use
Use after `video_prompts.json` exists.

# Inputs
- `video_prompts.json`
- `remake_plan.json`

# Workflow
1. Create mock asset records for each scene.
2. Build a timeline from scene durations.
3. Reserve output paths without creating real generated video.
4. Write `assets.json`.

# Output format
`assets.json` with assets, timeline, assemble status, mock metadata, and errors.

# Safety rules
- Always mark generated assets as mock in v0.1.
- Do not claim real Kling or Seedance assets exist.

# Related CLI command
`video-maker mock-assets --task <task_id>`

# Failure handling
If prompts are missing, stop and report the missing artifact.
