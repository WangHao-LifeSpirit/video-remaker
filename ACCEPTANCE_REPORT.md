# v0.1 Acceptance Report

审计时间：2026-06-03  
审计范围：v0.1 CLI 数据流、JSON 产物、失败恢复、Web 最小页面/API、README、安全边界、代码质量。  
审计结论：v0.1 主链路可以验收为“本地 mock 工作流 MVP”，但建议先修复 3 个 v0.1 质量问题后再进入 v0.2。

## 1. 项目结构审计

### 文件结构树

```text
video-remaker
  app
    page.tsx
    layout.tsx
    globals.css
    api/tasks/route.ts
    api/tasks/[taskId]/route.ts
    api/tasks/[taskId]/run/route.ts
    api/tasks/[taskId]/export/route.ts
    tasks/[taskId]/page.tsx
    export/[taskId]/page.tsx
  components
    create-task-form.tsx
  cli
    video-maker.ts
  lib
    agents
      orchestrator.ts
      parser-agent.ts
      storyboard-agent.ts
      content-creator-agent.ts
      quality-check-agent.ts
    tools
      task-store.ts
      link-resolver.ts
      video-ingest.ts
      video-analyzer.ts
      prompt-generator.ts
      asset-generator.ts
      video-assembler.ts
    api-clients
      openai-client.ts
      kling-client.ts
      seedance-client.ts
      tts-client.ts
      asr-client.ts
      README.md
    export
      markdown-exporter.ts
      json-exporter.ts
    prompts
      <empty>
    types
      common.ts
      task.ts
      input.ts
      analysis.ts
      storyboard.ts
      remake-plan.ts
      video-prompts.ts
      assets.ts
  skills
    douyin-link-parser/SKILL.md
    video-ingest/SKILL.md
    video-structure-analyzer/SKILL.md
    storyboard-generator/SKILL.md
    remake-plan-generator/SKILL.md
    video-model-prompt-generator/SKILL.md
    asset-generator/SKILL.md
    tts-generator/SKILL.md
    subtitle-generator/SKILL.md
    video-assembler/SKILL.md
  data
    tasks
    uploads
    outputs
    samples
  AGENTS.md
  README.md
  ACCEPTANCE_REPORT.md
  .env.example
  package.json
  package-lock.json
  tsconfig.json
  next.config.mjs
  tailwind.config.ts
  postcss.config.js
```

### 核心文件作用

| 文件 | 作用 |
| --- | --- |
| `lib/tools/task-store.ts` | 任务目录、`task.json`、JSON artifact 读写、状态与错误记录。 |
| `lib/tools/link-resolver.ts` | 安全解析官方短视频 URL，不下载、不绕过平台限制。 |
| `lib/tools/video-ingest.ts` | 摄取上传路径、文案、字幕、截图描述，生成 `input.json`。 |
| `lib/tools/video-analyzer.ts` | 生成 mock `analysis.json`，材料不足时进入 `needs_user_input`。 |
| `lib/tools/prompt-generator.ts` | 从改编分镜生成 Kling / Seedance mock prompt。 |
| `lib/tools/asset-generator.ts` | 生成 mock asset manifest 和 timeline。 |
| `lib/tools/video-assembler.ts` | v0.1 mock assemble，仅更新状态和预留 MP4 路径。 |
| `lib/agents/orchestrator.ts` | 串联完整 mock pipeline，CLI `run` 与 Web API 共用。 |
| `lib/agents/parser-agent.ts` | Parser Agent wrapper，调用链接解析和 ingest。 |
| `lib/agents/storyboard-agent.ts` | Storyboard Agent mock 分镜拆解。 |
| `lib/agents/content-creator-agent.ts` | Content Creator Agent mock 原创改编方案。 |
| `lib/agents/quality-check-agent.ts` | 规则化质量检查。 |
| `lib/export/markdown-exporter.ts` | 生成 Markdown 制作包。 |
| `lib/export/json-exporter.ts` | 生成 JSON 项目包。 |
| `lib/api-clients/*.ts` | API wrapper，默认 mock，真实模式仅预留并检查 Key。 |
| `lib/types/*.ts` | `task.json`、产物 JSON、状态、错误、mock metadata 类型。 |
| `cli/video-maker.ts` | CLI 命令入口，逐步命令和一键 `run` 都调用 `/lib`。 |
| `app/api/tasks/route.ts` | Web 创建任务 API，调用 `createTask` 和 `runFullMockPipeline`。 |
| `app/api/tasks/[taskId]/run/route.ts` | Web 触发任务 API，调用 `runFullMockPipeline`。 |
| `app/api/tasks/[taskId]/export/route.ts` | Web 导出 API，调用 `/lib/export`。 |

