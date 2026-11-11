> 状态说明：第1—6节保留初始交付历史，第7节是2026-11-07手动真实运行，第8节是本轮Mock质量基线。历史“没有密钥/实模阻塞”不代表目前没有真实案例。

# 实际测试记录

日期：2026-11-04（Asia/Shanghai）  
环境：Windows、Node.js v24.19.0、npm、Microsoft Edge（Playwright Core 驱动）、项目目录 `<project-root>`。

> 重要：本记录中的浏览器 E2E 使用 `scripts/mock-openai.mjs` 测试替身，**不是真实模型**。真实模型验收因缺少 API 密钥被阻塞，见文末。

## 1. 安装与构建

```text
npm install --ignore-scripts --no-audit --no-fund --cache .npm-cache
added 181 packages ...
npm install --save-dev playwright-core --ignore-scripts ...
added 1 package
```

`--ignore-scripts` 是本机沙箱环境下的安装方式；`package-lock.json` 已生成。普通环境可直接执行 `npm ci`。

```text
npm run build

> tsc --noEmit && vite build
vite v7.3.7 building client environment for production...
✓ 39 modules transformed.
dist/web/index.html                   0.66 kB │ gzip:  0.47 kB
dist/web/assets/index-6eJEmpOw.css   38.78 kB │ gzip:  8.44 kB
dist/web/assets/index-sx1MErSc.js   277.52 kB │ gzip: 85.13 kB
✓ built in 612ms
```

结论：TypeScript 检查通过，生产构建成功。

## 2. 自动化测试

命令：

```bash
npm test
```

实际输出（8 项全部通过）：

```text
✔ material segmentation and verbatim citation checks
✔ invalid or background citations are stripped instead of displayed as evidence
✔ host end action requires a concrete end reason
✔ conflicting material is segmented and both incompatible figures are citable
✔ real orchestration loop: independent role calls, tool use, pause, direct reply, summary and export
✔ user interjection wins over a stale, unexecuted host invitation
✔ insufficient material: no fabricated citation survives and summary can leave evidence empty
✔ API failure is surfaced as error, not as a successful discussion

tests 8
pass 8
fail 0
duration_ms 2655.8879
```

测试文件：[tests/seminar.test.ts](../tests/seminar.test.ts)。

### 覆盖点与证据

| 验收点 | 测试 | 实际断言 |
| --- | --- | --- |
| 三个角色确实独立调用 | `real orchestration loop` | 调用日志含 host/participant/summarizer；A、B 均发言；host、A、B 的 `contextHash` 集合互不重叠 |
| 工具按编号读取材料 | 同上 | 断言至少一条 `read_material` 工具记录，且包含材料段落 2 |
| 用户插话得到直接回应 | `real orchestration loop`、`stale invitation` | 主持人消息包含用户消息 ID；参与者 `directToUser=true` 且 `addresses` 含用户 ID；旧的未执行主持安排不会先于用户回应运行 |
| 引用准确 | `real orchestration loop`、`conflicting material` | 每条参与者引用与总结依据都通过 `validateCitation`；三份材料的关键冲突数字均可逐字引用 |
| 材料不足不编造 | `insufficient material` | 引用不存在时被移除；证据块降级；总结 `evidence=[]`，不补写材料依据 |
| 暂停有效 | `real orchestration loop` | `stage=paused` 后等待，调用数不再增加 |
| 结束有效 | `API failure` | 用户结束后无 host/participant 新调用，只允许 summarizer |
| 刷新后恢复 | 浏览器 E2E | 重新加载 `?session=...` 后总结编辑仍在 |
| API 失败不被显示为成功 | `API failure` | `stage=error`、`lastError` 可见、summary 为 none；不会伪造结束或成功 |
| 导出与实际讨论一致 | 编排测试 + 浏览器 E2E | Markdown 包含技术记录与编辑后总结；JSON 调用数与状态一致 |

材料 3《社团年度总结里的冲突数字》的测试断言：

- `活跃成员 240 人`（材料 1）与 `全年登记成员 180 人`（材料 2）都可逐字引用；
- `共举办活动 32 场`（材料 1）与 `18 场有独立签到表`（材料 2）都可逐字引用。

