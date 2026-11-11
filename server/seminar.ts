import { createHash, randomUUID } from 'node:crypto';
import type {
  CallLog,
  CallRole,
  DiscussionQuestion,
  HostAction,
  MaterialSegment,
  ParticipantMeta,
  PlannerQuestion,
  RoleKey,
  SeminarMessage,
  SeminarSession,
  StatementBlock,
  SummaryContent,
  SummaryEvidence,
  TokenUsage,
} from '../src/shared/types.js';
import { DEFAULT_ROLES } from '../src/shared/types.js';
import { segmentMaterial, searchSegments } from '../src/shared/material.js';
import { config as defaultConfig, type AppConfig } from './config.js';
import { LlmRequestError, chatCompletion, type LlmMessage, type LlmResponse, type LlmToolDefinition } from './llm.js';
import {
  MATERIAL_TOOL,
  buildHostSystem,
  buildHostUser,
  buildParticipantSystem,
  buildParticipantUser,
  buildPlannerMessages,
  buildRepairMessage,
  buildSummaryMessages,
} from './prompts.js';
import { SessionNotFoundError, SessionStore } from './store.js';
import {
  SchemaError,
  emptySummary,
  extractJson,
  parseHostAction,
  parseParticipant,
  parsePlannerQuestions,
  parseSummary,
  validateCitation,
} from './validation.js';

type LlmFunction = typeof chatCompletion;

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

class BudgetError extends Error {
  constructor() {
    super('模型调用预算已用尽。');
    this.name = 'BudgetError';
  }
}

interface Runtime {
  busy: boolean;
  abort: AbortController;
  rerun: boolean;
}

interface CallMeta {
  role: CallRole;
  actorId: CallRole | RoleKey;
  actorName: string;
  purpose: CallLog['purpose'];
  round: number;
  schemaRetry: boolean;
}

interface TurnResult {
  content: string;
  callId: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function safeMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text
    .replace(/sk-[A-Za-z0-9_-]{6,}/g, 'sk-[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .slice(0, 700);
}

function newUsage(): TokenUsage {
  return { promptTokens: null, completionTokens: null, totalTokens: null };
}

function recomputeUsage(session: SeminarSession): void {
  const usage = {
    calls: session.calls.length,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    usageMissingCalls: 0,
  };
  for (const call of session.calls) {
    if (call.status === 'ok') {
      if (call.usage.totalTokens === null) {
        usage.usageMissingCalls += 1;
      } else {
        usage.totalTokens += call.usage.totalTokens;
      }
      usage.promptTokens += call.usage.promptTokens ?? 0;
      usage.completionTokens += call.usage.completionTokens ?? 0;
    }
  }
  session.usage = usage;
}

function clip(text: string, limit: number): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length <= limit ? compact : `${compact.slice(0, limit)}…`;
}

function makeMessage(input: {
  role: SeminarMessage['role'];
  actorId: SeminarMessage['actorId'];
  actorName: string;
  kind: SeminarMessage['kind'];
  round: number;
  text: string;
  blocks?: StatementBlock[];
  addresses?: string[];
  hostAction?: HostAction;
  participant?: ParticipantMeta;
  callId?: string;
}): SeminarMessage {
  return {
    id: randomUUID(),
    role: input.role,
    actorId: input.actorId,
    actorName: input.actorName,
    kind: input.kind,
    round: input.round,
    text: input.text,
    blocks: input.blocks ?? [],
    addresses: input.addresses ?? [],
    ...(input.hostAction ? { hostAction: input.hostAction } : {}),
    ...(input.participant ? { participant: input.participant } : {}),
    ...(input.callId ? { callId: input.callId } : {}),
    createdAt: nowIso(),
  };
}

function contextHash(messages: LlmMessage[]): string {
  return createHash('sha256')
    .update(messages.map((message) => `${message.role}:${message.content}`).join('\n---\n'))
    .digest('hex')
    .slice(0, 12);
}

function isUserMessage(session: SeminarSession, id: string): boolean {
  return session.messages.some((message) => message.id === id && message.role === 'user');
}

function isEnded(session: SeminarSession): boolean {
  return session.stage === 'ended';
}

const backgroundByDirectory = new Map<string, Set<Promise<void>>>();

export class SeminarEngine {
  private readonly cache = new Map<string, SeminarSession>();
  private readonly runtimes = new Map<string, Runtime>();
  private readonly activeRequests = new Set<string>();

  constructor(
    private readonly store: SessionStore,
    private readonly appConfig: AppConfig = defaultConfig,
    private readonly llm: LlmFunction = chatCompletion,
  ) {}

  private trackBackground(task: Promise<unknown>): void {
    const key = this.store.directory;
    const tasks = backgroundByDirectory.get(key) ?? new Set<Promise<void>>();
    backgroundByDirectory.set(key, tasks);
    const tracked = task.then(() => undefined, () => undefined);
    tasks.add(tracked);
    void tracked.finally(() => {
      tasks.delete(tracked);
      if (!tasks.size && backgroundByDirectory.get(key) === tasks) backgroundByDirectory.delete(key);
    });
  }

