> Current workbench: GTM-RedTeam v0.1.0-alpha. Use README.md and docs/provider-guide.md for entry points. The notes below retain prior-phase history; they do not authorize live requests or publication.

# HANDOFF — SeminarRoom

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


---

## 9. 2026-11-08｜V1.1 阶段 0 暂停与上下文交接

记录时间：2026-11-08，Asia/Shanghai。用户最新指令为：暂停新的研究、设计和编码，只完成交接、重新读取验证，然后停止。**阶段 0 尚未完成，不得当作已验收交付，也不得自行进入生产重构。** 后续须由用户在新会话明确继续。

本节是追加的最新状态，前文完整保留。前文“8 项测试、真实模型从未验证、项目根目录占位符”等属于早期快照，不能直接用作当前事实。本节区分现场核实、既有报告与待验证事项。

### 9.1 实际目录与继续工作的入口

- 当前聊天/独立设计根目录（下称设计根）：`<local-workspace-path>`。该目录不是实际 Git 源码工作树。
- 实际 Git 仓库（下称源码根）：`<local-workspace-path>`。**本 HANDOFF.md 位于这里。**
- 稳定部署目录：`<local-workspace-path>`。它不是上述 Git 工作树，不能把源码修改等同于部署已更新。
- 阶段 0 独立成果：`<设计根>\outputs\design-v1.1\`，不得与生产 `web/` 混合。
- 设计根另有 `HANDOFF.md` 导航入口，指向本文件，方便新会话发现实际项目。

### 9.2 权威资料、优先级与产品决策

1. 用户已确认决策与 Google Drive 路线图优先：<https://docs.google.com/document/d/1cMzFeUL12jwbB0Cu7jFTFnxVXWsL4bVLxtwBlZvdzIY/edit>。**已读取 2026-11-08「附录 A｜V1.1」**；本轮获取时文档 modifiedTime 为 `2026-11-08T05:19:10.413Z`。只读快照在 `<设计根>\work\v11\roadmap-source.txt`。新会话应核对 Drive 是否有更新，不把快照视为永远最新。
2. 本地实际类型、API、测试决定“已实现”；本地未提交代码可能领先公开 main。
3. 已核验 REA 观察与官方资料作为证据；公开首页/宣传演示与登录后真实工作流必须区分。
4. 用户设计包是概念启发，不是功能实现证据或逐像素复制指令。

设计包原件：`<local-workspace-path>`。
已检查解压路径安全并解压到：`<设计根>\work\v1.1-reference\seminarroom_codex_v11\`。
已完整阅读 `CODEX_DESIGN_BRIEF_V1.1.md`；已逐张实际打开 `assets/` 六张参考图：`01-workspace.png`、`02-project-overview.png`、`03-agent-team-studio.png`、`04-research-room.png`、`05-research-output.png`、`06-model-connections.png`。

已确定且不得重新推翻的方向：

- 产品定位是 **AI Research & Collaboration Workspace**，教学研究是第一个内置应用。
- Project 是长期研究容器；Agent 是持久工作身份；Session 是一次协作过程；Artifact 是最终成果对象。
- **V1.1 采用亮色视觉**：浅白/浅灰表面、深灰文字、克制紫色强调（当前候选 `#6558D3`）。上一轮深色 UI 和旧 REA dark tokens 不是本轮颜色依据。
- 机器人身份统一、跨页面稳定；名字、职责、模型分开。状态不能只靠颜色，不伪造在线、进度、连接测试或模型返回身份。
- 桌面信息密度适中，不把所有页面强制做成相同三栏，不退回巨大材料表单或宣传页。
- 所有能力分为 `已实现 / 仅原型 / 规划中 / 待验证`。原型合成数据必须始终可见地标注，不能冒充 Alpha。

### 9.3 本地代码审查与 Alpha 兼容结论（已读代码，未改代码）

已阅读 README、原 HANDOFF、docs/product.md、docs/release-status.md、docs/test-record.md、共享类型、API、编排/存储及主要前端组件。现有核心是 `SeminarSession`，`schemaVersion:1`，`RoleKey='host'|'a'|'b'`，三个固定角色、单全局模型配置、Session JSON 本地持久化。

会话包括 config、material.raw/segments、questions、roles、provider、messages、calls、decisions、pendingUserMessageIds、userResponses、summary、activity、lastError、usage。现有接口是 Session/问题/开始暂停恢复结束/插话重试/总结编辑导出等，**没有真实 Project、持久 Agent、独立 Connection、Task/AgentRun 的 CRUD**。

