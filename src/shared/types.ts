/**
 * Shared contracts for the server and the browser.
 * Deliberately small: no API key, raw prompt, or provider response body lives here.
 */

export const DEFAULT_LIMITS = {
  maxRounds: 6,
  maxCalls: 30,
  maxOutputTokens: 700,
  timeoutMs: 60_000,
} as const;

export type Stage = 'draft' | 'running' | 'paused' | 'ended' | 'error';
export type RoleKey = 'host' | 'a' | 'b';
export type CallRole = 'planner' | 'host' | 'participant' | 'summarizer';
export type ActivityPhase =
  | 'idle'
  | 'planning'
  | 'host_thinking'
  | 'participant_thinking'
  | 'summarizing';

export interface SessionLimits {
  maxRounds: number;
  maxCalls: number;
  maxOutputTokens: number;
  timeoutMs: number;
}

export interface MaterialSegment {
  id: number;
  text: string;
  chars: number;
}

export interface DiscussionQuestion {
  id: string;
  text: string;
  origin: 'model' | 'edited' | 'example';
}

export interface Citation {
  paragraphId: number;
  quote: string;
}

export type BlockType =
  | 'claim'
  | 'evidence'
  | 'concession'
  | 'question'
  | 'background';

export interface StatementBlock {
  type: BlockType;
  text: string;
  citations: Citation[];
  /** True when the model attached a citation that failed verbatim checking. */
  unverified?: boolean;
}

export interface HostAction {
  action: 'invite' | 'clarify' | 'end';
  participantId: RoleKey | null;
  publicMessage: string;
  prompt: string;
  focus: string;
  addressUserMessageIds: string[];
  respondToMessageIds: string[];
  reason: string;
  endReason: string | null;
}

export interface StanceUpdate {
  changed: boolean;
  note: string;
}

export interface ParticipantMeta {
  addresses: string[];
  stanceUpdate: StanceUpdate;
  directToUser: boolean;
  citationWarnings: string[];
  directResponseWarning: string | null;
}

export interface SeminarMessage {
  id: string;
  role: 'host' | 'participant' | 'user' | 'system';
  actorId: RoleKey | 'user' | 'system';
  actorName: string;
  kind: 'opening' | 'invite' | 'statement' | 'user' | 'notice';
  round: number;
  text: string;
  blocks: StatementBlock[];
  addresses: string[];
  hostAction?: HostAction;
  participant?: ParticipantMeta;
  callId?: string;
  createdAt: string;
}

export interface PlannerQuestion {
  text: string;
  rationale: string;
}

export interface DecisionRecord {
  id: string;
  round: number;
  action: HostAction['action'];
  participantId: RoleKey | null;
  reason: string;
  addressUserMessageIds: string[];
  respondToMessageIds: string[];
  callId: string;
  at: string;
}

export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  resultChars: number;
  segmentIds: number[];
  at: string;
}

export interface TokenUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export interface CallLog {
  id: string;
  role: CallRole;
  actorId: CallRole | RoleKey;
  actorName: string;
  purpose:
    | 'plan_questions'
    | 'host_turn'
    | 'participant_turn'
    | 'summary'
    | 'schema_repair';
  round: number;
  model: string;
  startedAt: string;
  durationMs: number;
  status: 'ok' | 'error' | 'aborted';
  httpStatus: number | null;
  usage: TokenUsage;
  outputChars: number;
  contextHash: string;
  toolCalls: ToolCallRecord[];
  schemaRetry: boolean;
  validationError?: string;
  error?: string;
}

export interface UsageSummary {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  usageMissingCalls: number;
}

export interface SummaryEvidence {
  paragraphId: number;
  quote: string;
  note: string;
}

export interface SummaryContent {
  consensus: string[];
  disagreements: string[];
  evidence: SummaryEvidence[];
  unresolved: string[];
}

export type SummaryStatus = 'none' | 'generating' | 'ready' | 'error';

export interface SeminarSummary extends SummaryContent {
  status: SummaryStatus;
  generatedAt: string | null;
  editedAt: string | null;
  model: string | null;
  warnings: string[];
  error: string | null;
}

export interface SessionError {
  code: string;
  message: string;
  at: string;
  callId?: string;
  retryable: boolean;
}

export interface Activity {
  phase: ActivityPhase;
  actorId: RoleKey | 'summarizer' | null;
  label: string;
  startedAt: string | null;
}

export interface RoleConfig {
  name: string;
  seat: string;
}

export interface SessionConfig {
  topic: string;
  roles: {
    host: RoleConfig;
    a: RoleConfig;
    b: RoleConfig;
  };
  style: 'balanced' | 'evidence-first' | 'critical';
}

export interface SeminarSession {
  schemaVersion: 1;
  id: string;
  mode: 'live';
  createdAt: string;
  updatedAt: string;
  stage: Stage;
  stopReason: string | null;
  config: SessionConfig;
  material: {
    raw: string;
    segments: MaterialSegment[];
  };
  questions: DiscussionQuestion[];
  roles: Record<RoleKey, RoleConfig>;
  limits: SessionLimits;
  provider: {
    model: string;
    baseUrlHost: string;
    temperature: number;
  };
  round: number;
  messages: SeminarMessage[];
  calls: CallLog[];
  decisions: DecisionRecord[];
  pendingUserMessageIds: string[];
  summary: SeminarSummary;
  activity: Activity;
  lastError: SessionError | null;
  usage: UsageSummary;
}

export interface ReplayScript {
  id: string;
  title: string;
  description: string;
  notice: string;
  material: {
    raw: string;
    segments: MaterialSegment[];
  };
  topic: string;
  questions: DiscussionQuestion[];
  roles: Record<RoleKey, RoleConfig>;
  messages: SeminarMessage[];
  summary: SeminarSummary;
  recordedAt: string;
}

export interface ExampleMaterial {
  id: string;
  title: string;
  tag: '存在合理分歧' | '材料不足' | '相互冲突';
  description: string;
  material: string;
  topic: string;
  suggestedQuestions: string[];
}

export interface HealthResponse {
  ok: boolean;
  configured: boolean;
  model: string;
  baseUrlHost: string;
  limits: SessionLimits;
  dataDir: string;
  hint?: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    detail?: string;
  };
}

export const ROLE_LABELS: Record<RoleKey, string> = {
  host: '主持人',
  a: '参与者 A',
  b: '参与者 B',
};

export const DEFAULT_ROLES: Record<RoleKey, RoleConfig> = {
  host: { name: '林序', seat: '主持人 · 负责推进与收束' },
  a: { name: '周证', seat: '材料派 · 先找证据再下判断' },
  b: { name: '陈疑', seat: '检验派 · 寻找反例与未言明的前提' },
};
