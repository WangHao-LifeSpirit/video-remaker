# Name
video-assembler

# Description
Assemble a playable final video from real and/or clearly marked Mock assets, captions, and audio.

# When to use
Use after assets and timeline are ready.

# Inputs
- `assets.json`
- Generated or Mock video clips, audio, subtitles, and cover.

# Workflow
1. Read asset manifest and timeline.
2. Verify every referenced local asset exists and is readable.
3. Normalize scene clips and call FFmpeg to assemble `final.mp4`.
4. Preserve `mocked` status when any required scene remains a Mock fallback.
5. Write final output path and assembly truth into `task.json` and `assets.json`.

# Output format
Updated `assets.json` and `task.export_paths.mp4`.

# Safety rules
- Do not report a mixed or Mock timeline as a fully real generated video.
- Do not use unauthorized source footage.

# Related CLI command
`video-maker assemble --task <task_id>`

# Failure handling
If required assets are missing or FFmpeg fails, stop, record the error, and preserve existing outputs.