  /** Observation/drain only: does not start, stop, retry or change any session. */
  async waitForIdle(timeoutMs = 5000): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const drain = async () => {
      while (true) {
        const tasks = [...(backgroundByDirectory.get(this.store.directory) ?? [])];
        if (tasks.length) await Promise.all(tasks);
        await this.store.flush();
        if (!(backgroundByDirectory.get(this.store.directory)?.size)) return;
      }
    };
    try {
      await Promise.race([drain(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Session background work did not settle.')), timeoutMs); })]);
    } finally { if (timer) clearTimeout(timer); }
  }

  async init(): Promise<void> {
    await this.store.init();
    for (const id of await this.store.ids()) {
      try { await this.getSession(id); }
      catch { console.error(`[seminar-room] 无法恢复会话 ${id}，原文件保留。`); }
    }
  }

  private async getSession(id: string): Promise<SeminarSession> {
    const cached = this.cache.get(id);
    if (cached) return cached;
    const session = await this.store.get(id);
    // Loading a persisted running session never starts a worker or spends API credits.
    if (session.stage === 'running') {
      session.stage = 'paused';
      session.stopReason = 'interrupted';
      session.activity = { phase: 'idle', actorId: null, label: '', startedAt: null };
      session.lastError = { code: 'session_interrupted', message: '服务曾中断。已完成的发言已保留，点击继续后才会恢复调用。', at: nowIso(), retryable: true };
      await this.persist(session);
    }
    this.cache.set(id, session);
    return session;
  }

  private async persist(session: SeminarSession): Promise<void> {
    session.updatedAt = nowIso();
    recomputeUsage(session);
    await this.store.save(session);
  }

  private ensureConfigured(): void {
    if (!this.appConfig.configured) {
      throw new AppError(
        503,
        'model_not_configured',
        '服务端未配置模型 API。请设置 OPENAI_API_KEY，并重启服务。',
      );
    }
  }

  private remainingRoleCalls(session: SeminarSession): number {
    // Reserve the final call for the summary. A role/tool call may not consume it.
    return session.limits.maxCalls - session.calls.length - 1;
  }

  private assertBudget(session: SeminarSession, reserveSummary = true): void {
    const remaining = reserveSummary
      ? this.remainingRoleCalls(session)
      : session.limits.maxCalls - session.calls.length;
    if (remaining <= 0) throw new BudgetError();
  }

  private async logRequest(
    session: SeminarSession,
    meta: CallMeta,
    messages: LlmMessage[],
    options: { tools?: LlmToolDefinition[]; signal: AbortSignal },
  ): Promise<{ response: LlmResponse; call: CallLog }> {
    const started = Date.now();
    const startedAt = nowIso();
    const id = randomUUID();
    const hash = contextHash(messages);
    this.activeRequests.add(session.id);
    try {
      const response = await this.llm(messages, {
        tools: options.tools,
        signal: options.signal,
        maxTokens: session.limits.maxOutputTokens,
        timeoutMs: session.limits.timeoutMs,
      });
      const call: CallLog = {
        id,
        role: meta.role,
        actorId: meta.actorId,
        actorName: meta.actorName,
        purpose: meta.purpose,
        round: meta.round,
        model: this.appConfig.model,
        startedAt,
        durationMs: Date.now() - started,
        status: 'ok',
        httpStatus: response.httpStatus,
        usage: response.usage,
        outputChars: response.content.length,
        contextHash: hash,
        toolCalls: [],
        schemaRetry: meta.schemaRetry,
      };
      session.calls.push(call);
      await this.persist(session);
      return { response, call };
    } catch (error) {
      const aborted = error instanceof LlmRequestError && error.kind === 'aborted';
      const call: CallLog = {
        id,
        role: meta.role,
        actorId: meta.actorId,
        actorName: meta.actorName,
        purpose: meta.purpose,
        round: meta.round,
        model: this.appConfig.model,
        startedAt,
        durationMs: Date.now() - started,
        status: aborted ? 'aborted' : 'error',
        httpStatus: error instanceof LlmRequestError ? error.status : null,
        usage: newUsage(),
        outputChars: 0,
        contextHash: hash,
        toolCalls: [],
        schemaRetry: meta.schemaRetry,
        error: safeMessage(error),
      };
      session.calls.push(call);
      await this.persist(session);
      throw error;
    } finally {
      this.activeRequests.delete(session.id);
    }
  }

  private materialToolResult(
    session: SeminarSession,
    toolCall: { function: { name: string; arguments: string } },
  ): { content: string; call: CallLog['toolCalls'][number] } {
    const args = (() => {
      try {
        return JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>;
      } catch {
        return {};
      }
    })();
    let chosen: MaterialSegment[] = [];
    let name = toolCall.function.name;
    if (name !== 'read_material') {
      return {
        content: `工具 ${name} 不存在。可用工具只有 read_material。`,
        call: {
          name,
          args,
          resultChars: 0,
          segmentIds: [],
          at: nowIso(),
        },
      };
    }
    const ids = Array.isArray(args.ids)
      ? args.ids
          .filter((value): value is number => typeof value === 'number' && Number.isInteger(value))
          .slice(0, 4)
      : [];
    if (ids.length) {
      chosen = session.material.segments.filter((segment) => ids.includes(segment.id));
    }
    if (typeof args.query === 'string' && args.query.trim()) {
      const found = searchSegments(session.material.segments, args.query, 4);
      const map = new Map([...chosen, ...found].map((segment) => [segment.id, segment]));
      chosen = [...map.values()].sort((a, b) => a.id - b.id).slice(0, 4);
    }
    if (!chosen.length) {
      chosen = session.material.segments.slice(0, 2);
    }
    let content = chosen
      .map((segment) => `【材料 ${segment.id}】\n${segment.text}`)
      .join('\n\n');
    if (content.length > 6000) content = `${content.slice(0, 6000)}\n…（工具结果已截断）`;
    return {
      content,
      call: {
        name,
        args,
        resultChars: content.length,
        segmentIds: chosen.map((segment) => segment.id),
        at: nowIso(),
      },
    };
  }

  private async agentCompletion(
    session: SeminarSession,
    meta: CallMeta,
    inputMessages: LlmMessage[],
    options: { tools?: LlmToolDefinition[]; signal: AbortSignal; reserveSummary?: boolean },
  ): Promise<TurnResult> {
    const messages = [...inputMessages];
    let lastCallId = '';
    for (let toolRound = 0; toolRound < 3; toolRound += 1) {
      this.assertBudget(session, options.reserveSummary ?? true);
      const { response, call } = await this.logRequest(session, meta, messages, {
        tools: options.tools,
        signal: options.signal,
      });
      lastCallId = call.id;
      if (response.toolCalls.length > 0) {
        if (toolRound >= 2) {
          throw new SchemaError('模型连续 3 次请求工具，已停止本轮。');
        }
        messages.push({
          role: 'assistant',
          content: response.content,
          tool_calls: response.toolCalls,
        });
        for (const toolCall of response.toolCalls) {
          const result = this.materialToolResult(session, toolCall);
          call.toolCalls.push(result.call);
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result.content,
          });
        }
        await this.persist(session);
        continue;
      }
      return { content: response.content, callId: lastCallId };
    }
    throw new SchemaError('工具调用没有收敛。');
  }

