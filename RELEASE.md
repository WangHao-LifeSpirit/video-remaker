# Release v0.7

当前版本：v0.7

这是“短视频复刻自动化工作台”的本地交付版本。它可以在本机完成从用户材料到原创改编方案、真实/模拟素材、FFmpeg 成片和制作包导出的完整闭环。

## 已实现能力

- 创建任务并保存 `task.json`。
- 支持短视频链接、用户上传文件路径、手动文案、字幕、截图描述作为输入。
- 安全链接解析，不绕过登录、验证码、反爬或平台限制。
- DeepSeek real mode：
  - 原视频结构分析
  - 分镜拆解
  - 原创改编脚本
  - 视频模型 prompt
- Mock fallback：
  - LLM 失败时记录 recoverable error 并降级 mock。
  - 视频 provider 不满足成本保护条件时降级 mock。
- Seedance 单/多 scene 真实生成，受 `scene-limit` 和成本保护控制。
- 已成功生成的 Seedance scene 自动复用，避免重复消耗额度。
- FFmpeg 合成可播放 `final.mp4`。
- 导出 Markdown 制作包和 JSON 项目包。
- 网页任务详情页支持：
  - 当前任务状态
  - provider / scene-limit / paid API 状态
  - dry-run 预估
  - 一键生成
  - 步骤状态展示
  - 下载 `final.mp4`、`production-package.md`、`project-package.json`
- CLI 支持逐步运行和 `run-full` 一键运行。

## 未实现能力

- 页面内视频播放器预览。
- 后台任务队列和实时进度推送。
- Agent review cycle，总控自动审稿、打回和重写。
- 上传视频真实处理：ffprobe 元信息、抽帧、字幕读取。
- ASR 转写。
- TTS 配音。
- 字幕烧录。
- 自动下载公开视频。
- 抖音/短视频链接深度解析增强。
- 多用户、登录、计费。
- 全量无限 scene 真实生成。

## 安装

```bash
cd video-remaker
npm install
cp .env.example .env
```

确认 FFmpeg：

```bash
ffmpeg -version
ffprobe -version
```

## 配置 .env

Mock 本地模式：

```env
MOCK_MODE=true
VIDEO_PROVIDER=mock
ENABLE_PAID_API_CALLS=false
FFMPEG_PATH=ffmpeg
FFPROBE_PATH=ffprobe
```

DeepSeek + Seedance 模式：

```env
MOCK_MODE=false
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=填入 DeepSeek Key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

VIDEO_PROVIDER=seedance
SEEDANCE_API_KEY=填入火山方舟 API Key
SEEDANCE_API_BASE_URL=https://ark.cn-beijing.volces.com
SEEDANCE_MODEL=doubao-seedance-1-0-pro-250528
SEEDANCE_RESOLUTION=720p
SEEDANCE_WATERMARK=false
SEEDANCE_CAMERA_FIXED=false

ENABLE_PAID_API_CALLS=true
MAX_VIDEO_SCENES_PER_RUN=3
MAX_RETRY_PER_SCENE=1
```

不要把真实 Key 写入文档、代码或提交记录。

## 启动网页

```bash
npm run dev
```

访问：

```text
http://localhost:3000
```

## 创建任务

在首页填写：

- 视频链接，或上传用户自己有权限的视频文件。
- 目标平台。
- 视频时长。
- 风格。
- 复刻强度。
- 原创改编开关。
- 补充文案、字幕、截图描述。

提交后进入任务详情页。

## 点击一键生成

在任务详情页：

1. 选择 `provider=seedance` 或 `mock`。
2. 设置 `scene-limit`，建议 3。
3. 勾选 `合成 MP4`。
4. 勾选 `导出制作包`。
5. 先点 `Dry-run 预估`。
6. 确认成本保护提示和步骤计划。
7. 点 `一键生成`。

生成完成后页面会显示步骤状态和下载入口。

## 下载结果

任务详情页提供三个下载入口：

- `final.mp4`
- `production-package.md`
- `project-package.json`

文件也会保存在：

```text
data/outputs/{task_id}/
```

## CLI 使用

逐步流程：

```bash
npm run video-maker -- ingest --task <task_id> --text-notes "补充文案"
npm run video-maker -- analyze --task <task_id>
npm run video-maker -- storyboard --task <task_id>
npm run video-maker -- remake --task <task_id>
npm run video-maker -- prompts --task <task_id>
npm run video-maker -- generate-assets --task <task_id> --provider seedance --scene-limit 3
npm run video-maker -- assemble --task <task_id>
npm run video-maker -- export --task <task_id>
```

一键流程：

```bash
npm run video-maker -- run-full \
  --task <task_id> \
  --provider seedance \
  --scene-limit 3 \
  --assemble \
  --export
```

新建任务并一键流程：

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
npm run video-maker -- run-full --task <task_id> --provider mock --scene-limit 3 --assemble --export
```

Seedance：

```bash
npm run video-maker -- run-full --task <task_id> --provider seedance --scene-limit 3 --assemble --export
```

## 避免重复生成

默认 resume：

- 已存在的分析、分镜、改编、prompt 会跳过。
- 已成功的 Seedance scene 会复用本地视频。
- 不会重复生成 s1/s2/s3。

强制重生成：

```bash
npm run video-maker -- run-full --task <task_id> --provider seedance --scene-limit 3 --assemble --export --force
```

## 成本控制

- 默认 `ENABLE_PAID_API_CALLS=false`。
- 真实生成前先用 dry-run。
- 将 `MAX_VIDEO_SCENES_PER_RUN` 设为 1 到 3。
- 将 `MAX_RETRY_PER_SCENE=1`。
- 不使用 `--force`，除非明确要重生成。
- scene-limit 超过上限时，前端和后端都会拒绝。

## 常见问题

### 为什么一键生成没有调用 Seedance？

检查：

- `VIDEO_PROVIDER=seedance`
- `SEEDANCE_API_KEY` 已填写
- `ENABLE_PAID_API_CALLS=true`
- `scene-limit <= MAX_VIDEO_SCENES_PER_RUN`

### 为什么只生成前 3 个 scenes？

这是 v0.7 的成本保护策略。全量 scene 生成留到后续版本。

### 为什么重新点击一键生成没有新增扣费？

系统会复用已成功的 Seedance scene。只有使用 `--force` 或删除已有素材后才会重新生成。

### 任务失败怎么办？

查看任务详情页错误记录，或打开：

```text
data/tasks/{task_id}/task.json
data/tasks/{task_id}/assets.json
```

recoverable error 通常可以通过补充材料、修正 `.env` 或降低 scene-limit 后继续运行。

### 如何关闭网页服务？

在运行 `npm run dev` 的终端按 `Ctrl+C`。

## 交付说明

v0.7 是本地可运行交付版，适合小范围客户演示和内部试用。它已经具备“输入材料 → Agent 分析 → 原创改编 → Seedance 片段 → FFmpeg 成片 → 下载制作包”的主链路，但还不是多用户 SaaS 生产系统。
