# Name
subtitle-generator

# Description
Generate or reserve subtitle data from the remake script and timeline.

# When to use
Use when subtitles are needed for exports or future MP4 assembly.

# Inputs
- `remake_plan.json`
- `assets.json`
- Optional ASR transcript.

# Workflow
1. Read narration and captions.
2. Align captions to mock or real timeline.
3. Prepare subtitle records for export.
4. In v0.1, keep subtitle data inside timeline and production package.

# Output format
Timeline subtitle records and future subtitle files such as `.srt` or `.vtt`.

# Safety rules
- Do not claim ASR alignment occurred unless real ASR ran.
- Keep subtitles original.

# Related CLI command
`video-maker mock-assets --task <task_id>` and future subtitle-specific command.

# Failure handling
If timeline is missing, wait for asset generation.
