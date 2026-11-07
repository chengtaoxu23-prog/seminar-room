import express, { type NextFunction, type Request, type Response } from 'express';
import { config } from './config.js';
import { EXAMPLE_MATERIALS } from '../examples/materials.js';
import { REPLAY_SCRIPTS, getReplay } from '../examples/replay.js';
import { AppError, SeminarEngine } from './seminar.js';
import { SessionNotFoundError } from './store.js';
import { SchemaError } from './validation.js';
import { toJson, toMarkdown } from './export.js';
import type { SummaryContent } from '../src/shared/types.js';

function asyncRoute(
  handler: (request: Request, response: Response) => Promise<void>,
): (request: Request, response: Response, next: NextFunction) => void {
  return (request, response, next) => {
    handler(request, response).catch(next);
  };
}

function bodyRecord(request: Request): Record<string, unknown> {
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
    throw new AppError(400, 'invalid_body', '请求体必须是 JSON 对象。');
  }
  return request.body as Record<string, unknown>;
}

export function createApp(engine: SeminarEngine) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use((request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');
    if (request.path.startsWith('/api/')) response.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.get('/api/health', (_request, response) => {
    response.json({
      ok: true,
      configured: config.configured,
      model: config.model,
      baseUrlHost: config.baseUrlHost,
      limits: config.limits,
      dataDir: 'data/sessions',
      ...(config.configured
        ? {}
        : {
            hint: '在 seminar-room/.env.local 设置 OPENAI_API_KEY（可同时设置 OPENAI_BASE_URL、OPENAI_MODEL），然后重启服务。密钥只在服务端读取。',
          }),
    });
  });

  app.get('/api/examples', (_request, response) => {
    response.json({ materials: EXAMPLE_MATERIALS, replays: REPLAY_SCRIPTS.map((script) => ({ ...script, material: { raw: '', segments: [] }, messages: [], summary: { ...script.summary, consensus: [], disagreements: [], evidence: [], unresolved: [] } })) });
  });

  app.get('/api/replay/:id', (request, response) => {
    const replay = getReplay(request.params.id);
    if (!replay) throw new AppError(404, 'replay_not_found', '找不到这个示例回放。');
    response.json({ replay });
  });

  app.post(
    '/api/sessions',
    asyncRoute(async (request, response) => {
      const body = bodyRecord(request);
      if (typeof body.material !== 'string' || typeof body.topic !== 'string') {
        throw new AppError(400, 'invalid_body', 'material 和 topic 必须是字符串。');
      }
      const session = await engine.create({
        material: body.material,
        topic: body.topic,
        style:
          body.style === 'evidence-first' || body.style === 'critical' || body.style === 'balanced'
            ? body.style
            : undefined,
        roles:
          body.roles && typeof body.roles === 'object'
            ? (body.roles as Record<'host' | 'a' | 'b', { name?: string }>)
            : undefined,
      });
      response.status(201).json({ session });
    }),
  );

  app.get(
    '/api/sessions/:id',
    asyncRoute(async (request, response) => {
      response.json({ session: await engine.get(request.params.id) });
    }),
  );

  app.post(
    '/api/sessions/:id/plan',
    asyncRoute(async (request, response) => {
      response.json({ session: await engine.planQuestions(request.params.id) });
    }),
  );

  app.patch(
    '/api/sessions/:id/questions',
    asyncRoute(async (request, response) => {
      const body = bodyRecord(request);
      if (!Array.isArray(body.questions) || body.questions.some((item) => typeof item !== 'string')) {
        throw new AppError(400, 'invalid_questions', 'questions 必须是三个字符串。');
      }
      response.json({
        session: await engine.updateQuestions(request.params.id, body.questions as string[]),
      });
    }),
  );

  app.post(
    '/api/sessions/:id/start',
    asyncRoute(async (request, response) => {
      response.json({ session: await engine.start(request.params.id) });
    }),
  );

  app.post(
    '/api/sessions/:id/pause',
    asyncRoute(async (request, response) => {
      response.json({ session: await engine.pause(request.params.id) });
    }),
  );

  app.post(
    '/api/sessions/:id/resume',
    asyncRoute(async (request, response) => {
      response.json({ session: await engine.resume(request.params.id) });
    }),
  );

  app.post(
    '/api/sessions/:id/end',
    asyncRoute(async (request, response) => {
      response.json({ session: await engine.end(request.params.id) });
    }),
  );

  app.post(
    '/api/sessions/:id/messages',
    asyncRoute(async (request, response) => {
      const body = bodyRecord(request);
      if (typeof body.text !== 'string') {
        throw new AppError(400, 'invalid_text', 'text 必须是字符串。');
      }
      response.json({ session: await engine.addUserMessage(request.params.id, body.text) });
    }),
  );

  app.post(
    '/api/sessions/:id/retry',
    asyncRoute(async (request, response) => {
      response.json({ session: await engine.retry(request.params.id) });
    }),
  );

  app.post(
    '/api/sessions/:id/summary',
    asyncRoute(async (request, response) => {
      response.json({ session: await engine.generateSummary(request.params.id, true) });
    }),
  );

  app.patch(
    '/api/sessions/:id/summary',
    asyncRoute(async (request, response) => {
      const body = bodyRecord(request) as unknown as SummaryContent;
      response.json({ session: await engine.updateSummary(request.params.id, body) });
    }),
  );

  app.get(
    '/api/sessions/:id/export.json',
    asyncRoute(async (request, response) => {
      const session = await engine.get(request.params.id);
      response.setHeader('Content-Disposition', `attachment; filename="seminar-${session.id}.json"`);
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.send(`${JSON.stringify(toJson(session), null, 2)}\n`);
    }),
  );

  app.get(
    '/api/sessions/:id/export.md',
    asyncRoute(async (request, response) => {
      const session = await engine.get(request.params.id);
      response.setHeader('Content-Disposition', `attachment; filename="seminar-${session.id}.md"`);
      response.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      response.send(toMarkdown(session));
    }),
  );

  app.use('/api', (_request, response) => {
    response.status(404).json({ error: { code: 'not_found', message: 'API 路径不存在。' } });
  });

  app.use(express.static(config.publicDir));
  app.get('*', (request, response, next) => {
    if (request.path.startsWith('/api')) return next();
    response.sendFile('index.html', { root: config.publicDir }, (error) => {
      if (error) {
        response
          .status(404)
          .type('text/plain')
          .send('前端尚未构建。开发时请打开 http://127.0.0.1:5173，或先运行 npm run build。');
      }
    });
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof SessionNotFoundError) {
      response.status(404).json({ error: { code: 'session_not_found', message: error.message } });
      return;
    }
    if (error instanceof AppError) {
      response.status(error.status).json({
        error: { code: error.code, message: error.message, ...(error.detail ? { detail: error.detail } : {}) },
      });
      return;
    }
    if (error instanceof SchemaError) {
      response.status(422).json({ error: { code: 'invalid_model_output', message: error.message } });
      return;
    }
    const type = (error as { type?: string }).type;
    if (type === 'entity.too.large') {
      response.status(413).json({ error: { code: 'body_too_large', message: '请求体超过 1 MB。' } });
      return;
    }
    const message = error instanceof Error ? error.message : '未知错误';
    console.error('[seminar-room] unhandled request error:', message);
    response.status(500).json({ error: { code: 'internal_error', message: '服务端内部错误。' } });
  });

  return app;
}
