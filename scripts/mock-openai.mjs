/**
 * Test-only OpenAI-compatible stub for the browser E2E check.
 * It is NOT a model, NOT used by the product, and must never be cited as
 * evidence that real model orchestration works.
 */
import http from 'node:http';

const PORT = 4320;
let toolServed = false;

function systemOf(messages) {
  return messages.find((message) => message.role === 'system')?.content ?? '';
}
function firstUser(messages) {
  return messages.find((message) => message.role === 'user')?.content ?? '';
}
function idsFromSection(content, start, end) {
  const index = content.indexOf(start);
  if (index < 0) return [];
  const tail = content.slice(index + start.length);
  const endIndex = tail.indexOf(end);
  const section = endIndex >= 0 ? tail.slice(0, endIndex) : tail;
  return [...section.matchAll(/id=([0-9a-f-]{36})/g)].map((match) => match[1]);
}
function contentResponse(content, toolCalls = []) {
  return {
    id: `mock-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'mock-e2e-not-a-real-model',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content,
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: toolCalls.length ? 'tool_calls' : 'stop',
      },
    ],
    usage: { prompt_tokens: 150, completion_tokens: 80, total_tokens: 230 },
  };
}
function planner() {
  return JSON.stringify({
    questions: [
      { text: '22:00 后的使用比例，是否足以支持延长开放时间？', rationale: '先核对需求。' },
      { text: '延长后的成本和值班压力应由谁承担？', rationale: '处理成本分配。' },
      { text: '怎样的六周试行指标能验证真实需求？', rationale: '指向可检验行动。' },
    ],
  });
}
function host(messages) {
  const prompt = firstUser(messages);
  const pending = idsFromSection(prompt, '[尚未回应的用户消息]', '[最近讨论]');
  const round = Number(prompt.match(/当前第 (\d+) 轮/)?.[1] ?? 0);
  if (pending.length) {
    return JSON.stringify({
      action: 'invite',
      participantId: 'a',
      publicMessage: '用户刚刚提出 23:00 的折中。周证，请你直接回答成本问题，并回应陈疑对统计口径的质疑。',
      prompt: '直接回应用户的 23:00 折中，引用材料里的值班成本，并回应陈疑的质疑。',
      focus: '直接回应用户：23:00 折中',
      addressUserMessageIds: pending,
      respondToMessageIds: [],
      reason: '用户插话改变了方案参数，先让最熟悉成本数据的参与者回应。',
      endReason: null,
    });
  }
  if (round >= 4) {
    return JSON.stringify({
      action: 'end',
      participantId: null,
      publicMessage: '双方都接受先做六周试行，剩余分歧是要不要写进长期规则。继续追问只会重复，我们停在这里。',
      prompt: '',
      focus: '收束',
      addressUserMessageIds: [],
      respondToMessageIds: [],
      reason: '核心分歧已定位，继续讨论需要真实试行数据。',
      endReason: '可执行的试行方案已经形成，剩余分歧无法靠继续论证解决。',
    });
  }
  const participantId = round % 2 === 0 ? 'a' : 'b';
  return JSON.stringify({
    action: round === 0 ? 'invite' : 'clarify',
    participantId,
    publicMessage:
      round === 0
        ? '先不急着下结论。周证，请从签到记录里给出一个支持延长的理由，并说明它的局限。'
        : `请 ${participantId === 'a' ? '周证' : '陈疑'} 直接回应上一位的论证，不要重复已经说过的话。`,
    prompt: '引用一条材料原文，回应上一位发言，并说明你的判断边界。',
    focus: round === 0 ? '22:00 后需求是否稳定' : '回应上一位论证',
    addressUserMessageIds: [],
    respondToMessageIds: [],
    reason: round === 0 ? '先建立材料事实。' : '让另一位参与者进行检验。',
    endReason: null,
  });
}
function participant(messages, isB) {
  const prompt = firstUser(messages);
  const pending = idsFromSection(prompt, '[你必须先直接回应的用户消息]', '[需要直接回应的近期发言]');
  const targets = idsFromSection(prompt, '[需要直接回应的近期发言]', '[与你最相关的材料段落]');
  const addresses = [...new Set([...pending, ...targets])].slice(0, 4);
  const direct = pending.length > 0;
  if (isB) {
    return JSON.stringify({
      blocks: [
        {
          type: 'evidence',
          text: '材料自己承认了统计口径问题：签到记录没有区分短暂停留和整晚使用，也没有记录离开时间。所以 112 人次可能是同几个人反复出现，不能当作“稳定需求人数”。',
          citations: [
            {
              paragraphId: 2,
              quote: '记录没有区分“短暂停留”和“整晚使用”，也没有记录离开时间',
            },
          ],
        },
        {
          type: 'concession',
          text: '不过我不反对试行。把 24:00 改成 23:00 后，追加成本减半，风险也更可控；我接受先试六周，但反对现在就写进长期规则。',
        },
        {
          type: 'claim',
          text: '试行指标还要拆开“原本就在场、22:00 后新到、只是晚走”三类人，否则“单位成本”的分母会把原有使用算成新增需求。',
        },
      ],
      addresses,
      stanceUpdate: {
        changed: false,
        note: '',
      },
    });
  }
  return JSON.stringify({
    blocks: [
      {
        type: 'evidence',
        text: direct
          ? '先回应你的问题：只延到 23:00 确实能压低追加成本。按材料，两小时需要额外 2 名值班人员、每人每小时 60 元；只延一小时，六周追加成本约为 720 元，而不是 1,440 元。'
          : '按材料，21:00—22:00 的签到占 29%，22:00 之后仍留在空间的人次占 9%。这说明晚间有使用，但 9% 是人次占比，不是独立人数。',
        citations: [
          {
            paragraphId: 2,
            quote: '21:00—22:00 占 29%，22:00 之后仍留在空间的人次占 9%',
          },
        ],
      },
      {
        type: 'concession',
        text: direct
          ? '陈疑说得对：112 人次不能当作稳定人数。我接受把 22:00 后的去重人数和 22:30 后仍在场人数作为试行指标。'
          : '我不反对先做六周试行；问题不是“要不要试”，而是用什么指标决定是否继续。',
      },
      {
        type: 'claim',
        text: '23:00 折中比 24:00 更容易控制成本。我支持试六周，用“每小时追加成本 ÷ 新增去重使用人数”决定是否继续，但不建议现在就把最低开放时长写死。',
      },
    ],
    addresses,
    stanceUpdate: {
      changed: direct,
      note: direct ? '接受用户提出的 23:00 折中，并把论据从总人次改为去重人数。' : '',
    },
  });
}
function summary() {
  return JSON.stringify({
    consensus: [
      '22:00 后确实有人使用，但现有签到记录不能证明存在稳定的 24:00 需求。',
      '双方都接受先做六周试行，并用去重人数、追加成本和值班反馈评估。',
      '23:00 折中比 24:00 更容易控制追加成本与值班风险。',
    ],
    disagreements: [
      '陈疑认为在试行数据出现前不应把最低时长写进长期规则；周证认为可以先按试行安排执行。',
      '“单位成本”的分母仍缺少新增使用人数与原有使用后移的区分。',
    ],
    evidence: [
      {
        paragraphId: 2,
        quote: '21:00—22:00 占 29%，22:00 之后仍留在空间的人次占 9%',
        note: '支持有晚间使用，但不能直接推出稳定的一人群体。',
      },
      {
        paragraphId: 5,
        quote: '延长时段需要额外 2 名值班人员，按每小时 60 元计算',
        note: '用于估算 23:00 折中的追加成本。',
      },
      {
        paragraphId: 7,
        quote: '双方都同意的一点是：如果要延长，应该先做短期试行，并记录 22:00 后的独立使用人数、人均成本、取消或改期情况以及值班人员反馈',
        note: '为试行指标提供材料内的共同基础。',
      },
    ],
    unresolved: [
      '22:00 后的新增使用人数是否足以覆盖 120 元/周的追加值班成本。',
      '“周五至少开放到 23:00”应写进长期规则，还是只作为六周试行安排。',
    ],
  });
}

const server = http.createServer((request, response) => {
  if (request.method !== 'POST' || !request.url?.endsWith('/chat/completions')) {
    response.writeHead(404).end('not found');
    return;
  }
  let raw = '';
  request.on('data', (chunk) => {
    raw += chunk;
  });
  request.on('end', async () => {
    const body = JSON.parse(raw);
    const messages = body.messages ?? [];
    const system = systemOf(messages);
    await new Promise((resolve) => setTimeout(resolve, 380));
    let payload;
    if (system.includes('备课主持人')) {
      payload = contentResponse(planner());
    } else if (system.includes('独立总结员')) {
      payload = contentResponse(summary());
    } else if (system.includes('你是 SeminarRoom 的主持人')) {
      if (!toolServed && !messages.some((message) => message.role === 'tool')) {
        toolServed = true;
        payload = contentResponse('', [
          {
            id: 'mock-tool-e2e',
            type: 'function',
            function: { name: 'read_material', arguments: '{"ids":[2]}' },
          },
        ]);
      } else {
        payload = contentResponse(host(messages));
      }
    } else if (system.includes('你是 SeminarRoom 的参与者')) {
      payload = contentResponse(participant(messages, system.includes('陈疑')));
    } else {
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'unexpected system prompt' } }));
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(payload));
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock-openai] http://127.0.0.1:${PORT}/v1 (TEST ONLY, not a real model)`);
});
