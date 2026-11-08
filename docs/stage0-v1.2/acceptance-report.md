# V1.2 阶段0最终审查与发布验收
2026-11-08。结论：现有八页与亮色设计保留，完成必要的产品/技术修订；阶段0形成正式基线，阶段1没有启动。GitHub提交与推送的实际回执由本轮发布完成后单独报告，不能从本文件推定远端已更新。

## 发现与实际修订

| 问题 | 修订 | 对应证据 |
|---|---|---|
| 旧定位强调成果，AI团队完整工作链不够具体 | 明确工作流为核心、成果为交付物；新增完整执行契约，而非复制另一份IA | product-strategy、user-workflows |
| 旧阶段编号与用户V1.2不同 | 阶段0–5统一；阶段2同时交付国内多模型与持久身份，紧接阶段1 | baseline.json、roadmap、Backlog、Studio标签 |
| Sidecar退出/恢复/回退不明确 | 单一写源、临时写/sync/平台替换验证、generation备份、intent恢复；最迟阶段3持久Run前事务迁移 | architecture ADR-01、B23/B24 |
| Task审批显示当前稿，批准后却再生成新稿 | 提交先冻结候选正文、baseVersion和SHA-256；弹窗审阅候选，批准原样应用；旧基线拒绝批准 | 原型候选内容/hash测试与flow-C-approval截图 |
| 依赖交接停留在隐式顺序 | Task dependencyIds；Run inputRefs消费上游候选；Task蓝图补Coordinator到交付链路 | V1.2 workflow检查、路径C |
| 测试脚本绑定作者机器路径；公开main与本地状态易混淆 | QA改为仓库发现/环境变量；分别测试公开8项与本地34计数项；公开包排除私人来源与临时日志 | verification-summary、发布允许清单 |

## 保留与理由
八页、空间/项目双层导航、亮色Token、三机器人图形身份、原文与推断分开、独立成果阅读/编辑、三条原型路径保留。它们已覆盖主要任务，V1.2问题集中在执行契约与可靠性；没有为视觉偏好重新绘制页面。没有新增UI、数据库或运行依赖。

## 测试结果（本轮实际执行）

| 检查 | 结果 | 边界 |
|---|---|---|
| 原型node --check | 通过 | 静态JS语法 |
| 原型浏览器 | 40项通过，0失败；pageErrors=[]、externalRequests=[] | 原38项回归保留，路径C加强候选hash/正文与上游refs断言，新增完整蓝图/依赖/过期候选检查 |
| 三尺寸 | 8页×1440×900、1024×768、390×844，整页无水平溢出 | Edge视口，不声称真机/Safari/Firefox验收 |
| 配色 | 9组核心语义文字/背景≥4.5:1 | 不等于所有文字或完整WCAG认证 |
| 公开Alpha基线d5ad8d4 | typecheck、8单测、build、Mock E2E/visual通过；13调用记录行、暂停7→7、编辑/导出通过 | 未发布本地生产修复，不能称六修复已同步到公开代码 |
| 较新本地Alpha保护副本 | typecheck、34计数项、build、Mock E2E/visual通过；15调用记录行 | 包含用户原有未提交修改；34含父子计数，不是34个独立用户场景；不纳入本轮提交 |

原始日志、下载文件、完整截图在本地交付的qa/results内保留。公开仓库只提交经审查的设计截图、可复现脚本与[正式结果摘要](qa/verification-summary.json)，不提交临时运行目录或合成会话JSON。公开Alpha旧E2E使用硬编码端口/截图路径，本轮在临时运行副本中仅重定向visual URL至4319、依赖解析及输出位置；原断言/生产源码未修改。Mock服务仅4318/4319/4320，静态原型4350，不启停稳定部署。

## 文档清单
README、product-strategy、information-architecture、domain-model、user-workflows、research-evidence、page-specifications、design-system/tokens、technical-architecture、iteration-roadmap、implementation-backlog、alpha-state-mapping、defect-log、visual-review、baseline.json；prototype及qa复现脚本；screenshots正式图集。根README、docs/product、docs/release-status、docs/test-record、HANDOFF仅加正式基线入口和发布范围，不覆写旧历史。

## 未解决事项与优先级
- **P0，下一阶段入口**：公开main尚未包含较新本地六项回归修复；B01必须另行审查同步并验证后，才开始真实Project功能。本次按边界不夹带生产修改。
- **P1，阶段1/3门禁**：现Alpha普通writeFile不提供新设计的原子写/备份/事务保证。B24为阶段1门禁，B23为阶段3持久Run上线前门禁；本轮只有设计，不虚构可靠性实现。
- **P1，阶段2完成门禁**：国内不同模型/跨厂商真实协作须另有额度与授权；本轮未执行，既不能取消也不能改成选做。
- **P2，后续按范围**：每项目一场合成Session、全局库代表页、固定三成员、无真实权限执行、无协同diff；屏幕阅读器/真机软键盘/完整WCAG尚未验收。均已标明原型或规划。

没有尚未说明的阶段0设计阻断项。以上工程门禁不因设计发布而视为完成。用户未授权阶段1，发布完成后停止；不创建Release/Tag。
