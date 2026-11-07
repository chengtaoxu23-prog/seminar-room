import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { AppConfig } from '../server/config.js';
import { chatCompletion, type LlmMessage } from '../server/llm.js';
import { SeminarEngine } from '../server/seminar.js';
import { SessionStore } from '../server/store.js';
import { toMarkdown } from '../server/export.js';
import { segmentMaterial } from '../src/shared/material.js';
import { parseParticipant, validateCitation, parseHostAction } from '../server/validation.js';
import { EXAMPLE_MATERIALS } from '../examples/materials.js';
import type { SeminarSession } from '../src/shared/types.js';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor<T>(
  check: () => Promise<T | null | undefined | false>,
  label: string,
  timeoutMs = 8000,
): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await check();
    if (value) return value;
    await delay(25);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function makeConfig(dataDir: string, overrides: Partial<AppConfig['limits']> = {}): AppConfig {
  return {
    port: 0,
    host: '127.0.0.1',
    apiKey: 'test-only',
    baseUrl: 'http://127.0.0.1:9/v1',
    model: 'mock-seminar-model',
    temperature: 0.2,
    dataDir,
    publicDir: path.join(dataDir, 'public'),
    limits: { maxRounds: 6, maxCalls: 30, maxOutputTokens: 700, timeoutMs: 5000, ...overrides },
    configured: true,
    baseUrlHost: 'mock.local',
  };
}

function response(content: string, toolCalls: [] | unknown[] = []): Awaited<ReturnType<typeof chatCompletion>> {
  return {
    content,
    toolCalls: toolCalls as never,
    finishReason: 'stop',
    usage: { promptTokens: 120, completionTokens: 60, totalTokens: 180 },
    httpStatus: 200,
  };
}

function systemOf(messages: LlmMessage[]): string {
  return messages.find((message) => message.role === 'system')?.content ?? '';
}

function firstUser(messages: LlmMessage[]): string {
  return messages.find((message) => message.role === 'user')?.content ?? '';
}

function idsFromSection(content: string, start: string, end: string): string[] {
  const startIndex = content.indexOf(start);
  if (startIndex < 0) return [];
  const tail = content.slice(startIndex + start.length);
  const endIndex = tail.indexOf(end);
  const section = endIndex >= 0 ? tail.slice(0, endIndex) : tail;
  return [...section.matchAll(/id=([0-9a-f-]{36})/g)].map((match) => match[1]);
}

function hostDecision(messages: LlmMessage[]): string {
  const prompt = firstUser(messages);
  const pending = idsFromSection(prompt, '[尚未回应的用户消息]', '[最近讨论]');
  const round = Number(prompt.match(/当前第 (\d+) 轮/)?.[1] ?? 0);
  if (pending.length > 0) {
    return JSON.stringify({
      action: 'invite',
      participantId: 'a',
      publicMessage: '用户刚刚提出一个新问题。周证，请你直接回应用户，并说明材料能支持到什么程度。',
      prompt: '直接回应用户插话，引用材料原文，不要继续原定顺序。',
      focus: '直接回应用户',
      addressUserMessageIds: pending,
      respondToMessageIds: [],
      reason: '用户插话必须优先处理。',
      endReason: null,
    });
  }
  if (round >= 4) {
    return JSON.stringify({
      action: 'end',
      participantId: null,
      publicMessage: '双方已给出可核对的观点，继续追问的边际收益很低，今天停在这里。',
      prompt: '',
      focus: '收束',
      addressUserMessageIds: [],
      respondToMessageIds: [],
      reason: '已经形成可执行的试行方案，剩余分歧需要真实数据。',
      endReason: '讨论已覆盖主要分歧，继续重复不如去验证。',
    });
  }
  const participantId = round % 2 === 0 ? 'a' : 'b';
  return JSON.stringify({
    action: round === 0 ? 'invite' : 'clarify',
    participantId,
    publicMessage:
      round === 0
        ? '先从材料里的 22:00 后使用数据开始。周证，请给出一个支持延长的理由，并说明它的局限。'
        : `请 ${participantId === 'a' ? '周证' : '陈疑'} 回应上一位的具体论证，不要重复。`,
    prompt: '引用一条材料原文，回应上一位发言，并说明你的判断边界。',
    focus: round === 0 ? '22:00 后需求' : '回应上一位论证',
    addressUserMessageIds: [],
    respondToMessageIds: [],
    reason: round === 0 ? '先建立材料事实。' : '让另一位参与者检验论证。',
    endReason: null,
  });
}

