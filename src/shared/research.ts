import type { SourceSnapshot, VerifiedClaim } from "./gtm";
export type HypothesisStatus =
  | "unassessed"
  | "supported"
  | "challenged"
  | "inconclusive"
  | "needs_research";
export interface Contract {
  market?: string;
  customerSegment?: string;
  validationWindow?: string;
  decisionThreshold?: string;
  revision: number;
  statement: string;
  scope: string;
  metric: string;
  method: string;
  supporting: string;
  falsification: string;
  createdAt: string;
  lockedAt: string | null;
}
export interface Delta {
  id: string;
  contractRevision: number;
  sourceId: string;
  sourceRevision: string;
  previousEvidenceIds: string[];
  relation:
    | "supporting"
    | "contradicting"
    | "inconclusive"
    | "contextual"
    | "neutral"
    | "duplicate"
    | "insufficient_evidence";
  mode: "MOCK / SYNTHETIC" | "REAL PROVIDER";
  runId?: string;
  previousStatus?: HypothesisStatus;
  proposedStatus?: HypothesisStatus;
  claim: VerifiedClaim;
  reason: string;
  createdAt: string;
}
export interface Proposal {
  id: string;
  contractRevision: number;
  from: HypothesisStatus;
  to: HypothesisStatus;
  evidenceIds: string[];
  auditId?: string;
  reason: string;
  decision: "pending" | "approved" | "rejected" | "further_research";
  createdAt: string;
  reviewedAt?: string;
  reviewNote?: string;
  reviewedStatus?: HypothesisStatus;
}
export interface Hypothesis {
  projectId?: string;
  id: string;
  createdAt: string;
  updatedAt: string;
  status: HypothesisStatus;
  statusRevision: number;
  contracts: Contract[];
  sources: SourceSnapshot[];
  deltas: Delta[];
  proposals: Proposal[];
  audits: { auditId: string; contractRevision: number; sourceIds: string[] }[];
}
export interface DecisionEvent {
  actor?: "user" | "assistant_acceptance" | "agent";
  projectId?: string;
  id: string;
  at: string;
  objectId: string;
  contractRevision: number;
  type: string;
  reason: string;
  evidenceIds: string[];
  from: HypothesisStatus | null;
  to: HypothesisStatus;
  proposedStatus?: HypothesisStatus;
  requestId: string;
  requestHash: string;
  after: Hypothesis;
  previousHash: string;
  hash: string;
}
export interface ResearchState {
  revision: number;
  hypotheses: Hypothesis[];
  events: DecisionEvent[];
}
