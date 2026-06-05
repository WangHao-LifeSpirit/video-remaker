# Release v2.0

当前版本：v2.0 Local Video Remaker Workbench

这是一个本地运行的网页端短视频复刻自动化工作台。它不部署公网，不包含任何 API Key。客户需要在自己的机器上安装依赖、配置 `.env`，并自行管理 DeepSeek / OpenAI / Claude / Seedance 等第三方 API 的额度和费用。

## 稳定链路

```text
输入链接 / 上传原视频 / 补充材料
→ Storyboard Agent
→ Content Creator Agent
→ Review Agent
→ LLM 生成脚本 / 分镜 / prompts
→ Seedance 生成视频片段
→ FFmpeg 合成 final.mp4
→ 字幕烧录 final_subtitled.mp4
→ 页面预览和下载
```

## 已实现能力

- 首页 v2.0 工作台入口、最近任务和说明入口。
- 任务详情页按 5 步组织：输入材料、三 Agent 创作、视频生成与合成、旁白与字幕、成片预览与导出。
- 链接识别与用户补充模式，输出 `source_link.json`。
- 上传用户自有原视频，读取元信息，抽取关键帧。
- 保存原字幕、原文案、画面说明和复刻要求。
- LLM Provider 架构：`mock` / `deepseek` / `openai` / `claude`。
- Video Provider 架构：`mock` / `seedance` / `kling` / `luma`，稳定链路为 `mock` / `seedance`。
- 三 Agent 协作：Storyboard / Content Creator / Review。
- 总控审稿按钮化和 prompt 修正 apply。
- Seedance 受成本保护的视频片段生成。
- FFmpeg 合成 `final.mp4`。
- 字幕稿、SRT、mock audio 和字幕烧录 `final_subtitled.mp4`。
- 后台 job、轮询进度、防重复运行和 failed job 重试。
- 页面内视频预览和下载。
- 成片资产管理：`final.mp4`、`final_subtitled.mp4`、`cover.jpg`、`production-package.md`、`project-package.json`、`outputs_manifest.json`。
- 历史错误日志折叠展示与安全清理。

## 当前限制

- 本地运行，不是公网 SaaS。
- 不自动下载公开视频。
- 不绕过登录、验证码、反爬、付费墙或平台限制。
- 不包含 API Key，真实生成需要用户自己的 `.env` 配置。
- 暂无多用户、登录、权限和计费。
- 当前后台 job 是本地 JSON 轻量实现，不是生产级队列系统。
- TTS 真实调用已预留，但不是当前稳定主链路。
- ASR 尚未接入真实链路。
- Kling / Luma 是实验性 provider，不作为当前稳定交付链路。
- 本地任务依赖本机文件系统。

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

## 启动网页

```bash
npm run dev
```

打开：

```text
http://localhost:3000
```

## 配置 .env

Mock 本地模式：

```env
MOCK_MODE=true
LLM_PROVIDER=mock
VIDEO_PROVIDER=mock
ENABLE_PAID_API_CALLS=false
FFMPEG_PATH=ffmpeg
FFPROBE_PATH=ffprobe
```

DeepSeek + Seedance 模式：

```env
MOCK_MODE=false
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

VIDEO_PROVIDER=seedance
SEEDANCE_API_KEY=
SEEDANCE_API_BASE_URL=https://ark.cn-beijing.volces.com
SEEDANCE_MODEL=doubao-seedance-1-0-pro-250528
SEEDANCE_RESOLUTION=720p

ENABLE_PAID_API_CALLS=true
MAX_VIDEO_SCENES_PER_RUN=3
MAX_RETRY_PER_SCENE=1
```

不要把真实 Key 写入文档、代码或提交记录。

## CLI

配置检查：

```bash
npm run video-maker -- config-check
```

一键流程：

```bash
npm run video-maker -- run-full --task <task_id> --provider seedance --scene-limit 3 --assemble --export
```

链接解析：

```bash
npm run video-maker -- parse-link --task <task_id> --url "https://v.douyin.com/example/"
```

上传视频后读取元信息和抽帧：

```bash
npm run video-maker -- analyze-source --task <task_id>
npm run video-maker -- extract-frames --task <task_id> --max 8
```

旁白、字幕和字幕烧录：

```bash
npm run video-maker -- prepare-audio --task <task_id>
npm run video-maker -- burn-subtitles --task <task_id>
```

封面和资产清单：

```bash
npm run video-maker -- export-cover --task <task_id>
npm run video-maker -- outputs-manifest --task <task_id>
```

## 成本控制

- 默认 `ENABLE_PAID_API_CALLS=false`。
- 真实生成前先用 dry-run。
- `scene-limit` 不得超过 `MAX_VIDEO_SCENES_PER_RUN`。
- 已成功生成的 Seedance scene 默认复用。
- 不使用 `--force`，除非明确需要重生成。

## 交付文件

最终用户主要下载：

- `final.mp4`
- `final_subtitled.mp4`
- `cover.jpg`
- `production-package.md`
- `project-package.json`

本地路径：

```text
data/outputs/<task_id>/
```
