/**
 * Real-model acceptance check.
 *
 * Run this only against a server configured with a real OpenAI-compatible API:
 *   npm start                      # terminal 1, with .env.local configured
 *   npm run check:live             # terminal 2
 *
 * It never reads or prints the API key. It refuses to count a mock/fake model as
 * real evidence, and writes a sanitized report to docs/live-run.json on success
 * or failure.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { EXAMPLE_MATERIALS } from '../examples/materials.js';
import { validateCitation } from '../server/validation.js';
import type { ApiErrorBody, HealthResponse, SeminarSession } from '../src/shared/types.js';

const base = (process.env.SEMINAR_LIVE_URL ?? 'http://127.0.0.1:4317').replace(/\/+$/, '');
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const reportPath = path.resolve(process.cwd(), 'docs', 'live-run.json');
const timeoutMs = 180_000;
const runStartedAt = Date.now();

async function request<T>(pathname: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${pathname}`, {
    ...init,
    headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...(init?.headers ?? {}) },
  });
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const body = payload as ApiErrorBody | null;
    throw new Error(`HTTP ${response.status}: ${body?.error?.message ?? text}`);
  }
  return payload as T;
}

async function pollSession(
  id: string,
  predicate: (session: SeminarSession) => boolean,
  label: string,
): Promise<SeminarSession> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { session } = await request<{ session: SeminarSession }>(`/api/sessions/${id}`);
    if (predicate(session)) return session;
    await sleep(1200);
  }
  throw new Error(`Timed out after ${timeoutMs / 1000}s waiting for ${label}.`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function writeReport(report: Record<string, unknown>): Promise<void> {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

try {
  const health = await request<HealthResponse>('/api/health');
  console.log(`[live] server ${base} · model=${health.model} · endpoint=${health.baseUrlHost}`);
  if (!health.configured) {
    console.error(
      '[live] BLOCKED: 服务端未配置 OPENAI_API_KEY。真实模型验证无法进行；示例回放不能代替。',
    );
    process.exitCode = 2;
  } else if (/mock|fake|stub|e2e/i.test(health.model) || health.baseUrlHost === 'mock.local') {
    console.error(
      `[live] REFUSED: 当前模型 "${health.model}" 看起来是测试替身，不能作为真实模型验证。`,
    );
    process.exitCode = 2;
  } else {
    const sample = EXAMPLE_MATERIALS[0];
    const created = await request<{ session: SeminarSession }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ material: sample.material, topic: sample.topic }),
    });
    const id = created.session.id;
    console.log(`[live] session ${id} created; generating questions with ${health.model}`);
    await request(`/api/sessions/${id}/plan`, { method: 'POST' });
    const planned = await request<{ session: SeminarSession }>(`/api/sessions/${id}`);
    assert(planned.session.questions.length === 3, 'planner must produce 3 questions');
    const editedQuestions = planned.session.questions.map((question, index) =>
      index === 0 ? `${question.text}` : question.text,
    );
    await request(`/api/sessions/${id}/questions`, {
      method: 'PATCH',
      body: JSON.stringify({ questions: editedQuestions }),
    });
    await request(`/api/sessions/${id}/start`, { method: 'POST' });
    console.log('[live] discussion started; waiting for both participants to speak');

    const bothSpoke = await pollSession(
      id,
      (session) =>
        session.messages.some((message) => message.actorId === 'a') &&
        session.messages.some((message) => message.actorId === 'b') &&
        session.stage === 'running',
      'both participants to speak while running',
    );
    assert(bothSpoke.stage === 'running', 'discussion ended before pause check');

    await request(`/api/sessions/${id}/pause`, { method: 'POST' });
    const paused = await pollSession(id, (session) => session.stage === 'paused', 'pause');
    console.log('[live] paused; checking that scheduling stops');
    await sleep(2500);
    const callsAfterSettle = (await request<{ session: SeminarSession }>(`/api/sessions/${id}`)).session.calls.length;
    await sleep(3000);
    const callsLater = (await request<{ session: SeminarSession }>(`/api/sessions/${id}`)).session.calls.length;
    assert(
      callsAfterSettle === callsLater,
      `pause did not stop scheduling: calls ${callsAfterSettle} -> ${callsLater}`,
    );

    await request(`/api/sessions/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        text: '如果只在周五延长到 23:00，而不是 24:00，能不能先压低值班成本？请直接回应这个折中。',
      }),
    });
    const afterUser = await request<{ session: SeminarSession }>(`/api/sessions/${id}`);
    const userId = afterUser.session.pendingUserMessageIds[0];
    assert(userId, 'user message should be queued while paused');
    await request(`/api/sessions/${id}/resume`, { method: 'POST' });
    console.log('[live] resumed; waiting for a relevant participant to directly address the user');

    const direct = await pollSession(
      id,
      (session) =>
        session.messages.some(
          (message) =>
            message.role === 'participant' &&
            message.participant?.directToUser === true &&
            message.addresses.includes(userId),
        ),
      'direct participant response to user',
    );
    const directMessage = direct.messages.find(
      (message) => message.role === 'participant' && message.addresses.includes(userId),
    );
    assert(directMessage, 'direct response message missing');
    assert(
      direct.messages.some((message) => message.role === 'host' && message.addresses.includes(userId)),
      'host did not record addressing the user message',
    );
    console.log('[live] direct response received; ending discussion');

    const endRequestedAt = new Date().toISOString();
    const ended = await request<{ session: SeminarSession }>(`/api/sessions/${id}/end`, {
      method: 'POST',
    });
    const callIdsAtEnd = new Set(ended.session.calls.map((call) => call.id));
    console.log('[live] ended; waiting for summary');

    const summarized = await pollSession(
      id,
      (session) => session.summary.status === 'ready' || session.summary.status === 'error',
      'summary',
    );
    assert(summarized.summary.status === 'ready', `summary failed: ${summarized.summary.error ?? 'unknown'}`);
    assert(summarized.messages.length > 0, 'discussion has no messages');

    for (const message of summarized.messages) {
      for (const block of message.blocks) {
        for (const citation of block.citations) {
          const checked = validateCitation(citation, summarized.material.segments);
          assert(checked.ok, `invalid participant citation: ${JSON.stringify(citation)}`);
        }
      }
    }
    for (const evidence of summarized.summary.evidence) {
      const checked = validateCitation(evidence, summarized.material.segments);
      assert(checked.ok, `invalid summary evidence: ${JSON.stringify(evidence)}`);
    }

    const roleCalls = new Set(summarized.calls.map((call) => call.role));
    assert(roleCalls.has('host'), 'no host call');
    assert(roleCalls.has('participant'), 'no participant call');
    assert(summarized.messages.some((message) => message.actorId === 'b'), 'participant B never spoke');
    assert(summarized.summary.evidence.length > 0, 'summary has no material evidence');

    const hostHashes = new Set(summarized.calls.filter((call) => call.role === 'host').map((call) => call.contextHash));
    const aHashes = new Set(
      summarized.calls
        .filter((call) => call.role === 'participant' && call.actorId === 'a')
        .map((call) => call.contextHash),
    );
    const bHashes = new Set(
      summarized.calls
        .filter((call) => call.role === 'participant' && call.actorId === 'b')
        .map((call) => call.contextHash),
    );
    assert(aHashes.size > 0 && bHashes.size > 0, 'one participant has no independent call');
    for (const hash of aHashes) assert(!hostHashes.has(hash), 'host and A share a context hash');
    for (const hash of bHashes) assert(!hostHashes.has(hash), 'host and B share a context hash');
    for (const hash of aHashes) assert(!bHashes.has(hash), 'A and B share a context hash');

    const callsAfterEnd = summarized.calls.filter((call) => !callIdsAtEnd.has(call.id));
    const newRoleCallsAfterEnd = callsAfterEnd.filter(
      (call) =>
        (call.role === 'host' || call.role === 'participant') && call.startedAt >= endRequestedAt,
    );
    assert(
      newRoleCallsAfterEnd.length === 0,
      'a host/participant call started after the user ended the discussion',
    );
    assert(
      summarized.usage.calls === summarized.calls.length,
      'usage call count does not match actual call logs',
    );

    const editedText = '真实运行验收：双方同意先做六周试行，剩余分歧等待真实数据。';
    const editedSummary = {
      consensus: summarized.summary.consensus.length
        ? [editedText, ...summarized.summary.consensus.slice(1)]
        : [editedText],
      disagreements: summarized.summary.disagreements,
      evidence: summarized.summary.evidence,
      unresolved: summarized.summary.unresolved,
    };
    const saved = await request<{ session: SeminarSession }>(`/api/sessions/${id}/summary`, {
      method: 'PATCH',
      body: JSON.stringify(editedSummary),
    });
    assert(saved.session.summary.consensus[0] === editedText, 'summary edit did not persist');

    const markdownResponse = await fetch(`${base}/api/sessions/${id}/export.md`);
    const markdown = await markdownResponse.text();
    assert(markdown.includes(editedText), 'Markdown export is not consistent with the edited summary');
    assert(markdown.includes('技术记录（真实调用）'), 'Markdown export lacks the technical trace');
    const jsonResponse = await fetch(`${base}/api/sessions/${id}/export.json`);
    const json = (await jsonResponse.json()) as { session: SeminarSession };
    assert(json.session.calls.length === summarized.calls.length, 'JSON export call count mismatch');

    const report = {
      status: 'passed',
      generatedAt: new Date().toISOString(),
      base,
      model: health.model,
      endpointHost: health.baseUrlHost,
      sessionId: id,
      topic: summarized.config.topic,
      durationMs: Date.now() - runStartedAt,
      limits: summarized.limits,
      usage: summarized.usage,
      round: summarized.round,
      stopReason: summarized.stopReason,
      callsByRole: summarized.calls.reduce<Record<string, number>>((accumulator, call) => {
        accumulator[call.role] = (accumulator[call.role] ?? 0) + 1;
        return accumulator;
      }, {}),
      contextHashes: {
        host: [...hostHashes],
        a: [...aHashes],
        b: [...bHashes],
      },
      directUserMessageId: userId,
      directResponseParticipant: directMessage.actorName,
      citationsChecked: summarized.messages.reduce(
        (sum, message) => sum + message.blocks.reduce((inner, block) => inner + block.citations.length, 0),
        0,
      ),
      summaryEvidence: summarized.summary.evidence.length,
      checks: {
        independentRoleCalls: true,
        pauseStoppedScheduling: true,
        userInterjectionDirectlyAddressed: true,
        citationsVerbatim: true,
        summaryGenerated: true,
        noRoleCallsAfterEnd: true,
        summaryEditable: true,
        markdownAndJsonExport: true,
      },
    };
    await writeReport(report);
    console.log(JSON.stringify(report, null, 2));
    console.log(`[live] PASS — report written to ${reportPath}`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[live] FAIL — ${message}`);
  await writeReport({
    status: 'failed',
    generatedAt: new Date().toISOString(),
    base,
    error: message,
    note: 'No API key or prompt was recorded. A failure is not a successful run.',
  }).catch(() => undefined);
  process.exitCode = 1;
}
