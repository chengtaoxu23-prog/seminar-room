# 亮色设计系统
2026-11-08。运行真源为tokens.css及prototype/styles.css；不引入UI依赖。亮色是已确认方向。

## 语义Token
| 组 | 主要值 | 作用 |
|---|---|---|
| surface | canvas #F7F8FC / base #FFF / nav #FCFCFF / soft #F2F3F8 / accent #F1EDFF | 页面、面板、导航、次级块、选择 |
| text | primary #202338 / secondary #586077 / muted #656D81 / on-accent #FFF | 结构、正文、辅助、主按钮 |
| border | subtle #E6E7EF / strong #CBD0DD | 面板与控件边界 |
| accent / focus | #6558D3 / hover & focus #5143BB | 主动作、选择、3px可见焦点 |
| status | success #207454 on #EAF7F0 / warning #8A5915 on #FFF5E3 / error #AA3D45 on #FFF0F1 / info #376790 on #EDF4FC | 文字与背景成对；配文字，状态不只靠颜色 |
| spacing | 4/8/12/16/20/24/32px | 字段、组件与区块分组 |
| radius | 6/8/12/14px | 小标签、控件、面板、机器人 |
| typography | 中文系统无衬线；UI14、说明12–13、正文14、文档15、标题24；文档行高1.9 | 长中文阅读优先，禁止把整段正文排成标题 |
| elevation | 轻面板投影；dialog 0 22px 90px #24203B29 | 只表达表面关系，无大面积炫光 |
| motion | 120ms反馈 / 180ms面板 | reduced-motion下0ms、禁用平滑滚动样式 |

Windows实际优先Microsoft YaHei UI/微软雅黑；macOS PingFang SC，英文Segoe UI。没有联网字体请求。角色色紫/蓝/琥珀只用于身份，运行状态另有文字；三位机器人耳部/头型/眼部细节保持同一图形语言。头像ID绑定AgentProfile，修改名字、角色或连接不改变形象与历史ID。

## Token → 组件 → 页面
| Token | 组件 | 页面 |
|---|---|---|
| surface-nav + accent-soft + text-secondary | WorkspaceNav / ProjectNav | 全页 |
| surface-base + border-subtle + radius-panel | Panel / ObjectRow / Inspector | 概览、团队、连接、任务 |
| focus + control-height / touch-target | Button / Input / Dialog / Menu / Tabs | 全页 |
| role-* + radius-avatar | RobotIdentity / MemberRow / MessageActor | 工作台、项目、团队、研讨、任务 |
| status-* + text | StatusBadge / InlineAlert / ResponseProgress | 研讨、连接、任务、空失败 |
| text-document + line-document | OutputDocument / MaterialParagraph | 成果、材料 |

## 组件协议
- 导航采用语义navigation与aria-current；项目内跳页不伪装为tabpanel。真正内容tab使用tablist/tab/tabpanel、selected/controls/labelledby，左右/Home/End可操作。
- 原生dialog包含焦点、Escape关闭；重绘向导保留原触发器。菜单展开同步aria-expanded，Escape/外部点击关闭，回触发器或可用主内容。图标按钮具有可读名称。
- Button有默认/悬停/焦点/禁用；动作进行中有文字反馈。移动操作区≥44px。只需阅读的状态标签不是按钮。
- 保存协议：未改动→输入草稿→未保存提示→手动保存→已保存；切页和刷新保留草稿；导出只使用保存版。未来保存失败必须保留编辑内容并提供重试，禁止成功toast覆盖错误。
- 失败、暂停、中断、断线是不同状态。并行显示暂停与错误；服务恢复不等于用户允许继续。已完成回应不重复，待回应用户消息保留。
- 证据卡由类型、段落、连续原文和定位构成；核验通过仅证明引文存在，不用可信度分数替代人工判断。

## 响应式
1440×900：216px稳定侧栏；主面板与上下文保持足够阅读宽度。1024×768：压缩导航与检查器，文档/材料折为主内容优先，表格允许自身滚动。390×844：抽屉导航、单列内容、成员/连接/材料列表在组件内部横向滚动；正文不横向溢出。Research Room暂停/继续/结束/推进固定于屏幕底部；插话框保留在讨论尾部，底部留白避免遮挡。Tasks先任务表、后详情、再活动，不把长活动流挡在执行入口前。

## 验证边界
本轮浏览器检查键盘、焦点、语义、无名按钮、三尺寸布局与减少动画。颜色对比另见qa/contrast-results.json。未做屏幕阅读器真人测试、设备真机触控、400%缩放及完整WCAG认证；不能用少量断言替代这些验证。
