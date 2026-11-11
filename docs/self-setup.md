# 自行配置千问并验收

密钥由使用者自行管理。配置文件不应发给其他人，也不应上传 GitHub。

## 第一次运行

安装 Node.js（建议 Node 22.12 或更新的受支持版本），打开 PowerShell：

```powershell
cd "你的项目目录"
npm ci
Copy-Item .env.example .env.local
notepad .env.local
```

如果已经有 `.env.local`，跳过复制，避免覆盖已有配置。

在本机编辑以下三项：

```dotenv
OPENAI_API_KEY=自行粘贴你的百炼密钥
OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
OPENAI_MODEL=qwen-plus
```

上述是北京地域常见接口；以本人百炼控制台给出的地址为准。工作空间专属地址也可填入。地域、业务空间、模型权限和密钥必须匹配。变量名以 OPENAI 开头，是兼容接口的配置名，不要求 OpenAI 账号。

对于阿里云官方接口的 Qwen 模型，程序会发送 `enable_thinking=false`，让结构化发言直接输出，避免推理过程占用小额输出预算。这项适配已经过本地测试替身验证，尚未经真实千问调用验收。

官方资料：[接口配置](https://help.aliyun.com/zh/model-studio/get-api-key/)、[思考模式](https://help.aliyun.com/zh/model-studio/deep-thinking)。

## 自行检查模型（会调用模型并消耗额度）

```powershell
npm run check:model
```

最多发送三次请求，依次检查 JSON 输出、工具调用、工具结果续答。不启动网站，不保存报告，不打印密钥、模型回复或服务商原始错误。通过不等于完整研讨通过。

- HTTP 401/403：检查密钥、地域与模型权限。
- HTTP 429：检查可用额度、账户状态与限流。
- 输出格式失败：检查模型是否支持 tools 和 JSON 输出。
- 此检查结束即停止，不自动进入完整研讨。

## 自行启动和完整验收

```powershell
npm run build
npm start
```

打开 http://127.0.0.1:4317，在另一个 PowerShell 中进入同一目录，运行：

```powershell
npm run check:live
```

这一步会产生多次真实调用、消耗额度，并保存测试会话和 `docs/live-run.json`。通过标志为 `[live] PASS`。失败就停止，先看失败阶段，不反复重跑。不要直接公开完整日志或会话；即便没有密钥，其中也可能包含材料与讨论内容。

随后用三份自带材料分别试用，人工判断参与者是否回应彼此、引用是否支持观点、材料不足时是否承认不足。真实质量需要人工判断。

## 数据与停止

相关材料和发言会发送给配置的模型服务商。会话存于本机 `data/`。停止网站可在启动终端按 Ctrl+C；调用已经发送到服务商后，不保证可以撤销服务商的计费。

如只需要让协作者继续开发，反馈“通过/失败阶段/HTTP 状态码”即可，无需提供密钥、配置文件或原始响应。
