# Name
video-assembler

# Description
Reserve or execute final video assembly from assets, captions, voiceover, BGM, and cover.

# When to use
Use after assets and timeline are ready.

# Inputs
- `assets.json`
- Future generated video clips, audio, subtitles, and cover.

# Workflow
1. Read asset manifest and timeline.
2. In v0.1, update assemble status to `mocked` and reserve MP4 path.
3. In v0.3, call FFmpeg, MoviePy, or Remotion to assemble real MP4.
4. Write final output path into `task.json`.

# Output format
Updated `assets.json` and `task.export_paths.mp4`.

# Safety rules
- Do not claim MP4 exists in v0.1.
- Do not use unauthorized source footage.

# Related CLI command
`video-maker assemble --task <task_id>`

# Failure handling
If required real assets are missing in v0.3, stop before assembly and list missing assets.
