import type { ReplayScript, StatementBlock } from '../src/shared/types';
import { DEFAULT_ROLES } from '../src/shared/types';
import { segmentMaterial } from '../src/shared/material';
import { EXAMPLE_MATERIALS } from './materials';

const material = EXAMPLE_MATERIALS[0].material;
const segments = segmentMaterial(material);
const topic = EXAMPLE_MATERIALS[0].topic;
const roles = structuredClone(DEFAULT_ROLES);

function block(
  type: StatementBlock['type'],
  text: string,
  paragraphId?: number,
  quote?: string,
): StatementBlock {
  return {
    type,
    text,
    citations:
      paragraphId && quote ? [{ paragraphId, quote }] : [],
  };
}

const messages: ReplayScript['messages'] = [
  {
    id: 'replay-m1',
    role: 'host',
    actorId: 'host',
    actorName: roles.host.name,
    kind: 'opening',
    round: 1,
    text: '我们先不急着下结论，只看 22:00 后的需求是否稳定。周证，请从签到记录里给出一个支持延长的理由，并说明它的局限。',
    blocks: [],
    addresses: [],
    hostAction: {
      action: 'invite',
      participantId: 'a',
      publicMessage: '我们先不急着下结论，只看 22:00 后的需求是否稳定。周证，请从签到记录里给出一个支持延长的理由，并说明它的局限。',
      prompt: '从签到记录中找一个支持延长的数据，并主动说明这个数据不能证明什么。',
      focus: '22:00 后需求是否稳定',
      addressUserMessageIds: [],
      respondToMessageIds: [],
      reason: '先让材料派把事实和限制同时摆出来，避免直接站队。',
      endReason: null,
    },
    createdAt: '2026-11-04T20:01:00+08:00',
  },
  {
    id: 'replay-m2',
    role: 'participant',
    actorId: 'a',
    actorName: roles.a.name,
    kind: 'statement',
    round: 1,
    text: '9% 不是零，但也不能直接当作稳定需求。',
    blocks: [
      block(
        'evidence',
        '按材料，21:00—22:00 的签到占 29%，22:00 后仍留下的人次占 9%。以 1,246 人次计算，22:00 后约有 112 人次，这说明需求存在，但不是每晚都稳定出现。',
        2,
        '21:00—22:00 占 29%，22:00 之后仍留在空间的人次占 9%',
      ),
      block(
        'claim',
        '我支持先做六周试点，但前提是单独统计 22:00 后的去重人数，而不是拿人次当人数。现有记录没有离开时间，也没有区分短暂停留和整晚使用，所以“9%”只能说明有使用，不能说明值得长期延长。',
      ),
    ],
    addresses: ['replay-m1'],
    participant: {
      addresses: ['replay-m1'],
      stanceUpdate: { changed: false, note: '' },
      directToUser: false,
      citationWarnings: [],
      directResponseWarning: null,
    },
    createdAt: '2026-11-04T20:01:40+08:00',
  },
  {
    id: 'replay-m3',
    role: 'host',
    actorId: 'host',
    actorName: roles.host.name,
    kind: 'invite',
    round: 2,
    text: '陈疑，周证把 9% 换算成约 112 人次。这个数字能代表稳定需求吗？请从统计口径和值班成本两方面检验。',
    blocks: [],
    addresses: [],
    hostAction: {
      action: 'clarify',
      participantId: 'b',
      publicMessage: '陈疑，周证把 9% 换算成约 112 人次。这个数字能代表稳定需求吗？请从统计口径和值班成本两方面检验。',
      prompt: '直接检验“112 人次”能否代表稳定需求，并结合值班成本说明你的判断。',
      focus: '统计口径与成本',
      addressUserMessageIds: [],
      respondToMessageIds: ['replay-m2'],
      reason: '引入检验派，针对上一个论证的统计口径和成本发难。',
      endReason: null,
    },
    createdAt: '2026-11-04T20:02:20+08:00',
  },
  {
    id: 'replay-m4',
    role: 'participant',
    actorId: 'b',
    actorName: roles.b.name,
    kind: 'statement',
    round: 2,
    text: '人次不是人数，9% 也不是晚间需求占比。',
    blocks: [
      block(
        'evidence',
        '材料明确说，记录没有区分短暂停留和整晚使用，也没有记录离开时间。那 112 人次可能是同几个人反复签到，不能推出“有稳定的一群人需要 24:00”。',
        2,
        '记录没有区分“短暂停留”和“整晚使用”，也没有记录离开时间',
      ),
      block(
        'claim',
        '成本端更直接：十周值班支出约 10,800 元，已经是固定成本。再延长两小时，即使只有少数人使用，值班人员也不能少。用 9% 支持 24:00 的长期规则，证据不够。',
      ),
      block(
        'concession',
        '不过我不反对试点。问题不是“要不要试”，而是“试什么、用什么指标停”。',
      ),
    ],
    addresses: ['replay-m2'],
    participant: {
      addresses: ['replay-m2'],
      stanceUpdate: { changed: false, note: '' },
      directToUser: false,
      citationWarnings: [],
      directResponseWarning: null,
    },
    createdAt: '2026-11-04T20:03:00+08:00',
  },
  {
    id: 'replay-user-1',
    role: 'user',
    actorId: 'user',
    actorName: '你',
    kind: 'user',
    round: 2,
    text: '如果只在周五延长到 23:00，而不是 24:00，能不能先压低值班成本？',
    blocks: [],
    addresses: [],
    createdAt: '2026-11-04T20:03:30+08:00',
  },
  {
    id: 'replay-m5',
    role: 'host',
    actorId: 'host',
    actorName: roles.host.name,
    kind: 'invite',
    round: 3,
    text: '用户提出了一个具体折中：周五只延到 23:00。周证，请你直接回答这个方案，并回应陈疑关于“112 人次不等于稳定需求”的质疑。',
    blocks: [],
    addresses: ['replay-user-1'],
    hostAction: {
      action: 'invite',
      participantId: 'a',
      publicMessage: '用户提出了一个具体折中：周五只延到 23:00。周证，请你直接回答这个方案，并回应陈疑关于“112 人次不等于稳定需求”的质疑。',
      prompt: '先直接回应用户的 23:00 折中，算清追加成本；再回应陈疑的统计口径质疑。不要换题。',
      focus: '直接回应用户：23:00 折中',
      addressUserMessageIds: ['replay-user-1'],
      respondToMessageIds: ['replay-m4'],
      reason: '用户插话改变了方案参数，先让最熟悉签到数据的周证直接回应。',
      endReason: null,
    },
    createdAt: '2026-11-04T20:04:00+08:00',
  },
  {
    id: 'replay-m6',
    role: 'participant',
    actorId: 'a',
    actorName: roles.a.name,
    kind: 'statement',
    round: 3,
    text: '只延一小时，追加成本可减半；先测再决定。',
    blocks: [
      block(
        'evidence',
        '直接回答你的问题：按材料，延长两小时需要 2 名值班人员、每人每小时 60 元，即每周 240 元。只延到 23:00 则是一小时，追加值班成本约为每周 120 元，六周约 720 元，而不是 1,440 元。',
        5,
        '延长时段需要额外 2 名值班人员，按每小时 60 元计算',
      ),
      block(
        'concession',
        '陈疑说得对：112 人次不能当作稳定人数。我接受把“22:00 后去重人数”和“22:30 后仍在场人数”作为试行指标，而不是用总人次证明需求。',
      ),
      block(
        'claim',
        '23:00 折中降低了成本，但仍需要安静研讨室和值班安排。我支持试六周，用“每小时追加成本 ÷ 新增去重使用人数”决定是否继续。',
      ),
    ],
    addresses: ['replay-user-1', 'replay-m4'],
    participant: {
      addresses: ['replay-user-1', 'replay-m4'],
      stanceUpdate: {
        changed: true,
        note: '接受陈疑对“人次≠人数”的质疑，把论据从总人次改为去重人数与单位成本。',
      },
      directToUser: true,
      citationWarnings: [],
      directResponseWarning: null,
    },
    createdAt: '2026-11-04T20:04:45+08:00',
  },
  {
    id: 'replay-m7',
    role: 'host',
    actorId: 'host',
    actorName: roles.host.name,
    kind: 'invite',
    round: 4,
    text: '陈疑，周证已经接受你的统计质疑，并提出用单位成本做停止条件。你认为这套指标还缺什么？',
    blocks: [],
    addresses: [],
    hostAction: {
      action: 'clarify',
      participantId: 'b',
      publicMessage: '陈疑，周证已经接受你的统计质疑，并提出用单位成本做停止条件。你认为这套指标还缺什么？',
      prompt: '评价 23:00 折中的指标是否足够，指出至少一个仍未被测量的风险，并说明你是否改变立场。',
      focus: '试行指标还缺什么',
      addressUserMessageIds: [],
      respondToMessageIds: ['replay-m6'],
      reason: '让检验派收束成本讨论，并检验试行指标是否可操作。',
      endReason: null,
    },
    createdAt: '2026-11-04T20:05:20+08:00',
  },
  {
    id: 'replay-m8',
    role: 'participant',
    actorId: 'b',
    actorName: roles.b.name,
    kind: 'statement',
    round: 4,
    text: '我接受短期试行，但不接受把最低时长直接写死。',
    blocks: [
      block(
        'evidence',
        '双方已经同意：如果要延长，先做短期试行，并记录 22:00 后的独立使用人数、人均成本、取消或改期情况以及值班人员反馈。这几项正好能检验 23:00 折中，不必先写进长期规则。',
        7,
        '双方都同意的一点是：如果要延长，应该先做短期试行，并记录 22:00 后的独立使用人数、人均成本、取消或改期情况以及值班人员反馈',
      ),
      block(
        'concession',
        '把追加成本减半后，我对试行的反对减弱了。23:00 比 24:00 更容易控制安全和值班疲劳。',
      ),
      block(
        'claim',
        '但“单位成本”仍缺少分母：新增使用人数可能包含原本就会来的人。应同时记录 22:00 前已在场、22:00 后新到、以及只是晚走三类人。这样才知道延长创造的是新增使用，还是把原有使用时间后移。',
      ),
    ],
    addresses: ['replay-m6'],
    participant: {
      addresses: ['replay-m6'],
      stanceUpdate: {
        changed: true,
        note: '从“证据不足，不应延长”调整为“可做 23:00 的六周试行，但不写死长期规则”。',
      },
      directToUser: false,
      citationWarnings: [],
      directResponseWarning: null,
    },
    createdAt: '2026-11-04T20:06:00+08:00',
  },
  {
    id: 'replay-m9',
    role: 'host',
    actorId: 'host',
    actorName: roles.host.name,
    kind: 'invite',
    round: 5,
    text: '双方都已接受 23:00 的六周试行，并同意用去重使用人数和单位成本评估；剩余分歧是要不要写进长期规则。继续追问只会重复，我们停在这里。',
    blocks: [],
    addresses: [],
    hostAction: {
      action: 'end',
      participantId: null,
      publicMessage: '双方都已接受 23:00 的六周试行，并同意用去重使用人数和单位成本评估；剩余分歧是要不要写进长期规则。继续追问只会重复，我们停在这里。',
      prompt: '',
      focus: '收束',
      addressUserMessageIds: [],
      respondToMessageIds: [],
      reason: '核心分歧已定位，双方都接受可执行的试行方案，继续讨论边际收益低。',
      endReason: '已形成可执行的试行方案，剩余分歧需要真实试行数据而不是继续论证。',
    },
    createdAt: '2026-11-04T20:06:30+08:00',
  },
];

