import { config } from './config.js';
import { SessionStore } from './store.js';
import { SeminarEngine } from './seminar.js';
import { createApp } from './routes.js';

const store = new SessionStore(config.dataDir);
const engine = new SeminarEngine(store);
await engine.init();
const app = createApp(engine);

const server = app.listen(config.port, config.host, () => {
  console.log(`[seminar-room] http://${config.host}:${config.port}`);
  console.log(
    `[seminar-room] model=${config.model} endpoint=${config.baseUrlHost} configured=${config.configured ? 'yes' : 'no'}`,
  );
  console.log(
    `[seminar-room] limits rounds=${config.limits.maxRounds} calls=${config.limits.maxCalls} outputTokens=${config.limits.maxOutputTokens} timeout=${config.limits.timeoutMs}ms`,
  );
  if (!config.configured) {
    console.log(
      '[seminar-room] 未配置 OPENAI_API_KEY：真实研讨不可用，示例回放仍可查看。',
    );
  }
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[seminar-room] 端口 ${config.port} 已被占用。设置 SEMINAR_PORT 后重试。`);
  } else {
    console.error('[seminar-room] 服务启动失败:', error.message);
  }
  process.exitCode = 1;
});

function shutdown(signal: string): void {
  console.log(`[seminar-room] 收到 ${signal}，停止接收请求。`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
