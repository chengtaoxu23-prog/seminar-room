# HANDOFF — SeminarRoom

## 2026-11-08｜当前阶段0正式入口

后续设计与工程依据：[SeminarRoom V1.2 基线](docs/stage0-v1.2/README.md)、[完整工作流](docs/stage0-v1.2/user-workflows.md)、[领域模型](docs/stage0-v1.2/domain-model.md)、[架构与Sidecar退出](docs/stage0-v1.2/technical-architecture.md)、[路线/Backlog](docs/stage0-v1.2/implementation-backlog.md)。阶段0完成后停止，阶段1尚未授权启动。

本次只有设计文档与独立原型，不包含本地未提交生产修复/真实会话/凭据，不更新部署。阶段2同时包含国内优先多模型与持久Agent身份；真实跨模型验收不可无限延期。下文保留早期交接历史；其旧根目录、测试数和实模状态不得覆盖当前发布说明与基线结果。

## 0. 绝对路径

项目根目录：

```text
<project-root>
```

关键文件：

- 启动入口：`...\seminar-room\server\index.ts`
- 编排核心：`...\seminar-room\server\seminar.ts`
- 前端入口：`...\seminar-room\web\App.tsx`
- 共享类型：`...\seminar-room\src\shared\types.ts`
- 示例材料：`...\seminar-room\examples\materials.ts`
- 示例回放：`...\seminar-room\examples\replay.ts`
- 单元/编排测试：`...\seminar-room\tests\seminar.test.ts`
- 浏览器 E2E：`...\seminar-room\scripts\e2e-ui.mjs`
- 真实模型验收：`...\seminar-room\scripts\live-check.ts`
- 测试记录：`...\seminar-room\docs\test-record.md`
- 产品说明：`...\seminar-room\docs\product.md`
- 演示脚本：`...\seminar-room\docs\demo-script.md`
- 截图：`...\seminar-room\docs\screenshots\`

## 1. 当前交付状态

| 项 | 状态 |
| --- | --- |
| 材料编号分段 | 已完成 |
| 生成/编辑三个问题 | 已完成（真实调用；失败可重试） |
| 主持人 + 两位参与者独立上下文 | 已完成 |
| 结构化消息交接 | 已完成 |
| `read_material` 工具 | 已完成并出现在技术记录 |
| 用户插话 + 主持人优先处理 + 参与者直接回应 | 已完成并通过单元/E2E |
| 暂停 / 继续 / 结束 | 已完成并通过测试 |
| 材料逐字引用核对 | 已完成 |
| 背景知识与材料区分 | 已完成 |
| 可编辑总结（共识/分歧/依据/未解决） | 已完成 |
| 服务端保存 + 刷新恢复 | 已完成（E2E 刷新验证） |
| Markdown / JSON 导出 | 已完成（E2E 导出验证） |
| 示例材料 3 份 | 已完成 |
| 示例回放 + 明确标注 | 已完成 |
| 密码/密钥只读服务端 | 已完成 |
| 上限配置 | 已完成 |
| 真实模型运行验证 | **未完成：当前环境无 API 密钥，用户选择按阻塞交付** |
| 真实模型截图 / `docs/live-run.json` | **不存在** |
| PDF / 语音 / 联网 / 多人 / 云同步 | 按范围延期 |

测试结论：`npm test` **8/8 通过**；生产构建通过；浏览器 E2E 通过（模型为本地测试替身）。详见 `docs/test-record.md`。

## 2. 如何启动

### 前置

- Node.js >= 20.19
- npm
- 一个支持 OpenAI 兼容 `/chat/completions`、并支持工具调用的模型

### 开发模式

```powershell
cd "<project-root>"
Copy-Item .env.example .env.local
# 编辑 .env.local，填 OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL
npm ci
npm run dev
```

- UI：<http://127.0.0.1:5173>
- API：<http://127.0.0.1:4317>

### 生产模式

```powershell
npm run build
npm start
```

- UI 与 API：<http://127.0.0.1:4317>
- 只绑定 `127.0.0.1`，不对外网监听。

### 无密钥也能验收的部分

1. 打开 <http://127.0.0.1:4317>；
2. 点击“查看示例回放”；
3. 确认页面顶部有“示例回放 · 非实时模型输出 / 预置脚本 / 0 次实时模型调用”；
4. 点击“显示完整回放”，检查用户插话步骤和“直接回应你”标签；
5. 点击“材料 2”等引用，左侧原文应滚动并高亮。

## 3. 真实模型验收（必须做，当前被阻塞）

用户已选择“暂时没有可用密钥”。不要用示例回放或 mock 代替真实验收。

### 配置

`.env.local`：

```dotenv
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=...
```

不要把密钥写进浏览器、README、截图或任何提交。

### 运行

```powershell
# 终端 1
npm start