这说明材料中的冲突可以被检索和引用；它不声称模型一定会在真实运行中发现所有冲突。

## 3. 浏览器端到端测试（本地测试替身）

启动方式：

```powershell
# 终端 1：测试替身（不是真实模型）
npm run mock:model

# 终端 2：连接到替身
$env:SEMINAR_PORT="4318"
$env:OPENAI_BASE_URL="http://127.0.0.1:4320/v1"
$env:OPENAI_API_KEY="test-only"
$env:OPENAI_MODEL="e2e-mock-not-a-real-model"
$env:SEMINAR_DATA_DIR="<abs-path>\data\e2e-sessions"
npm start

# 终端 3
npm run test:e2e
```

实际输出：

```json
{
  "sessionId": "29a80c26-fef3-4492-8ec0-07fd3f79be7c",
  "questionCount": 3,
  "callRows": 13,
  "beforePauseMessages": 7,
  "afterPauseMessages": 7,
  "jsonSummaryEdited": true,
  "markdownExported": true,
  "errors": []
}
```

逐步验证：

1. 首页载入第一份示例材料；
2. 生成并编辑三个问题；
3. 开始讨论，等待两位参与者发言；
4. 暂停，等待当前调用完成后，消息数保持 7 条不变；
5. 暂停期间发送“23:00 折中”插话，继续；
6. 等待 `.direct-badge` 出现，确认参与者直接回应用户；
7. 结束讨论，等待独立总结；
8. 编辑第一条共识，点击保存，界面显示“已人工编辑”；
9. 打开技术记录，13 行调用，包含主持人、两位参与者、总结和 `read_material`；
10. 通过服务端导出 JSON/Markdown，断言编辑后的文本与实际状态一致；
11. 刷新页面，断言编辑后的总结仍在；
12. 390×844 窄屏下 `document.body.scrollWidth === 390`，无横向溢出；
13. 控制台无错误。

**注意：** 这里的 13 行调用是测试替身产生的真实 HTTP 请求记录，不是 OpenAI/DeepSeek 等真实模型的调用。模型名为 `e2e-mock-not-a-real-model`，技术记录与截图都可见。

## 4. 页面与视觉检查

使用 `npm run visual`（需要未配置密钥的服务在 4317 端口运行）：

```text
landing title: SeminarRoom · 材料研讨室
health badge: 未配置模型
replay scroll: { top: 1211, height: 812, scrollHeight: 2023 } last visible: true
replay messages: 10
summary visible: true
mobile body scroll width: 390
errors: none
```

截图见 [docs/screenshots/](screenshots/)。

## 5. 真实模型验收：阻塞

用户在当前会话中明确选择“暂时没有可用密钥，按阻塞交付”。

运行 `npm run check:live` 的实际结果：

```text
> tsx scripts/live-check.ts
[live] server http://127.0.0.1:4317 · model=gpt-4o-mini · endpoint=api.openai.com
[live] BLOCKED: 服务端未配置 OPENAI_API_KEY。真实模型验证无法进行；示例回放不能代替。
exit=2
docs/live-run.json -> False
```

因此：

- 没有生成 `docs/live-run.json`；
- 没有真实模型运行截图；
- 没有把 mock 输出、示例回放或测试断言写成“真实模型已验证”；
- 真实模型是否能稳定遵循 JSON/工具调用/逐字引用，仍未验证；
- 验收脚本已准备好，配置服务端密钥后运行 `npm run check:live` 即可。

## 6. 未覆盖/剩余风险

- 真实模型的结构化输出稳定性、工具调用兼容性、中文引用准确率尚未实测；
- 长材料（>12,000 字）只做截断与关键词选段，未做完整长上下文压测；
- 轮询在慢网络下的延迟；
- 没有并发多用户/权限测试；
- 没有真实用户可用性测试。

这些风险已在 README、`docs/product.md` 和 HANDOFF 中列明。

## 7. 2026-11-07 人工真实运行：书法教学研讨