### 结构结论

- 核心代码已集中在 `/lib/agents`、`/lib/tools`、`/lib/api-clients`、`/lib/export`、`/lib/types`。
- `/lib/prompts` 已创建但为空；当前 prompt 文案逻辑在 `lib/tools/prompt-generator.ts` 和 mock Agent 内部。
- CLI 和 Web API 均调用 `/lib` 共享函数，没有发现完整重复实现的业务链路。
- Web API 内有上传文件保存逻辑，这是 Web multipart 入口处理，不是 CLI 核心逻辑重复；后续可抽到 `/lib/tools/upload-store.ts`。
- 源码未发现 `TODO` / `FIXME` / `HACK`。
- 存在生成类文件或本机痕迹：`.DS_Store`、`.next/`、`node_modules/`、`tsconfig.tsbuildinfo`、`data/tasks/*`、`data/outputs/*`。建议后续添加 `.gitignore`。

## 2. CLI 验收

审计任务 ID：`task_20260603142106_4a129b90`

### 实际运行命令

```bash
npm run typecheck
npm run build
npm run video-maker -- init-task --target-platform douyin --duration 30s --style "audit clean style" --text-notes "审计样本：讲短视频结构复刻但保持原创表达"
npm run video-maker -- resolve-link --task task_20260603142106_4a129b90 --url "https://www.douyin.com/video/7641602238922014618"
npm run video-maker -- ingest --task task_20260603142106_4a129b90 --text-notes "审计样本：讲短视频结构复刻但保持原创表达" --transcript "先说结论，再拆结构，最后给原创改编方案。" --screenshot-notes "画面包含口播人物、大字标题、三段式结构说明。"
npm run video-maker -- analyze --task task_20260603142106_4a129b90
npm run video-maker -- storyboard --task task_20260603142106_4a129b90
npm run video-maker -- remake --task task_20260603142106_4a129b90
npm run video-maker -- prompts --task task_20260603142106_4a129b90
npm run video-maker -- mock-assets --task task_20260603142106_4a129b90
npm run video-maker -- export --task task_20260603142106_4a129b90
npm run video-maker -- assemble --task task_20260603142106_4a129b90
```

### 命令结果

| 步骤 | 结果 | 生成文件 | 更新 `task.json` | Mock | 可能失败点 | 恢复方式 |
| --- | --- | --- | --- | --- | --- | --- |
| `typecheck` | 通过 | 无 | 无 | 否 | 类型错误 | 修类型后重跑 |
| `build` | 通过 | `.next/` | 无 | 否 | Next 编译错误 | 修编译错误后重跑 |
| `init-task` | 通过 | `task.json` | `status=pending`、`current_step=init-task`、`source.parse_status=needs_user_input` | 否 | 参数非法 | 重新创建任务 |
| `resolve-link` | 通过 | 无新增文件 | `source.original_url/final_url/platform/content_id/parse_status=success` | 否 | 非官方链接、无效 URL | 进入补材料模式 |
| `ingest` | 通过 | `input.json` | `files.input_json`、`status=success`、`current_step=ingest` | 否 | 上传文件不可读、无材料 | 补充上传/文案/字幕/截图描述 |
| `analyze` | 通过 | `analysis.json` | `files.analysis_json`、`status=mocked`、`current_step=analyze` | 是 | 缺 `input.json` 或无可用材料 | 先跑 ingest 或补材料 |
| `storyboard` | 通过 | `storyboard.json` | `files.storyboard_json`、`status=mocked` | 是 | 缺 `analysis.json` | 先跑 analyze |
| `remake` | 通过 | `remake_plan.json` | `files.remake_plan_json`、`status=mocked` | 是 | 缺 analysis/storyboard | 先跑上游步骤 |
| `prompts` | 通过 | `video_prompts.json` | `files.video_prompts_json`、`status=mocked` | 是 | 缺 `remake_plan.json` | 先跑 remake |
| `mock-assets` | 通过 | `assets.json` | `files.assets_json`、`status=mocked` | 是 | 缺 prompts/remake_plan | 先跑 prompts |
| `export` | 通过 | `production-package.md`、`project-package.json` | `export_paths.markdown/json`、`status=success` | 部分，导出 mock 内容 | 缺任何上游 JSON | 补齐上游 JSON 后重跑 |
| `assemble` | 通过 | 更新 `assets.json` | `export_paths.mp4`、`status=mocked`、`current_step=assemble` | 是 | 缺 `assets.json` | 先跑 mock-assets |

