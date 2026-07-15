# Troubleshooting

## 如何确认当前配置

运行：

```bash
npm run video-maker -- config-check
npm run video-maker -- tts-check
```

输出会显示：

- 当前 `LLM_PROVIDER`
- DeepSeek / OpenAI / Claude 的 Key 和 Model 是否存在
- 当前 `VIDEO_PROVIDER`
- mock / Seedance / Kling 的配置是否完整
- `ENABLE_PAID_API_CALLS` 状态
- 当前 `TTS_PROVIDER`
- Volcengine / OpenAI TTS / ElevenLabs 的 Key、Voice、Model 是否存在
- `ENABLE_PAID_TTS_CALLS` 状态

不会显示完整 API Key，也不会调用真实 API。

## 切换 .env 后没有生效

如果在网页设置页保存，后续操作会直接读取新配置。如果手动编辑 `.env`，网页开发服务需要重启：

```bash
Ctrl+C
npm run dev
```

CLI 命令每次运行会重新读取 `.env`。

## 文本步骤 fallback mock

常见原因：

- `MOCK_MODE=true`
- `LLM_PROVIDER` 写成了不支持的值
- DeepSeek 缺少 `DEEPSEEK_API_KEY` 或 `DEEPSEEK_MODEL`
- OpenAI 缺少 `OPENAI_API_KEY` 或 `OPENAI_MODEL`
- Claude 缺少 `ANTHROPIC_API_KEY` 或 `ANTHROPIC_MODEL`
- 模型返回了非 JSON 或未通过本地 schema 校验

fallback mock 是安全降级，不消耗真实文本模型费用。

## 上传了视频，但生成结果和原片无关

先检查分析步骤是否真的获得了可理解的输入：

- DeepSeek 是文本模型，不能直接查看关键帧。
- 只有文件路径和元信息，不等于模型理解了画面内容。
- 没有字幕、文案、画面说明或视觉模型时，当前版本会暂停，不再继续消耗视频生成费用。
- 上传或修改材料后，重新运行即可；系统会按文件更新时间重算过期的 analysis、storyboard、remake 和 prompts。

推荐补充原字幕、原文案或画面说明。需要视觉理解时，配置 `OPENAI_API_KEY` 和 `OPENAI_VISION_MODEL`。

## 视频步骤 fallback mock

常见原因：

- `VIDEO_PROVIDER=mock`
- `ENABLE_PAID_API_CALLS=false`
- `scene-limit` 超过 `MAX_VIDEO_SCENES_PER_RUN`
- Seedance Key / Model / Base URL 配置不完整
- Kling 缺少 Access Key / Secret / Base URL / Model / Endpoint
- 已有成功 scene 被 resume 复用

视频 provider 和 LLM provider 是独立配置。OpenAI / DeepSeek / Claude 配置正确，不代表 Seedance 会生成视频。

## 成片出现纯色、绿色或彩色测试图案

这表示某些 scene 使用了 Mock 占位片段，不是视频模型的真实结果。新生成的 Mock 使用明确的彩色测试图案；旧任务可能仍保留早期纯色占位片段。

页面和 `assets.json` 会保持 `mocked` 标记。只有真实 provider 片段生成完成并重新 assemble 后，才能作为正式成片使用。

## 后台任务长时间停在运行中

视频 provider 的轮询可能持续数分钟。若 job 超过 30 分钟没有任何更新时间，系统会自动标记为 failed，不再永久阻塞任务。之后使用默认 `resume=true` 重新运行即可。

## TTS 步骤 fallback silent audio

常见原因：

- `TTS_PROVIDER=mock`
- `ENABLE_PAID_TTS_CALLS=false`
- Volcengine 缺少 `VOLC_TTS_APP_ID`
- Volcengine 缺少 `VOLC_TTS_ACCESS_TOKEN`
- Volcengine 缺少 `VOLC_TTS_CLUSTER`
- Volcengine 缺少 `VOLC_TTS_VOICE_TYPE`
- Volcengine 缺少 `VOLC_TTS_API_BASE_URL`
- OpenAI / ElevenLabs TTS 目前只是预留配置

TTS provider 和 Video provider 是独立配置。Seedance 配置正确，不代表会生成真实旁白音频。成本保护拦截时会记录 “No TTS credits were consumed.”。

## 为什么网页下拉框没有 Kling

这是产品策略。当前稳定 Video Provider 是 `mock` 和 `seedance`。Kling 属于实验性 provider，即使 `.env` 有配置，也不会默认出现在稳定生成入口里。

如果后续要把新视频 API 变成稳定链路，需要完成 client、asset-generator、cost-guard、config-check、页面选项和文档的整体验收。

## 页面不显示最新 provider

在设置页保存后刷新任务页。若是手动编辑 `.env`，需要重启 `npm run dev`。任务详情页只显示 provider 名称，不显示 Key。

## 链接解析后仍提示需要补充材料

这是正常设计。当前链接解析是输入辅助，不是自动抓取器。它只识别平台和 URL 状态，不下载视频、不绕过登录、不处理验证码或反爬。

继续方式：

```bash
npm run video-maker -- parse-link --task <task_id> --url "https://v.douyin.com/example/"
```

然后在页面继续：

- 上传原视频。
- 填写原视频字幕。
- 填写原视频文案。
- 填写画面说明。
- 填写复刻要求。

常见状态：

- `needs_user_input`：平台可识别，但当前不做自动抓取，请补充材料。
- `unsupported`：平台未知或暂未支持。
- `failed`：输入不是有效 URL。

抖音、小红书、快手等平台经常有短链、App 跳转或平台限制，本地工具不会绕过这些限制。

## 上传原视频失败

常见原因：

- 文件不是 `mp4`、`mov` 或 `webm`。
- 文件超过默认 500MB 限制。
- 当前任务 ID 不存在。
- `data/uploads` 目录不可写。

上传只保存用户本地选择的文件，不会读取任意路径，也不会自动下载公开视频。

## 原视频元信息读取失败

常见原因：

- 还没有上传原视频。
- `input.json` 中没有 `uploaded_video_path`。
- `FFPROBE_PATH` 配置错误。
- 上传文件损坏或 ffprobe 无法识别。

检查：

```bash
npm run video-maker -- analyze-source --task <task_id>
ffprobe data/uploads/<task_id>/source.mp4
```

## 关键帧抽取失败

常见原因：

- 还没有生成 `source_video.json`。
- 上传视频路径不存在。
- `FFMPEG_PATH` 配置错误。
- 视频太短，抽出的帧少于 max，这是正常情况。

检查：

```bash
npm run video-maker -- extract-frames --task <task_id> --max 8
```

输出在：

```text
data/tasks/<task_id>/assets/source-frames/
```

## 封面或成片资产不显示

常见原因：

- 还没有 `final.mp4` 或 `final_subtitled.mp4`。
- 还没有运行 `export-cover`。
- 还没有生成 `outputs_manifest.json`。

检查：

```bash
npm run video-maker -- export-cover --task <task_id>
npm run video-maker -- outputs-manifest --task <task_id>
```

输出在：

```text
data/outputs/<task_id>/cover.jpg
data/outputs/<task_id>/outputs_manifest.json
```

`final.mp4` 是原始合成版；`final_subtitled.mp4` 是字幕烧录版；`cover.jpg` 是从成片第 1 秒导出的封面图。