2026-11-07，使用千问 `qwen-plus`（`dashscope.aliyuncs.com`）完成书法教学备课研讨：“一节90分钟毛笔书法入门课，如何兼顾看清示范、动手练习与个别反馈？”实际运行 **6轮、14次模型调用、42,495 tokens**（输入37,444，输出5,051），包含用户插话、参与者直接回应、独立总结、人工编辑保存及 Markdown / JSON 导出。

- 会话：`7dfed129-d723-42ce-9cad-09f97a6cc1af`；达到6轮上限后结束。
- 输入为助手自拟的8名成人、1位老师、90分钟体验课，无投影与助教；不代表真实教师或学生的情况。
- 三问经人工编辑。用户插话要求后半场讨论分组看示范、等待任务与纸面记录，并指出假设性耗时不是事实；主持人安排后，参与者出现“直接回应你”并修正措辞。
- 独立总结后发现“未必看清”被扩大为“无法看清”、遗漏后续立场变化等问题，已人工编辑保存，导出包含编辑后的总结；不把人工修正归为模型自主完成。
- 本地证据为会话状态、Markdown / JSON 导出及运行截图；本次只提交文档，不上传原会话、截图、材料或密钥。

这是一次人工操作的真实运行案例，不等于 `npm run check:live` 自动化实模验收通过；目前仍未生成该脚本的 `docs/live-run.json` 报告。案例没有验证真实模型下的暂停/继续、长期稳定性、教学效果或多模型协作。三角色使用同一个模型和同一套服务配置，通过独立上下文分别调用。

这次案例支持将项目定位为早期可用版（Alpha），不能据此声称教学效果提升、长期稳定性、多 API Key 或多模型协作已验证。教学研究为首个内置产品方向，专用模板仍未内置。

## 8. V0.2第一阶段：本地质量基线


日期：2026-11-07，Asia/Shanghai。性质：本地测试基础建设；未开发多模型功能。

### A. 范围、环境与基础设施

工作副本：`work/published-check`。本地 HEAD 为 `8a48fd9`；已有远端跟踪引用为文档提交 `d5ad8d4`。本轮未 checkout、创建分支、提交或推送。原目录中已有千问适配等未提交修改，已记录状态和内容哈希，未覆盖。报告测试的是这份本地工作副本，不等于仅检验 GitHub main。

环境：Windows、Node v24.19.0、npm 11.17.0、系统 Edge、playwright-core。框架为 Node 内置 `node:test` + `assert`，由 tsx 执行 TypeScript；没有独立 Jest/Vitest、覆盖率工具或 lint 配置。`npm test` 同时执行纯函数测试、带测试替身的编排集成测试和请求层测试。TypeScript 为 strict / noEmit / ES2022 / Bundler；React 前端、Express 后端、JSON 文件持久化、Vite 构建。

package 脚本已检查：dev、dev:server、dev:web、build、typecheck、start、test、test:e2e、visual、mock:model、check:live，以及已有本地新增的 check:model。check:live / check:model 均未执行；后两者可能产生真实调用。

模型边界：本轮没有读取、复制或打印用户 `.env.local`，没有访问原部署的4317服务或真实会话。工作副本根目录没有 `.env` / `.env.local`；测试命令明确设置测试占位凭据和本地地址。请求层测试全部替换 fetch。浏览器使用4318测试网站、4320本地模型替身、4319无密钥视觉网站。新浏览器运行器在无环境文件的临时CWD启动服务，仅连接构建目录，不继承真实模型配置。

### B. 阶段A：修改测试前的原始基线

先完成代码、脚本、配置与文档阅读，再运行原始测试。测试产生的构建产物不算源代码修改；原E2E从临时目录运行，截图与测试会话未写入历史截图或真实会话目录。

