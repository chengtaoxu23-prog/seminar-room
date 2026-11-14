import type { ClaimCandidate, SourceSnapshot, VerifiedClaim } from "./gtm";
import type { Contract, Hypothesis, HypothesisStatus } from "./research";
import type { TokenUsage } from "./types";
export const RESEARCH_ROLES = [
  "planner",
  "market",
  "competitor",
  "customer",
  "business",
  "redteam",
  "verifier",
  "decision",
] as const;
export type ResearchRole = (typeof RESEARCH_ROLES)[number];
export interface MaterialUnit {
  id: string;
  text: string;
  locator: string;
  formula?: string;
  cachedValue?: string | null;
  rawValue?: string;
}
export interface Material {
  id: string;
  revision: string;
  fileHash: string;
  name: string;
  title: string;
  format: string;
  url?: string;
  publishedAt?: string;
  publicationBasis?: string;
  acquiredAt: string;
  bytes: number;
  parserVersion: "material-v2";
  units: MaterialUnit[];
  warnings: string[];
}
export interface ResearchProject {
  id: string;
  name: string;
  brief: string;
  market: string;
  customer: string;
  createdAt: string;
  updatedAt: string;
  materialKeys: string[];
  imports?: {
    id: string;
    at: string;
    name: string;
    url?: string;
    fileHash: string;
    materialKey?: string;
    classification: "new" | "duplicate" | "failed";
    reason: string;
  }[];
}
export type DeltaRelation =
  | "supporting"
  | "contradicting"
  | "contextual"
  | "neutral"
  | "duplicate"
  | "insufficient_evidence";
export interface ResearchClaim extends ClaimCandidate {
  hypothesisId: string;
  direction: DeltaRelation;
}
export interface AgentOutput {
  summary: string;
  sections: { title: string; body: string }[];
  gaps: string[];
  claims: ResearchClaim[];
  contracts?: Omit<Contract, "revision" | "createdAt" | "lockedAt">[];
  reviews?: {
    claimId: string;
    relation:
      | "supported"
      | "partially_supported"
      | "unsupported"
      | "insufficient_evidence";
    directlyStated: boolean;
    reasoning: string;
  }[];
  assessments?: {
    claimId: string;
    hypothesisId: string;
    direction: DeltaRelation;
    criteriaMet: boolean;
    reasoning: string;
  }[];
}
export interface AgentCall {
  id: string;
  role: ResearchRole;
  attempt: number;
  startedAt: string;
  finishedAt: string | null;
  status: "pending" | "ok" | "error" | "interrupted";
  request: unknown;
  requestHash: string;
  response: string | null;
  estimatedInputTokens: number;
  usage: TokenUsage;
  returnedModel: string | null;
  httpStatus: number | null;
  finishReason: string | null;
  error: string | null;
}
export interface RoleExecution {
  role: ResearchRole;
  status: "waiting" | "running" | "completed" | "failed";
  output: AgentOutput | null;
  error: string | null;
}
export interface WorkspaceRun {
  id: string;
  projectId: string;
  kind: "plan" | "research" | "delta";
  status: "running" | "completed" | "failed" | "paused";
  createdAt: string;
  updatedAt: string;
  model: string;
  mode: "real";
  maxCalls: 16;
  calls: AgentCall[];
  roles: RoleExecution[];
  sourceKeys: string[];
  sources: SourceSnapshot[];
  selectedUnits: {
    materialKey: string;
    unitId: string;
    sourceId: string;
    locator: string;
    paragraphId?: number;
  }[];
  coverage: {
    availableUnits: number;
    selectedUnits: number;
    omittedUnits: number;
    strategy: string;
  };
  hypotheses: Hypothesis[];
  verifiedClaims: VerifiedClaim[];
  error: string | null;
  committed: boolean;
  deltas?: WorkspaceDelta[];
}
export interface WorkspaceState {
  schemaVersion: "research-workspace-v1";
  revision: number;
  projects: ResearchProject[];
  materials: Material[];
  runs: WorkspaceRun[];
}
export interface WorkspaceDelta {
  id: string;
  hypothesisId: string | null;
  contractRevision: number | null;
  runId: string;
  relation: DeltaRelation;
  sourceKeys: string[];
  previousEvidenceIds: string[];
  newEvidenceIds: string[];
  previousStatus: HypothesisStatus | null;
  proposedStatus: HypothesisStatus | null;
  reason: string;
  timestamp: string;
  humanDecision: string;
  claimId?: string;
}
