# Name
subtitle-generator

# Description
Generate timed subtitle data and SRT files from the voiceover script and timeline.

# When to use
Use when subtitles are needed for preview, export, or FFmpeg burn-in.

# Inputs
- `remake_plan.json`
- `assets.json`
- Optional ASR transcript.

# Workflow
1. Read narration and captions.
2. Align captions to mock or real timeline.
3. Write `subtitles.json` and `assets/subtitles/subtitles.srt`.
4. Keep timing and source-scene references explicit for later burn-in.

# Output format
`subtitles.json` plus `assets/subtitles/subtitles.srt`.

# Safety rules
- Do not claim ASR alignment occurred unless real ASR ran.
- Keep subtitles original.

# Related CLI command
`video-maker subtitles --task <task_id>` or `video-maker prepare-audio --task <task_id>`.

# Failure handling
If timeline is missing, wait for asset generation.