| 命令/检查 | 原始结果 | 数量与限制 |
| --- | --- | --- |
| npm.cmd run typecheck | 通过 | 1次类型检查 |
| npm.cmd test | 通过 | 11通过，0失败，0跳过；含既有本地千问适配测试 |
| npm.cmd run build | 通过 | Vite 39模块 |
| 原scripts/e2e-ui.mjs，由隔离临时运行器启动依赖服务 | 通过 | 1条综合浏览器场景；3问题、13行调用、暂停7→7、总结编辑/导出/刷新恢复、errors=[] |
| npm run visual | 未执行原命令 | 原脚本硬编码4317，且覆盖历史截图；不触碰正在使用的真实网站 |
| check:model / check:live | 按边界跳过 | 2条真实调用入口；不计入Mock通过数 |

既有测试名中的“real orchestration loop”指执行真实编排代码，传入的是函数替身；不是实际模型。没有单列的 integration 命令，编排集成已包含在 npm test 中。

### C. 核心覆盖矩阵

“自动-Mock”表示程序逻辑经自动化验证，但模型是替身；“自动-本地”表示纯数据/文件处理，不依赖模型。书法案例是历史手动实模证据，本轮没有重新调用。

| 能力 | 原覆盖 | 本轮后的证据/边界 |
| --- | --- | --- |
| 文本粘贴与载入 | 自动-Mock E2E | 保留；文件/PDF导入未实现，不适用 |
| 分段与编号 | 自动-本地，短材料 | 补长中文、BOM/CRLF、编号确定性、全文非空白字符完整性、空材料 |
| 按关键词/编号读材料 | 自动-Mock工具路径 | 补关键词检索；语义召回质量未验证 |
| 三问生成及人工编辑 | 自动-Mock E2E | 补无效格式两次尝试、错误保存、不产生伪问题 |
| 主持人初始化与角色交接 | 自动-Mock | 保留原编排集成与E2E |
| 角色独立上下文 | 自动-Mock指纹 | 补两个并行会话任务上下文、消息ID隔离；不证明模型认知独立 |
| 多轮发言 | 自动-Mock | 保留；新增明确2轮上限与调用数断言 |
| 主持人主动结束 | 自动-Mock | 保留；是否完整讨论全部三问无确定性保证 |
| 轮次/结束上限 | 间接覆盖 | 新增 round_limit、实际参与者轮数及无结束后插话 |
| 调用预算耗尽 | 未专门测试 | 仍为缺口；不能把轮次上限等同调用预算上限 |
| 用户插话、主持人安排、参与者直答 | 自动-Mock；历史书法手动实模 | 保留正常路径；新增修复失败路径，发现BUG-R2 |
| 旧主持安排不抢先执行 | 自动-Mock | 保留已有 stale invitation 测试 |
| 暂停与继续 | 自动-Mock集成/E2E | 保留7→7及继续后的直答；实模自动化未验收 |
| 用户主动结束 | 仅错误态结束 | 新增在途主持调用被abort，之后只启动总结 |
| 重启中断恢复 | 未测试 | BUG-R1已复现；未修复 |
| 引用段落与逐字核对 | 自动-本地/Mock | 保留真引用、错误编号、改写与冲突数字验证 |
| 点击引用定位 | 历史人工/视觉记录 | 本轮E2E未点击引用定位，仍缺专门交互断言 |
| 无效引用/背景知识引用 | 自动-本地/Mock | 保留降级、移除和材料不足路径 |
| 总结生成及共识/分歧/未解决 | 自动-Mock；历史手动实模 | 新增三类编辑文字均进入Markdown；内容质量仍需人工审核 |
| 总结编辑保存 | 自动-Mock E2E | 新增新Store/新Engine磁盘读回，不只读缓存 |
| 无效总结编辑 | 未测试 | 新增无效引文拒绝且不覆盖已存总结 |
| Markdown/JSON导出 | 自动-Mock E2E | 新增编辑后内容与磁盘状态一致 |
| 刷新恢复 | 自动-Mock E2E | 保留；并非进程重启恢复 |
| 同schema历史会话读取 | 自动-Mock | 新增schemaVersion=1生成快照重新加载；未用用户历史数据 |
| 跨schema版本迁移 | 未实现/未测试 | Store直接JSON.parse并断言类型，无运行时迁移，后续需设计 |
| 顺序并发保存 | 未测试 | 新增两次排队写入后最新快照胜出 |
| 非法ID/缺失文件 | 未专测 | 新增拒绝路径穿越、缺失会话错误 |
| 损坏JSON | 未测试 | 新增读错误显式抛出、不覆盖磁盘；不表示能修复损坏 |
| 写入期间断电/磁盘写失败 | 未测试 | 仍未覆盖；writeFile并非原子替换 |
| HTTP401/429、网络失败 | 原编排函数抛错 | 新增fetch替身，分类、重试标志、无隐式重发及错误脱敏 |
| 超时/预先取消 | 未测试传输入口 | 新增超时abort、取消前不发请求 |
| 无效模型响应 | 部分结构校验 | 新增缺失choices；无效HTTP JSON体的分类仍未专测 |
| 失败后错误状态与重试 | 原error/结束路径 | 新增timeout→error持久化→retry→结束、清除错误 |
| 界面错误展示 | 仅实现阅读 | 没有浏览器错误横幅故障注入，仍缺测试 |
| 模型身份与token日志 | 自动-Mock结构/人工实模 | 补缺失usage保持null；不保证服务商返回模型身份，当前日志来自配置 |
| 无密钥首页/回放/窄屏 | 历史visual仅输出日志 | 最终隔离运行通过，并新增关键状态、宽度和console断言 |
| 多提供商/多模型协作 | 未实现 | 不适用本阶段，不作通过声明 |

