# Video Remaker

本地网页端短视频原创改编工作台。

它解决的不是“下载并搬运一条公开视频”，而是把用户有权使用的原视频、链接提示、字幕、文案和画面说明，转成一套可执行的原创短视频生产流程：

```text
输入材料
-> 原片理解
-> Storyboard Agent
-> Content Creator Agent
-> Review Agent
-> 视频片段生成
-> FFmpeg 合成与字幕
-> 预览和导出
```

## 当前稳定能力

- 创建可命名任务，输入链接、上传 `mp4/mov/webm`，或填写字幕、文案、画面说明。
- 用 `ffprobe` 读取原视频元信息，并用 FFmpeg 抽取覆盖全片的关键帧。
- 通过统一 LLM Provider 生成分析、分镜、原创改编方案和视频提示词。
- 运行总控审稿，检查可执行性、原创性、时长和提示词质量。
- 使用 `mock` 或 Seedance 生成视频片段；Kling 保留为实验性 POC。
- 用 FFmpeg 合成 `final.mp4`，生成 SRT，并输出 `final_subtitled.mp4`。
- 后台执行一键流程，显示步骤进度，防重复点击，支持断点续跑。
- 页面内预览和下载成片、封面、Markdown 制作包、JSON 项目包。

## 明确不做

- 不自动下载公开视频。
- 不绕过登录、Cookie、验证码、反爬或平台限制。
- 不默认复制原视频素材、原文案、人物身份或受版权保护的表达。
- 不把 Mock 占位片段说成真实 AI 视频。
- 不在代码、日志、页面或导出文件中保存 API Key。
- 当前不是多用户 SaaS，也不是生产级分布式队列。

## 安装

要求：

- Node.js 20.9+
- npm
- FFmpeg 和 ffprobe

```bash
npm install
cp .env.example .env
npm run typecheck
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。如果 3000 端口已占用，终端会显示实际端口。

### macOS 日常打开方式

双击解压后项目文件夹内的 `Start Video Remaker.command`。启动器会自动：

- 检查 Node.js、npm 和 FFmpeg。
- 首次启动时安装依赖，并创建不会调用付费 API 的 Mock 配置。
- 复用已经运行的工作台，避免重复启动。
- 在 3000–3010 之间选择可用端口。
- 等待页面真正就绪后自动打开浏览器。
- 启动失败时显示中文原因和最近日志。

工作台运行期间请保留启动窗口。需要停止时，在该窗口按 `Control + C`。

停止本地服务：回到启动服务的终端，按 `Control + C`。

开发服务使用 `.next-dev`，production build 使用 `.next-build`。两者缓存隔离，可以在开发服务运行时执行 `npm run build`，不会再覆盖页面 CSS/JS。

## 最安全的首次运行

先使用完全 Mock 的配置验证产品流程：

```env
MOCK_MODE=true
LLM_PROVIDER=mock
VIDEO_PROVIDER=mock
ENABLE_PAID_API_CALLS=false
TTS_PROVIDER=mock
ENABLE_PAID_TTS_CALLS=false
```

Mock 模式不会调用付费 LLM 或视频 API。Mock 片段是带测试图案的可播放占位视频，只用于验证流程和 FFmpeg 合成，不是交付成片。

## 真实 Provider 配置

### 文本模型

`LLM_PROVIDER` 支持：

- `mock`
- `deepseek`
- `openai`
- `claude`

对应配置放在 `.env`：

```env
MOCK_MODE=false
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

DeepSeek 是文本模型。仅上传视频、没有字幕或画面说明时，它不能直接理解关键帧。此时系统会暂停，避免继续生成不相关视频。解决方式二选一：

1. 补充原字幕、原文案或画面说明。
2. 配置 `OPENAI_API_KEY` 和 `OPENAI_VISION_MODEL`，让分析步骤查看抽取出的关键帧。

### 视频模型

稳定页面入口只开放：

- `mock`
- `seedance`

Seedance 示例：

```env
VIDEO_PROVIDER=seedance
SEEDANCE_API_KEY=
SEEDANCE_API_BASE_URL=https://ark.cn-beijing.volces.com
SEEDANCE_MODEL=doubao-seedance-1-0-pro-250528
ENABLE_PAID_API_CALLS=false
MAX_VIDEO_SCENES_PER_RUN=1
MAX_RETRY_PER_SCENE=1
```

