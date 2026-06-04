# Name
video-model-prompt-generator

# Description
Generate Kling and Seedance prompts for original video assets from the remake plan.

# When to use
Use after `remake_plan.json` exists.

# Inputs
- `task.json`
- `remake_plan.json`

# Workflow
1. Convert every new storyboard scene into provider prompts.
2. Add negative prompts against copied footage and watermarks.
3. Keep provider, duration, aspect ratio, camera motion, style tags, and safety note.
4. Write `video_prompts.json`.

# Output format
`video_prompts.json` with global style and one prompt per provider per scene.

# Safety rules
- Prompts must target original generation.
- Do not prompt models to recreate identifiable source footage.

# Related CLI command
`video-maker prompts --task <task_id>`

# Failure handling
If remake data is missing, stop and report the missing `remake_plan.json`.
