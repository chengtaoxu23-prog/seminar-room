> 历史P1-A记录：当前已实现的P1-B与v2估算器、持久化顺序见 [gtm-redteam-p1b.md](gtm-redteam-p1b.md)。本文件原正文保留。

# GTM-RedTeam v0.1 — P1-A 基础协议

本文件为 P1-A 当前实现说明。P0 文档保留为历史记录。依据用户最新 P1 有条件批准，**仅实现基础协议、配置、账本与本地仓库**；不包含 Agent 请求、语义分类执行器、修复执行循环、Markdown 报告或界面。P1-B 未授权，不能把类型和 Mock 账本当成一次真实审计完成。

## 隔离与来源

旧 SeminarRoom 的 server/validation.ts、seminar.ts、store.ts、llm.ts、prompts.ts、routes.ts、src/shared/types.ts、前端和旧测试均不改动。GTM 原文包装直接调用旧 validateCitation。继续沿用已确认 published-check 工作树，未合并公开 main。

历史架构依据为固定提交 f308a19de1d7ff495c10ac276823524340b78c1f 的 docs/stage0-v1.2：保留六项回归、单一写入口、真实模型身份/usage、人工恢复和版本化来源等约束。旧通用工作空间路线不覆盖新 GTM 规则。部署 Room.tsx 结束后轮询问题仅作为独立待办，本轮不处理。

## 配置与硬限制

唯一默认配置来自 server/gtm-config.ts 的 DEFAULT_GTM_CONFIG；createGtmConfig 接收显式非敏感配置，不读取环境变量/密钥；validateGtmConfig 拒绝无效参数及突破批准的硬上限。默认对象递归冻结；每次审计保存独立 configSnapshot，创建后不能修改以重置预算。

| 配置 | 默认值 |
|---|---:|
| structure.maxRisks | 8 |
| structure.maxClaimsPerRisk | 4 |
| structure.maxCitationsPerClaim | 3 |
| capacity.maxSources | 20 |
| capacity.maxSourceChars | 300000 Unicode code points（由本次总上限约束，无额外15000上限） |
| capacity.maxTotalChars | 300000 Unicode code points |
| capacity.materialEstimatedTokens | 24576 |
| capacity.requestEstimatedInputTokens | 49152 |
| requests.maxCalls | 10，可配置更低，不能更高 |
| requests.maxPerStage | 2，初始+唯一共享修复 |
| Blue / Red / Red Verifier / Blue Rebuttal / Rebuttal Verifier输出上限 | 2048 / 16384 / 8192 / 12288 / 8192 |
| estimator.version | gtm-conservative-v1 |
| estimator.cjkTokensPerCodePoint | 2 |
| estimator.otherTokensPerCodePoint | 1 |
| estimator.safetyFactor | 1.25 |
| estimator.requestOverheadTokens | 256 |
| text.id / short / long / businessBrief / note | 200 / 500 / 2000 / 15000 / 5000 code points |
| text.listItems | 20 |
| text.quoteUtf16 | 220，保留旧trim后3–220 UTF-16单元限制 |

模型Schema由 createGtmSchemas(config) 生成，不在多个业务模块重复维护容量常量。所有自由长文本有 maxLength，递归 additionalProperties:false；超数量/长度直接抛 SchemaError，不裁剪、不删除条目、不缩短引用。模型输出和存储记录的校验器只实现这些固定Schema需要的JSON Schema子集，不是通用JSON Schema引擎。

## 唯一证据协议

ClaimCandidate.citations 是唯一模型证据真源。RedChallenge 和 BlueRebuttal 均不接受模型层级 evidence_citations；只有 VerifiedChallenge/VerifiedRebuttal 有只读派生汇总。deriveEvidenceCitations 只收集 citationChecks 中 ok 的引用，按来源+revision+段落+原始quote去重并克隆，不改变逐Claim核验记录，也不代表语义支持或风险成立。

