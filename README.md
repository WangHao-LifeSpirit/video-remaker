# Short Video Remaker

短视频复刻自动化工作台 v2.0。

这是一个本地运行的网页端短视频原创改编工作台，不是公网 SaaS。用户输入短视频链接、上传自己有权限的视频，或手动补充文案/字幕/截图描述后，系统通过 Storyboard / Content Creator / Review Agent 流程拆解结构、生成原创改编方案、调用视频生成 provider 生成素材，并用 FFmpeg 合成 `final.mp4` 和 `final_subtitled.mp4`。

目标是“同款结构，原创内容”，不是下载、搬运、洗稿或复制原素材。

## 当前能力

- 创建任务并生成 `task.json`。
- 首页 v2.0 工作台入口、最近任务和说明页。
- 任务详情页按 5 步组织：输入材料、三 Agent 创作、视频生成与合成、旁白与字幕、成片预览与导出。
- 安全解析链接文本，不绕过登录、验证码或反爬。
- 安全识别短视频链接平台，输出 `source_link.json`，并引导用户补充材料。
- 接收用户手动补充的文案、字幕、截图描述和上传路径。
- 支持上传用户自己有权限的本地原视频，并写入 `input.json`。
- 支持用 ffprobe 读取原视频元信息，输出 `source_video.json`。
- 支持用 FFmpeg 抽取原视频关键帧，输出 `source_frames.json` 和 `assets/source-frames/*.jpg`。
- 支持保存原视频字幕、原视频文案、画面说明和复刻要求。
- LLM Provider real mode 生成，当前支持 `deepseek` / `openai` / `claude`，也可使用 `mock`：
  - `analysis.json`
  - `storyboard.json`
  - `remake_plan.json`
  - `video_prompts.json`
  - `review_report.json`
- Mock mode fallback：LLM 或视频 provider 配置不完整时，写入 recoverable error 并降级 mock。
- Seedance provider 真实生成受限数量的视频片段。
- 已成功生成的 Seedance scene 会自动复用，除非显式使用 `--force`。
- FFmpeg 合成真实可播放的 `final.mp4`。
- 支持字幕烧录，输出 `final_subtitled.mp4`。
- 支持从成片导出 `cover.jpg`。
- 支持生成 `outputs_manifest.json`，集中记录成片、封面和制作包资产。
- 导出：
  - `production-package.md`
  - `project-package.json`
- 网页任务详情页支持：
  - dry-run 预估
  - 一键生成
  - 成本保护提示
  - 后台 job 执行
  - 页面轮询进度
  - 历史 jobs
  - 防重复运行
  - failed job 重试
  - 步骤状态
  - `final.mp4` 页面内预览
  - Agent Review / 总控审稿展示
  - 原视频 / 输入材料展示
  - 关键帧缩略图展示
  - 成片资产展示
  - 下载结果文件
- 历史错误日志默认折叠展示。
- 支持安全清理历史错误日志，并备份到任务目录。
- CLI 支持逐步命令和 `run-full` 一键流程。

## 当前限制

- 不自动下载公开视频。
- 不绕过登录、验证码、反爬、付费墙或平台限制。
- 不证明用户是否拥有上传素材版权，权限由用户自行确认。
- 上传视频元信息读取和关键帧抽取已支持；真实 ASR 字幕识别尚未完成。
- TTS Provider 架构已预留，mock/silent audio 已支持；真实 TTS 不是当前稳定主链路。
- ASR 转写尚未完成。
- 没有多用户、登录、计费。
- 本地任务依赖本机文件系统。
- 当前后台 job 是本地 JSON 轻量实现，不是生产级分布式任务队列。
- 已支持基础链接平台识别；暂无抖音/小红书/快手等平台的深度元信息自动解析。
- Kling / Luma 不作为当前交付链路使用。
- Seedance 真实生成受成本保护限制，默认不全量生成所有 scenes。

## 推荐使用流程

1. 在首页创建任务。
2. 在任务详情页 Step 1 输入链接、上传原视频，或补充原字幕 / 原文案 / 画面说明 / 复刻要求。
3. 读取原视频元信息并抽取关键帧。
4. 使用 dry-run 预估生成步骤和成本保护。
5. 运行一键生成，生成分析、分镜、改编方案、video prompts、视频片段、final.mp4 和制作包。
6. 运行总控审稿，必要时应用 prompt 修正。
7. 生成旁白稿、字幕稿、SRT 和 mock 音频。
8. 烧录字幕，生成 `final_subtitled.mp4`。
9. 导出封面帧和 `outputs_manifest.json`。
10. 在成片资产区下载 MP4、封面、制作包和 JSON 包。

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

更多说明：

