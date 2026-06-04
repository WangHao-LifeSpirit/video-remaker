# Name
storyboard-generator

# Description
Generate a structured storyboard and rhythm analysis from `analysis.json`.

# When to use
Use after original structure analysis has been created.

# Inputs
- `task.json`
- `analysis.json`

# Workflow
1. Read the analysis structure.
2. Convert opening, development, turning point, and ending into scenes.
3. Add shot type, visual description, narration/caption role, purpose, and pacing notes.
4. Write `storyboard.json`.

# Output format
`storyboard.json` with `original_storyboard`, rhythm analysis, visual language, BGM notes, subtitle notes, and errors.

# Safety rules
- Describe structure and rhythm only.
- Do not reproduce source visuals or exact captions.

# Related CLI command
`video-maker storyboard --task <task_id>`

# Failure handling
If `analysis.json` is missing, fail the command instead of fabricating a storyboard.