### D. 新增与调整

- `tests/fixtures/baseline-mock.ts`：独立临时Store、确定性材料与响应、事件等待。没有真实API请求。
- `tests/lifecycle-regression.test.ts`：7个顶层测试，含2个明确TODO缺陷复现。
- `tests/storage-material-regression.test.ts`：2个顶层测试，覆盖材料完整性、排队写入及错误读取。
- `tests/transport-regression.test.ts`：1个顶层测试及7个子测试，全部替换fetch并在finally恢复。
- `scripts/e2e-ui.mjs`：增加本地模型替身身份检查、可指定截图目录、console/page error失败断言。
- `scripts/visual-check.mjs`：增加本地URL和无密钥检查、独立截图目录、已有观察点断言及finally关闭浏览器。
- `scripts/mock-regression.mjs`：只启动测试服务；端口被占用即退出，不复用或关闭用户服务；临时数据、日志、截图保留在系统临时目录，结束时关闭自己创建的进程。
- `docs/test-record.md`：保留历史并增加本轮记录。本轮不修改package.json，不引入依赖。

### E. 阶段D：最终结果

| 命令 | 最终结果 |
| --- | --- |
| npm.cmd run typecheck | 通过 |
| npm.cmd test | 28个Node计数项：26通过，0非TODO失败，2 TODO，0跳过，0取消；退出码0 |
| npm.cmd run build | 通过，39模块 |
| node scripts/mock-regression.mjs | Mock E2E和隔离visual均通过，退出码0 |
| check:model / check:live | 未执行，禁止真实调用 |

Node计数包含7个嵌套子测试和其父测试，不能把28理解成28条互不重叠的业务场景。相对原11计数项，增加17项：其中15通过、2为未修复TODO。**不是28项全通过，不是没有业务Bug。** TODO内执行期望断言，当前确实失败；Node框架因TODO标记不使整体退出码非零。这是隔离已知缺陷，未降低断言标准。将来修复后应移除对应TODO。

补测初稿曾因测试替身发言不足30字，出现1项普通失败和1个TODO超时；已修正测试数据长度，未修改业务规则。最终两个TODO都以明确断言失败复现，不再以超时作为缺陷证据。

最终浏览器：3问题、13行HTTP调用、暂停7→7，用户直答、总结编辑、MD/JSON导出、刷新恢复通过，errors=[]。visual：回放10条消息、完整回放最后一条可见、总结可见、390px无横向溢出、errors=none。原visual命令的4317限制由测试脚本参数化解决，未访问用户真实服务。

### F. 已知问题与未验收项

#### BUG-R1：进程重启后的“运行中”状态失真

