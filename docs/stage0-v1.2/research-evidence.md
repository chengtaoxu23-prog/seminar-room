# 研究证据 → 设计 → 工程追踪
2026-11-08。复用既有REA研究，不重复安装或重新抓取私人工作区。历史报告中的深色建议已被本轮用户亮色决策取代。

## 来源与等级
F-R=历史REA运行观察；F-M=独立浏览器测量；F-D=官方文档；F-C=本轮本地代码核对；I=推断；S=本产品设计建议。营销首页、公开演示与登录后实际工作流是不同证据。

| ID/等级 | 可支持的事实 | 不能支持的结论 | 设计选择 | 页面 / Backlog |
|---|---|---|---|---|
| R01 F-R | 历史REA保存Linear公开演示的导航、对象、活动布局 | 未验证登录后的真实委派、后台Agent | 对象列表与执行记录分开；Task失败不覆写Run | Tasks / B14–B17 |
| R02 F-R/F-M | Linear菜单expanded及Escape在抽样中改变；Notion同次Escape行为不同 | 不能声称竞品键盘交互相同 | 本产品自行实现Escape/焦点恢复与明确aria状态 | 全页 / B02 |
| R03 F-D | [Linear Concepts](https://linear.app/docs/conceptual-model)：issue属于team并进入工作流，支持项目/负责人关联；V1.1时读取 | 不直接移植其完整领域或权限 | Project、Task、Assignment与Run分离 | IA、domain / B01、B14 |
| R04 F-D | [Notion Workspace](https://www.notion.com/help/intro-to-workspaces)：侧栏组织内容，编辑区承载工作内容；V1.1时读取 | 没有登录实测其协作版本或权限 | 稳定导航；文档独立阅读；来源按需展开 | Output / B04、B18 |
| R05 F-M | 既有抽样1440/1024/390测量中导航随视口变化 | 页面营销字号不是应用规范 | 采用本产品中文阅读尺度、44px移动控件 | tokens / B02 |
| R06 F-C | RoleKey=host/a/b、SeminarSession.schemaVersion=1，单provider；无Project/Task/Connection CRUD | UI显示连接列表不能证明真实多模型 | 单独的合成原型，阶段2再适配连接层 | Connections / B08–B12 |
| R07 F-C | pendingUserMessageIds/userResponses、store中断恢复、Room总结刷新 | 原型断言不是后端回归证据 | 队列、部分成功、暂停错误、结束总结分别建状态 | Room / B06、B07 |
| R08 S | 用户给定六张概念图（作者提供的六张概念图；未随公开包重发） | 数量、费用、可信度、在线状态均为虚构 | 用本地合成对象计数；不显示假费用/百分比/可信度 | 八页 / B03–B05 |
| R09 F-D | [WAI Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)与[Tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)V1.1时读取 | 不是完整WCAG认证 | 原生dialog焦点约束、Escape；导航不用伪tab，内容tab关联面板 | 全页 / B02 |

## 架构参考的使用边界
Grokbot/群体Agent体验、ChatGPT对话交互是任务书提供的方向，没有在本轮登录操作，不新增“实测”声明。机器人形象为本原型自绘SVG。DeepSeek Harness Router/Worker、事件与Watchdog依据Drive已确认架构方向，作为S，不声称阅读了其私有实现。没有复制竞品代码或图片资源。

REA历史资料在作者本地留存，原始捕获和私人Drive文档未随公开基线发布；以下设计决策与官方公开来源可供复核。历史REA公开首页观察有范围限制，不能等同于登录后工作流实测。V1.2只复核本轮相关代码/状态，不重新声称执行历史REA捕获。

## 六张参考图拆解与修订
| 图 | 保留机制 | 本轮差异 / 理由 |
|---|---|---|
| 01 Workspace | 项目续接、团队、最近活动、待审 | 精简为当前合成对象的计数；不绘制虚构存储使用率与API成本 |
| 02 Project | 目标、统一项目内导航、任务与成果 | 不显示48%等无来源进度；阶段1索引兼容Session，不把Session改名成Project |
| 03 Team | 机器人、持久身份与职责配置 | 中文；名字/职责/连接ID分离；权限仅原型，不展示长期记忆已启用 |
| 04 Room | 可追溯时间线、来源、插话、控制 | 保留固定三角色；无自动分配与假百分比；失败和暂停可同时呈现 |
| 05 Output | 文档优先、目录、来源、编辑/保存/导出 | 五部分总结；不摆放无效富文本工具栏；版本与审查明确未来原型 |
| 06 Connections | 独立连接、按成员分配、测试结果 | 不接收密钥；example.invalid；实际模型未验证；模拟测试不变成真实通过 |

证据链不以“像Linear”收尾：R03→Task/Run不混用→B14/15→路径C；R04→成果优先→B04/18→路径B；R07→六项保护→B06/07→qa/verification-summary.json（本地较新工作版本）及浏览器状态截图。

V1.2追加可靠性依据：Node fs官方API不替项目保证跨文件事务；SQLite原子提交与备份文档支持B23评审。URL及具体决策见technical-architecture.md ADR-01。未在本轮接入新数据库。
