/** GTM contracts are isolated from legacy SeminarSession/schemaVersion:1. */
import type { MaterialSegment, TokenUsage, SeminarSession } from './types.js';
export const AUDIT_PHASES = ['blue_proposal', 'red_challenge', 'verifier', 'blue_rebuttal', 'convergence'] as const;
export type AuditPhase = typeof AUDIT_PHASES[number];
export const MODEL_STAGES = ['blue_proposal', 'red_challenge', 'red_verifier', 'blue_rebuttal', 'rebuttal_verifier'] as const;
export type ModelStage = typeof MODEL_STAGES[number];
export type ExecutionStage = ModelStage | 'convergence';
export type AuditLifecycle = 'draft' | 'running' | 'paused' | 'failed' | 'cancelled' | 'completed';
export type AuditPosition =
  | { phase: 'blue_proposal' | 'red_challenge'; substate: 'generating' | 'repairing' | 'validated' }
  | { phase: 'verifier'; substate: 'citation_check' | 'red_repair_pending' | 'reviewing' | 'repairing' | 'verified' }
  | { phase: 'blue_rebuttal'; substate: 'generating' | 'blue_repairing' | 'citation_check' | 'rebuttal_verifying' | 'verifier_repairing' | 'verified' }
  | { phase: 'convergence'; substate: 'assembling' | 'assembled' };
export type AuditState = AuditPosition & { lifecycle: AuditLifecycle };
export interface GtmConfig {
  protocolVersion: 'gtm-p1a-v1';
  structure: { maxRisks: 8; maxClaimsPerRisk: 4; maxCitationsPerClaim: 3 };
  capacity: { maxSources: number; maxSourceChars: number; maxTotalChars: number; materialEstimatedTokens: number; requestEstimatedInputTokens: number };
  requests: { maxCalls: number; maxPerStage: 2; outputTokens: Record<ModelStage, number> };
  estimator: { version: 'gtm-conservative-v1' | 'gtm-conservative-v2'; cjkTokensPerCodePoint: number; otherTokensPerCodePoint: number; riskTokensPerCodePoint?: number; safetyFactor: number; requestOverheadTokens: number };
  text: { id: number; short: number; long: number; quoteUtf16: 220; businessBrief: number; note: number; listItems: number };
}
export type RiskType = 'market' | 'competition' | 'compliance' | 'pricing' | 'unit_economics' | 'distribution';
export type EvidenceRelation = 'supported' | 'partially_supported' | 'unsupported' | 'insufficient_evidence';
export type ClaimClassification = 'material_fact' | 'inference' | 'hypothesis' | 'insufficient_evidence';
export interface BusinessContext { businessBrief: string; projectName?: string; clientLabel?: string; targetMarket?: string; targetCustomer?: string; competitorInfo?: string; background?: string }
export interface SourceDocument {
  id: string; revision: string; title: string; sourceType: 'pasted_text' | 'txt' | 'md';
  sourceKind?: 'official' | 'financial_report' | 'legal' | 'media' | 'forum' | 'other' | 'unknown';
  originalUrl?: string; publishedAt?: string; accessedAt: string; jurisdiction?: string; rawContent: string;
  paragraphSegmentationVersion: 'paragraph-v1';
}
export type SourceInput = Omit<SourceDocument, 'revision' | 'paragraphSegmentationVersion'>;
export interface SourceSnapshot extends SourceDocument { paragraphs: MaterialSegment[] }
export interface CitationCandidate { sourceId: string; materialRevision: string; paragraphId: number; quote: string }
export interface EvidenceCitation extends CitationCandidate { matchMode: 'exact' | 'normalized'; normalizationVersion?: 'citation-norm-v1' }
export type CitationCheck = { ok: true; citation: EvidenceCitation } | { ok: false; candidate: CitationCandidate; reason: string };
export interface BlueProposal { target_market: string | null; target_customer: string | null; value_prop: string; pricing_model: string | null; gtm_channels: string[]; key_assumptions: string[]; unknowns: string[] }
/** Model kind is a suggestion. citations is the only authoritative model evidence field. */
export interface ClaimCandidate { id: string; text: string; kind: 'observation' | 'inference'; reasoning: string; citations: CitationCandidate[] }
export interface RedChallenge {
  id: string; risk_type: RiskType; description: string; reasoning: string;
  assumptions: string[]; proposed_validation: string[];
  /** Model-assessed severity, not objective probability. */
  severity: 'critical' | 'high' | 'medium' | 'low'; claims: ClaimCandidate[];
}
export interface SemanticReview { claimId: string; relation: EvidenceRelation; directlyStated: boolean; reasoning: string }
export interface VerifiedClaim { candidate: ClaimCandidate; citationChecks: CitationCheck[]; semanticReview: SemanticReview | null; classification: ClaimClassification }
export interface VerifiedChallenge { challenge: RedChallenge; claims: VerifiedClaim[]; readonly evidence_citations: readonly EvidenceCitation[] }
export interface BlueRebuttal { challengeId: string; response: 'accepted' | 'rebutted' | 'revised' | 'unresolved'; reasoning: string; claims: ClaimCandidate[] }
export interface VerifiedRebuttal { rebuttal: BlueRebuttal; claims: VerifiedClaim[]; readonly evidence_citations: readonly EvidenceCitation[] }
export interface HumanReview { challengeId: string; decision: 'include' | 'further_research' | 'not_applicable'; note: string; reviewedAt: string }
/** Structural exhaustion fails the stage; citation exhaustion excludes only invalid evidence.
 * Execution of this policy belongs to P1-B, sharing the original Agent's repair slot.
 */