复现：合成schema-v1会话保存为running→新建Store/Engine读回→仍为running，且新Engine没有runtime。`server/seminar.ts:getSession`只缓存加载数据，`init`仅初始化目录，未恢复/标记中断。用户无法直接按现有resume恢复，因为它只接受paused。TODO断言期望不再假装运行，实际仍为running。后续需要独立的重启恢复设计，本轮不修复。

#### BUG-R2：参与者未确认回应用户却清空待回应队列

复现：暂停时发送合成插话→继续→主持人正确安排→参与者第一次与修复后第二次均返回空addresses→消息显示directResponseWarning且directToUser=false→pending ID仍被清除。定位`server/seminar.ts:runParticipant`：missing仅在attempt===0抛错，之后清理整个pendingAtStart集合。TODO期望直答或仍保留待回应，实际两者都不满足。本轮不修复。

#### 其他缺口与限制

- 当前Store直接写文件，无原子替换与跨进程锁；断电/磁盘满不在本次覆盖内。
- 没有schema迁移或运行时历史会话验证；本次仅验证合成schema-v1读回。
- 调用预算边界、总结生成失败恢复、浏览器错误横幅、点击引用定位尚需后续专项回归。
- 不测试生成内容的教学正确性。先前人工案例中的前提误读、总结过度推断仍是质量风险。
- Edge路径硬编码，仅在本Windows环境验证；Linux/macOS需配置浏览器位置，未虚构跨平台通过。

### G. Diff与安全审查

本轮基于开始前内容哈希核对：server/、web/、src/shared/、examples/及已有测试文件没有被本轮改写。已有README、package.json、server/llm.ts和千问适配文件属于前次工作，不能计入本轮授权diff。本轮允许的改动为新测试/fixture、3个测试脚本、测试记录；未删除历史文件、未改lockfile、无新依赖。

完整仓库diff与本轮独立diff均保留供审查；新增未跟踪文件也纳入本轮补丁，不因git diff默认忽略而漏掉。交付不包含测试会话JSON、截图或用户密钥。测试中出现的test-only和synthetic字符串都是固定测试占位值。

### H. 下一阶段技术准备（只分析，未实施）

1. `server/config.ts:AppConfig`目前只有一套apiKey/baseUrl/model；配置连接表与按角色绑定需先定义新类型及默认连接回退，密钥不能进入共享类型或会话导出。
2. `server/llm.ts:chatCompletion`直接读取全局config，`SeminarEngine`虽注入appConfig和llm函数，默认调用仍依赖全局配置。应先建立显式连接参数入口，再逐角色选择；避免只改Engine中的model标签。
3. `server/seminar.ts:logRequest`的model来自appConfig而非服务商响应；`CallLog`只有model，没有连接ID、提供商或返回模型名。下一阶段应分别记录请求配置身份和服务商返回身份。
4. `SeminarSession.provider`为单对象、schemaVersion为1；需要决定新增角色绑定如何兼容旧会话，先解决BUG-R1，不要自动续跑旧任务或产生意外费用。
5. 前端`Landing.tsx`只创建角色名称/风格，`Setup.tsx`和`Room.tsx`显示session.provider，`web/api.ts`、`App.tsx`管理单会话。多连接选择应先落在创建/确认页，身份展示及日志随真实绑定更新；不在本轮改界面。

本轮到此停止，不进入多模型连接实现，也不执行真实API验收。

## 9. 两项已复现Bug修复（2026-11-07）


日期：2026-11-07（Asia/Shanghai）。仅本地开发，未创建提交、分支或推送。

工作副本：`<local-workspace-path>`。原部署目录 `<local-workspace-path>` 和其密钥文件、真实会话、运行中服务均未操作；本轮修复尚未部署到该目录。

### 1. 根本原因

**插话丢失：** `runParticipant`在第一次缺少addresses时要求修复，却允许第二次仍缺少确认的结果进入消息列表；随后无条件清除pendingAtStart。队列也没有记录每位参与者的完成状态，无法可靠表达部分成功。

**重启虚假运行：** 执行中的runtime只存在内存。旧init仅创建数据目录，getSession直接读回running；没有重启后的中断标记，也没有人工恢复入口所需的状态转换。