- `USER_GUIDE.md`：面向使用者的 Provider 切换说明。
- `AGENT_CONTEXT.md`：面向后续开发 Agent 的项目上下文。
- `TROUBLESHOOTING.md`：配置和 fallback 排障。

## 配置 .env

所有 API Key 只写入 `.env`，不要写进代码、README 或日志。

Mock 模式：

```env
MOCK_MODE=true
LLM_PROVIDER=mock
VIDEO_PROVIDER=mock
ENABLE_PAID_API_CALLS=false
FFMPEG_PATH=ffmpeg
FFPROBE_PATH=ffprobe
```

LLM Provider 和 Video Provider 是两套独立配置：

- `LLM_PROVIDER` 影响分析、分镜、改编、video prompts 和 Agent review。
- `VIDEO_PROVIDER` 影响视频片段生成。
- 修改 `.env` 后需要重启 `npm run dev` 或重新执行 CLI。

Video Provider 稳定性：

- `mock`：测试模式，始终可用，不消耗费用。
- `seedance`：当前稳定真实视频生成链路。
- `kling`：实验性 provider，已有部分 client，但未作为稳定交付链路。
- `luma`：实验性 provider，预留配置，不作为稳定交付链路。

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

OpenAI 文本模型：

```env
MOCK_MODE=false
LLM_PROVIDER=openai
OPENAI_API_KEY=填入你的 Key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=填入模型名
```

Claude 文本模型：

```env
MOCK_MODE=false
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=填入你的 Key
ANTHROPIC_MODEL=填入模型名
```

如果 `MOCK_MODE=true`，或所选 LLM Provider 缺少 Key / Model，文本步骤会 fallback mock，不会调用真实模型。

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
5. 在 `原视频 / 输入材料` 区域上传本地原视频、读取元信息、抽取关键帧，并补充原视频字幕 / 文案 / 画面说明 / 复刻要求。
6. 查看任务状态、已有 JSON 产物和成本保护提示。
7. 点击 `Dry-run 预估`，确认将执行哪些步骤，不消耗费用。
8. 保持 `provider=seedance`，`scene-limit=3`，点击 `一键生成`。
9. 生成完成后下载：
   - `final.mp4`
   - `final_subtitled.mp4`
   - `cover.jpg`
   - `production-package.md`
   - `project-package.json`

## 上传原视频和输入材料

v1.5 支持把短视频链接作为输入辅助。系统只识别平台和链接状态，不自动爬取或下载公开视频。

CLI：

```bash
npm run video-maker -- parse-link --task <task_id> --url "https://v.douyin.com/example/"
```

输出：

```text
data/tasks/{task_id}/source_link.json
```

当前链接解析支持平台识别：

- Douyin：`douyin.com` / `v.douyin.com`
- Kuaishou：`kuaishou.com`
- Xiaohongshu：`xiaohongshu.com` / `xhslink.com`
- Bilibili：`bilibili.com` / `b23.tv`
- YouTube：`youtube.com` / `youtu.be`
- TikTok：`tiktok.com` / `vt.tiktok.com`
- Instagram：`instagram.com`

解析失败或平台限制时，系统会进入“用户补充材料模式”。推荐组合是：

```text
链接 + 上传原视频 + 原字幕/文案 + 画面说明 + 复刻要求
```

系统不会处理登录、cookie、验证码、反爬，也不会把公开视频下载为素材。

v1.4+ 支持上传用户自己有权限的本地原视频。系统只处理用户上传的本地文件。

网页：

1. 进入任务详情页。
2. 在 `原视频 / 输入材料` 区域选择 `mp4` / `mov` / `webm` 文件。
3. 点击上传后，文件会保存到：

```text
data/uploads/{task_id}/source.mp4
```

4. 点击 `读取原视频元信息`，生成：

```text
data/tasks/{task_id}/source_video.json
```

5. 点击 `抽取关键帧`，生成：

```text
data/tasks/{task_id}/assets/source-frames/frame_001.jpg
data/tasks/{task_id}/source_frames.json
```

6. 在页面填写原视频字幕、原视频文案、画面说明和复刻要求后保存，内容会写入：

```text
data/tasks/{task_id}/input.json
```

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

当前不做真实 ASR，因此不会自动从上传视频转写字幕。请手动补充字幕，或后续接入 ASR Provider。

## 网页预览 final.mp4

任务详情页包含 `最终成片预览` 区域。

如果当前任务已经生成：

```text
data/outputs/{task_id}/final.mp4
```

页面会显示一个 `<video controls>` 播放器，视频源来自安全接口：

```text
/api/tasks/{task_id}/video
```

这个预览接口只读取当前任务输出目录中的成片文件，不会读取任意路径，也不会触发 LLM、Seedance、Kling、Luma 或任何付费 API 调用。如果存在 `final_subtitled.mp4`，页面会优先预览带字幕版；否则继续预览 `final.mp4`。