function participantReply(messages: LlmMessage[]): string {
  const prompt = firstUser(messages);
  const pending = idsFromSection(prompt, '[你必须先直接回应的用户消息]', '[需要直接回应的近期发言]');
  const targets = idsFromSection(prompt, '[需要直接回应的近期发言]', '[与你最相关的材料段落]');
  const addresses = [...new Set([...pending, ...targets])].slice(0, 4);
  const direct = pending.length > 0;
  return JSON.stringify({
    blocks: [
      {
        type: 'evidence',
        text: direct
          ? '先回应你的问题：23:00 折中确实能降低追加成本。按材料，两小时需要额外 2 名值班人员、每人每小时 60 元；只延一小时，六周追加成本约为 720 元。'
          : '材料里有一个支持谨慎延长的信号：21:00—22:00 的签到占 29%，22:00 之后仍留在空间的人次占 9%。',
        citations: [
          {
            paragraphId: 2,
            quote: '21:00—22:00 占 29%，22:00 之后仍留在空间的人次占 9%',
          },
        ],
      },
      {
        type: 'claim',
        text: direct
          ? '但这仍不能证明存在稳定的一群人需要到 23:00；我接受先测去重人数和单位成本，而不是把最低时长直接写死。'
          : '我支持先试行，但 9% 是人次占比，不是独立人数，不能直接推出稳定需求。',
      },
    ],
    addresses,
    stanceUpdate: { changed: direct, note: direct ? '接受用户提出的 23:00 折中。' : '' },
  });
}

function summaryReply(): string {
  return JSON.stringify({
    consensus: ['22:00 后确实有使用，但现有记录不能证明存在稳定的 24:00 需求。'],
    disagreements: ['是否把 23:00 写进长期规则仍有分歧。'],
    evidence: [
      {
        paragraphId: 2,
        quote: '21:00—22:00 占 29%，22:00 之后仍留在空间的人次占 9%',
        note: '支持有晚间使用，但不能直接推出稳定人数。',
      },
    ],
    unresolved: ['22:00 后新增的去重使用人数能否覆盖追加成本。'],
  });
}

function plannerReply(): string {
  return JSON.stringify({
    questions: [
      { text: '22:00 后的使用比例是否足以支持延长？', rationale: '先核对需求。' },
      { text: '延长后的追加成本由谁承担？', rationale: '处理成本分配。' },
      { text: '怎样的试行指标能验证需求？', rationale: '指向可检验行动。' },
    ],
  });
}

function createFake(options: { failHost?: boolean; endAfterOne?: boolean } = {}) {
  let toolServed = false;
  const fake = async (messages: LlmMessage[]) => {
    const system = systemOf(messages);
    await delay(55);
    if (options.failHost && system.includes('你是 SeminarRoom 的主持人')) {
      throw new Error('mock upstream unavailable');
    }
    if (system.includes('备课主持人')) return response(plannerReply());
    if (system.includes('独立总结员')) return response(summaryReply());
    if (system.includes('你是 SeminarRoom 的主持人')) {
      if (!toolServed && !messages.some((message) => message.role === 'tool')) {
        toolServed = true;
        return response('', [
          {
            id: 'mock-tool-1',
            type: 'function',
            function: { name: 'read_material', arguments: '{"ids":[2]}' },
          },
        ]);
      }
      if (options.endAfterOne && /当前第 [2-9]/.test(firstUser(messages))) {
        return response(
          JSON.stringify({
            action: 'end',
            participantId: null,
            publicMessage: '材料已经暴露出关键缺口，先停在这里。',
            prompt: '',
            focus: '收束',
            addressUserMessageIds: [],
            respondToMessageIds: [],
            reason: '证据不足，继续讨论会重复。',
            endReason: '材料不足以支持进一步判断。',
          }),
        );
      }
      return response(hostDecision(messages));
    }
    if (system.includes('你是 SeminarRoom 的参与者')) return response(participantReply(messages));
    throw new Error(`Unexpected system prompt: ${system.slice(0, 40)}`);
  };
  return fake as typeof chatCompletion;
}