### `run` 与逐步命令关系

`video-maker run --task ... --assemble` 调用 `lib/agents/orchestrator.ts`，内部顺序为：

```text
optional resolve-link
→ ingest
→ analyze
→ storyboard
→ remake
→ prompts
→ mock-assets
→ optional assemble
→ export
```

它和逐步命令调用的是同一套 `/lib` 函数，不是独立实现。

### CLI 发现的问题

1. `ingest` 和 `run` 的 `commonTaskOptions` 带默认值；如果用户不显式传 `--style` 等参数，可能覆盖 `init-task` 时的原始 user inputs。审计中 `style` 从 `audit clean style` 被恢复为默认值。
2. `mock-assets` 解析 `0-3s` 这类 range duration 时只取第一个数字，导致第一段 timeline 为 `00:00-00:00`，后续时间也偏。
3. 按当前命令顺序 `export` 在 `assemble` 前执行，`project-package.json` 中的 `assets.assemble_status` 仍是 `pending`，而最新 `assets.json` 已变成 `mocked`。

## 3. JSON 产物验收

示例任务：`task_20260603142106_4a129b90`

| 文件 | 示例路径 | 字段符合计划 | 缺失字段 | 空字段 | Mock 标记 | `status/errors` |
| --- | --- | --- | --- | --- | --- | --- |
| `task.json` | `data/tasks/task_20260603142106_4a129b90/task.json` | 是 | 无 | `errors=[]` | 不需要 | 有 |
| `input.json` | `data/tasks/task_20260603142106_4a129b90/input.json` | 是 | 无 | `errors=[]`，`upload` pending | 不需要 | 有 |
| `analysis.json` | `data/tasks/task_20260603142106_4a129b90/analysis.json` | 是 | 无 | `errors=[]` | 有 | 有 |
| `storyboard.json` | `data/tasks/task_20260603142106_4a129b90/storyboard.json` | 是 | 无 | `errors=[]` | 有 | 有 |
| `remake_plan.json` | `data/tasks/task_20260603142106_4a129b90/remake_plan.json` | 是 | 无 | `errors=[]`、`quality_check.missing_assets=[]` | 有 | 有 |
| `video_prompts.json` | `data/tasks/task_20260603142106_4a129b90/video_prompts.json` | 是 | 无 | `errors=[]` | 有 | 有 |
| `assets.json` | `data/tasks/task_20260603142106_4a129b90/assets.json` | 是 | 无 | `errors=[]` | 有 | 有 |
| `production-package.md` | `data/outputs/task_20260603142106_4a129b90/production-package.md` | 是，包含 18 个制作包章节 | 无 | 无关键空段 | 明确写明 mock | 不适用 |
| `project-package.json` | `data/outputs/task_20260603142106_4a129b90/project-package.json` | 是，包含 task/input/analysis/storyboard/remake_plan/video_prompts/assets | 无 | 同各子产物 | 有 | 有 |

产物稳定性结论：

- 所有 JSON 都可被下一步读取。
- 所有 mock 产物均有 `mock.is_mock=true`。
- 所有 JSON 产物都有 `status` 和 `errors`。
- `project-package.json` 如果在 `assemble` 前导出，会与后续最新 `assets.json/task.json` 不完全同步。建议 `assemble` 后自动重跑 export，或文档要求最终导出在 assemble 之后执行。

## 4. 失败处理验收

坏链接任务 ID：`task_20260603142210_8f302045`

### 坏链接命令

```bash
npm run video-maker -- init-task --target-platform douyin --duration 30s
npm run video-maker -- resolve-link --task task_20260603142210_8f302045 --url "https://bad.example.com/xxx"
```

### 状态变化

解析后 `task.json`：

```json
{
  "status": "needs_user_input",
  "current_step": "resolve-link",
  "source": {
    "input_type": "url",
    "parse_status": "needs_user_input",
    "original_url": "https://bad.example.com/xxx",
    "platform": "unknown",
    "parse_error": "Only official short-video platform URLs are accepted in v0.1."
  }
}
```