  private async setActivity(
    session: SeminarSession,
    phase: SeminarSession['activity']['phase'],
    actorId: SeminarSession['activity']['actorId'],
    label: string,
  ): Promise<void> {
    session.activity = {
      phase,
      actorId,
      label,
      startedAt: phase === 'idle' ? null : nowIso(),
    };
    await this.persist(session);
  }

  async create(input: {
    material: string;
    topic: string;
    roles?: Partial<Record<RoleKey, { name?: string }>>;
    style?: SeminarSession['config']['style'];
  }): Promise<SeminarSession> {
    const material = input.material?.trim() ?? '';
    const topic = input.topic?.trim() ?? '';
    if (material.length < 20) throw new AppError(400, 'material_too_short', '材料至少需要 20 个字符。');
    if (material.length > 50_000) {
      throw new AppError(400, 'material_too_long', '材料最多 50,000 个字符。');
    }
    if (topic.length < 2) throw new AppError(400, 'topic_required', '请填写讨论主题。');
    if (topic.length > 200) throw new AppError(400, 'topic_too_long', '主题最多 200 个字符。');
    const segments = segmentMaterial(material);
    if (!segments.length) throw new AppError(400, 'material_empty', '材料分段后为空。');

    const roles = structuredClone(DEFAULT_ROLES);
    for (const key of ['host', 'a', 'b'] as const) {
      const name = input.roles?.[key]?.name?.trim();
      if (name) {
        if (name.length > 24) throw new AppError(400, 'role_name_too_long', '角色名称最多 24 个字符。');
        roles[key].name = name;
      }
    }
    const style = input.style ?? 'balanced';
    if (!['balanced', 'evidence-first', 'critical'].includes(style)) {
      throw new AppError(400, 'invalid_style', '未知的讨论风格。');
    }

    const createdAt = nowIso();
    const session: SeminarSession = {
      schemaVersion: 1,
      id: randomUUID(),
      mode: 'live',
      createdAt,
      updatedAt: createdAt,
      stage: 'draft',
      stopReason: null,
      config: { topic, roles, style },
      material: { raw: material, segments },
      questions: [],
      roles,
      limits: { ...this.appConfig.limits },
      provider: {
        model: this.appConfig.model,
        baseUrlHost: this.appConfig.baseUrlHost,
        temperature: this.appConfig.temperature,
      },
      round: 0,
      messages: [],
      calls: [],
      decisions: [],
      pendingUserMessageIds: [],
      summary: emptySummary(),
      activity: { phase: 'idle', actorId: null, label: '', startedAt: null },
      lastError: null,
      usage: { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, usageMissingCalls: 0 },
    };
    this.cache.set(session.id, session);
    await this.persist(session);
    return session;
  }