# 终端 2
npm run check:live
```

脚本会：

- 拒绝 `mock/fake/e2e` 模型；
- 调用真实模型生成三个问题、开始讨论；
- 等待两位参与者发言；
- 暂停并检查调用数不再增加；
- 暂停时插话“如果只延到 23:00 成本如何”，继续；
- 等待参与者 `directToUser=true`；
- 结束，等待独立总结；
- 检查所有引用逐字存在；
- 检查 host/A/B 上下文指纹互不相同；
- 检查结束后没有新角色调用；
- 编辑总结并验证 Markdown/JSON 导出一致；
- 写出 **不含密钥** 的 `docs/live-run.json`。

成功标志：终端输出 `[live] PASS` 并生成 `docs/live-run.json`。

失败处理：
- 脚本退出码 1：读取报告中的 error，修复后重跑；不要把失败写成功。
- 模型不支持 tools：换支持工具调用的模型。
- JSON/引用不稳定：查看技术记录中的 `validationError`、`schema_retry`；这属于真实模型兼容性问题，需要调整模型或提示词后重跑。

## 4. Codex 建议验收顺序

1. `npm ci`（若环境受限，`npm install --ignore-scripts`，并记录原因）。
2. `npm run typecheck`。
3. `npm test`，期望 8 通过。
4. `npm run build`。
5. 启动 `npm start`，浏览首页与示例回放；确认无密钥时真实按钮禁用、回放标注清楚。
6. 如需 UI E2E，按 `docs/test-record.md` 启动 mock（明确标记为测试替身）与 4318 服务，执行 `npm run test:e2e`。
7. 配置真实密钥后执行 `npm run check:live`；这一步是本次交付唯一未完成的强制项。
8. 检查 `docs/live-run.json`、导出文件和截图；确认没有密钥/提示词泄漏。

## 5. 关键设计复验点

### 独立上下文

`server/seminar.ts` 中每次调用都重新组装：

- host：`buildHostSystem` + `buildHostUser`
- participant：`buildParticipantSystem` + `buildParticipantUser`
- summary：`buildSummaryMessages`

技术记录保存每次请求的 `contextHash`。测试断言 host/A/B 的哈希集合不重叠。

### 用户插话

- `addUserMessage` 写入 `pendingUserMessageIds`；
- `runHost` 的 `validateHostReferences` 要求所有 pending ID 出现在 `addressUserMessageIds`；
- 若 pending 尚未被处理，不允许执行旧的 host 邀请；
- 参与者输出必须 `directToUser` 并在 addresses 中列入用户 ID；
- 暂停时插话会排队，继续后优先处理。

### 引用

`server/validation.ts` 的 `validateCitation` 是唯一判定：

- paragraphId 必须存在；
- quote 必须是原文连续子串；
- 省略号/改写/不存在都失败；
- evidence 无合法引用时降级为 claim；
- summary evidence 同样核对。

### 暂停/结束

- `pause()` 只设置 `stage=paused`，不中止在途请求；在途请求完成后不再调度。
- `end()` 设置 `stage=ended`、abort 当前请求；之后只允许 summary。
- 测试记录里明确区分“暂停后仍有 1 条在途消息写入”和“不再发起新调用”。

### 预算

- 默认 max calls 30，包含 planner、工具续调、结构修复、总结。
- 角色调用前预留 1 次给总结。
- token 只显示接口返回；不要根据价格表捏造成本。

## 6. 已知问题 / 风险

1. **真实模型未验证**：这是当前最大的缺口，不要补假报告。
2. 模型必须支持 OpenAI 风格 tools；不支持会失败并在 UI 显示错误。
3. JSON 输出通过提示词 + 一次修复兜底，不保证所有模型稳定。
4. 长材料截断为 12k 字符进行问题生成/总结选段；超长材料可能丢失上下文。
5. 前端 1 秒轮询，不是 SSE；慢网络下状态更新有延迟。
6. 本地 JSON 存储、无认证；仅适合 127.0.0.1 单用户。
7. 示例回放的脚本与总结是预先编写的；截图/测试中已经反复标注。
8. 浏览器 E2E 的截图显示 `e2e-mock-not-a-real-model`，不能用作真实模型证据。

## 7. 数据与清理

- 真实会话默认保存在 `...\seminar-room\data\sessions\`（`.gitignore` 已忽略）。
- 浏览器 E2E 使用 `data\e2e-sessions\`，可删除。
- `.env.local` 不进仓库；本人未创建/提交任何真实密钥。
- 当前没有自动发布 GitHub；按用户要求停止在本地交付。

## 8. 来源与许可

- 产品机制参考：[THU-MAIC/OpenMAIC](https://github.com/THU-MAIC/OpenMAIC)，MIT License，Copyright (c) 2026 THU-MAIC。
- 未复用其代码、提示词或资源；SeminarRoom 为独立实现。
- SeminarRoom 使用 MIT License，见 `LICENSE`。
- 三份材料均为本项目自撰的虚构材料。