错误记录：

```json
{
  "step": "resolve-link",
  "message": "Only official short-video platform URLs are accepted in v0.1.",
  "code": "LINK_PARSE_NEEDS_USER_INPUT",
  "recoverable": true
}
```

### 补材料后继续

补充命令：

```bash
npm run video-maker -- ingest --task task_20260603142210_8f302045 --text-notes "坏链接恢复：用户补充原视频主题和文案结构" --transcript "开头给结论，中段拆三点，结尾给行动建议。" --screenshot-notes "截图描述：竖屏口播、大字标题、节奏快。"
```

结果：

- `input.json` 生成成功。
- `available_materials=["text_notes","transcript","screenshot_notes"]`。
- `missing_materials=["url","upload"]`。
- 后续 `analyze/storyboard/remake/prompts/mock-assets/export/assemble` 均跑通。
- 最终任务仍保留 `source.parse_status=needs_user_input` 和 recoverable error，这是正确的，因为原链接仍未解析成功；但任务主流程可以基于用户补充材料继续。

## 5. Web 页面验收

### 页面路径

- 首页 / 创建任务页：`/`
- 任务详情页：`/tasks/[taskId]`
- 结果导出页：`/export/[taskId]`

### API Route 路径

- `POST /api/tasks`
- `GET /api/tasks/[taskId]`
- `POST /api/tasks/[taskId]/run`
- `POST /api/tasks/[taskId]/export`

### 动态验证结果

- `GET /`：此前已通过 `curl` 验证返回 `200 OK`，HTML 中包含“短视频复刻自动化工作台”和创建任务表单字段。
- `GET /tasks/task_20260603141423_3cbd357c`：此前已通过 `curl` 验证返回 `200 OK`。
- 本轮尝试对 `POST /api/tasks` 做动态创建任务验收时，因当前本地请求需要 escalated localhost 权限且系统提示授权额度限制，未能完成该动态 POST 验证；未做绕过。

### 静态代码确认

- `components/create-task-form.tsx` 提交到 `/api/tasks`。
- `app/api/tasks/route.ts` 调用 `createTask` 和 `runFullMockPipeline`。
- `app/api/tasks/[taskId]/run/route.ts` 调用 `runFullMockPipeline`。
- `app/api/tasks/[taskId]/export/route.ts` 调用 `exportMarkdownForTask` 和 `exportJsonForTask`。
- Web 没有另写一套分析、分镜、改编、prompt、asset 生成逻辑。

### 当前 UI 限制

- 没有任务列表。
- 没有进度轮询和分步骤状态 UI。
- 导出页只展示本地路径，没有浏览器下载按钮。
- 不支持重新运行单个步骤。
- 不支持真实 MP4 预览。
- 上传文件保存逻辑在 API route 中，后续可抽为共享工具。

## 6. 安全边界验收

| 安全项 | 结果 | 证据 |
| --- | --- | --- |
| 自动下载公开视频 | 未发现 | `link-resolver` 只解析 URL；无远程下载代码。 |
| 绕过登录 | 未发现 | 无登录态、Cookie、浏览器自动化、平台请求逻辑。 |
| 绕过验证码 | 未发现 | 无验证码处理或规避逻辑。 |
| 绕过反爬 | 未发现 | 不抓取远程页面，不做平台 API 探测。 |
| 默认搬运原视频 | 未发现 | 文案和 prompt 明确要求原创，不使用原素材。 |
| 假装真实调用 Kling / Seedance | 未发现 | client 默认 mock，真实模式抛出 v0.2 reserved error。 |
| 假装真实生成 MP4 | 未发现 | `assemble_status.note` 明确 No MP4 was generated。 |
| API Key 写进代码 | 未发现 | 仅 `.env.example` 和 `process.env.*` key 名称，无真实 key。 |

## 7. README 验收

README 已包含：

- 项目目标：有。
- 安装步骤：有。
- 环境变量：有。
- CLI 使用方式：有。
- Web 使用方式：有。
- Mock 模式说明：有。
- v0.1 能做什么：有。
- v0.1 不能做什么：部分有，主要在 mock/安全说明中。
- 下一步扩展真实 API 的位置：部分有，提到 real integrations reserved；但未详细列出 `lib/api-clients` 作为扩展入口。

建议补充：

