# Name
remake-plan-generator

# Description
Generate an original remake strategy, script, new storyboard, cover titles, publish copy, and quality check.

# When to use
Use after `analysis.json` and `storyboard.json` exist.

# Inputs
- `task.json`
- `analysis.json`
- `storyboard.json`

# Workflow
1. Read source structure and user target settings.
2. Preserve structural rhythm while replacing script, examples, visual materials, and wording.
3. Generate new concept, script, storyboard, cover titles, and publish copy.
4. Run quality checks for similarity and missing assets.
5. Write `remake_plan.json`.

# Output format
`remake_plan.json` with remake strategy, new concept, script, storyboard, publishing copy, risk notes, quality check, and errors.

# Safety rules
- High remake strength means structural similarity only.
- Do not copy source text, footage, or cover language.

# Related CLI command
`video-maker remake --task <task_id>`

# Failure handling
If required upstream artifacts are missing, stop and report the missing artifact.
