# Name
tts-generator

# Description
Reserve the workflow for voiceover generation from the remake script.

# When to use
Use in v0.2+ when TTS API keys and provider details are configured.

# Inputs
- Voiceover text.
- Voice profile settings.
- Task ID.

# Workflow
1. Read narration from `remake_plan.json` or timeline.
2. Confirm real API mode and key availability.
3. Generate or mock voiceover assets.
4. Record asset paths in `assets.json`.

# Output format
Voiceover asset records with provider, file path, status, and errors.

# Safety rules
- Do not call paid TTS without confirmation.
- Do not clone voices without explicit rights.

# Related CLI command
Reserved for `video-maker mock-assets` in v0.1 and future TTS command in v0.2.

# Failure handling
If key or confirmation is missing, remain in mock mode.
