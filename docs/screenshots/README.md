# 截图说明

所有截图均为本项目界面的实际截图，使用 Microsoft Edge + Playwright 在 1440×1000（桌面）或 390×844（窄屏）下拍摄。

| 文件 | 内容 | 是否为真实模型运行 |
| --- | --- | --- |
| `landing.png` / `landing-full.png` | 首页；服务端未配置密钥的状态 | 否（未调用模型） |
| `landing-mobile.png` | 390px 首页 | 否 |
| `replay-full.png` | 示例回放完成态 | 否，示例回放 |
| `replay-user-interjection.png` | 示例回放中的用户插话与直接回应 | 否，示例回放 |
| `setup-e2e-mock.png` | 问题确认页 | **否，本地测试替身** |
| `room-e2e-mock.png` | 三角色讨论中 | **否，本地测试替身** |
| `room-user-interjection-e2e-mock.png` | 用户插话得到直接回应 | **否，本地测试替身** |
| `room-summary-e2e-mock.png` | 可编辑总结 | **否，本地测试替身** |
| `tech-trace-e2e-mock.png` | 真实调用记录抽屉 | **否，本地测试替身** |
| `room-mobile.png` | 390px 讨论室 | **否，本地测试替身** |

`e2e-mock` 截图来自浏览器端到端测试；模型由 `scripts/mock-openai.mjs` 扮演，模型名明确为 `e2e-mock-not-a-real-model`。这些截图证明 UI 与 API 流程，不证明真实模型能力。

**当前没有真实模型运行截图**，因为交付环境未提供 API 密钥。配置后可运行 `npm run check:live`；它会把真实运行报告写到 `docs/live-run.json`，不会自动生成截图。