### 2. 修复方式

- 为每条插话增加可选持久化字段userResponses，记录required、completed、failedActor、error；旧schema-v1文件可以没有此字段，按需从已有成功消息推导完成者。
- 新插话需要A、B分别确认；继续保持一轮一个参与者。主持人收到剩余回应者列表，不能重复安排已经完成全部待处理插话的人。参与者只接收自己尚未完成的插话。
- 解析和确认都成功后才提交参与者消息；两次失败则保留队列、记录user_response_failed和失败参与者，界面显示“插话回应失败 · 消息已保留”。无效草稿不会成为重复发言。
- A成功后其消息、round和completed持久化；B失败时最后一条已完成主持安排仍在。重试只续跑B，不重播A或主持人。只有所有必要回应完成才清队列。
- 新插话至少需要剩余2轮和4次角色调用容量（另预留总结），不足时明确拒收，避免承诺无法完成的回应。预算不包含对修复次数的无限保证；遇到耗尽仍可停止，未完成插话保留。
- 用户明确结束不再把尚未回应的插话当作成功清除，界面显示“未完成回应”。用户结束仍停止后续角色调用。
- 启动枚举合法会话文件；遗留running转换为paused + stopReason=interrupted，写入中断说明并清理过期活动显示。不调用kick或模型。读取尚未缓存的running文件也执行同样保护。
- 界面显示“服务中断 · 等待继续”，说明未自动调用模型；沿用现有“继续”按钮。只有resume由用户触发才开始工作，并清除中断标记。已完成消息与调用日志保留。
- 无法读取的会话启动时报告ID并保留原文件，不打印文件内容，不阻止其他会话加载。

### 3. 修改文件（本轮12项）

| 文件 | 本轮修改 |
| --- | --- |
| server/seminar.ts | 逐参与者确认、错误与重试、队列容量、中断恢复 |
| server/store.ts | 枚举合法会话ID，不改变原有保存方式 |
| server/prompts.ts | 主持人可见剩余/已完成回应者 |
| src/shared/types.ts | 可选userResponses字段，不包含密钥 |
| web/components/Room.tsx | 中断与回应失败提示，继续/重试及未完成回应显示 |
| tests/lifecycle-regression.test.ts | 两个TODO改为正式回归断言 |
| tests/recovery-regression.test.ts | 部分成功、实际子进程退出与恢复、容量边界、结束保留，以及服务端渲染的界面提示断言 |
| tests/fixtures/acknowledging-mock.ts | 可区分已完成回应者的确定性Mock |
| tests/fixtures/restart-worker.ts | 合成会话子进程，模拟B在途时退出及显式恢复 |
| tests/seminar.test.ts | 既有主持人Mock识别尚需B回应，不再永远指向A；原断言保留 |
| scripts/mock-openai.mjs | 同步调整E2E替身，支持两个回应者的队列状态 |
| docs/test-record.md | 追加本轮结果；原始基线和真实运行历史保留 |

没有改动模型调用实现server/llm.ts、本轮以外的千问适配、README、package/lockfile或其他界面。它们在git status中已有的修改属于此前工作，不能计入本轮。

### 4. 测试结果与关键证据

| 项目 | 修复前 | 修复后 |
| --- | --- | --- |
| npm.cmd run typecheck | 通过 | 通过 |
| npm.cmd test | 28计数项：26通过、2 TODO缺陷失败 | 31通过、0失败、0 TODO、0跳过、0取消 |
| npm.cmd run build | 通过 | 通过，39模块 |
| node scripts/mock-regression.mjs | E2E/visual通过 | E2E/visual通过 |

测试计数含7个嵌套子测试及其父测试，不应当作31条独立业务场景。

关键测试证据：