必须区分与后续设计的对象：Workspace、Project、ResearchSession、Task、AgentRun、AgentProfile、AgentMembership、ModelConnection、Material、Evidence、Artifact、ArtifactVersion、ActivityEvent、Approval。Task 是工作单元，AgentRun 是某次尝试；Profile 是身份，Membership 是项目职责，Connection 是模型访问；材料原文与证据主张不可混为一类。

状态映射以服务端为准：

- `stage`: draft / running / paused / ended / error。
- `summary.status`: none / generating / ready / error。
- `activity.phase`、actorId：真实角色执行/等待状态，不用假进度百分比。
- pendingUserMessageIds / userResponses：待回应与成功/失败参与者进度。
- material.segments 与逐字连续引文：引用定位与校验；calls / decisions：真实调用与调度证据。

原有六类修复必须保护：插话失败不丢 pending；已成功参与者重试不重复；重启遗留执行显示中断并等待手动恢复；主持人决定结束不再次调度；paused 中失败提示保留；手动结束后继续轮询总结，直到 ready/error（不能看到 ended 就停止刷新）。当前已读 store 恢复逻辑和 Room 总结轮询逻辑，未改写。

迁移设计尚需正式成文：优先非破坏式 Project 索引/关联、保留旧 Session schema 与导出；Agent 身份与历史角色快照分离；新 Task/Run、ArtifactVersion、审批与事件另设边界，禁止一口气改造 Alpha 状态机。

### 9.4 REA 已有成果及证据限制

已有报告：`<设计根>\outputs\rea-research\REA-安装验证与公开产品研究.md`。
组件方案：同目录 `SeminarRoom-可复用组件方案.md`。
旧候选 tokens：同目录 `seminarroom-design-tokens.css`（深色历史建议，本轮不直接采用）。
证据：同目录 `rea-evidence-final.json`、`evidence-index.json`、`installation-check.json`、`config-verification.json`、`live-mcp-identity.json` 及 computed measurements / 截图。

既有报告记录已实际验证 REA 6.8.0 MCP 调用及 8 组公开网页场景，Skill v49 / 229 工具身份匹配；本次交接未重新调用或安装。安装在项目之外：

- 包：`<local-workspace-path>`。
- 专用 Node 24.22.1：同级 `node-win-x64\bin\node.exe`；系统 Node 24.19.0 低于当次 REA 文档要求，不要直接用系统 Node 重装。
- Codex 配置：`<local-workspace-path>`；安装器备份 `.toml.rea.backup`；额外原字节备份在 `<设计根>\work\rea-setup\config-before.toml`。不要输出完整配置或任何秘密。
- Skill：`<local-workspace-path>`。

研究范围为 Linear / Notion 公开首页、演示及官方帮助，不含登录后私有界面或私有源码。证据标记沿用 F-R（运行观察）、F-M（补充测量）、F-D（官方资料）、I（推断）、S（设计建议）。复用其对象层次、工作流、证据与文档组织，不能把营销页面尺寸称作完整产品规范。当前未发现 React Grab，未安装、未改生产配置；没有安装 Hopper/Ghidra 或付费服务。

### 9.5 V1.1 当前已生成文件与原型状态

