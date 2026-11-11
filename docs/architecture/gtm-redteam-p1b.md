# GTM-RedTeam P1-B — 执行引擎与接入契约

当前实现为本地单用户执行引擎，UI/API路由和人工审查页面仍属于P2。仅Mock验证；没有真实商业效果、真实Token校准或真实供应商兼容性结论。旧Seminar模型解析、引用核心和前端不改；server/index.ts新增本地GTM启动恢复。全量验收暴露旧存储读写竞态后，用户追加授权了最小Store原子写与必要的测试/后台任务收尾，见末节。

## 接口

- `new AuditRepository(dir)` / `createAuditDraft(context,sources,selectedSourceIds,config)` / `repository.save(draft,null)`：创建本地审计。来源可为0–20份、总量300000 Unicode code points；仅完整来源选择。
- `new GtmAuditEngine(repository, provider)` / `await engine.init()`：启动扫描与本地恢复，不构造真实连接、不派发模型。实际应用启动入口也调用recoverGtmAudits。
- `engine.start(id)`：只启动draft；完成后的重复start返回既有记录。模型commandId为auditId+modelStage+attempt，预登记保存成功且isNew:true才调用Provider。
- `engine.pause(id)`：保留在途结果，停止新请求；`engine.cancel(id)`：持久终止并传AbortSignal，不能恢复取消状态。
- `engine.resume(id,{acknowledgeUnknown:true})`：显式恢复；未知供应商结果必须另行确认。已经耗尽的结构性修复失败不能借恢复绕过额度。
- `engine.view(id)`：完整审计与来源估算视图，包括存储容量声明、选定材料estimated Tokens、24576预算占用、完整请求估算/49152上限及超限原因。没有假百分比或费用。P2应显示这些字段；本阶段未新增UI。
- 结构化结果为AuditRun.execution；规范Markdown为execution.markdown。唯一报告生产者为assembleAuditReport/auditReportMarkdown，不调用总结Agent。

Provider是显式服务器依赖，配置模型、实际返回模型与usage分开。createGtmHttpProvider只执行单次fetch，复用旧providerOptions，不读取环境变量，禁止重定向/工具/SDK隐藏重试；本阶段仅以注入fetch Mock测试该边界，不能宣称真实厂商兼容通过。API Key只在服务器Provider闭包中用于认证与泄露检测，永不进入模型消息/检查点/调用日志。无未经用户启动的真实调用。

## 两项前置修复

估算器默认gtm-conservative-v2：CJK=1.75、普通英文/拉丁=0.35、riskTokensPerCodePoint=1、safetyFactor=1.25、额外请求余量256。财务表格、数字/符号密集行、URL、代码行采用更保守系数；请求JSON结构与正文分别估算，避免把JSON封装误当所有英文正文都是代码。保留读取旧v1快照的能力，不静默改变既有审计配置。系数是工程初值，没有真实校准。

**30万字符是存储容量，不代表30万字符都能进入一次审计。** 选定完整来源超过材料预算则拒绝start；完整请求超过输入估算则停止、记录估算/上限，不裁剪材料。供应商实际context_limit同样安全失败，不自动删除原文。

持久化先写新主临时文件并sync，然后复制旧主到临时备份、sync、rename覆盖.bak，最后rename新临时主覆盖主文件。整个过程从不先移走/删除当前主文件。P1-A实际实现也没有移动主文件，但准备新主临时文件在备份之后，现已严格按新顺序调整。Windows本机实际测试覆盖成功替换和复制/备份替换/主替换/写入中断失败，失败时主文件保持可读；不退化为unlink主文件。init仅清理命名规则匹配且非本进程活动的临时文件，只保留一版.bak。仍是单进程单写入者，不承诺多文件事务、任意断电或跨进程安全。

## 五阶段与证据

Blue Proposal → Red Challenge → Verifier → Blue Rebuttal（内部rebuttal_verifying）→ Deterministic Convergence。每个模型执行阶段最多初始1+共享修复1，总≤10；JSON/Schema/length/ID/引用修复共用额度。无效引用由原Blue/Red修复，Verifier不能编造引用。引用修复只允许改citations，不能删除Claim或重写风险论证。