如果播放器不显示，请检查：

- 是否已经运行 `run-full`。
- 是否已经执行 `assemble`。
- `data/outputs/{task_id}/final.mp4` 是否存在。
- 浏览器是否支持 MP4/H.264 播放。

## 字幕烧录

v1.3 支持把 `assets/subtitles/subtitles.srt` 烧录进成片，输出独立的带字幕版本：

```text
data/outputs/{task_id}/final_subtitled.mp4
```

原始 `final.mp4` 不会被覆盖。字幕烧录只依赖本地 FFmpeg，不调用 Seedance、DeepSeek、TTS 或任何付费 API。

CLI：

```bash
npm run video-maker -- burn-subtitles --task <task_id>
```

也可以指定输入和输出文件名，文件必须位于当前 task 的 output 目录：

```bash
npm run video-maker -- burn-subtitles --task <task_id> --input final.mp4 --output final_subtitled.mp4
```

网页：

1. 先确保任务已有 `final.mp4` 和 `subtitles.srt`。
2. 打开任务详情页。
3. 在“最终成片预览”区域点击 `烧录字幕`。
4. 生成后页面会优先预览 `final_subtitled.mp4`。
5. 下载区会同时保留 `final.mp4` 和 `final_subtitled.mp4`。

`final.mp4` 是原始合成版；`final_subtitled.mp4` 是画面里已经烧录字幕的版本，适合直接预览或发布前检查。

## 成片资产和封面

v1.4 新增 `成片资产` 区域，用于集中查看和下载：

- `final.mp4`：原始合成版。
- `final_subtitled.mp4`：带画面字幕版。
- `cover.jpg`：从成片第 1 秒导出的封面帧。
- `production-package.md`：制作包。
- `project-package.json`：项目 JSON 包。

导出封面：

```bash
npm run video-maker -- export-cover --task <task_id>
```

生成或刷新资产清单：

```bash
npm run video-maker -- outputs-manifest --task <task_id>
```

输出：

```text
data/outputs/{task_id}/cover.jpg
data/outputs/{task_id}/outputs_manifest.json
```

封面和资产清单只依赖本地文件与 FFmpeg，不调用 DeepSeek、Seedance、TTS、ASR 或任何付费 API。

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
npm run video-maker -- review --task <task_id>
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

## Agent review cycle

Agent review cycle 模拟总控 Agent 的审稿环节：

```text
storyboard.json
→ remake_plan.json
→ video_prompts.json
→ quality review
→ prompt 修正建议
→ 可选自动修正 video_prompts
```

运行审稿：

```bash
npm run video-maker -- review --task <task_id>
```

也可以在任务详情页的 `Agent Review / 总控审稿` 区域点击：

```text
运行总控审稿
```

输出：

```text
data/tasks/{task_id}/review_report.json
```

如果需要把审稿建议自动应用到 `video_prompts.json`：

```bash
npm run video-maker -- review --task <task_id> --apply
```

页面里可以点击：

```text
应用 prompt 修正
```

`--apply` 会先备份原文件：

```text
data/tasks/{task_id}/video_prompts.backup.{timestamp}.json
```

然后只修改被 review 标记为 `needs_revision` 或 `bad` 的 scene prompt，不修改 `storyboard.json` 或 `remake_plan.json`。

review / apply 不会调用 Seedance，不会生成视频，也不会消耗视频生成费用。它主要用于提前发现分镜、prompt、时长、原创性和可执行性问题。

应用修正后不会自动重新生成视频。如需使用修正后的 prompt 生成新素材，需要用户手动运行一键生成，且仍受 `ENABLE_PAID_API_CALLS` 和 `MAX_VIDEO_SCENES_PER_RUN` 成本保护控制。

`run-full` 默认不启用 review，保持 v1.0 行为不变。如需启用：

```bash
npm run video-maker -- run-full --task <task_id> --provider mock --scene-limit 3 --review
npm run video-maker -- run-full --task <task_id> --provider mock --scene-limit 3 --review-apply
```

## 旁白与字幕

v1.2 支持先生成旁白稿、字幕稿和 mock/silent 音频轨。v1.2.1 增加 TTS Provider 架构，当前真实 TTS 主 provider 是 Volcengine，但必须通过成本保护才会调用。

v1.2.2 已把这些能力接到任务详情页。在“旁白与字幕”区域可以点击：

- `生成旁白稿`：生成 `voiceover_script.json`。
- `生成字幕稿`：生成 `subtitles.json` 和 `subtitles.srt`。
- `生成 mock 音频`：生成 `assets/audio/silent.wav`。
- `一键准备音频与字幕`：依次执行旁白稿、字幕稿和 mock 音频。