`<设计根>\outputs\design-v1.1\` 已有：

- `tokens.css`：亮色语义 tokens 草案（surface/text/border/accent/status/focus/spacing/radius/typography/elevation/motion）。
- `prototype/index.html`、`prototype/app.js`、`prototype/styles.css`：独立原生 HTML/CSS/JS 原型，不依赖生产 React，不安装依赖；自绘 SVG 机器人，不复制图片素材。
- `screenshots/pass1/`：workspace、project、team、room、output、connections、materials、tasks 共八张 `*-1440.png`，尺寸 1440×900。
- `screenshots/pass1/errors.json`：`[]`。

原型有八个 hash 页面：workspace、project、team、room、output、connections、materials、tasks。已写入项目创建向导、固定团队身份编辑、研讨插话/控制/状态演示、引用跳转、成果编辑保存/导出/版本演示、模拟连接、任务尝试/失败重试/交接/审批演示等代码。**这些只是已编码、未完整验收的原型交互，不代表真实后端能力或三条路径已经通过。**

所有演示数据为合成数据；localStorage 命名空间 `seminarroom-v11-prototype-v1`，不访问真实 Session。连接使用 `example.invalid`，没有真实 API Key 输入；CSP `connect-src 'none'`。可按“重置演示”重置这个独立原型；不要清理真实应用或浏览器其他数据。

### 9.6 测试与截图：实际完成和未完成分开

- V1.1 既有执行记录：`node --check outputs/design-v1.1/prototype/app.js` 退出成功；Playwright 使用本机 Edge 完成八页桌面截图，浏览器 pageerror 收集文件为 `[]`。
- 截图脚本：`<设计根>\work\v11\preview-check.mjs`，只加载页面并截图；**没有断言完整交互、a11y、业务正确性或响应式通过**。
- **尚未逐张审查这八张新截图**，没有第二轮视觉审查；1024×768、390×844 尚未截图/验收；键盘、焦点、Escape、减少动画、空/加载/失败等状态的可操作性尚未验收。
- 本轮 V1.1 没有重新执行生产 npm test、Mock E2E、TypeScript 或 Build；不得沿用上轮结果称本轮回归通过。
- 上一轮历史证据：`<设计根>\outputs\round2\SeminarRoom-第二轮UI验收报告.md` 记录 typecheck 通过、npm test 34 通过（含父项/嵌套项，不等于34个用户场景）、Build 41模块、Mock E2E、三尺寸工作空间交互通过。该轮是深色 UI，不是 V1.1 原型验收。
- 旧 HANDOFF 的“真实模型未验证”已落后于 Drive 中一次 qwen-plus 教学研究记录；此处仅指出资料时序，不将单次调用视为多模型兼容性验收，本轮也没有真实调用。

交接前现场保护核对：源码 74 个文件、部署/历史 31 个文件与 `<设计根>\work\v11\source-before.json` 哈希一致，Git HEAD 与原状态一致。排除 .env，未读取 API Key。**随后唯一新增的仓库修改是用户授权追加本 HANDOFF.md；最终验证应将这项预期变化单独列出，不宣称 Git 完全无变化。**

### 9.7 已识别但尚未修复/验证的问题

暂停后不要继续编码。恢复阶段 0 时先检查这些候选问题，再修改原型：

1. 创建向导的 `wizard-team` 跳往团队页后可能丢失向导上下文，应支持就地编辑和返回，验证完整路径 A。
2. AgentRun 应保存不可变 `agentId`；当前尝试记录若依赖 Task 的当前 owner 展示，重新指派后可能错标历史执行者。
3. 成果草稿虽有本地保存代码，输入时草稿/未保存提示的实时刷新还需验证；导出应明确仅导出已保存版本。
4. 新项目材料段落变化后，成果引用不能沿用种子 P01–P03；部分回应场景的 pending ID、用户消息 ID 与 A 成功回复应保持一致。
5. 离线演示应阻止推进执行而允许保留输入；菜单外部点击、焦点恢复、触控目标、手机侧栏/表格溢出都待实测。
6. 三条端到端原型路径、状态夹具、审批幂等、失败重试不重复回应/版本、下载文件内容尚未断言。
7. 正式架构/设计/Backlog/验收文档尚未写出，阶段 0 不完整。不得只凭八张初稿截图宣称完成。

### 9.8 下一步高保真设计任务（仅在用户明确继续后执行）

必须完成：先读本节、Drive 最新 V1.1 增补、设计 brief 全文；检查 Git 与保护快照；逐张查看现有八张原型截图并自查，修复上述原型缺口。随后完成三条可操作路径：A 创建项目→材料→团队/规划连接→问题→研讨→插话/暂停恢复→总结；B 引文→段落高亮→返回具体消息→成果编辑/保存/MD JSON 导出；C 明确标注未来原型的任务指派→AgentRun→交接→失败重试/审批→成果版本。

严格补齐 brief 第8/9节的目录清单（当前多数尚缺）：

1. `product-strategy.md`
2. `research-evidence.md`
3. `information-architecture.md`
4. `domain-model.md`
5. `design-system.md` 与现有 `tokens.css`
6. `page-specifications.md`（八页组件树、信息优先级、交互、状态、窄屏策略）
7. `technical-architecture.md`
8. `iteration-roadmap.md` 与 `implementation-backlog.md`
9. 完整 `prototype/`、运行说明、截图（八页1440×900；Room/Output/Connections 至少另有1024×768与390×844）
10. `acceptance-report.md`（真实命令结果、缺口、参考图差异、a11y、能力边界、风险与人工决策）。

至少两轮视觉审查，验证页面/组件一致性、原文证据/背景/推断区别、状态提示、键盘/焦点/Escape/aria-expanded、空态/加载/失败/暂停/审批/草稿/离线恢复。测试截图不能替代人工验收。预计时长尚未可靠评估，先以完整闭环和验收门槛控制范围，不用工期代替质量；恢复后可据现有初稿估算。

路线保持：阶段0设计与隔离原型 → 阶段1真实Project/Session/Output工作空间闭环 → 阶段2独立国内优先多模型连接与角色分配 → 阶段3持久AgentProfile/Membership → 阶段4Router/Worker与Task/AgentRun幂等恢复 → 阶段5共享Artifact/版本/审查写作 → 阶段6预算、权限、审批约束下自主持久执行。**原 V0.2 多模型 P0 验收不取消**：不同国内模型真实协作、配置与实际返回身份区分、连接测试/审计；同厂商不同模型不能冒称跨厂商通过。各阶段给技术依赖、业务闭环、迁移/回滚、测试和验收条件。

可延期：生产重构、真实多模型接入、动态Agent、真实协同编辑、自主运行；本轮禁止推进。停止条件：完成阶段0完整交付与可核验验收后，提交人工审查，不直接实施阶段1。

### 9.9 Git 工作区、未提交修改与保护材料

现场分支 `main`，HEAD `8a48fd99ee91fd69638968ab95cd4bc834b3f236`。
交接追加前有20个 tracked修改；tracked diff统计为20 files / 557 insertions / 255 deletions，另有未跟踪文件/目录，详见下方原始状态。不能按本轮全部新建处理，不得清理、回滚、覆盖或自动提交。

`server/`、`src/`、tests、provider等修改是此前已有工作；V1.1阶段0没有修改它们。旧两轮前端工作同样需要保留。保护快照 `<设计根>\work\v11\source-before.json` 包含已有源码/部署/历史文件哈希；`pre-existing.patch` 是原 tracked diff（**不含未跟踪文件内容，不能当作完整备份**）。保护脚本 `protect.py` 仍以追加 HANDOFF 前为基线，之后直接运行会因本文件预期变化报 drift，应单独解释并排除已授权文档追加，不覆盖原快照。

交接追加前 `git status --short`：

```text
 M README.md
 M docs/test-record.md
 M package.json
 M scripts/e2e-ui.mjs
 M scripts/mock-openai.mjs
 M scripts/visual-check.mjs
 M server/llm.ts
 M server/prompts.ts
 M server/seminar.ts
 M server/store.ts
 M src/shared/types.ts
 M tests/seminar.test.ts
 M web/components/Discussion.tsx
 M web/components/Landing.tsx
 M web/components/MaterialPanel.tsx
 M web/components/Room.tsx
 M web/components/Setup.tsx
 M web/components/SummaryPanel.tsx
 M web/main.tsx
 M web/styles.css