Claim唯一引用字段是citations。使用选定SourceDocument的sourceId+revision+paragraphId，直接调用旧validateCitation精确连续匹配，精确失败后才有限citation-norm-v1；保留原quote与无效失败记录。引用错且共享额度耗尽时排除无效证据，零有效引用跳过语义、classification=insufficient_evidence；结构修复失败则阶段failed，无完整报告。

语义批次只包含有效引用Claim，引用/原文使用共享登记表避免重复传输；全部32个Claim与96条原始核验记录仍保留。Verifier同时收到riskContexts，不将背景观察直接当作风险依据。supported/partially_supported/unsupported等是模型判断；服务端决定material_fact/inference/hypothesis/insufficient_evidence。只有获得支持的商业inference进入verifiedFindings，纯材料事实不能自动证明风险。无有效Claim时允许跳过该语义请求，零风险不强凑请求数或观点。

Blue只回应一次，结构严格绑定Red风险ID。原Red尝试、引用失败、原Verifier输出、最终findings和抗辩均保存；封存检查点和核验结果不可覆盖。Convergence保留原始质询、有效/无效证据、抗辩、未知/假设/实验、选定与未选材料、方法局限与人工审查声明。Markdown对模型/材料文本做展示转义，JSON仍保留原quote。

## 安全与恢复

材料只在结构化user数据中，固定system/schema/phase由服务器决定。模型额外状态、角色、工具请求或Schema修改被拒绝。Provider canary检测先于Schema解析；无密钥或环境读取工具。Mock注入测试不证明真实模型具备同等抵抗能力。

finishReason=length/max_tokens/max_output_tokens即使JSON完整也拒绝；非stop未知完成原因保守拒绝。使用唯一修复槽，耗尽后failed。旧Seminar解析路径不改。

阶段checkpoint保存冻结输入、每次尝试输入快照/hash、结构化候选、调用ID与受控错误；原始无效JSON/供应商错误正文不写日志。账本先持久化pending，再调用；结构化结果与结算在一次Repository更新提交。持久化失败保留pending并暂停，不重新派发。

启动扫描把遗留pending标interrupted并保留次数，running转paused，未知结果标needsManualRecovery；相同commandId不会再授权派发。确认恢复可能消耗剩余的共享槽；未知的第二次尝试没有第三个槽。已成功检查点复用，不因刷新重跑。旧P1-A没有输入快照的pending明确记未知，确认后用仍冻结的原业务/来源重建下一次输入，不虚构旧输入。

## 复现与边界

`npm run typecheck`、`npm test`、`npm run build`。离线示例：`node --import tsx scripts/gtm-mock-demo.ts <新输出目录>`；脚本没有HTTP Provider/密钥读取，使用合成材料，输出带Mock标识的Markdown/结构化运行记录，usage unavailable。不能把示例作为真实市场预测或商业效果。

P1-B完成后停止。真实Token校准需另交模型、供应商、次数、规模与成本上限方案并获得明确授权；不自动进入P2、不提交推送或部署。Human Review UI、文件上传/原生TXT解码、PDF/DOCX/RAG、持久化多进程协调和真实模型效果均未在本阶段实现或验证。

## 追加授权的旧存储与收尾修复

全量回归两次在旧SessionStore读写窗口读到不完整JSON；未改源码的隔离并发探针也复现，不能用单独34项通过掩盖该风险。用户明确批准最小修复后，SessionStore改为同目录独占临时写+文件sync+原子rename，失败保留旧主；共享按绝对文件路径的进程内写队列，get等待同文件已排队写入，flush可等待同目录所有Store实例的写入。未引入新Schema、迁移、模型调用或旧数据重写。

SeminarEngine仅新增后台任务完成观察和waitForIdle；不改变主持人/参与者决策、模型解析、引用规则或重试语义。旧测试断言保留，目录删除前等待后台/写入完成，子进程清理同时识别exitCode与signalCode，避免等待已发生的退出事件。新增测试覆盖旧并发读完整JSON、替换失败保留旧记录、等待收尾不新增模型请求。它不构成跨进程事务或任意断电安全保证。
