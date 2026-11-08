# 八类核心页面规格
2026-11-08。所有页面共享导航、亮色Token、机器人身份及“合成示例、不连接真实模型”常驻提示。下列目标组件名是后续React复用接口，不代表本轮新建生产组件。

## 1. Workspace / workspace
组件树：Shell → Heading/CreateProject → ObjectMetrics → ContinueProject → ProjectFilters/ProjectCards；侧区TeamSummary/RecentActivity/ReviewQueue。第一优先是继续研究和创建，第二为找项目，最后才是汇总数字。数字从原型对象计数，不生成采用率、费用或成功率。
交互：向导四步，内联编辑成员，前后步保留输入；项目名/目标必填、材料≥20字；连接仅规划配置。查找支持页面、项目名及当前材料。空筛选可恢复，错误可重试；全局空/加载状态可用“状态演示”复现。
1440主区+侧区；1024收窄侧区；390单列，指标2×2。全局Projects/Agents等目标导航在原型进入代表页面，尚无完整全局资产管理。

## 2. Project Overview / project
组件树：ProjectHeader → ProjectNav → Goal / Phase / TaskRows / MaterialRows / ArtifactCard；ProjectTeam/ObjectGlossary/Activity。目标和产物优先，跨会话持续性来自未来Project实体。会话数来自当前合成消息是否存在，成果未生成显示空状态。
运行入口：draft会话进入问题规划；已有会话回Room，原型不重复覆盖历史。新建项目材料/会话/成果/任务隔离，切项目恢复。阶段1需补真正Session列表与多会话创建。阶段卡不显示无依据百分比。
390将各组纵排，六项项目导航紧凑可达；空成果仍允许返回规划。

## 3. Agent Team / Studio / team
组件树：ProjectNav → MemberList → ProfileHeader / IdentityFields / MembershipFields / ConnectionBinding / PermissionChecklist / WorkHistory。名字、项目职责、底层连接分栏，连接引用ID。三位机器人跨页面同形同名；工作记录来自合成事件。
选择成员、编辑名称/职责/风格、保存；空名称拒绝。修改不改变Agent ID或历史Run执行者。权限只演示，不授真实工具权限。不提供虚假的“创建无限Worker”操作。
1440列表+详情；1024收窄；390列表组件内横滑、详情纵排，保存按钮完整宽度。

## 4. Research Room / room
组件树：SessionHeader → StageRail / PendingResponse / Error / Interrupted / Offline → Timeline(MessageActor/BlockType/Addresses/Citation) + Composer(RunControls/TextInput)；Inspector以Team/Material/Evidence/记录 tabs切换。
优先显示谁在处理/回应谁、原文/推断、当前stage与summary各自状态。固定三角色不伪装动态Router；每次推进是用户触发合成动作。引用去原文并返回具体Message ID；暂停可保存插话；恢复不重复已成功回应；结束后总结独立更新。断线保留输入，不允许推进执行；重连后仍由用户发送/继续。
状态夹具：draft、running、partial error、paused error、interrupted、ended/generating、ended/ready、offline。模型背景与原文证据分别标记。390将Inspector放在时间线之后，重要控制固定底部且有文字，插话框可滚动到达。

## 5. Research Output / output
组件树：ArtifactHeader/Version/Edit/Export → Outline + DocumentToolbar/ReadDocument|Editor + Sources|Review。内容最优先；目录用于长页锚点；证据可定位；审查明确未来原型。
阅读/编辑切换保留草稿；输入即时显示未保存；刷新保留；保存产生合成版本并使旧批准失效；MD/JSON仅导出保存版，含notice。若任务交接遇未保存草稿先阻止覆盖。目录映射实际章节，不将正文全做h2。
空成果提示返回项目；generating展示独立加载。版本列表目前仅合成历史，缺少真实diff/恢复/并发编辑，阶段4落实。390目录变紧凑条，文档与证据纵排，导出菜单完整可操作。

## 6. Model Connections / connections
组件树：BoundaryNotice → ConnectionList + ConfigDetail(TestAction/BasicFields/CredentialPlaceholder/TestResult/MemberAssignment)。连接配置、能力测试、实际调用身份是三个证据层级。配置模型≠服务端返回模型；未验证不以连接名称填空。
添加示例、改名和配置模型、按成员选择稳定connectionId、模拟测试中→已模拟通过。无API Key输入、查看或复制控件；地址example.invalid只读；无真实网络。安全提示说明目标服务端保管而非声称已经加密实现。空/错误可用统一状态演示；真实连接超时/鉴权/限流错误是B10验收。
390列表内部横滑，详情纵排，测试按钮整行。用量显示无数据，不伪造零费用意味着已测试。

## 7. Materials & Evidence / materials
组件树：MaterialList + SourceDocument(StableParagraph/Highlight/ReverseLinks) + EvidenceTypes。原文与证据主张分开；段落显示完整连续原文，高亮定位；反向链接只列真实引用该段的合成消息，不把固定m2挂到所有材料。
新增材料验证长度并追加稳定编号，不重新编号旧段；点击引用保留Message入口；回Room标记具体消息。Evidence类型含原文/模型背景/推断。原型不实现PDF/URL读取、OCR或外部来源验证。
390选择器内部横滑，原文阅读优先，证据登记在下方。长中文自动换行，无整个页面横向滚动。

## 8. Tasks & Activity / tasks
组件树：TaskTable → SelectedTask(Assignment/Controls/RunAttempts/Approval) + ActivityTimeline。Task是工作单元；Run为一次尝试，保存不可变agentId/当时姓名/attempt。依赖未完成禁用启动；失败记录保留，重试追加Run；提交交接更新成果；需审批任务冻结待应用候选版本与hash，基于当前保存版；批准后候选原样应用一次。
运行中不允许改指派；失败后重新指派不改旧Run。T02边界检验完成解锁T03整合；T03提交后待人审。拒绝转待修改，批准转完成；同交接不可重复建版本。未保存成果阻止覆盖。活动记录合成事件，不能充当真实调用日志。
390任务表→详情→活动，防止用户滚过长日志才能见操作。表格/长Run ID在组件内换行或滚动，错误和审批均以文字表达。

## 跨页验收
截图命名`<route>-<width>.png`为精确视口，`-full.png`为可滚动完整页面。三种宽度的八页均保存；关键状态截图以state-/flow-前缀。不可将原型的浏览器PASS写成真实生产后端或跨模型PASS。

补充状态：成果保存失败保留草稿，手动重试后保存；总结失败保留讨论可重试；连接失败仍不声称真实身份。Room记录检查器区分配置、响应身份、调用/调度字段，原型明确无真实日志。审批意见与目标版本保存为合成记录。

## V1.2必要修订
八页与亮色视觉不变。Tasks“工作流蓝图”补齐完整目标链；依赖采用Task ID集合，Run保存输入交接refs，失败/换成员不改历史。T03提交后冻结候选正文、baseVersion、版本和SHA-256；审批弹窗展示此候选，批准原样应用。旧基线变化转待修改，拒绝后新Run形成新候选；禁止批准旧版后另生成新内容。全部仍为合成演示，不声称Coordinator自主运行。Stage2同时交付连接与持久Profile/Membership。