export type ValidationIssue =
  | { category: 'structure'; code: 'invalid_json' | 'output_truncated' | 'invalid_schema' | 'claim_id_mismatch' | 'missing_field' | 'quantity_limit' }
  | { category: 'citation'; code: 'quote_not_found' | 'cross_paragraph' | 'source_revision_mismatch' | 'normalized_mismatch'; claimId: string };
export type RepairReason = 'structure' | 'citation' | 'truncated' | 'transport';
export interface AuditCallRecord {
  id: string; commandId: string; stage: ModelStage; attempt: 1 | 2; repairReason: RepairReason | null;
  configuredModel: string; returnedModel: string | null; startedAt: string; finishedAt: string | null; durationMs: number | null;
  status: 'pending' | 'ok' | 'error' | 'aborted' | 'interrupted'; httpStatus: number | null;
  estimatedInputTokens: number; estimatorVersion: string; maxOutputTokens: number;
  usage: TokenUsage; finishReason: string | null; schemaValid: boolean | null; errorCode: string | null;
  // Metadata only: never store API keys, raw prompts/materials or provider bodies here.
}
export interface AuditUsage {
  calls: number; knownPromptTokens: number; knownCompletionTokens: number; knownTotalTokens: number;
  missingUsageCalls: number; availability: 'available' | 'partial' | 'unavailable';
}
export interface RequestLedger { calls: AuditCallRecord[]; usage: AuditUsage }
export interface SourceBudgetItem { sourceId: string; title: string; originalChars: number; estimatedTokens: number; selected: boolean }
export interface SourceSelection {
  selectedSourceIds: string[]; sources: SourceBudgetItem[]; selectedChars: number; estimatedMaterialTokens: number;
  estimatorVersion: string; estimateOnly: true; withinBudget: boolean; overBudgetSourceIds: string[];
}
/** P1-A persistence aggregate. No Agent executor or generated phase outputs yet. */
export interface AuditRun {
  schemaVersion: 'gtm-audit-v1'; id: string; recordRevision: number; createdAt: string; updatedAt: string;
  configSnapshot: GtmConfig; context: BusinessContext; sources: SourceSnapshot[]; selection: SourceSelection;
  state: AuditState; ledger: RequestLedger; execution?: AuditExecution;
  humanReviews?: HumanReview[];
  providerSnapshot?: {mode:'mock'|'real';model:string};
}
/** Typed phase snapshots reserved for P1-B; not executed/persisted by P1-A. */
export interface StageIO {
  blue_proposal: { input: { context: BusinessContext; sources: SourceSnapshot[] }; output: BlueProposal };
  red_challenge: { input: { proposal: BlueProposal; sources: SourceSnapshot[] }; output: { challenges: RedChallenge[] } };
  red_verifier: { input: { challenges: RedChallenge[]; sources: SourceSnapshot[] }; output: { findings: VerifiedChallenge[] } };
  blue_rebuttal: { input: { proposal: BlueProposal; findings: VerifiedChallenge[]; sources: SourceSnapshot[] }; output: { rebuttals: BlueRebuttal[] } };
  rebuttal_verifier: { input: { rebuttals: BlueRebuttal[]; sources: SourceSnapshot[] }; output: { rebuttals: VerifiedRebuttal[] } };
  convergence: { input: { findings: VerifiedChallenge[]; rebuttals: VerifiedRebuttal[] }; output: AuditReport };
}
export type StageRecord<S extends ExecutionStage = ExecutionStage> = S extends ExecutionStage ? {
  stage: S; status: 'pending' | 'running' | 'succeeded' | 'failed' | 'paused' | 'cancelled';
  inputSnapshot: StageIO[S]['input']; output: StageIO[S]['output'] | null;
  startedAt: string | null; finishedAt: string | null; callIds: string[];
  retryCount: 0 | 1; error: { code: string; message: string; at: string } | null;
} : never;
export interface AuditReport {
  schemaVersion: 'gtm-report-v1'; auditId: string; generatedAt: string;
  notice: 'AI-generated draft — Human review required'; context: BusinessContext; initialProposal: BlueProposal;
  verifiedFindings: VerifiedChallenge[]; unsupportedChallenges: VerifiedChallenge[];
  rebuttals: VerifiedRebuttal[]; criticalUnknowns: string[]; validationExperiments: string[];
  sourceRegister: SourceSnapshot[]; evidenceReferences: EvidenceCitation[];
  humanReviews: HumanReview[]; methodology: string[]; limitations: string[];
  originalChallenges: RedChallenge[]; coverage: { selected: SourceBudgetItem[]; excluded: SourceBudgetItem[]; storageCapacityNotice: string };
  calls: AuditCallRecord[]; usage: AuditUsage; citationFailures: IntegrityRecord[];
}
export type LocalRecord = { kind: 'seminar'; session: SeminarSession } | { kind: 'gtm-audit'; audit: AuditRun };

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key:string]: JsonValue };
export type ModelOutput = BlueProposal | { challenges:RedChallenge[] } | { reviews:SemanticReview[] } | { rebuttals:BlueRebuttal[] };
export interface ModelAttempt { callId:string; inputHash:string; inputSnapshot?:JsonValue; output:ModelOutput|null; errorCode:string|null }
export interface ModelCheckpoint { inputSnapshot:JsonValue; attempts:ModelAttempt[]; output:ModelOutput|null; sealed:boolean; skipped:boolean }
export interface IntegrityRecord { stage:'red_challenge'|'blue_rebuttal'; callId:string; failures:{claimId:string;candidate:CitationCandidate;reason:string}[] }
export interface AuditExecution {
  checkpoints:Partial<Record<ModelStage,ModelCheckpoint>>;
  integrity:IntegrityRecord[]; findings:VerifiedChallenge[]|null; rebuttals:VerifiedRebuttal[]|null;
  report:AuditReport|null; markdown:string|null;
  lastError:{code:string;stage:ModelStage|null;at:string;estimatedInputTokens?:number;budgetLimit?:number}|null; needsManualRecovery:boolean;
}