  async planQuestions(id: string): Promise<SeminarSession> {
    this.ensureConfigured();
    const session = await this.getSession(id);
    if (session.stage !== 'draft') {
      throw new AppError(409, 'not_draft', '只有尚未开始的草稿可以生成问题。');
    }
    await this.setActivity(session, 'planning', 'summarizer', '备课主持人正在阅读材料并拟定问题…');
    const baseMessages = buildPlannerMessages(session.material.raw, session.material.segments, session.config.topic);
    const meta: CallMeta = {
      role: 'planner',
      actorId: 'planner',
      actorName: '备课主持人',
      purpose: 'plan_questions',
      round: 0,
      schemaRetry: false,
    };
    try {
      const controller = new AbortController();
      let questions: PlannerQuestion[] | null = null;
      let lastError: unknown = null;
      let lastContent = '';
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const messages: LlmMessage[] =
          attempt === 0
            ? baseMessages
            : [
                ...baseMessages,
                {
                  role: 'assistant',
                  content: lastContent,
                },
                buildRepairMessage(
                  safeMessage(lastError),
                  '{"questions":[{"text":"...","rationale":"..."}]} 必须恰好 3 项。',
                ),
              ];
        const result = await this.agentCompletion(
          session,
          { ...meta, schemaRetry: attempt > 0 },
          messages,
          { signal: controller.signal },
        );
        lastContent = result.content;
        try {
          questions = parsePlannerQuestions(extractJson(result.content));
          break;
        } catch (error) {
          lastError = error;
          const call = session.calls.find((entry) => entry.id === result.callId);
          if (call) {
            call.validationError = safeMessage(error);
            await this.persist(session);
          }
        }
      }
      if (!questions) throw lastError instanceof Error ? lastError : new SchemaError('问题生成失败。');
      session.questions = questions.map((question, index) => ({
        id: `q${index + 1}`,
        text: question.text,
        origin: 'model',
      }));
      session.lastError = null;
      await this.setActivity(session, 'idle', null, '');
      await this.persist(session);
      return session;
    } catch (error) {
      session.lastError = {
        code: error instanceof BudgetError ? 'budget_exceeded' : 'planner_error',
        message:
          error instanceof BudgetError
            ? '模型调用预算不足以生成问题。请重启会话或提高 SEMINAR_MAX_CALLS。'
            : `问题生成失败：${safeMessage(error)}`,
        at: nowIso(),
        retryable: true,
      };
      await this.setActivity(session, 'idle', null, '');
      await this.persist(session);
      throw new AppError(
        error instanceof BudgetError ? 429 : 502,
        session.lastError.code,
        session.lastError.message,
      );
    }
  }

  async updateQuestions(id: string, texts: string[]): Promise<SeminarSession> {
    const session = await this.getSession(id);
    if (session.stage !== 'draft') {
      throw new AppError(409, 'not_draft', '讨论开始后不能再改问题。');
    }
    if (!Array.isArray(texts) || texts.length !== 3) {
      throw new AppError(400, 'three_questions_required', '必须保留恰好 3 个问题。');
    }
    const cleaned = texts.map((text) => (typeof text === 'string' ? text.trim() : ''));
    if (cleaned.some((text) => text.length < 4 || text.length > 120)) {
      throw new AppError(400, 'invalid_question', '每个问题需为 4—120 个字符。');
    }
    session.questions = cleaned.map((text, index) => ({
      id: session.questions[index]?.id ?? `q${index + 1}`,
      text,
      origin: 'edited',
    }));
    await this.persist(session);
    return session;
  }

  async start(id: string): Promise<SeminarSession> {
    const session = await this.getSession(id);
    if (session.stage !== 'draft') {
      throw new AppError(409, 'not_draft', '研讨会话已经启动或结束。');
    }
    if (session.questions.length !== 3) {
      throw new AppError(400, 'questions_required', '请先生成并确认 3 个讨论问题。');
    }
    this.ensureConfigured();
    if (this.remainingRoleCalls(session) < 2) {
      throw new AppError(429, 'budget_exceeded', '调用预算不足以开始讨论。');
    }
    session.stage = 'running';
    session.stopReason = null;
    session.lastError = null;
    await this.persist(session);
    this.kick(session.id);
    return session;
  }

  async pause(id: string): Promise<SeminarSession> {
    const session = await this.getSession(id);
    if (session.stage !== 'running') {
      throw new AppError(409, 'not_running', '当前会话不在进行中。');
    }
    session.stage = 'paused';
    await this.persist(session);
    return session;
  }

  async resume(id: string): Promise<SeminarSession> {
    const session = await this.getSession(id);
    if (session.stage !== 'paused') {
      throw new AppError(409, 'not_paused', '当前会话不在暂停状态。');
    }
    this.ensureConfigured();
    session.stage = 'running';
    session.lastError = null;
    session.stopReason = null;
    await this.persist(session);
    this.kick(session.id);
    return session;
  }

  async end(id: string): Promise<SeminarSession> {
    const session = await this.getSession(id);
    if (!['running', 'paused', 'error'].includes(session.stage)) {
      throw new AppError(409, 'not_active', '当前会话不能结束。');
    }
    if (session.stage !== 'ended') {
      session.stage = 'ended';
      session.stopReason = 'user_end';
      session.activity = { phase: 'idle', actorId: null, label: '', startedAt: null };
      // Explicitly stopping does not turn unanswered messages into successful responses.
      await this.persist(session);
      this.abortRuntime(session.id);
      this.triggerSummary(session.id);
    }
    return session;
  }

  async addUserMessage(id: string, textInput: string): Promise<SeminarSession> {
    const session = await this.getSession(id);
    const text = textInput?.trim() ?? '';
    if (text.length < 1) throw new AppError(400, 'message_empty', '请输入内容。');
    if (text.length > 800) throw new AppError(400, 'message_too_long', '插话最多 800 个字符。');
    if (!['running', 'paused'].includes(session.stage)) {
      throw new AppError(409, 'not_accepting_messages', '当前状态不接受插话。');
    }
    if (session.limits.maxRounds - session.round < 2) {
      throw new AppError(409, 'round_limit', '剩余轮次不足以安排两位参与者回应，不再接受新的插话。');
    }
    if (this.remainingRoleCalls(session) < 4) {
      throw new AppError(429, 'budget_exceeded', '模型调用预算不足，无法保证回应这条插话。');
    }
    const message = makeMessage({
      role: 'user',
      actorId: 'user',
      actorName: '你',
      kind: 'user',
      round: session.round,
      text,
    });
    session.messages.push(message);
    session.pendingUserMessageIds.push(message.id);
    this.responseProgress(session, message.id);
    await this.persist(session);
    if (session.stage === 'running') this.kick(session.id);
    return session;
  }

  async retry(id: string): Promise<SeminarSession> {
    const session = await this.getSession(id);
    if (session.stage !== 'error') {
      throw new AppError(409, 'not_error', '当前会话没有可重试的错误。');
    }
    this.ensureConfigured();
    if (this.remainingRoleCalls(session) <= 0) {
      throw new AppError(429, 'budget_exceeded', '调用预算已用尽，只能结束并生成已有总结。');
    }
    session.stage = 'running';
    session.stopReason = null;
    session.lastError = null;
    session.activity = { phase: 'idle', actorId: null, label: '', startedAt: null };
    await this.persist(session);
    this.kick(session.id);
    return session;
  }

  private triggerSummary(id: string): void {
    this.trackBackground(this.generateSummary(id, false).catch(async (error) => {
      const session = this.cache.get(id);
      if (!session) return;
      session.summary.status = 'error';
      session.summary.error = `总结生成失败：${safeMessage(error)}`;
      session.activity = { phase: 'idle', actorId: null, label: '', startedAt: null };
      await this.persist(session).catch(() => undefined);
    }));
  }

  async generateSummary(id: string, regenerate: boolean): Promise<SeminarSession> {
    const session = await this.getSession(id);
    if (session.stage !== 'ended') {
      throw new AppError(409, 'not_ended', '讨论结束后才能生成总结。');
    }
    if (session.summary.status === 'generating') return session;
    if (session.summary.status === 'ready' && !regenerate) return session;
    this.ensureConfigured();
    for (let wait = 0; this.activeRequests.has(id) && wait < 50; wait += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (session.calls.length >= session.limits.maxCalls) {
      session.summary.status = 'error';
      session.summary.error = '模型调用上限已用尽，无法生成总结。';
      await this.persist(session);
      return session;
    }

    session.summary.status = 'generating';
    session.summary.error = null;
    await this.setActivity(session, 'summarizing', 'summarizer', '总结员正在整理共识、分歧与材料依据…');
    const meta: CallMeta = {
      role: 'summarizer',
      actorId: 'summarizer',
      actorName: '总结员',
      purpose: 'summary',
      round: session.round,
      schemaRetry: false,
    };
    try {
      const controller = new AbortController();
      const base = buildSummaryMessages(session);
      let parsed: { summary: SummaryContent; warnings: string[] } | null = null;
      let lastError: unknown = null;
      let lastContent = '';
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const messages: LlmMessage[] =
          attempt === 0
            ? base
            : [
                ...base,
                { role: 'assistant', content: lastContent },
                buildRepairMessage(
                  safeMessage(lastError),
                  '{"consensus":[],"disagreements":[],"evidence":[{"paragraphId":1,"quote":"逐字原文","note":""}],"unresolved":[]}',
                ),
              ];
        const result = await this.agentCompletion(
          session,
          {
            ...meta,
            schemaRetry: attempt > 0,
            purpose: attempt > 0 ? 'schema_repair' : 'summary',
          },
          messages,
          { signal: controller.signal, reserveSummary: false },
        );
        lastContent = result.content;
        try {
          parsed = parseSummary(extractJson(result.content), session.material.segments);
          break;
        } catch (error) {
          lastError = error;
          const call = session.calls.find((entry) => entry.id === result.callId);
          if (call) {
            call.validationError = safeMessage(error);
            await this.persist(session);
          }
        }
      }
      if (!parsed) throw lastError instanceof Error ? lastError : new SchemaError('总结解析失败。');
      session.summary = {
        status: 'ready',
        ...parsed.summary,
        generatedAt: nowIso(),
        editedAt: null,
        model: this.appConfig.model,
        warnings: parsed.warnings,
        error: null,
      };
      await this.setActivity(session, 'idle', null, '');
      await this.persist(session);
      return session;
    } catch (error) {
      session.summary.status = 'error';
      session.summary.error = `总结生成失败：${safeMessage(error)}`;
      await this.setActivity(session, 'idle', null, '');
      await this.persist(session);
      return session;
    }
  }

  async updateSummary(id: string, input: SummaryContent): Promise<SeminarSession> {
    const session = await this.getSession(id);
    if (session.stage !== 'ended') {
      throw new AppError(409, 'not_ended', '讨论结束后才能编辑总结。');
    }
    if (session.summary.status !== 'ready') {
      throw new AppError(409, 'summary_not_ready', '总结尚未生成成功。');
    }
    const list = (value: unknown, field: string, max: number): string[] => {
      if (!Array.isArray(value)) throw new AppError(400, 'invalid_summary', `${field} 必须是数组。`);
      if (value.length > 5) throw new AppError(400, 'invalid_summary', `${field} 最多 5 项。`);
      return value.map((item, index) => {
        if (typeof item !== 'string' || !item.trim() || item.trim().length > 320) {
          throw new AppError(400, 'invalid_summary', `${field}[${index}] 无效。`);
        }
        return item.trim();
      });
    };
    if (!Array.isArray(input.evidence)) {
      throw new AppError(400, 'invalid_summary', 'evidence 必须是数组。');
    }
    if (input.evidence.length > 10) {
      throw new AppError(400, 'invalid_summary', '材料依据最多 10 项。');
    }
    const evidence: SummaryEvidence[] = input.evidence.map((item, index) => {
      if (
        !item ||
        !Number.isInteger(item.paragraphId) ||
        typeof item.quote !== 'string' ||
        typeof item.note !== 'string'
      ) {
        throw new AppError(400, 'invalid_summary', `证据 ${index + 1} 字段不完整。`);
      }
      const checked = validateCitation(
        { paragraphId: item.paragraphId, quote: item.quote },
        session.material.segments,
      );
      if (!checked.ok) {
        throw new AppError(400, 'invalid_citation', `证据 ${index + 1} 未通过核对：${checked.reason}`);
      }
      return {
        paragraphId: item.paragraphId,
        quote: item.quote.trim(),
        note: item.note.trim().slice(0, 240),
      };
    });

    session.summary = {
      ...session.summary,
      consensus: list(input.consensus, 'consensus', 5),
      disagreements: list(input.disagreements, 'disagreements', 5),
      unresolved: list(input.unresolved, 'unresolved', 5),
      evidence,
      status: 'ready',
      editedAt: nowIso(),
      error: null,
    };
    await this.persist(session);
    return session;
  }

  async get(id: string): Promise<SeminarSession> {
    return this.getSession(id);
  }

  private kick(id: string): void {
    const existing = this.runtimes.get(id);
    if (existing?.busy) {
      existing.rerun = true;
      return;
    }
    const runtime: Runtime = { busy: true, abort: new AbortController(), rerun: false };
    this.runtimes.set(id, runtime);
    this.trackBackground(this.runLoop(id, runtime).catch((error) => {
      const session = this.cache.get(id);
      if (session && session.stage === 'running') {
        session.stage = 'error';
        session.stopReason = 'api_error';
        session.lastError = {
          code: 'internal_error',
          message: safeMessage(error),
          at: nowIso(),
          retryable: true,
        };
        session.activity = { phase: 'idle', actorId: null, label: '', startedAt: null };
        void this.persist(session);
      }
    }));
  }

  private abortRuntime(id: string): void {
    this.runtimes.get(id)?.abort.abort();
  }

  private async runLoop(id: string, runtime: Runtime): Promise<void> {
    const session = await this.getSession(id);
    try {
      while (session.stage === 'running' && !runtime.abort.signal.aborted) {
        if (session.round >= session.limits.maxRounds) {
          await this.finish(session, 'round_limit');
          break;
        }
        const last = session.messages.at(-1);
        if (last?.role === 'host' && last.hostAction?.action === 'end') {
          await this.finish(session, 'host_end');
          break;
        }
        const pendingMessages = this.pendingMessages(session);
        const hostAddressedPending =
          last?.hostAction !== undefined &&
          pendingMessages.every((message) =>
            last.hostAction?.addressUserMessageIds.includes(message.id),
          );
        const resumingParticipant =
          last?.role === 'host' &&
          last.hostAction &&
          last.hostAction.action !== 'end' &&
          last.round === session.round + 1 &&
          (session.pendingUserMessageIds.length === 0 || hostAddressedPending);
        const requiredCalls = resumingParticipant ? 1 : 2;
        if (this.remainingRoleCalls(session) < requiredCalls) {
          await this.finish(session, 'call_limit');
          break;
        }

        if (resumingParticipant) {
          await this.runParticipant(session, last, runtime.abort.signal);
        } else {
          await this.runHost(session, runtime.abort.signal);
        }
        if (session.stage !== 'running') break;
      }
    } catch (error) {
      if (session.stage === 'ended' || runtime.abort.signal.aborted) return;
      if (error instanceof BudgetError) {
        await this.finish(session, 'call_limit');
        return;
      }
      // A paused in-flight request may still fail: retain the pause, but expose the failure.
      if (session.stage !== 'paused') session.stage = 'error';
      session.stopReason = 'api_error';
      session.activity = { phase: 'idle', actorId: null, label: '', startedAt: null };
      const lastCall = session.calls.at(-1);
      session.lastError = {
        code: error instanceof LlmRequestError ? `model_${error.kind}` : error instanceof AppError ? error.code : 'orchestration_error',
        message: safeMessage(error),
        at: nowIso(),
        ...(lastCall ? { callId: lastCall.id } : {}),
        retryable: !(error instanceof SchemaError),
      };
      const failedHost = session.messages.at(-1)?.hostAction;
      const failedActor = failedHost?.participantId;
      if (failedActor === 'a' || failedActor === 'b') {
        for (const message of this.pendingMessages(session, failedActor)) {
          const progress = this.responseProgress(session, message.id);
          progress.failedActor = failedActor;
          progress.error = session.lastError.message;
        }
      }
      await this.persist(session);
    } finally {
      const current = this.runtimes.get(id);
      if (current === runtime) {
        runtime.busy = false;
        this.runtimes.delete(id);
        if (runtime.rerun && session.stage === 'running' && !runtime.abort.signal.aborted) {
          queueMicrotask(() => this.kick(id));
        }
      }
    }
  }

  private async runHost(session: SeminarSession, signal: AbortSignal): Promise<void> {
    if (session.stage !== 'running') return;
    await this.setActivity(
      session,
      'host_thinking',
      'host',
      `${session.roles.host.name} 正在判断下一步…`,
    );
    const meta: CallMeta = {
      role: 'host',
      actorId: 'host',
      actorName: session.roles.host.name,
      purpose: 'host_turn',
      round: session.round + 1,
      schemaRetry: false,
    };
    const buildBase = (): LlmMessage[] => [
      { role: 'system', content: buildHostSystem(session.roles, session.limits.maxRounds) },
      { role: 'user', content: buildHostUser(session, this.pendingMessages(session)) },
    ];

    let action: HostAction | null = null;
    let lastError: unknown = null;
    let lastContent = '';
    let callId = '';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const base = buildBase();
      const messages: LlmMessage[] =
        attempt === 0
          ? base
          : [
              ...base,
              { role: 'assistant', content: lastContent },
              buildRepairMessage(
                safeMessage(lastError),
                '主持人 JSON 必须包含 action、participantId、publicMessage、prompt、focus、addressUserMessageIds、respondToMessageIds、reason、endReason。',
              ),
            ];
      const result = await this.agentCompletion(
        session,
        {
          ...meta,
          schemaRetry: attempt > 0,
          purpose: attempt > 0 ? 'schema_repair' : 'host_turn',
        },
        messages,
        { tools: [MATERIAL_TOOL], signal },
      );
      lastContent = result.content;
      callId = result.callId;
      try {
        const parsed = parseHostAction(extractJson(result.content));
        this.validateHostReferences(session, parsed);
        action = parsed;
        break;
      } catch (error) {
        lastError = error;
        const call = session.calls.find((entry) => entry.id === result.callId);
        if (call) {
          call.validationError = safeMessage(error);
          await this.persist(session);
        }
      }
    }
    if (!action) throw lastError instanceof Error ? lastError : new SchemaError('主持人输出无效。');
    if (isEnded(session) || signal.aborted) return;

    const round = session.round + 1;
    const message = makeMessage({
      role: 'host',
      actorId: 'host',
      actorName: session.roles.host.name,
      kind: session.messages.length === 0 ? 'opening' : 'invite',
      round,
      text: action.publicMessage,
      addresses: action.addressUserMessageIds,
      hostAction: action,
      callId,
    });
    session.messages.push(message);
    session.decisions.push({
      id: randomUUID(),
      round,
      action: action.action,
      participantId: action.participantId,
      reason: action.reason,
      addressUserMessageIds: action.addressUserMessageIds,
      respondToMessageIds: action.respondToMessageIds,
      callId,
      at: nowIso(),
    });
    await this.persist(session);

    if (action.action === 'end') {
      await this.finish(session, 'host_end');
    }
  }

  private validateHostReferences(session: SeminarSession, action: HostAction): void {
    if (action.action === 'end' && session.round === 0) {
      throw new SchemaError('还没有任何发言，不能直接结束。');
    }
    const spoken = {
      a: session.messages.filter((message) => message.actorId === 'a').length,
      b: session.messages.filter((message) => message.actorId === 'b').length,
    };
    if (action.action === 'end' && (spoken.a === 0 || spoken.b === 0)) {
      throw new SchemaError('两位参与者都必须至少发言一次，不能提前结束。');
    }
    const pending = this.pendingMessages(session);
    if (pending.length && action.action === 'end') {
      throw new SchemaError('仍有用户插话未回应，不能结束；请先安排回应。');
    }
    if (
      pending.length === 0 &&
      session.round < 2 &&
      (action.participantId === 'a' || action.participantId === 'b') &&
      spoken[action.participantId] > 0
    ) {
      const other = action.participantId === 'a' ? spoken.b : spoken.a;
      if (other === 0) {
        throw new SchemaError('开场前两轮应让两位参与者各获得一次发言机会，请换一位。');
      }
    }
    for (const id of action.addressUserMessageIds) {
      if (!isUserMessage(session, id)) {
        throw new SchemaError(`addressUserMessageIds 中的 ${id} 不是本会话的用户消息。`);
      }
    }
    for (const message of pending) {
      if (!action.addressUserMessageIds.includes(message.id)) {
        throw new SchemaError(`必须把待回应用户消息 ${message.id} 放进 addressUserMessageIds。`);
      }
    }
    for (const id of action.respondToMessageIds) {
      if (!session.messages.some((message) => message.id === id)) {
        throw new SchemaError(`respondToMessageIds 中的 ${id} 不存在。`);
      }
    }
    if (pending.length && !action.participantId) {
      throw new SchemaError('有用户插话时，必须指定一位参与者直接回应。');
    }
    if (pending.length && (action.participantId === 'a' || action.participantId === 'b') &&
        this.pendingMessages(session, action.participantId).length === 0) {
      throw new SchemaError('该参与者已经回应全部待处理插话，请安排尚未回应的参与者。');
    }
  }

  private async runParticipant(
    session: SeminarSession,
    hostMessage: SeminarMessage,
    signal: AbortSignal,
  ): Promise<void> {
    const action = hostMessage.hostAction;
    if (!action || !action.participantId) return;
    if (action.participantId !== 'a' && action.participantId !== 'b') return;
    const roleKey = action.participantId;
    if (session.stage !== 'running') return;
    const role = session.roles[roleKey];
    await this.setActivity(
      session,
      'participant_thinking',
      roleKey,
      `${role.name} 正在阅读材料并组织回应…`,
    );
    const pendingAtStart = this.pendingMessages(session, roleKey);
    const meta: CallMeta = {
      role: 'participant',
      actorId: roleKey,
      actorName: role.name,
      purpose: 'participant_turn',
      round: hostMessage.round,
      schemaRetry: false,
    };
    const base: LlmMessage[] = [
      {
        role: 'system',
        content: buildParticipantSystem(roleKey, session.roles, session.config.style),
      },
      {
        role: 'user',
        content: buildParticipantUser(session, roleKey, action, pendingAtStart),
      },
    ];

    let parsed: ReturnType<typeof parseParticipant> | null = null;
    let lastError: unknown = null;
    let lastContent = '';
    let callId = '';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const messages: LlmMessage[] =
        attempt === 0
          ? base
          : [
              ...base,
              { role: 'assistant', content: lastContent },
              buildRepairMessage(
                safeMessage(lastError),
                '参与者 JSON 必须包含 blocks（1—4 项，含 type/text/citations）、addresses、stanceUpdate。',
              ),
            ];
      const result = await this.agentCompletion(
        session,
        {
          ...meta,
          schemaRetry: attempt > 0,
          purpose: attempt > 0 ? 'schema_repair' : 'participant_turn',
        },
        messages,
        { tools: [MATERIAL_TOOL], signal },
      );
      lastContent = result.content;
      callId = result.callId;
      try {
        const candidate = parseParticipant(extractJson(result.content), session.material.segments);
        const pendingIds = pendingAtStart.map((message) => message.id);
        const missing = pendingIds.filter((id) => !candidate.addresses.includes(id));
        if (missing.length) {
          throw new SchemaError(
            `用户插话必须直接回应，但 addresses 缺少 ${missing.join('、')}。请在 addresses 中列出。`,
          );
        }
        parsed = candidate;
        break;
      } catch (error) {
        lastError = error;
        const call = session.calls.find((entry) => entry.id === result.callId);
        if (call) {
          call.validationError = safeMessage(error);
          await this.persist(session);
        }
      }
    }
    if (!parsed) {
      if (pendingAtStart.length) {
        const message = `${role.name}未成功确认回应插话。待回应消息已保留；请重试，已成功的参与者不会重复执行。`;
        for (const pending of pendingAtStart) {
          const progress = this.responseProgress(session, pending.id);
          progress.failedActor = roleKey;
          progress.error = message;
        }
        // The shared session may be paused while awaiting the model response.
        if (['paused'].includes(session.stage)) {
          session.lastError = { code: 'user_response_failed', message, at: nowIso(), retryable: true };
        }
        await this.persist(session);
        throw new AppError(502, 'user_response_failed', message);
      }
      throw lastError instanceof Error ? lastError : new SchemaError('参与者输出无效。');
    }
    if (isEnded(session) || signal.aborted) return;

    const validAddresses = parsed.addresses.filter((id) =>
      session.messages.some((message) => message.id === id),
    );
    const pendingIds = pendingAtStart.map((message) => message.id);
    const directToUser = pendingIds.length > 0 && pendingIds.every((id) => validAddresses.includes(id));
    const directResponseWarning =
      pendingIds.length > 0 && !directToUser
        ? '参与者没有在结构化字段中确认回应用户插话；内容仍已展示，请核对。'
        : null;
    const message = makeMessage({
      role: 'participant',
      actorId: roleKey,
      actorName: role.name,
      kind: 'statement',
      round: hostMessage.round,
      text: parsed.blocks.map((block) => block.text).join('\n'),
      blocks: parsed.blocks,
      addresses: validAddresses,
      participant: {
        addresses: validAddresses,
        stanceUpdate: parsed.stanceUpdate,
        directToUser,
        citationWarnings: parsed.warnings,
        directResponseWarning,
      },
      callId,
    });
    session.messages.push(message);
    session.round = hostMessage.round;
    for (const id of pendingIds) {
      const progress = this.responseProgress(session, id);
      if (!progress.completed.includes(roleKey)) progress.completed.push(roleKey);
      if (progress.failedActor === roleKey) { delete progress.failedActor; delete progress.error; }
    }
    session.pendingUserMessageIds = session.pendingUserMessageIds.filter(id => {
      const progress = this.responseProgress(session, id);
      return progress.required.some(actor => !progress.completed.includes(actor));
    });
    session.activity = { phase: 'idle', actorId: null, label: '', startedAt: null };
    await this.persist(session);
  }

  private responseProgress(session: SeminarSession, id: string) {
    session.userResponses ??= {};
    return session.userResponses[id] ??= {
      required: ['a', 'b'],
      completed: (['a', 'b'] as const).filter(actor => session.messages.some(message =>
        message.actorId === actor && message.participant?.directToUser && message.addresses.includes(id))),
    };
  }

  private pendingMessages(session: SeminarSession, actor?: 'a' | 'b'): SeminarMessage[] {
    const ids = new Set(session.pendingUserMessageIds);
    return session.messages.filter((message) => ids.has(message.id) &&
      (!actor || !this.responseProgress(session, message.id).completed.includes(actor)));
  }

  private async finish(session: SeminarSession, reason: string): Promise<void> {
    if (session.stage === 'ended') return;
    session.stage = 'ended';
    session.stopReason = reason;
    session.activity = { phase: 'idle', actorId: null, label: '', startedAt: null };
    await this.persist(session);
    this.triggerSummary(session.id);
  }
}
