# Agent Context

本项目是 v2.1 本地网页端短视频复刻自动化工作台，目标是“同款结构，原创内容”。系统不自动下载公开视频，不绕过登录、验证码、反爬或平台限制。

当前产品入口以网页为主：首页创建任务，任务详情页按 5 步组织输入材料、三 Agent 创作、视频生成与合成、旁白与字幕、成片预览与导出。高级信息默认折叠，只用于排障和后续开发。

## Provider 分层

LLM Provider 只负责文本和规划：

- `mock`
- `deepseek`
- `openai`
- `claude`

它影响：

- `analysis.json`
- `storyboard.json`
- `remake_plan.json`
- `video_prompts.json`
- `review_report.json`

Video Provider 只负责视频片段：

- `mock`
- `seedance`
- `kling`

它影响：

- `assets.json`
- `data/tasks/<task_id>/assets/videos/*.mp4`
- `final.mp4` 的视频素材来源

TTS Provider 只负责旁白音频：

- `mock`
- `volcengine`
- `openai`
- `elevenlabs`

它影响：

- `data/tasks/<task_id>/assets/audio/voiceover.wav`
- `data/tasks/<task_id>/assets/audio/silent.wav`
- `assets.json` 中的 voiceover audio asset

不要把 LLM Provider、Video Provider 和 TTS Provider 混在一起。DeepSeek/OpenAI/Claude 不生成视频；Seedance 不做文本分析；TTS 不生成视频片段。

稳定性边界：

- 稳定 Video Provider：`mock`、`seedance`
- 实验性 Video Provider：`kling`
- 稳定 TTS Provider：`mock`、`volcengine`
- 预留 TTS Provider：`openai`、`elevenlabs`

类型支持不等于产品默认开放。网页一键生成下拉框默认只显示稳定 provider。Kling 只有在明确验收后才能进入稳定链路。

接入新视频 API 时，至少检查：

- `lib/api-clients/*-client.ts`
- `lib/tools/asset-generator.ts`
- `lib/tools/cost-guard.ts`
- `lib/tools/config-check.ts`
- 页面 provider 选项
- README / USER_GUIDE / TROUBLESHOOTING

接入新 TTS API 时，至少检查：

- `lib/api-clients/tts-client.ts`
- `lib/api-clients/*-tts-client.ts`
- `lib/tools/audio-generator.ts`
- `lib/tools/cost-guard.ts`
- `lib/tools/config-check.ts`
- 旁白与字幕页面展示
- README / USER_GUIDE / TROUBLESHOOTING

## 安全规则

- API Key 只从 `.env` 读取。
- 不在页面、日志、README、导出文件中打印完整 Key。
- 真实 API 配置缺失时必须 fallback mock。
- mock 结果必须清晰标记。
- 修改 `.env` 后需要重启 dev server。

## 开发注意

优先复用 `/lib` 中的工具函数。CLI、API Route 和网页都不应该各写一套业务逻辑。`run-full` 主链路默认行为必须保持稳定，新增能力应通过显式参数开启。

## v1.4 输入材料和成片资产

链接输入：

- `lib/tools/link-parser.ts` 只做本地 URL 规范化、平台识别和安全状态判断。
- 输出 `data/tasks/<task_id>/source_link.json`。
- 同步核心链接信息到 `input.json` 的 `source_link` 字段。
- 解析状态不是下载状态。`needs_user_input` 表示平台可识别，但仍需要用户上传原视频或补充字幕、文案、画面说明。
- 不联网、不下载公开视频、不读取 cookie、不处理登录、验证码或反爬。

原视频输入：

- 用户可以上传自己有权限的本地 `mp4` / `mov` / `webm`。
- 上传文件保存到 `data/uploads/<task_id>/source.mp4` 或对应扩展名。
- 上传信息写入 `data/tasks/<task_id>/input.json` 的 `uploaded_video` 字段。
- 不自动下载公开视频，不绕过平台限制，不做真实 ASR。

原视频分析：

- `lib/tools/source-video-analyzer.ts` 使用 ffprobe 读取元信息。
- 输出 `data/tasks/<task_id>/source_video.json`。
- 字段包括时长、分辨率、fps、视频编码、是否有音轨和音频编码。

关键帧：

- `lib/tools/frame-extractor.ts` 使用 FFmpeg 抽帧。
- 默认每 2 秒一帧，最多 8 帧。
- 输出 `data/tasks/<task_id>/assets/source-frames/frame_001.jpg` 等文件。
- 元数据写入 `data/tasks/<task_id>/source_frames.json`。

补充材料：

- 原视频字幕、原视频文案、画面说明、复刻要求写入 `input.json`。
- 这些材料用于帮助后续 LLM 分析，但保存本身不调用 LLM。

成片资产：

- `lib/tools/cover-exporter.ts` 从 `final_subtitled.mp4` 或 `final.mp4` 第 1 秒导出 `cover.jpg`。
- `lib/tools/output-manifest.ts` 生成 `data/outputs/<task_id>/outputs_manifest.json`。
- manifest 记录 `final.mp4`、`final_subtitled.mp4`、`cover.jpg`、`production-package.md`、`project-package.json` 的存在状态、大小和更新时间。
- 页面成片资产区只展示和下载本地输出文件，不触发任何付费 API。
