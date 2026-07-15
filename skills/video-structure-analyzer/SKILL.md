# Name
video-structure-analyzer

# Description
Create a source-structure analysis from user-authorized materials using the configured LLM or an explicit mock fallback.

# When to use
Use after `input.json` exists and has at least one available material.

# Inputs
- `task.json`
- `input.json`

# Workflow
1. Check available materials.
2. Summarize source and missing inputs.
3. Generate topic, audience, core message, structure, pacing, and risk notes.
4. Use configured vision input only when real frames and a vision-capable provider are available.
5. Mark fallback output as mock; never blur the distinction.
6. Write `analysis.json`.

# Output format
`analysis.json` with source summary, topic, structure, viral points, pacing, risk notes, and errors.

# Safety rules
- Do not claim visual understanding occurred when the active provider only received text.
- Do not infer private or unavailable source content.
- Keep output focused on structure learning.

# Related CLI command
`video-maker analyze --task <task_id>`

# Failure handling
If materials are absent, write `status=needs_user_input` and preserve recoverable errors.