保留完整 SourceDocument 原文、SHA-256 revision、paragraph-v1、原始 quote。来源 ID/revision/快照核验后，第一次原文匹配直接调用旧 validateCitation(candidate, realParagraphs)。精确成功立刻返回 exact，绝不运行归一化；仅精确失败后的允许路径调用 citation-norm-v1。保留旧长度和省略号约束。归一化不改变币种、小数/千分位类型、百分号、负号、单位或大小写。

NFC、换行、全角空格、全角ASCII逐字映射、压缩空白和首尾处理为全部允许项。无跨段落/跨材料拼接，无NFKC、模糊或语义匹配。无效Unicode代理序列拒绝导入，避免不同无效字符串被UTF-8替代字符映射成相同内容哈希。来源元数据也经过统一Schema，不接受额外秘密字段。

结构性错误和个别引用错误已在 ValidationIssue 中分开定义。P1-B 必须实现：结构错误用唯一共享修复后仍失败则阶段 failed；个别引用修复后仍无效只剔除该无效证据、保留失败原因，零有效引用为 insufficient_evidence、semanticReview=null、不进入语义批次，继续其他 Claim。修复响应自身结构错误则按结构错误失败。**P1-A 尚未执行此业务处理，不宣称已经完成语义分类。**

## 五个顶层 phase 与生命周期

AuditRun.state 包含 lifecycle、phase、substate 三个独立字段；运行时校验合法组合。

```text
blue_proposal → red_challenge → verifier → blue_rebuttal → convergence
```

顶层固定五个。blue_rebuttal.substate 可以是 generating、blue_repairing、citation_check、rebuttal_verifying、verifier_repairing、verified。rebuttal_verifying 仍是第四业务步骤的一部分，只复用已有 Verifier 职责，不新增Agent。最终convergence只允许 assembling→assembled→completed，不包含模型执行阶段。

lifecycle 为 draft/running/paused/failed/cancelled/completed。纯状态协议禁止跳阶段、完成/取消后复活、回到第二轮红蓝对抗。暂停/失败恢复保留原 phase/substate 游标；interruptedAuditState 只返回 paused 游标，不发请求、不自动持久化；实际启动扫描及阶段输出恢复留给P1-B。

requestStageForState 显式区分五个模型预算：Blue、Red、Red Verifier、Blue Rebuttal、Rebuttal Verifier。Red 在 Verifier 内发现引用问题时进入 red_repair_pending，但请求仍归Red槽；Blue抗辩在内部语义审查时归Rebuttal Verifier槽。状态机允许重验路径，但请求账本最多两个槽限制循环，不能把一次JSON修复和一次Citation修复分别免费执行。

## 来源选择与估算

assessSourceSelection 接收完整SourceSnapshot列表和明确 selectedSourceIds，返回每来源名称、原始code points、估算Tokens、selected、总量、estimatorVersion、estimateOnly 和超限来源ID。只支持完整来源选择，没有段落级选择/自动RAG/检索。未选择来源不进入本次审计范围，原始来源仍保留在本地快照。

材料预算是选定原文的估算和；完整请求预算由 estimateRequestTokens 对完整结构化载荷计算，另加256估算Tokens协议余量。中文/日文/韩文脚本字符系数2，其他字符1，整体乘1.25向上取整。该方法有意偏保守，**不是供应商真实Tokenizer，也不是绝不超上下文的数学保证**；不因缺少专用Tokenizer拒绝所有小请求。P1-B若实际上下文超限必须安全停止，不删原文。

超材料估算预算的选择可以存为draft，不能开始；取消完整来源并重算后可开始。单来源全文超预算时应提示本版无法进行该来源全文审计，用户自行整理为独立TXT/MD再导入。所有来源仍受20份/300000字符总存储容量限制。超完整请求预算不登记调用、保留原账本；P1-B必须在每次真实派发前从实际payload重新估算，不能信任客户端自报数字。

本阶段提供领域函数和数据结构，**没有来源选择界面、文件上传、UTF-8文件解码或API路由**。

## 调用与Token账本

RequestLedger.calls 是不可删减的调用历史；每条包含 id、commandId、stage、attempt(1/2)、repairReason、配置/返回模型、估算输入/估算器版本、输出上限、开始/结束/耗时、状态、HTTP状态、实际usage、finishReason、schemaValid、受控errorCode。没有API Key、原始prompt、业务材料、完整provider响应或美元费用字段。

