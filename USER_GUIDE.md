# User Guide

短视频复刻自动化工作台 v2.1 是本地运行版本。它把文本模型、视频模型和配音模型分开配置：

- LLM Provider：负责分析、分镜、改编、video prompts 和 Agent review。
- Video Provider：负责生成视频片段。
- TTS Provider：负责生成旁白音频。

## Provider 切换

最推荐的新用户流程是：先用 mock 跑通，再配置 DeepSeek / OpenAI / Claude 作为 LLM Provider，最后在明确成本保护后启用 Seedance。

Mock 测试模式不消耗费用：

```env
MOCK_MODE=true
LLM_PROVIDER=mock
VIDEO_PROVIDER=mock
ENABLE_PAID_API_CALLS=false
```

DeepSeek：

```env
MOCK_MODE=false
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

DeepSeek 负责文本推理，不会直接查看上传视频的关键帧。只上传视频而没有字幕、文案或画面说明时，系统会暂停以避免生成不相关内容。需要自动理解关键帧时，可额外配置 `OPENAI_API_KEY` 和 `OPENAI_VISION_MODEL`；也可以直接补充原字幕和画面说明。

OpenAI：

```env
MOCK_MODE=false
LLM_PROVIDER=openai
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=
```

Claude：

```env
MOCK_MODE=false
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=
```

Seedance 视频生成：

```env
VIDEO_PROVIDER=seedance
SEEDANCE_API_KEY=
SEEDANCE_API_BASE_URL=https://ark.cn-beijing.volces.com
SEEDANCE_MODEL=doubao-seedance-1-0-pro-250528
ENABLE_PAID_API_CALLS=true
MAX_VIDEO_SCENES_PER_RUN=3
```

Video Provider 区别：

- `mock`：始终可用，生成本地占位片段，不消耗费用。
- `seedance`：当前稳定交付链路，用于真实生成视频片段。
- `kling`：实验性 provider，已有部分 client，但默认不在网页下拉框开放。

网页一键生成下拉框默认只显示 `seedance` 和 `mock`。Kling client 的存在不代表它已经成为稳定可用的页面能力。

TTS Provider：

- `mock`：生成 `silent.wav`，不消耗费用。
- `volcengine`：当前真实 TTS 主 provider。
- `openai`：预留配置。
- `elevenlabs`：预留配置。

Volcengine 配置：

```env
TTS_PROVIDER=volcengine
VOLC_TTS_APP_ID=
VOLC_TTS_ACCESS_TOKEN=
VOLC_TTS_CLUSTER=
VOLC_TTS_VOICE_TYPE=
VOLC_TTS_API_BASE_URL=https://openspeech.bytedance.com/api/v1/tts
ENABLE_PAID_TTS_CALLS=false
```

真实 TTS 必须设置 `ENABLE_PAID_TTS_CALLS=true`。如果配置缺失或成本保护关闭，系统会 fallback 到 mock/silent audio，并记录 “No TTS credits were consumed.”。

在设置页保存的配置会立即用于后续操作。若手动编辑 `.env`，请重启 `npm run dev`。CLI 命令每次运行会重新读取本地环境。

## 配置检查

```bash
npm run video-maker -- config-check
npm run video-maker -- tts-check
```

该命令只显示 Key 是否存在，不显示完整 Key，不调用任何真实 API。

## 上传原视频

上传完成后无需在下一步重复上传。运行 analyze 或一键生成时，系统会自动读取元信息并抽取覆盖全片的关键帧。输入材料发生变化后，旧的分析、分镜、改编和 prompts 会自动失效并重新生成。

任务详情页的 `原视频 / 输入材料` 区域也支持先输入短视频链接并点击 `解析链接`。

链接解析只做：

- 判断 URL 是否有效。
- 识别平台。
- 写入 `source_link.json`。
- 给出下一步材料补充建议。

链接解析不会：

- 下载公开视频。
- 处理登录、cookie、验证码或反爬。
- 调用 DeepSeek、Seedance、TTS 或 ASR。

CLI：

```bash
npm run video-maker -- parse-link --task <task_id> --url "https://www.bilibili.com/video/BVxxxx"
```

如果状态是 `needs_user_input`、`unsupported` 或 `failed`，请继续上传原视频，或补充原字幕、原文案、画面说明和复刻要求。

任务详情页的 `原视频 / 输入材料` 区域支持上传用户自己有权限的本地视频：

- 支持格式：`mp4`、`mov`、`webm`
- 默认大小限制：500MB
- 保存位置：`data/uploads/<task_id>/source.mp4`

上传后可以在页面点击：

- `读取原视频元信息`：用 ffprobe 生成 `source_video.json`。
- `抽取关键帧`：用 FFmpeg 生成 `assets/source-frames/*.jpg` 和 `source_frames.json`。
- `保存原视频补充材料`：保存原视频字幕、文案、画面说明和复刻要求到 `input.json`。

CLI：

```bash
npm run video-maker -- analyze-source --task <task_id>
npm run video-maker -- extract-frames --task <task_id> --max 8
npm run video-maker -- source-notes --task <task_id> \
  --source-transcript "原视频字幕" \
  --source-caption "原视频文案" \
  --screenshot-notes "画面说明" \
  --remake-requirements "复刻要求"
```

当前不会自动爬取公开视频，也不会绕过平台限制。真实 ASR 尚未接入，因此上传视频不会自动转写字幕。

## 成片资产

任务详情页的 `成片资产` 区域会读取 `outputs_manifest.json`，集中展示：

- `final.mp4`：原始成片。
- `final_subtitled.mp4`：带字幕成片。
- `cover.jpg`：封面帧。
- `production-package.md`：制作包。
- `project-package.json`：项目包。

导出封面帧：

```bash
npm run video-maker -- export-cover --task <task_id>
```

刷新资产清单：

```bash
npm run video-maker -- outputs-manifest --task <task_id>
```

封面帧优先从 `final_subtitled.mp4` 的第 1 秒导出；如果没有带字幕版，则从 `final.mp4` 导出。

## Fallback 规则

如果 `MOCK_MODE=true`，或所选 LLM Provider 缺少 Key / Model，文本步骤会 fallback mock。mock 是测试模式，不消耗文本模型费用。视频生成仍受 `VIDEO_PROVIDER` 和 `ENABLE_PAID_API_CALLS` 控制。
