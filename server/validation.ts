import type {
  BlockType,
  Citation,
  HostAction,
  MaterialSegment,
  ParticipantMeta,
  PlannerQuestion,
  SeminarSummary,
  StanceUpdate,
  StatementBlock,
  SummaryContent,
  SummaryEvidence,
} from '../src/shared/types.js';

export class SchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaError';
  }
}

const BLOCK_TYPES: BlockType[] = ['claim', 'evidence', 'concession', 'question', 'background'];

export function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) throw new SchemaError('输出中没有 JSON 对象。');
  const candidate = trimmed.slice(start, end + 1);
  try {
    return JSON.parse(candidate) as unknown;
  } catch (error) {
    throw new SchemaError(
      `JSON 解析失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SchemaError('预期一个 JSON 对象。');
  }
  return value as Record<string, unknown>;
}

function requiredString(
  value: unknown,
  field: string,
  options: { min?: number; max?: number } = {},
): string {
  if (typeof value !== 'string') throw new SchemaError(`${field} 必须是字符串。`);
  const text = value.trim();
  if (text.length < (options.min ?? 1)) throw new SchemaError(`${field} 不能为空。`);
  if (text.length > (options.max ?? 1000)) {
    throw new SchemaError(`${field} 超过 ${options.max ?? 1000} 字。`);
  }
  return text;
}

function optionalString(value: unknown, field: string, max = 500): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') throw new SchemaError(`${field} 必须是字符串。`);
  if (value.length > max) throw new SchemaError(`${field} 超过 ${max} 字。`);
  return value.trim();
}

function stringArray(value: unknown, field: string, maxItems: number): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new SchemaError(`${field} 必须是数组。`);
  const items = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  if (items.length > maxItems) throw new SchemaError(`${field} 最多 ${maxItems} 项。`);
  return [...new Set(items)];
}

export function parsePlannerQuestions(payload: unknown): PlannerQuestion[] {
  const root = object(payload);
  if (!Array.isArray(root.questions)) throw new SchemaError('questions 必须是数组。');
  if (root.questions.length !== 3) throw new SchemaError('必须恰好提出 3 个问题。');
  const seen = new Set<string>();
  return root.questions.map((entry, index) => {
    const item = object(entry);
    const text = requiredString(item.text, `questions[${index}].text`, { min: 4, max: 120 });
    if (seen.has(text)) throw new SchemaError('三个问题不能重复。');
    seen.add(text);
    return {
      text,
      rationale: optionalString(item.rationale, `questions[${index}].rationale`, 160),
    };
  });
}

export function parseHostAction(payload: unknown): HostAction {
  const root = object(payload);
  const action = requiredString(root.action, 'action', { max: 20 });
  if (!['invite', 'clarify', 'end'].includes(action)) {
    throw new SchemaError('action 只能是 invite、clarify 或 end。');
  }
  const participantRaw = root.participantId;
  const participantId =
    participantRaw === 'a' || participantRaw === 'b'
      ? participantRaw
      : participantRaw === null || participantRaw === undefined || participantRaw === 'null'
        ? null
        : (() => {
            throw new SchemaError('participantId 只能是 "a"、"b" 或 null。');
          })();
  const publicMessage = requiredString(root.publicMessage, 'publicMessage', { min: 2, max: 260 });
  const prompt = optionalString(root.prompt, 'prompt', 400);
  const focus = optionalString(root.focus, 'focus', 100);
  const reason = requiredString(root.reason, 'reason', { min: 2, max: 200 });
  const endReason = optionalString(root.endReason, 'endReason', 200);
  const addressUserMessageIds = stringArray(root.addressUserMessageIds, 'addressUserMessageIds', 5);
  const respondToMessageIds = stringArray(root.respondToMessageIds, 'respondToMessageIds', 2);

  if (action === 'end') {
    if (participantId !== null) throw new SchemaError('action=end 时 participantId 必须为 null。');
    if (!endReason) throw new SchemaError('action=end 时必须给出 endReason。');
    if (prompt) throw new SchemaError('action=end 时 prompt 必须为空。');
    return {
      action: 'end',
      participantId: null,
      publicMessage,
      prompt: '',
      focus,
      addressUserMessageIds,
      respondToMessageIds,
      reason,
      endReason,
    };
  }

  if (!participantId) throw new SchemaError('invite/clarify 必须指定 participantId a 或 b。');
  if (!prompt) throw new SchemaError('invite/clarify 必须给被点名者 prompt。');
  return {
    action: action as 'invite' | 'clarify',
    participantId,
    publicMessage,
    prompt,
    focus,
    addressUserMessageIds,
    respondToMessageIds,
    reason,
    endReason: null,
  };
}

export interface ParsedParticipant {
  blocks: StatementBlock[];
  addresses: string[];
  stanceUpdate: StanceUpdate;
  warnings: string[];
}

export function validateCitation(
  citation: Citation,
  segments: MaterialSegment[],
): { ok: true } | { ok: false; reason: string } {
  if (!Number.isInteger(citation.paragraphId) || citation.paragraphId < 1) {
    return { ok: false, reason: '段落编号不是正整数' };
  }
  const segment = segments.find((entry) => entry.id === citation.paragraphId);
  if (!segment) return { ok: false, reason: `不存在材料段落 ${citation.paragraphId}` };
  const quote = citation.quote.trim();
  if (quote.length < 3) return { ok: false, reason: '引文过短' };
  if (quote.length > 220) return { ok: false, reason: '引文过长' };
  if (/…|\.{3}/.test(quote)) return { ok: false, reason: '引文不能使用省略号' };
  if (!segment.text.includes(quote)) {
    return { ok: false, reason: `引文不是材料 ${citation.paragraphId} 的逐字原文` };
  }
  return { ok: true };
}

export function parseParticipant(
  payload: unknown,
  segments: MaterialSegment[],
): ParsedParticipant {
  const root = object(payload);
  if (!Array.isArray(root.blocks) || root.blocks.length === 0) {
    throw new SchemaError('blocks 必须是非空数组。');
  }
  if (root.blocks.length > 4) throw new SchemaError('一次发言最多 4 个块。');

  const warnings: string[] = [];
  let totalChars = 0;
  const blocks: StatementBlock[] = root.blocks.map((entry, index) => {
    const item = object(entry);
    const type = requiredString(item.type, `blocks[${index}].type`, { max: 20 }) as BlockType;
    if (!BLOCK_TYPES.includes(type)) {
      throw new SchemaError(`blocks[${index}].type 不是允许的块类型。`);
    }
    const text = requiredString(item.text, `blocks[${index}].text`, { min: 2, max: 360 });
    totalChars += text.length;

    const citationsRaw = Array.isArray(item.citations) ? item.citations : [];
    if (citationsRaw.length > 4) {
      throw new SchemaError(`blocks[${index}].citations 最多 4 条。`);
    }
    const citations: Citation[] = [];
    let unverified = false;
    for (const raw of citationsRaw) {
      const record = object(raw);
      const paragraphId = record.paragraphId;
      const quote = record.quote;
      if (typeof paragraphId !== 'number' || typeof quote !== 'string') {
        unverified = true;
        warnings.push(`第 ${index + 1} 块有一条引用字段不完整，已隐藏。`);
        continue;
      }
      const citation = { paragraphId, quote: quote.trim() };
      const checked = validateCitation(citation, segments);
      if (checked.ok) {
        citations.push(citation);
      } else {
        unverified = true;
        warnings.push(`第 ${index + 1} 块引用未通过核对：${checked.reason}，已隐藏。`);
      }
    }

    let finalType: BlockType = type;
    if (type === 'background') {
      if (citations.length > 0) {
        warnings.push(`第 ${index + 1} 块标注为背景知识，已移除材料引用以保持区分。`);
      }
      return { type: 'background', text, citations: [], unverified: false };
    }
    if (type === 'evidence' && citations.length === 0) {
      finalType = 'claim';
      warnings.push(`第 ${index + 1} 块声称是材料证据，但没有可核对引用，已降级为观点。`);
    }
    return {
      type: finalType,
      text,
      citations,
      ...(unverified ? { unverified: true } : {}),
    };
  });

  if (totalChars > 700) throw new SchemaError('本轮发言超过 700 字，请压缩。');
  if (totalChars < 30) throw new SchemaError('本轮发言过短，至少写 30 字。');

  const addresses = stringArray(root.addresses, 'addresses', 4);
  const stanceRaw = root.stanceUpdate;
  let stanceUpdate: StanceUpdate = { changed: false, note: '' };
  if (stanceRaw !== undefined) {
    const stance = object(stanceRaw);
    if (typeof stance.changed !== 'boolean') {
      throw new SchemaError('stanceUpdate.changed 必须是布尔值。');
    }
    stanceUpdate = {
      changed: stance.changed,
      note: optionalString(stance.note, 'stanceUpdate.note', 240),
    };
  }

  return {
    blocks: blocks as StatementBlock[],
    addresses,
    stanceUpdate,
    warnings,
  };
}

export function parseSummary(
  payload: unknown,
  segments: MaterialSegment[],
): { summary: SummaryContent; warnings: string[] } {
  const root = object(payload);
  const readStrings = (value: unknown, field: string): string[] => {
    if (!Array.isArray(value)) throw new SchemaError(`${field} 必须是数组。`);
    if (value.length > 5) throw new SchemaError(`${field} 最多 5 项。`);
    return value.map((item, index) =>
      requiredString(item, `${field}[${index}]`, { min: 2, max: 320 }).replace(/\s+/g, ' '),
    );
  };

  const consensus = readStrings(root.consensus ?? [], 'consensus');
  const disagreements = readStrings(root.disagreements ?? [], 'disagreements');
  const unresolved = readStrings(root.unresolved ?? [], 'unresolved');
  if (!Array.isArray(root.evidence)) throw new SchemaError('evidence 必须是数组。');
  if (root.evidence.length > 5) throw new SchemaError('evidence 最多 5 项。');

  const warnings: string[] = [];
  const evidence: SummaryEvidence[] = [];
  for (const [index, raw] of root.evidence.entries()) {
    const item = object(raw);
    const paragraphId = item.paragraphId;
    const quoteRaw = item.quote;
    if (typeof paragraphId !== 'number' || typeof quoteRaw !== 'string') {
      warnings.push(`总结依据第 ${index + 1} 项字段不完整，已移除。`);
      continue;
    }
    const quote = quoteRaw.trim();
    const checked = validateCitation({ paragraphId, quote }, segments);
    if (!checked.ok) {
      warnings.push(`总结依据第 ${index + 1} 项未通过核对：${checked.reason}，已移除。`);
      continue;
    }
    evidence.push({
      paragraphId,
      quote,
      note: optionalString(item.note, `evidence[${index}].note`, 240),
    });
  }

  return {
    summary: { consensus, disagreements, evidence, unresolved },
    warnings,
  };
}

export function emptySummary(): SeminarSummary {
  return {
    status: 'none',
    consensus: [],
    disagreements: [],
    evidence: [],
    unresolved: [],
    generatedAt: null,
    editedAt: null,
    model: null,
    warnings: [],
    error: null,
  };
}

export function isParticipantMeta(meta: ParticipantMeta | undefined): meta is ParticipantMeta {
  return Boolean(meta);
}