1. A成功、B两次确认失败：completed=['a']，failedActor='b'，pending保留，只有A的一条参与者消息；界面错误提示存在。重试后新执行的角色只有B，completed=['a','b']，pending为空，A原消息ID不变，消息ID无重复，磁盘状态一致。
2. 真正的子进程退出：在A已保存、B调用已进入时终止测试子进程。新进程init后的模型调用数为0；状态为暂停/中断，原消息、调用日志和完成进度不变。再启动明确执行resume的进程，只发生B与总结两次调用，A/B最终各一条消息。
3. 不足两轮或不足四次角色调用时拒收新插话；主动结束后未完成插话仍可见。
4. 原正常插话、暂停/继续、结束、引用、总结编辑/保存、MD/JSON导出、刷新恢复均经原测试或Mock E2E回归。
5. 最终E2E：3个问题，15行HTTP调用（原13行；增加另一位参与者回应所需的主持人+参与者调用），暂停7→7，编辑与导出通过，errors=[]。视觉回放10条消息、总结可见，390px无横向溢出，errors=none。

UI提示由React服务端渲染断言检查；本轮没有在浏览器中手动点击模拟“中断”页面，进程恢复业务路径由实际子进程测试验证。正常页面交互使用Mock E2E。

最终E2E/视觉原始日志位于系统临时目录`seminar-mock-regression-C2AOyo`。命令没有调用check:model/check:live，没有启动原部署服务；所有密钥都是合成test-only占位，fetch异常测试使用替身。

### 5. Diff审查与交付边界

修改前将涉及文件复制到work/bugfix-before并保存git状态；本轮独立patch以这些副本为基线，包含新增未跟踪文件。保留全部已有未提交工作，不运行reset/clean，不修改HEAD或远端。git diff --check通过。没有新依赖、密钥、原始真实会话或私人材料进入补丁。

### 6. 尚未解决的限制

- 确认成功指结构化addresses包含目标ID，不能保证自然语言真正回答了问题；内容质量仍须独立评估。
- 本轮使用Mock，不证明真实模型下的稳定性或教学效果。
- 仍为单进程JSON存储，未增加原子写入、跨进程锁或断电保护；实际子进程测试是在B已开始且先前状态已持久化后终止，不代表任意写入瞬间都可恢复。
- 旧版已被错误清除的pending无法可靠自动补回，避免擅自重开历史任务或产生费用；此次防止未来继续丢失。
- 对遗留running状态做恢复；进程在问题生成或总结生成期间退出的专门恢复策略仍未实现。本轮不自动重跑任何此类调用。

完成后停止，待人工审查；不进入多模型开发，不提交、不推送。

## 10. 修复验收与本机部署（2026-11-07）

补充修复暂停期间在途失败提示丢失、主持人end保存后重启重复调度两个边界。全量33通过（比前轮多2），专项12通过，0失败、0 TODO；类型检查、构建、Mock E2E和visual均通过。原部署五份源码同步并重建前端后，首页与健康检查200。配置未改，3份历史数据哈希不变，无真实API调用，未提交/推送。详细报告保存在本次Codex输出《SeminarRoom-修复验收与部署报告.md》。


## 2026-11-11 GTM-RedTeam v0.1.0-alpha release candidate

- `npm test`: 146 reported nodes, including one parent container; 145 independent leaf tests passed. Existing assertions retained; real adapter tested with HTTP stubs only.
- Typecheck and build passed. Isolated clean `npm ci`/build/README startup served loopback 4317; Mock full workflow/export/reload passed. Current browser Mock acceptance includes upload, selection, evidence, Human Review, export and cancellation.
- Configuration construction/check makes zero model calls. Smoke CLI without approval flag intentionally refuses (exit 1) without loading live configuration or sending requests. Live smoke not executed.
- Runtime limits and usage remain in the existing ledger. No silent real-to-Mock fallback; real start requires informed consent. Config/model identity is public, key is server-only.
- Current and fetched history text scan: no non-allowlisted sensitive-pattern findings; explicit synthetic test credentials allowlisted by location and marker. Screenshots reviewed as synthetic/historical fixtures. No ZIP/PATCH/backup is selected for publication. Local runtime data and artifacts remain ignored.
- MIT retained; installed dependency license metadata reviewed. No deployment, merge, tag, release or Push performed. Local commit and final manifests are reported separately so no self-referential hash is stored here.