只有显式设置 `ENABLE_PAID_API_CALLS=true` 后，真实视频调用才可能发生。页面会继续检查 Key、模型、scene-limit 和已成功场景。

Kling 国内版 client 和本地 JWT 检查仍保留，但属于实验性 POC，不是默认稳定交付链路。

## 推荐使用流程

1. 在首页填写任务名称和目标信息，创建任务。
2. 在任务详情页上传自己有权使用的原视频。
3. 等待上传完成；无需在下一步重复上传。
4. 如当前 LLM 不能看关键帧，补充字幕、文案或画面说明。
5. 先点击 `Dry-run 预估`，确认 provider、scene 数量和成本保护。
6. 点击 `一键生成`，观察后台步骤状态。
7. 运行总控审稿，需要时应用 prompt 修正。
8. 生成旁白稿、字幕稿和 SRT；当前默认音频为 mock/silent。
9. 烧录字幕，预览并下载最终资产。

输入发生变化后，系统会按文件更新时间重新运行过期的分析、分镜、改编和提示词。`resume` 只跳过仍然有效的产物，不再复用旧视频对应的分析。

## 输出真实性

- 所有场景都是真实 provider 结果：素材状态可为 `success`。
- 任一场景仍为 Mock：素材和合成结果保持 `mocked`，页面标记为预览版。
- `final.mp4` 是真实可播放文件，但它可能由真实片段、Mock 片段或两者混合合成。
- `final_subtitled.mp4` 只表示字幕已经烧录，不代表每个视频片段都由真实 provider 生成。

## 常用 CLI

```bash
# 创建可命名任务
npm run video-maker -- init-task --task-name "AI 工作流短视频" --target-platform douyin --duration 15s

# 补充材料
npm run video-maker -- ingest --task <task_id> --text-notes "主题和原片信息"

# 逐步运行
npm run video-maker -- analyze --task <task_id>
npm run video-maker -- storyboard --task <task_id>
npm run video-maker -- remake --task <task_id>
npm run video-maker -- prompts --task <task_id>
npm run video-maker -- generate-assets --task <task_id> --provider mock --scene-limit 1
npm run video-maker -- assemble --task <task_id>
npm run video-maker -- export --task <task_id>

# 一键运行
npm run video-maker -- run-full --task <task_id> --provider mock --scene-limit 1 --assemble --export

# 只预估，不调用付费 API
npm run video-maker -- run-full --task <task_id> --provider seedance --scene-limit 1 --assemble --export --dry-run

# 配置检查，不联网、不显示 Key
npm run video-maker -- config-check

# 清理历史错误，先自动备份
npm run video-maker -- clear-errors --task <task_id>
```

使用 `npm run video-maker -- --help` 查看完整命令。

## 主要产物

任务数据：

```text
data/tasks/<task_id>/
  input.json
  source_video.json
  source_frames.json
  analysis.json
  storyboard.json
  remake_plan.json
  video_prompts.json
  review_report.json
  assets.json
```

交付文件：

```text
data/outputs/<task_id>/
  final.mp4
  final_subtitled.mp4
  cover.jpg
  production-package.md
  project-package.json
  outputs_manifest.json
```

这些目录、`.env`、`.next` 和 `node_modules` 已在 `.gitignore` 中排除。

## 故障恢复

- 创建任务慢：任务先创建、视频再单独流式上传，页面会显示上传进度。
- 页面一直“运行中”：超过 30 分钟没有更新的 job 会自动标记失败，可用 resume 重跑。
- 上传新视频后旧步骤显示“跳过”：刷新后重新运行；系统会根据输入文件更新时间重算过期步骤。
- 成片是测试图案：当前场景使用了 Mock，占位片段不是模型生成结果。
- 成片与原视频无关：先确认分析是否真的获得字幕、画面说明或视觉关键帧输入。
- 播放器不显示：先确认 `data/outputs/<task_id>/final.mp4` 存在，再刷新页面。

更多说明见 [USER_GUIDE.md](./USER_GUIDE.md) 和 [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)。

## 开发边界

后续 Codex 进入项目时先阅读 [AGENTS.md](./AGENTS.md)。核心逻辑必须位于 `/lib`，网页和 CLI 调用同一套函数。任何真实 API 接入必须同时补齐 client、成本保护、状态标记、失败回退和验收。

## 许可证

本项目采用 [MIT License](./LICENSE) 开源。
