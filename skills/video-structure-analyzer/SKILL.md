# Name
video-structure-analyzer

# Description
Create a mock original-video structure analysis from available user material.

# When to use
Use after `input.json` exists and has at least one available material.

# Inputs
- `task.json`
- `input.json`

# Workflow
1. Check available materials.
2. Summarize source and missing inputs.
3. Generate topic, audience, core message, structure, pacing, and risk notes.
4. Mark output as mock.
5. Write `analysis.json`.

# Output format
`analysis.json` with source summary, topic, structure, viral points, pacing, risk notes, and errors.

# Safety rules
- Do not claim real video analysis occurred in v0.1.
- Do not infer private or unavailable source content.
- Keep output focused on structure learning.

# Related CLI command
`video-maker analyze --task <task_id>`

# Failure handling
If materials are absent, write `status=needs_user_input` and preserve recoverable errors.
