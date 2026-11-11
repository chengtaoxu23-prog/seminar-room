> 历史记录：本文件描述 P0。当前已批准并实现的 P1-A 协议见 [gtm-redteam-p1a.md](gtm-redteam-p1a.md)；数量、容量、phase 和引用字段以新协议为准。P1-B 尚未实施。

# GTM-RedTeam v0.1 — P0 架构与兼容协议

本阶段只实现领域协议、引用包装、结构校验和纯状态转换定义。尚未提供可运行的 GTM 审计产品；Agent 执行、语义判断和服务端分类属于 P1，界面、持久化接线和报告导出属于后续阶段。

## 模块边界与既有资产

- `src/shared/gtm.ts`：独立 GTM 领域类型；不扩展、替换旧 `SeminarSession` 的状态枚举。
- `server/gtm-sources.ts`：材料快照、版本、段落、有限归一化和旧验证函数包装。
- `server/gtm-schema.ts`：JSON Schema 及严格本地子集校验器、模型输出解析器。
- `server/gtm-state.ts`：纯转换定义；没有网络调用、运行循环或自动恢复执行。
- `tests/gtm-p0.test.ts`：P0 基础回归。

原 `server/validation.ts` 的 `validateCitation()` 未改动。原 `llm.ts`、`seminar.ts`、`prompts.ts`、`store.ts`、`routes.ts` 和所有前端文件均保留。后续复用现有单 HTTP 请求适配器、AbortController、TokenUsage、日志和一次修复能力；不得将旧研讨工作流的 30 次预算直接当作 GTM 预算。

## 领域对象

BusinessContext 只要求 businessBrief；项目名、客户名、目标市场/客户、竞争对手和背景可选。BlueProposal 对未知单值保留 null，unknowns 显式描述数据缺口，不引入必填 CAC/LTV。

RedChallenge 最多八条，包含独立 ClaimCandidate，以便逐条 Claim 分类。Claim 的 kind 是模型建议的 observation/inference，不能当作最终分类。severity 是模型评估严重度，不能表示客观概率。

SemanticReview 是模型语义判断，只有 relation、directlyStated、reasoning 和 claimId；最终 classification 只存在于服务端 VerifiedClaim。HumanReview 独立保存，不覆盖机器输出。报告分别保存原始风险、验证结果、抗辩及其验证、来源快照、人工审查、方法和局限。

AuditCallRecord 中 TokenUsage 的 null 表示 unavailable。日志只存调用元数据和错误代码；原始业务材料保存在受控的阶段输入快照，而非额外复制到调用日志。

## Citation 协议与材料版本

定位键为 sourceId + materialRevision + paragraphId。revision 是原始 UTF-8 内容的 SHA-256（含 sha256: 前缀），不对原始材料进行归一化后再哈希。任何原文更改都产生新 revision；同 ID/revision 的已有快照不得被不同元数据静默替换。

appendSourceVersion 是 copy-on-write 的内存归档操作，不修改调用者原对象，并保留历史版本。一次审计只允许每个来源选择一个版本；历史归档可以有同来源的多个版本。快照在引用验证前重新计算哈希和分段，发现篡改或不支持的分段版本即拒绝。

paragraph-v1：CRLF/CR 转 LF；一个或多个空行（可包含空格）作为边界；删除段落外围空白；保留内部空白与内容；每个材料版本从 1 编号。原 rawContent 永远保留。未使用旧材料工具可能包含的裁剪规则。

引用先调用旧 validateCitation 做精确连续子串匹配。失败后只在同一段落内尝试 citation-norm-v1：NFC、换行统一、U+3000 转空格、U+FF01–FF5E 转半角 ASCII、连续空白压缩和首尾空白处理。不采用 NFKC、标点删除、数字删除、模糊或语义匹配。原始 quote 保留；服务端添加 matchMode 和 normalizationVersion。

原函数的引文长度（trim 后 3–220 个 UTF-16 单元）和禁止省略号约束继续生效；全角句点变成省略号后也不能通过。材料上限则明确按 Unicode code point 计数。全角逗号属于允许映射的全角 ASCII；中文顿号、句号等不能任意替换。

材料上限：5 份、单份 15000 code points、总计 30000 code points。无静默截断。P0 支持文本内容协议与格式枚举；UTF-8 文件解码、浏览器上传和输入 UI 尚未接入。

