# Short Video Remaker

短视频复刻自动化工作台 v0.7。

这是一个本地运行的短视频原创改编工作台。用户输入短视频链接、上传自己有权限的视频，或手动补充文案/字幕/截图描述后，系统通过 Agent 流程拆解结构、生成原创改编方案、调用视频生成 provider 生成素材，并用 FFmpeg 合成 `final.mp4`。

目标是“同款结构，原创内容”，不是下载、搬运、洗稿或复制原素材。

## 当前能力

- 创建任务并生成 `task.json`。
- 安全解析链接文本，不绕过登录、验证码或反爬。
- 接收用户手动补充的文案、字幕、截图描述和上传路径。
- DeepSeek real mode 生成：
  - `analysis.json`
  - `storyboard.json`
  - `remake_plan.json`
  - `video_prompts.json`
- Mock mode fallback：LLM 或视频 provider 配置不完整时，写入 recoverable error 并降级 mock。
- Seedance provider 真实生成受限数量的视频片段。
- 已成功生成的 Seedance scene 会自动复用，除非显式使用 `--force`。
- FFmpeg 合成真实可播放的 `final.mp4`。
- 导出：
  - `production-package.md`
  - `project-package.json`
- 网页任务详情页支持：
  - dry-run 预估
  - 一键生成
  - 成本保护提示
  - 步骤状态
  - 下载结果文件
- CLI 支持逐步命令和 `run-full` 一键流程。

## 当前限制

- 不自动下载公开视频。
- 不绕过登录、验证码、反爬、付费墙或平台限制。
- 不证明用户是否拥有上传素材版权，权限由用户自行确认。
- 上传视频抽帧、元信息读取、字幕识别尚未完成。
- TTS 配音尚未完成。
- ASR 转写尚未完成。
- 字幕烧录尚未完成，目前以外挂字幕/制作包为主。
- 没有后台任务队列和实时进度流；网页请求会等待后端流程完成。
- 没有多用户、登录、计费。
- Kling / Luma 不作为当前交付链路使用。
- Seedance 真实生成受成本保护限制，默认不全量生成所有 scenes。

## 安装

```bash
cd video-remaker
npm install
cp .env.example .env
```

确保本机已安装 FFmpeg 和 ffprobe：

```bash
ffmpeg -version
ffprobe -version
```

## 配置 .env

所有 API Key 只写入 `.env`，不要写进代码、README 或日志。

Mock 模式：

```env
MOCK_MODE=true
VIDEO_PROVIDER=mock
ENABLE_PAID_API_CALLS=false
FFMPEG_PATH=ffmpeg
FFPROBE_PATH=ffprobe
```

DeepSeek + Seedance real mode：

```env
MOCK_MODE=false
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=填入你的 Key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

VIDEO_PROVIDER=seedance
SEEDANCE_API_KEY=填入你的火山方舟 API Key
SEEDANCE_API_BASE_URL=https://ark.cn-beijing.volces.com
SEEDANCE_MODEL=doubao-seedance-1-0-pro-250528
SEEDANCE_RESOLUTION=720p
SEEDANCE_WATERMARK=false
SEEDANCE_CAMERA_FIXED=false

ENABLE_PAID_API_CALLS=true
MAX_VIDEO_SCENES_PER_RUN=3
MAX_RETRY_PER_SCENE=1
```

成本保护默认关闭真实视频生成：

```env
ENABLE_PAID_API_CALLS=false
```

只有当 `VIDEO_PROVIDER=seedance`、`SEEDANCE_API_KEY` 存在、`ENABLE_PAID_API_CALLS=true`，且 `scene-limit <= MAX_VIDEO_SCENES_PER_RUN` 时，才允许真实调用 Seedance。

## 启动网页

```bash
npm run dev
```

打开：

```text
http://localhost:3000
```

如果默认端口受限，可尝试：

```bash
npm run dev -- -H 127.0.0.1 -p 3000
```

## 网页使用方式

1. 打开首页。
2. 填写短视频链接，或上传用户自己有权限的视频，或补充文案/字幕/截图描述。
3. 创建任务。
4. 进入任务详情页。
5. 查看任务状态、已有 JSON 产物和成本保护提示。
6. 点击 `Dry-run 预估`，确认将执行哪些步骤，不消耗费用。
7. 保持 `provider=seedance`，`scene-limit=3`，点击 `一键生成`。
8. 生成完成后下载：
   - `final.mp4`
   - `production-package.md`
   - `project-package.json`