页面按钮默认只生成 mock/silent 音频，不会调用真实 TTS，不会调用 Seedance，也不会自动重新生成 `final.mp4`。如果要把新音频合进成片，需要手动运行 assemble 或页面的一键生成流程。真实 TTS 仍需在 `.env` 中配置并显式开启 `ENABLE_PAID_TTS_CALLS=true`。

生成 SRT 后，任务详情页会显示 `subtitles.srt` 下载入口。

逐步生成：

```bash
npm run video-maker -- voiceover --task <task_id>
npm run video-maker -- subtitles --task <task_id>
npm run video-maker -- audio --task <task_id> --provider mock
```

组合命令：

```bash
npm run video-maker -- prepare-audio --task <task_id>
```

输出文件：

```text
data/tasks/{task_id}/voiceover_script.json
data/tasks/{task_id}/subtitles.json
data/tasks/{task_id}/assets/subtitles/subtitles.srt
data/tasks/{task_id}/assets/audio/silent.wav
```

`assemble` 会优先使用已有音频轨：

1. `assets/audio/voiceover.wav`
2. `assets/audio/silent.wav`
3. 自动生成的静音音轨

如果需要在一键流程中准备音频，可以显式加：

```bash
npm run video-maker -- run-full --task <task_id> --provider mock --scene-limit 3 --prepare-audio --assemble
```

`--prepare-audio` 默认不开启，保持既有主链路不变。

### TTS Provider

TTS Provider 负责把 `voiceover_script.json` 合成为旁白音频：

- `mock`：生成本地 `silent.wav`，不消耗费用。
- `volcengine`：当前真实 TTS 主 provider。
- `openai`：预留配置，尚未接入真实合成。
- `elevenlabs`：预留配置，尚未接入真实合成。

配置检查：

```bash
npm run video-maker -- tts-check
```

Volcengine 配置模板：

```env
TTS_PROVIDER=volcengine
VOLC_TTS_APP_ID=
VOLC_TTS_ACCESS_TOKEN=
VOLC_TTS_CLUSTER=
VOLC_TTS_VOICE_TYPE=
VOLC_TTS_API_BASE_URL=https://openspeech.bytedance.com/api/v1/tts
ENABLE_PAID_TTS_CALLS=false
```

真实 TTS 调用必须显式开启：

```env
ENABLE_PAID_TTS_CALLS=true
```

生成真实旁白：

```bash
npm run video-maker -- audio --task <task_id> --provider volcengine
```

如果配置缺失、成本保护关闭或调用失败，系统会 fallback 到 `silent.wav`，并在 `assets.json` 中记录原因。不会打印 API Key。

## 切换 LLM / Video Provider

Mock 测试模式：

```bash
MOCK_MODE=true
LLM_PROVIDER=mock
VIDEO_PROVIDER=mock
ENABLE_PAID_API_CALLS=false
```

文本模型切换：

```bash
LLM_PROVIDER=deepseek
LLM_PROVIDER=openai
LLM_PROVIDER=claude
```

视频模型切换：

```bash
MOCK_MODE=false
VIDEO_PROVIDER=seedance
ENABLE_PAID_API_CALLS=true
MAX_VIDEO_SCENES_PER_RUN=3
```

检查当前配置：

```bash
npm run video-maker -- config-check
```

该命令只显示 Key 是否存在，不会打印完整 Key，也不会调用任何 API。

接入新的 Video Provider 时，需要同时更新：

- `lib/api-clients/*-client.ts`
- `lib/tools/asset-generator.ts`
- `lib/tools/cost-guard.ts`
- `lib/tools/config-check.ts`
- 任务详情页 provider 选项
- README / USER_GUIDE / AGENT_CONTEXT / TROUBLESHOOTING

`.env` 只负责配置；新增配置项不会让未实现或未验收的 provider 自动变成稳定可用。

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

## 清理历史调试错误日志

任务详情页顶部默认只展示最近一次后台 job 的状态和错误。`task.json` / `assets.json` 中的历史 `errors` 主要是调试日志，可能包含过去的 Kling、Luma、Seedance endpoint 或成本保护记录，不一定代表当前任务失败。

如需清空历史错误日志：

```bash
npm run video-maker -- clear-errors --task <task_id>
```

清理会先备份到：

```text
data/tasks/{task_id}/backups/errors-backup-{timestamp}.json
```

该命令只清空：

- `task.json.errors`
- `assets.json.errors`

不会删除：

- `data/outputs/{task_id}/final.mp4`
- `production-package.md`
- `project-package.json`
- `data/tasks/{task_id}/assets/videos/`
- `data/jobs/` 中的后台 job 历史

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