## JSON Schema

模型请求/返回协议：Blue、Red、Red Verifier、Blue Rebuttal、Rebuttal Verifier。另定义 BusinessContext、SourceInput、HumanReview、CitationCandidate Schema。模型对象递归拒绝额外字段，不能自填 matchMode、normalizationVersion、classification 或覆盖 findings。

本地校验器只实现这些固定 Schema 使用的 JSON Schema 子集（type、enum、properties、required、additionalProperties、items、长度/数量/数字上下界），不是任意 JSON Schema 通用引擎；另拒绝只有空白的必填文本。未增加依赖。ID 唯一性是解析器额外领域约束，不声称由 JSON Schema 的字符串结构验证自动证明。

风险 ID、跨风险的 Claim ID、同批 Verifier claimId、同批 rebuttal challengeId 和抗辩 Claim ID 不允许重复。跨阶段 ID 归属绑定、完整审查覆盖和原始风险记录不可覆盖，需要 P1 调度器实施并测试。

## 状态机

```text
draft → blue_generating → red_generating → verifying
      → blue_revising → rebuttal_verifying → converging → completed
```

活动阶段可以进入 paused/failed/cancelled；draft 可取消；paused/failed 仅能回到服务器保存的 resumeStage，或取消。completed/cancelled 为终态。禁止重复本阶段、跳阶段、第二轮抗辩。

StageRecord 为按阶段区分的联合类型，保存输入快照、对应输出、执行状态、开始/完成时间、调用 ID、错误和 retryCount 0/1。输出与输入类型随阶段绑定，不能把任意输出泛化为 unknown。

interruptedAuditState 只将遗留活动阶段标为 paused 并保留游标，不发起请求。实际原子持久化、单次执行锁、先记账后请求、暂停/取消/失败恢复、成功阶段复用等执行保障尚未接线，不能仅凭纯状态函数宣称已完成。

预算定义：总计 10 次；五个模型阶段各最多 2 次（初始+一次修复），converging 为零请求。输出上限分别 1200/2400/1600/1400/1200，总计 7800；全部修复理论 15600。超时、失败、修复均应在 P1 计数；P0 未实现预算执行器。

## 历史数据兼容方案

1. 旧 schemaVersion:1、UUID 文件路径、SessionStore、旧路由和导出全部不变；不运行迁移、不改写真实历史数据。
2. 新审计用 schemaVersion:'gtm-audit-v1'，报告用 'gtm-report-v1'；LocalRecord 用 kind 区分旧 Session 和新审计，禁止强制转型。
3. 后续新 AuditStore 使用独立 data/audits/，材料历史快照置于审计记录或独立版本归档；不得写入旧 data/sessions/。本阶段只确定方案，未实现新 Store。
4. 已成功阶段输出、材料 revision、原始 Red 和验证结果必须保留；人工审查与 Blue 抗辩独立追加。下一阶段实现读写时使用隔离目录和合成数据验证。
5. 回滚后旧应用仍读取原格式；P0 不写任何新 GTM 数据，不影响旧应用启动。旧 Seminar 测试和合成 schema-v1 存储/重载测试通过；未对真实历史记录进行重写测试。

## 许可证与依赖

项目 LICENSE 为 MIT，未修改；未增加或更新依赖，package.json 和 package-lock.json 原字节保留。锁文件许可证元数据出现 MIT、ISC、Apache-2.0、BSD-2-Clause、BSD-3-Clause、0BSD、CC-BY-4.0。CC-BY-4.0 对应 caniuse-lite 1.0.30001820，后续分发应保留适用署名/许可。此次只是本地许可证元数据检查，未做法律认证或上游维护状态调查；无新增依赖，因此不增加新依赖运行成本。

## 后续验收边界

P1：Agent Prompt、批量语义审查、服务端 Claim Classification、引用修复/剔除、调用预算执行和失败恢复集成。P0 的注入材料测试仅证明材料被当作普通内容保留且自由文本不能通过模型输出 Schema，不证明模型端抵抗注入已验证。

P2：创建项目、文件输入、状态 UI、人工审查、确定性报告及导出。P3：Benchmark、产品文档和完整验收。真实模型调用只在明确授权后执行；当前没有真实调用，也没有商业效果实测。