## CLI 使用方式

创建任务：

```bash
npm run video-maker -- init-task \
  --target-platform douyin \
  --duration 15s \
  --style "clean cinematic AI workflow"
```

补充材料：

```bash
npm run video-maker -- ingest \
  --task <task_id> \
  --text-notes "一个大学生用 AI 搭建自己的个人工作流"
```

逐步执行：

```bash
npm run video-maker -- analyze --task <task_id>
npm run video-maker -- storyboard --task <task_id>
npm run video-maker -- remake --task <task_id>
npm run video-maker -- prompts --task <task_id>
npm run video-maker -- generate-assets --task <task_id> --provider seedance --scene-limit 3
npm run video-maker -- assemble --task <task_id>
npm run video-maker -- export --task <task_id>
```

一键 dry-run：

```bash
npm run video-maker -- run-full \
  --task <task_id> \
  --provider seedance \
  --scene-limit 3 \
  --assemble \
  --export \
  --dry-run
```

一键生成：

```bash
npm run video-maker -- run-full \
  --task <task_id> \
  --provider seedance \
  --scene-limit 3 \
  --assemble \
  --export
```

新建任务并一键生成：

```bash
npm run video-maker -- run-full \
  --provider seedance \
  --scene-limit 3 \
  --target-platform douyin \
  --duration 15s \
  --style "clean cinematic AI workflow" \
  --text-notes "一个大学生用 AI 搭建自己的个人工作流" \
  --assemble \
  --export
```

## 切换 mock / Seedance

Mock：

```bash
MOCK_MODE=true
VIDEO_PROVIDER=mock
ENABLE_PAID_API_CALLS=false
```

Seedance：

```bash
MOCK_MODE=false
VIDEO_PROVIDER=seedance
ENABLE_PAID_API_CALLS=true
MAX_VIDEO_SCENES_PER_RUN=3
```

CLI 也可以显式指定：

```bash
npm run video-maker -- run-full --task <task_id> --provider mock --scene-limit 3 --assemble --export
npm run video-maker -- run-full --task <task_id> --provider seedance --scene-limit 3 --assemble --export
```

## 避免重复生成

默认 `run-full` 会 resume：

- 已存在的 `analysis.json`、`storyboard.json`、`remake_plan.json`、`video_prompts.json` 会跳过。
- 已经成功的 Seedance scene 会复用本地视频文件。
- 不会重复生成成功的 s1/s2/s3。

只有显式使用 `--force` 才会重新生成：

```bash
npm run video-maker -- run-full --task <task_id> --provider seedance --scene-limit 3 --assemble --export --force
```

## 控制成本

- 先用 `--dry-run` 看执行计划。
- 保持 `MAX_VIDEO_SCENES_PER_RUN=3` 或更低。
- 保持 `MAX_RETRY_PER_SCENE=1`。
- 不要使用 `--force`，除非确实要重新消耗生成额度。
- `ENABLE_PAID_API_CALLS=false` 时不会触发真实 Seedance 生成。

## 输出文件

任务文件：

```text
data/tasks/{task_id}/
  task.json
  input.json
  analysis.json
  storyboard.json
  remake_plan.json
  video_prompts.json
  assets.json
  assets/videos/
  final/
```

导出文件：

```text
data/outputs/{task_id}/
  final.mp4
  production-package.md
  project-package.json
```

## 常见问题

### Key 放哪里？

只放 `.env`。`.env` 已被 `.gitignore` 忽略。

### 网页下载不了文件怎么办？

确认已经执行 `assemble` 和 `export`。下载接口只允许访问当前任务输出目录中的三个固定文件。

### 为什么没有真实生成视频？

检查：

- `VIDEO_PROVIDER=seedance`
- `SEEDANCE_API_KEY` 已填写
- `ENABLE_PAID_API_CALLS=true`
- `scene-limit <= MAX_VIDEO_SCENES_PER_RUN`

如果不满足，系统会 fallback mock 并写入 errors。

### 为什么没有重新生成 s1/s2/s3？

这是预期行为。系统默认复用已成功生成的 Seedance scene，避免重复花费。需要重生成时使用 `--force`。

### 如何关闭网页服务？

在运行 `npm run dev` 的终端按 `Ctrl+C`。

## 安全边界

本项目只做结构学习和原创改编，不绕过平台限制，不自动下载公开视频，不复制原视频素材，不把 API Key 写入代码。
