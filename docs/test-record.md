# 实际测试记录

历史测试日期：2026-11-04（Asia/Shanghai）；真实案例补充：2026-11-07
环境：Windows、Node.js v24.19.0、npm、Microsoft Edge（Playwright Core 驱动）、项目目录 `<project-root>`。

> 重要：第1—5节保留2026-11-04历史测试，浏览器 E2E 使用 `scripts/mock-openai.mjs`，**不是真实模型**。第7节为2026-11-07人工真实运行案例；自动化实模验收仍未完成，两者不可混同。

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

## 5. 2026-11-04 自动化实模验收：当时因缺少密钥阻塞

在2026-11-04初始交付中，用户选择“暂时没有可用密钥，按阻塞交付”。

当时运行 `npm run check:live` 的实际结果：

```text
> tsx scripts/live-check.ts
[live] server http://127.0.0.1:4317 · model=gpt-4o-mini · endpoint=api.openai.com
[live] BLOCKED: 服务端未配置 OPENAI_API_KEY。真实模型验证无法进行；示例回放不能代替。
exit=2
docs/live-run.json -> False
```

当时的状态（历史记录）：

- 没有生成 `docs/live-run.json`；
- 没有真实模型运行截图；
- 没有把 mock 输出、示例回放或测试断言写成“真实模型已验证”；
- 真实模型是否能稳定遵循 JSON/工具调用/逐字引用，仍未验证；
- 验收脚本已准备好，配置服务端密钥后运行 `npm run check:live` 即可。

## 6. 未覆盖/剩余风险

- 已有第7节单次人工真实运行；结构化输出稳定性、工具调用兼容性和中文引用准确率尚未完成系统性评估；
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
