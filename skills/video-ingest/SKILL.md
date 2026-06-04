# Name
video-ingest

# Description
Normalize user-provided uploads, transcript, copy, screenshot notes, and parsed source information into `input.json`.

# When to use
Use after task creation and optional link parsing, before analysis.

# Inputs
- Task ID.
- Optional owned upload path.
- Optional text notes, transcript, screenshot notes.

# Workflow
1. Read `task.json`.
2. Validate that any upload path is readable.
3. Merge user inputs into task state.
4. Build a materials list with per-material status.
5. Write `input.json`.

# Output format
`input.json` with `source`, `user_inputs`, `materials`, `available_materials`, `missing_materials`, and `errors`.

# Safety rules
- Only ingest material the user provides.
- Do not fetch or download remote videos.
- Mark unreadable uploads as recoverable failures.

# Related CLI command
`video-maker ingest --task <task_id> [--upload <path>] [--text-notes <text>] [--transcript <text>] [--screenshot-notes <text>]`

# Failure handling
If no usable material exists, set status to `needs_user_input` and ask for transcript, copy, screenshot notes, or an owned upload.