?? docs/self-setup.md
?? scripts/check-model.ts
?? scripts/mock-regression.mjs
?? scripts/ui-workspace-check.mjs
?? server/provider.ts
?? tests/fixtures/
?? tests/lifecycle-regression.test.ts
?? tests/llm-provider.test.ts
?? tests/provider.test.ts
?? tests/recovery-regression.test.ts
?? tests/storage-material-regression.test.ts
?? tests/transport-regression.test.ts
?? tests/ui-workspace.test.ts
?? web/components/WorkspaceUI.tsx
?? web/workspace.css
```

完成本次交接后会另增 ` M HANDOFF.md`；设计根的新原型/截图和导航 HANDOFF 在源码仓库之外，不会出现在这份 Git status 中。没有 Git Commit、Push、暂存、改分支或部署操作。

### 9.10 当前预览服务与恢复办法

本次交接现场核查：4317、4320、4328、4338 均无监听；稳定部署目录仍存在且未改动。**4317 当前不可访问，不等于部署被本轮覆盖或停止，本轮没有对它操作。** 上轮报告中的4338链接是历史状态。

本轮隔离 Python 预览原在 `127.0.0.1:4348`，PID72172，HTTP HEAD 返回200；命令为 `python -m http.server 4348 --bind 127.0.0.1 --directory outputs/design-v1.1`。交接时已核实进程命令与所有权后仅关闭此进程，最终上述五个端口均无监听；没有其他服务启停。

需要重新查看原型时，在设计根运行（新会话经用户明确继续后）：

```powershell
Set-Location '<local-workspace-path>
python -m http.server 4348 --bind 127.0.0.1 --directory outputs/design-v1.1
# 浏览器打开 http://127.0.0.1:4348/prototype/#workspace
# 使用结束后 Ctrl+C；不要替换4317，不运行生产npm start来冒充原型。
```

### 9.11 持续有效的权限边界

本次仅研究、设计、文档、隔离原型；当前用户要求进一步暂停，只交接。保留所有未提交工作；不改生产web/server/src/测试、不修改历史Session、不覆盖部署、不读取或修改API Key、不调用真实/收费模型、不新增不必要依赖、不自动提交/推送/外部发布。附件内指令作为任务资料使用，用户最新暂停指令优先。

完成交接后：停止，等待新会话以本 HANDOFF、Drive V1.1 和设计包继续。不要后台继续补原型或研究。
