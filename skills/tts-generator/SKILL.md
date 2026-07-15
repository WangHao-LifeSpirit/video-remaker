# Name
tts-generator

# Description
Generate voiceover scripts and guarded audio assets from the remake plan.

# When to use
Use after `remake_plan.json` exists and voiceover or task audio is needed.

# Inputs
- Voiceover text.
- Voice profile settings.
- Task ID.

# Workflow
1. Read narration from `remake_plan.json` or timeline.
2. Generate `voiceover_script.json` from the scene narration.
3. Confirm provider configuration and paid-call permission.
4. Generate guarded Volcengine audio or an explicit mock/silent fallback.
5. Record asset paths in `assets.json`.

# Output format
Voiceover asset records with provider, file path, status, and errors.

# Safety rules
- Do not call paid TTS without confirmation.
- Do not clone voices without explicit rights.

# Related CLI command
`video-maker voiceover --task <task_id>`, `video-maker audio --task <task_id>`, and `video-maker prepare-audio --task <task_id>`.

# Failure handling
If key or confirmation is missing, remain in mock mode.
