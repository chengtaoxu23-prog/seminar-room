# SeminarRoom V1.2 · 阶段0正式产品基线
2026-11-08。**AI Research & Collaboration Workspace**：AI团队围绕目标分析、分工、执行、交接、核验和修订；成果是可验收交付物。教学研究是首个内置应用。

本目录是正式设计/技术约束，产品仍为Alpha。阶段1未启动；Project、持久Agent、多模型、任务引擎、共同写作和持久执行均不能因这次文档发布而写成已上线。

## 文档入口

- [产品策略](product-strategy.md) · [信息架构](information-architecture.md) · [领域模型](domain-model.md) · [完整工作流](user-workflows.md)
- [设计系统](design-system.md) · [八页规格](page-specifications.md) · [研究依据](research-evidence.md)
- [技术架构与可靠性](technical-architecture.md) · [阶段0–5路线](iteration-roadmap.md) · [Backlog](implementation-backlog.md) · [Alpha保护映射](alpha-state-mapping.md)
- [修订与验收](acceptance-report.md) · [缺陷记录](defect-log.md) · [视觉检查](visual-review.md) · [版本/阶段真源](baseline.json)
- [独立原型](prototype/index.html) · [正式截图](screenshots/index.html)

## 运行与审查

在此目录启动静态服务器（不启动Alpha，不接入真实API）：
```powershell
python -m http.server 4350 --bind 127.0.0.1 --directory .
# http://127.0.0.1:4350/prototype/#workspace
```
零运行依赖，HTML/CSS/JS/SVG。CSP禁止网络连接，不接收API Key。独立存储键`seminarroom-v12-stage0-baseline-v1`，不读取旧原型或真实Session；重置只作用于此键。

三条路径沿用V1.1：A创建项目→材料/团队/规划连接→问题→研讨/插话/暂停继续→总结；B引文→原文→具体消息→编辑保存/导出；C任务指派→失败/新Run重试→上游交接→冻结候选正文审阅→原样应用。C完全是未来合成原型，每项目仅一场演示Session。Tasks“工作流蓝图”展示完整目标链，未实现自主Coordinator。

## 检查复现

`qa/browser-check.mjs`复用仓库已有playwright-core。设置`SEMINAR_REPO_ROOT`指向仓库（可自动向上查找）、`BROWSER_EXECUTABLE`指定已安装Edge/Chrome、`SEMINAR_DESIGN_BASE_URL`默认`http://127.0.0.1:4350`；`SEMINAR_DESIGN_QA_DIR`可指定**仓库外**测试输出。默认输出到系统临时目录，不把日志、下载和临时截图混入正式基线。运行`node qa/browser-check.mjs`与`python qa/contrast-check.py`。

正式截图是经审查的设计交付物，测试原始日志、真实Session、私人Drive资料、机器路径、用户配置与历史未提交改动均不提交。本轮未调用真实模型、未增加依赖、未改生产业务或部署；只提交本目录和必要文档入口，不创建Release/Tag。

## 阶段门禁

阶段1真实Project→Session→Output；阶段2国内优先多模型与持久身份，紧接阶段1不可无限延期；阶段3自主任务分工/交接/恢复；阶段4共同研究/证据审查/写作；阶段5长期记忆/工具/事件驱动与自主运行。Sidecar是过渡，最迟在阶段3持久Run上线前完成事务存储退出门禁。真实多模型验收仍是阶段2必须项，本轮不执行。