async function setupEngine(options: { failHost?: boolean; endAfterOne?: boolean; sample?: number } = {}) {
  const dataDir = path.join(os.tmpdir(), `seminar-room-test-${randomUUID()}`);
  const store = new SessionStore(dataDir);
  const config = makeConfig(dataDir);
  const engine = new SeminarEngine(store, config, createFake(options));
  await engine.init();
  const sample = EXAMPLE_MATERIALS[options.sample ?? 0];
  const session = await engine.create({ material: sample.material, topic: sample.topic });
  await engine.planQuestions(session.id);
  return { engine, sessionId: session.id, dataDir, config };
}

test('material segmentation and verbatim citation checks', () => {
  const segments = segmentMaterial(EXAMPLE_MATERIALS[0].material);
  assert.equal(segments.length, 7);
  assert.deepEqual(segments.map((segment) => segment.id), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(
    validateCitation(
      { paragraphId: 2, quote: '21:00—22:00 占 29%，22:00 之后仍留在空间的人次占 9%' },
      segments,
    ).ok,
    true,
  );
  assert.equal(validateCitation({ paragraphId: 2, quote: '21:00—22:00 约占三成' }, segments).ok, false);
  assert.equal(validateCitation({ paragraphId: 99, quote: '任意引文' }, segments).ok, false);
});

test('invalid or background citations are stripped instead of displayed as evidence', () => {
  const segments = segmentMaterial(EXAMPLE_MATERIALS[0].material);
  const parsed = parseParticipant(
    {
      blocks: [
        {
          type: 'evidence',
          text: '材料说 22:00 后占 9%，所以需求稳定。',
          citations: [{ paragraphId: 2, quote: '22:00 后一定有很多人' }],
        },
        {
          type: 'background',
          text: '一般而言，延长开放能提升满意度。',
          citations: [
            { paragraphId: 2, quote: '21:00—22:00 占 29%，22:00 之后仍留在空间的人次占 9%' },
          ],
        },
      ],
      addresses: [],
      stanceUpdate: { changed: false, note: '' },
    },
    segments,
  );
  assert.equal(parsed.blocks[0].type, 'claim');
  assert.equal(parsed.blocks[0].citations.length, 0);
  assert.equal(parsed.blocks[0].unverified, true);
  assert.equal(parsed.blocks[1].citations.length, 0);
  assert.equal(parsed.blocks[1].type, 'background');
  assert.ok(parsed.warnings.length >= 2);
});

test('host end action requires a concrete end reason', () => {
  assert.throws(
    () =>
      parseHostAction({
        action: 'end',
        participantId: null,
        publicMessage: '结束。',
        prompt: '',
        focus: '收束',
        addressUserMessageIds: [],
        respondToMessageIds: [],
        reason: '时间到了。',
        endReason: '',
      }),
    /endReason/,
  );
});

test('conflicting material is segmented and both incompatible figures are citable', () => {
  const segments = segmentMaterial(EXAMPLE_MATERIALS[2].material);
  const active240 = validateCitation({ paragraphId: 1, quote: '活跃成员 240 人' }, segments);
  const registered180 = validateCitation({ paragraphId: 2, quote: '全年登记成员 180 人' }, segments);
  const events32 = validateCitation({ paragraphId: 1, quote: '共举办活动 32 场' }, segments);
  const events18 = validateCitation({ paragraphId: 2, quote: '18 场有独立签到表' }, segments);
  assert.equal(active240.ok, true);
  assert.equal(registered180.ok, true);
  assert.equal(events32.ok, true);
  assert.equal(events18.ok, true);
  assert.notEqual(
    segments.find((segment) => segment.id === 1)?.text,
    segments.find((segment) => segment.id === 2)?.text,
  );
});

test('real orchestration loop: independent role calls, tool use, pause, direct reply, summary and export', async () => {
  const { engine, sessionId, dataDir, config } = await setupEngine();
  try {
    let session = await engine.get(sessionId);
    assert.equal(session.questions.length, 3);
    assert.equal(session.calls.length, 1, 'planner should be one real call');
    assert.equal(session.calls[0].role, 'planner');

    await engine.start(sessionId);
    session = await waitFor(
      async () => {
        const current = await engine.get(sessionId);
        return current.messages.some((message) => message.actorId === 'a') ? current : null;
      },
      'first participant reply',
    );

    await engine.pause(sessionId);
    await delay(220);
    const paused = await engine.get(sessionId);
    assert.equal(paused.stage, 'paused');
    const callsWhenPaused = paused.calls.length;
    await delay(280);
    assert.equal((await engine.get(sessionId)).calls.length, callsWhenPaused, 'pause must stop scheduling');

    await engine.addUserMessage(sessionId, '如果只在周五延长到 23:00，而不是 24:00，成本能不能降下来？');
    session = await engine.get(sessionId);
    assert.equal(session.pendingUserMessageIds.length, 1);
    const userId = session.pendingUserMessageIds[0];

    await engine.resume(sessionId);
    session = await waitFor(
      async () => {
        const current = await engine.get(sessionId);
        return current.stage === 'ended' && current.summary.status === 'ready' ? current : null;
      },
      'ended session with summary',
      15_000,
    );

    assert.equal(session.stopReason, 'host_end');
    const direct = session.messages.find(
      (message) => message.role === 'participant' && message.participant?.directToUser,
    );
    assert.ok(direct, 'a participant must directly address the user');
    assert.ok(direct?.addresses.includes(userId));
    assert.ok(
      session.messages.some((message) => message.role === 'host' && message.addresses.includes(userId)),
      'host must mark the user message as addressed',
    );

    const roles = new Set(session.calls.map((call) => call.role));
    assert.ok(roles.has('host'));
    assert.ok(roles.has('participant'));
    assert.ok(roles.has('summarizer'));
    assert.ok(session.messages.some((message) => message.actorId === 'a'));
    assert.ok(session.messages.some((message) => message.actorId === 'b'));

    const hostHashes = new Set(
      session.calls.filter((call) => call.role === 'host').map((call) => call.contextHash),
    );
    const aHashes = new Set(
      session.calls
        .filter((call) => call.role === 'participant' && call.actorId === 'a')
        .map((call) => call.contextHash),
    );
    const bHashes = new Set(
      session.calls
        .filter((call) => call.role === 'participant' && call.actorId === 'b')
        .map((call) => call.contextHash),
    );
    assert.ok(aHashes.size > 0 && bHashes.size > 0);
    for (const hash of aHashes) assert.ok(!hostHashes.has(hash));
    for (const hash of bHashes) assert.ok(!hostHashes.has(hash));
    for (const hash of aHashes) assert.ok(!bHashes.has(hash));

    const toolCall = session.calls.flatMap((call) => call.toolCalls).find((tool) => tool.name === 'read_material');
    assert.ok(toolCall);
    assert.ok(toolCall?.segmentIds.includes(2));

    for (const message of session.messages) {
      for (const block of message.blocks) {
        for (const citation of block.citations) {
          assert.equal(
            validateCitation(citation, session.material.segments).ok,
            true,
            `invalid citation in ${message.id}`,
          );
        }
      }
    }
    for (const evidence of session.summary.evidence) {
      assert.equal(validateCitation(evidence, session.material.segments).ok, true);
    }
    assert.ok(session.summary.consensus.length > 0);
    assert.ok(session.summary.evidence.length > 0);
    assert.ok(session.usage.totalTokens > 0);
    assert.equal(session.calls.length, session.usage.calls);

    const markdown = toMarkdown(session);
    assert.match(markdown, /讨论总结/);
    assert.match(markdown, /材料 2/);
    assert.match(markdown, /技术记录（真实调用）/);
    assert.match(markdown, /独立上下文/);

    const reloadedStore = new SessionStore(dataDir);
    const reloadedEngine = new SeminarEngine(reloadedStore, config, createFake());
    const reloaded = await reloadedEngine.get(sessionId);
    assert.equal(reloaded.messages.length, session.messages.length);
    assert.equal(reloaded.summary.status, 'ready');
  } finally {
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});

test('user interjection wins over a stale, unexecuted host invitation', async () => {
  const { engine, sessionId, dataDir } = await setupEngine();
  try {
    await engine.start(sessionId);
    await delay(15);
    await engine.pause(sessionId);
    await waitFor(
      async () => {
        const current = await engine.get(sessionId);
        return current.stage === 'paused' ? current : null;
      },
      'paused before the first participant reply',
    );
    await engine.addUserMessage(sessionId, '先别按原顺序，请直接告诉我延长到 23:00 的成本。');
    await engine.resume(sessionId);
    const session = await waitFor(
      async () => {
        const current = await engine.get(sessionId);
        const userId = current.messages.find((message) => message.role === 'user')?.id;
        const addressed = userId
          ? current.messages.some(
              (message) => message.role === 'host' && message.addresses.includes(userId),
            )
          : false;
        return addressed && current.stage === 'running' ? current : null;
      },
      'host to address queued user message after resume',
      8000,
    );
    const userId = session.messages.find((message) => message.role === 'user')?.id;
    assert.ok(userId);
    const userIndex = session.messages.findIndex((message) => message.id === userId);
    const addressedHostIndex = session.messages.findIndex(
      (message) => message.role === 'host' && message.addresses.includes(userId),
    );
    const participantsBeforeAddress = session.messages
      .slice(userIndex + 1, addressedHostIndex)
      .filter((message) => message.role === 'participant');
    assert.equal(
      participantsBeforeAddress.length,
      0,
      'no stale participant should run before the user is addressed',
    );
  } finally {
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});

test('insufficient material: no fabricated citation survives and summary can leave evidence empty', async () => {
  const { engine, sessionId, dataDir } = await setupEngine({ endAfterOne: true, sample: 1 });
  try {
    await engine.start(sessionId);
    const session = await waitFor(
      async () => {
        const current = await engine.get(sessionId);
        return current.stage === 'ended' && current.summary.status === 'ready' ? current : null;
      },
      'insufficient-material session to end',
      12_000,
    );
    assert.ok(session.messages.some((message) => message.actorId === 'a'));
    assert.equal(session.summary.evidence.length, 0);
    assert.ok(session.summary.unresolved.length > 0);
    const participantMessage = session.messages.find((message) => message.role === 'participant');
    assert.ok(participantMessage);
    assert.ok(
      participantMessage?.blocks.every((block) => block.citations.length === 0),
      'no citation should survive if the quote is not in the material',
    );
  } finally {
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});

test('API failure is surfaced as error, not as a successful discussion', async () => {
  const { engine, sessionId, dataDir } = await setupEngine({ failHost: true });
  try {
    await engine.start(sessionId);
    const session = await waitFor(
      async () => {
        const current = await engine.get(sessionId);
        return current.stage === 'error' ? current : null;
      },
      'error stage',
      8000,
    );
    assert.equal(session.stage, 'error');
    assert.equal(session.lastError?.code, 'orchestration_error');
    assert.match(session.lastError?.message ?? '', /mock upstream unavailable/);
    assert.equal(session.stopReason, 'api_error');
    assert.equal(session.summary.status, 'none');

    const ended = await engine.end(sessionId);
    assert.equal(ended.stage, 'ended');
    assert.equal(ended.stopReason, 'user_end');
    const callsBeforeSummary = new Set(ended.calls.map((call) => call.id));
    const finalSession = await waitFor(
      async () => {
        const current = await engine.get(sessionId);
        return current.summary.status === 'ready' ? current : null;
      },
      'summary after manually ending an errored session',
      8000,
    );
    const callsAfterEnd = finalSession.calls.filter((call) => !callsBeforeSummary.has(call.id));
    assert.ok(
      callsAfterEnd.every((call) => call.role === 'summarizer'),
      'ending must not start new host or participant calls',
    );
  } finally {
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});