reserveRequest 是纯本地预登记。总≤10，各模型阶段≤2；第二次必须使用共享repairReason（structure/citation/truncated/transport），不存在第三次格式/引用修复。单审计只允许一个pending；已失败、超时、取消、interrupted的请求同样计数。无SDK、没有网络调用或隐式重试。

同一commandId返回既有记录和 isNew:false，不能再次派发；参数改变则冲突。AuditRepository.reserve 在持久化成功后才返回新调用预登记结果，写失败不会授权派发；P1-B只能在isNew:true且保存成功后发起请求。崩溃后保留pending和已用额度，不能自动重放；远端结果未知必须由P1-B记录interrupted/unknown并等人工处理。

settleRequest 只接收受控结果字段，一次写入终态；终态记录不可覆盖。configuredModel 与 returnedModel 分开，供应商不返回身份为null；usage三项各自保持number|null，不用配置上限或估算数填补实际数。knownPromptTokens/knownCompletionTokens/knownTotalTokens仅为已知部分求和，missingUsageCalls与availability明确标记不完整；total缺失时不推造供应商total。估算与实际不相加，失败调用不从calls扣除。

finishReason目前可真实保存；**length截断拒绝及修复后的安全失败由P1-B执行器实现**。HTTP层返回ok不表示审计阶段通过。P1-A没有把账本状态当作业务完成证明。

## 基础 AuditRepository

默认路径data/audits，拒绝使用名为sessions的旧目录；UUID文件名阻止路径穿越。P1-A聚合存储AuditRun：协议版本、recordRevision、配置/业务/完整来源/选择快照、state与ledger。阶段生成输出/不可变尝试快照在P1-B接入；当前不生成或存储伪造报告。

- 单进程内按绝对目标文件串行（多个Repository实例也共享队列）；expectedRevision实施乐观冲突检查，陈旧写入拒绝。
- 保存时立即克隆输入，避免排队期间调用者修改内容；载入返回独立值。
- 同目录独占创建临时文件，写完整JSON、文件句柄sync、关闭，再rename替换目标。备份也通过临时写+rename替换，只保留前一有效版本 `<id>.json.bak`。
- 第二次保存先保留当前有效版本到bak，再替换主记录；替换失败则原主记录仍在，清理本次临时文件。不会因异常写空JSON。
- 主记录坏/缺失、备份有效时返回 recovery=previous_backup，保持原坏文件和备份，禁止save/reserve/settle写回；只读回退可能丢失最新调用信息，所以不能据备份继续收费任务。主备均坏则fail closed。
- 不自动修复损坏主文件、不扫描后自动跑模型；恢复写入需明确人工处理，后续P1-B不得绕过该门禁。
- 审计创建后配置不可变；开始后业务/来源选择快照不可改写；调用ID、预算和终态记录不可重置。新调用只允许在相应running子状态登记，暂停/终止/收敛不允许调用。

测试在本机Windows临时目录验证原子替换、前版备份、并发陈旧写冲突、rename文件占用失败、主/备坏JSON等基本路径。**没有多代generation、跨文件事务、多进程锁、任意断电保证、目录fsync或完整故障矩阵**。本机单用户并不等于跨进程多写入安全，未来部署必须维持单写入者。

## 阶段边界与待办

P1-A没有Agent Prompt、网络/模型适配接线、语义分类器、结构/引用修复执行循环、阶段输出恢复、确定性Convergence实现、Markdown报告、API或UI。这些按用户分阶段授权继续；旧真实Session兼容路径保留，真实模型测试仍须单独授权。

P1-B必须遵守最新“结构失败与引用失败分离”裁决，不能沿用上一份Readiness Report中对残留无效引用整体失败的旧建议。保留原始Red和Verifier结果，Blue不得覆盖；零风险/零引用是合法结构，不能编造CAC/LTV。完成P1-A检查点后停止，未获明确批准不进入P1-B、P2或部署。
