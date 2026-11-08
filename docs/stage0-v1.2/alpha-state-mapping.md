# Alpha状态 → 界面 → 回归证据
2026-11-08。本表对应较新本地未提交修复工作版本，公开main较早，结果不能互相替代。生产状态只由服务器决定；本轮原型为合成映射，两类测试证据分开。

| 真源字段/组合 | 设计显示与操作 | 本地实现触点 | 本轮证据 |
|---|---|---|---|
| stage=draft | 材料/问题确认；不自动开始 | Setup、seminar.plan/start | 路径A；alpha Mock E2E三个问题 |
| stage=running + activity.phase/actorId | 具体成员正在处理/其他成员等待；暂停与结束 | Room、WorkspaceUI、SeminarEngine | Alpha单测/Mock；原型仅用户推进 |
| stage=paused | 已暂停；在途可能完成；保留插话、继续/结束 | pause不等于abort，run loop检查stage | Mock暂停消息7→7；原型暂停与插话 |
| stage=paused + stopReason=interrupted | 中断、保留进度、等待手动继续；不自动调用 | store加载恢复、SeminarEngine.resume | alpha恢复测试子进程；state-interrupted-manual |
| stage=paused + lastError | 暂停与失败同时可见，不能盖住错误 | Room错误区；seminar错误处理 | state-paused-failure与alpha生命周期测试 |
| stage=error + pendingUserMessageIds | 调用失败、待回应队列保留、重试未完者 | userResponses.completed/failedActor | state-retry-preserved-A；alpha recovery测试 |
| pendingUserMessageIds + userResponses | 每条插话分别required/completed，完成后才清pending | seminar.responseProgress/runParticipant | 原型多条插话断言 + alpha单测 |
| stage=ended + pending仍有值 | 已结束，但这些插话未完成；不得显示全部回应 | end保留pending；Room进度 | alpha recovery/lifecycle；原型end不清pending |
| 主持人action=end / stopReason | 收束后无新host/participant调度 | seminar已有end guard与恢复逻辑 | alpha生命周期；原型ended无推进/继续入口 |
| summary.status=none | 结束后允许显式总结，保留讨论 | generateSummary | Room与新项目空成果状态 |
| ended + summary=generating | 讨论结束且总结生成中；仍需刷新 | Room轮询条件以summary终态为准 | state-ended-summary-generating；原型刷新后总结ready断言 |
| summary=ready | 阅读/编辑/保存/MD JSON | SummaryPanel/API/export | 路径B下载内容断言与alpha E2E |
| summary=error | 总结失败，保留消息，显式重试 | generateSummary错误契约 | state-summary-error；原型重试可完成 |
| calls / decisions | 调用与调度记录：purpose、role、model、tools、usage、errors；配置≠响应身份 | 现有CallLog/DecisionRecord；未来B11扩展 | 原型记录检查器无真实数据，state-audit-inspector |
| material.segments + citation | 合法paragraph ID + 连续原文quote；不合法不得升级为证据 | server/validation.ts；MaterialPanel | alpha引用校验测试；flow-B-source-highlight |

六项保护门禁：①中断不丢pending；②成功回应不重放；③重启不自动续调；④host结束不再调度；⑤paused失败不被遮盖；⑥手动ended后总结刷新到ready/error。生产逻辑未改，本轮在隔离副本重复执行其测试，原型另作交互断言。

## 兼容边界
当前只实现单provider，CallLog.model是配置标识，不能冒充返回模型。原型展示配置示例与“未验证”，不把消息数推算为真实调用数。断线/保存失败演示为UI夹具，没有新建生产API。原型导出合成格式与Alpha schema-v1导出不是同一种文件；后续工程必须继续通过Alpha原导出断言。