- `npm run video-maker -- analyze/storyboard/remake/prompts/mock-assets/assemble` 的逐步命令。
- 坏链接后如何通过 `ingest` 补材料继续。
- 明确 `next.config.mjs` 和本地 dev server 如遇端口权限问题可使用 `npm run dev -- -H 127.0.0.1 -p 3000`。
- 明确 v0.1 不会生成真实 MP4，不会真实调用 OpenAI/Kling/Seedance/TTS/ASR。

## 8. 代码质量验收

### TypeScript

- `npm run typecheck`：通过。
- `npm run build`：通过。
- 核心 JSON 类型均有 TypeScript 定义。

### `any` 使用

- 源码中未发现显式 `any` 滥用。
- `request.json()` 返回值在 API route 中未做 schema 校验，属于后续可加强点。

### 路径

- 未发现 macOS 本机绝对路径写死。
- `task-store.ts` 使用 `process.cwd()` 作为项目根；CLI 在项目根运行正常。
- 如果从项目外直接执行 CLI，`process.cwd()` 可能指向错误目录。README 当前要求 `cd video-remaker`，可接受；后续可改为从 `import.meta.url` 解析项目根。

### API Key

- 未发现真实 Key 泄露。
- `.env.example` 只有变量名。
- API clients 在 `MOCK_MODE=false` 时检查对应 Key，否则抛出“v0.2 reserved”错误。

### 运行问题

- `npm run video-maker` 原先用 `tsx` 会在当前沙箱触发 IPC permission 错误，已改为 `node --import tsx` 后通过。
- `npm run dev` 在当前沙箱中直接监听端口需要 elevated localhost 权限；构建不受影响。
- `npm install` 过程中曾因网络中断留下半安装目录，清理后重装成功；当前依赖可用。
- `npm install` 报告 2 个 audit warnings，未执行强制修复。

### 未处理异常

- CLI 顶层有 catch，会输出错误并设置 exit code。
- API routes 有 try/catch。
- 但对 JSON artifact 缺失的错误主要依赖 Node 文件读取异常，没有结构化写入 `task.errors`；后续可增强。

## 9. 最终结论

### 1. v0.1 是否可以验收

可以作为 v0.1 本地 mock MVP 验收：CLI 主链路、JSON 产物、失败恢复、导出包、安全边界和简单 Web 框架均已成立。

但不建议现在进入 v0.2 API 接入。建议先修复下面的 v0.1 数据稳定性问题。

### 2. 当前最严重的 5 个问题

1. `ingest/run` 默认参数会覆盖已有 `task.user_inputs`，导致用户在 `init-task` 设置的 `style` 等字段被恢复为默认值。
2. `mock-assets` 对 `0-3s`、`3-10s` 这种时间范围解析错误，生成了 `00:00-00:00` 等错误 timeline。
3. `export` 在 `assemble` 前执行时，`project-package.json` 会和最新 `assets.json/task.json` 不同步。
4. README 缺少完整逐步 CLI 命令和坏链接恢复说明。
5. 项目缺少 `.gitignore`，当前有 `.DS_Store`、`.next/`、`node_modules/`、`tsconfig.tsbuildinfo`、`data/tasks/*`、`data/outputs/*` 等生成文件风险。

### 3. 必须修复的问题

- 修复 `ingest/run` 默认值覆盖已有 user inputs。
- 修复 timeline duration/range 解析。
- 明确最终导出顺序：要么 `assemble` 后自动重导出，要么将验收命令顺序改为 `assemble` 后 `export`。
- 补 `.gitignore`。

### 4. 可以延期的问题

- Web 下载按钮、任务列表、进度轮询、单步重跑。
- `/lib/prompts` 抽离独立 prompt 模板。
- API route 中上传文件保存逻辑抽到 `/lib/tools`。
- JSON Schema runtime validation。
- npm audit warnings 评估与依赖升级。

### 5. 下一步应该先做什么

先做 v0.1 修复小包：

1. 修 CLI 默认参数覆盖问题。
2. 修 timeline 时间范围解析。
3. 修 export/assemble 顺序一致性。
4. 补 `.gitignore`。
5. 更新 README 的逐步命令和失败恢复说明。
6. 重新跑本报告中的验收命令。

### 6. 是否建议现在开始 v0.2 API 接入

不建议。v0.2 接真实 API 前，应先保证 v0.1 的任务状态、用户输入、timeline 和导出包一致性足够稳定。否则真实 API 接入后会把这些数据问题放大。