export const REPLAY_SCRIPTS: ReplayScript[] = [
  {
    id: 'commons-hours-replay',
    title: '共学空间开放时间 · 示例回放',
    description:
      '一段预先编写的互动演示：主持人安排发言，两位参与者围绕 9% 的统计口径互相质疑，用户插话提出 23:00 折中，随后得到针对性回应。',
    notice:
      '示例回放：非实时模型输出，也不是模型能力或事实证据。引文仍可在左侧材料中逐条核对。',
    material: { raw: material, segments },
    topic,
    questions: EXAMPLE_MATERIALS[0].suggestedQuestions.map((text, index) => ({
      id: `replay-q${index + 1}`,
      text,
      origin: 'example',
    })),
    roles,
    messages,
    summary: {
      status: 'ready',
      consensus: [
        '22:00 后确实有人在用，但现有签到记录不能证明存在稳定的 24:00 需求。',
        '双方都接受先做六周试行，并用去重使用人数、追加成本和值班反馈评估。',
        '23:00 折中比 24:00 更容易控制追加成本与值班风险。',
      ],
      disagreements: [
        '周证最初倾向直接支持延长，陈疑认为证据只能支持小范围试点；两人都在讨论中调整了措辞。',
        '陈疑主张把“至少开放到 23:00”写入长期规则前必须看到试行数据；周证认为可以先按试行安排执行，不必先改规则。',
      ],
      evidence: [
        {
          paragraphId: 2,
          quote: '21:00—22:00 占 29%，22:00 之后仍留在空间的人次占 9%',
          note: '支持“有晚间使用”，但不支持“有稳定的一群人需要到 24:00”。',
        },
        {
          paragraphId: 2,
          quote: '记录没有区分“短暂停留”和“整晚使用”，也没有记录离开时间',
          note: '说明人次无法直接换算成独立需求人数。',
        },
        {
          paragraphId: 5,
          quote: '延长时段需要额外 2 名值班人员，按每小时 60 元计算',
          note: '用于估算 23:00 折中的追加成本约为 24:00 方案的一半。',
        },
        {
          paragraphId: 7,
          quote: '双方都同意的一点是：如果要延长，应该先做短期试行，并记录 22:00 后的独立使用人数、人均成本、取消或改期情况以及值班人员反馈',
          note: '为试行指标提供了材料内的共同基础。',
        },
      ],
      unresolved: [
        '22:00 后的新增使用人数是否足以覆盖 120 元/周的追加值班成本。',
        '“周五至少开放到 23:00”应写进长期规则，还是只作为六周试行安排。',
        '安静研讨室的借用、夜间安全和值班学生疲劳如何纳入评估。',
      ],
      generatedAt: '2026-11-04T20:07:00+08:00',
      editedAt: null,
      model: '示例回放（预先编写）',
      warnings: ['这是预先编写的示例，不是真实模型运行产物。'],
      error: null,
    },
    recordedAt: '2026-11-04',
  },
];

export function getReplay(id: string): ReplayScript | undefined {
  return REPLAY_SCRIPTS.find((script) => script.id === id);
}
