# Name
douyin-link-parser

# Description
Safely identify official Douyin links or noisy Douyin share text and convert them into structured task source fields.

# When to use
Use when a user provides a Douyin URL or pasted share text and the workflow needs `original_url`, `final_url`, `platform`, `content_id`, and `parse_status`.

# Inputs
- URL or pasted share text.
- Task ID when writing into a task.

# Workflow
1. Extract the first official `douyin.com` or `iesdouyin.com` URL.
2. Reject unofficial or embedded fake domains.
3. Parse platform and content ID from the URL path when possible.
4. Do not download video, bypass redirects requiring login, or defeat anti-bot systems.
5. If parsing fails, set `parse_status=needs_user_input`.

# Output format
```json
{
  "original_url": "string",
  "final_url": "string",
  "platform": "douyin",
  "content_id": "string",
  "parse_status": "success | needs_user_input",
  "parse_error": "string"
}
```

# Safety rules
- Never bypass login, captcha, anti-bot, or platform restrictions.
- Never download or copy source video.
- Use links only for structure-learning context.

# Related CLI command
`video-maker resolve-link --task <task_id> --url <url_or_share_text>`

# Failure handling
If no official URL is found, write a recoverable error and move the task into user supplementary material mode.
