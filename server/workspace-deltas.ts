import type { ResearchState } from "../src/shared/research.js";
import type { WorkspaceRun, WorkspaceDelta } from "../src/shared/workspace.js";
import { digest } from "./research-materials.js";
/** Reproducible projection of immutable run snapshots + append-only human events. No model call. */
export function workspaceDeltas(
  run: WorkspaceRun,
  research: ResearchState,
): WorkspaceDelta[] {
  if (run.kind === "plan" || !run.committed) return [];
  const candidates = run.roles.flatMap((r) => r.output?.claims ?? []),
    assessments =
      run.roles.find((r) => r.role === "verifier")?.output?.assessments ?? [];
  const result: WorkspaceDelta[] = [];
  for (const verified of run.verifiedClaims) {
    const candidate = candidates.find((c) => c.id === verified.candidate.id)!;
    const frozen = run.hypotheses.find((h) => h.id === candidate.hypothesisId),
      h = research.hypotheses.find((h) => h.id === candidate.hypothesisId),
      proposal = h?.proposals.find((p) => p.reason.includes(run.id));
    const assessment = assessments.find((a) => a.claimId === candidate.id),
      record = h?.deltas.find(
        (d) => d.runId === run.id && d.claim.candidate.id === candidate.id,
      );
    const sources = [
      ...new Set(
        verified.candidate.citations.flatMap((c) =>
          run.selectedUnits
            .filter(
              (u) =>
                u.sourceId === c.sourceId && u.paragraphId === c.paragraphId,
            )
            .map((u) => u.materialKey),
        ),
      ),
    ];
    result.push({
      id: record?.id ?? "delta-" + digest(run.id + candidate.id).slice(0, 24),
      hypothesisId: frozen?.id ?? null,
      contractRevision: frozen?.contracts.at(-1)?.revision ?? null,
      runId: run.id,
      relation:
        verified.classification === "insufficient_evidence" ||
        verified.classification === "hypothesis"
          ? "insufficient_evidence"
          : (assessment?.direction ?? "contextual"),
      sourceKeys: sources,
      previousEvidenceIds: frozen?.deltas.map((d) => d.id) ?? [],
      newEvidenceIds: [record?.id ?? `claim:${run.id}:${candidate.id}`],
      previousStatus: frozen?.status ?? null,
      proposedStatus: proposal?.to ?? frozen?.status ?? null,
      reason:
        (verified.semanticReview?.reasoning ?? "Semantic support unknown") +
        " · " +
        (assessment?.reasoning ??
          "No business hypothesis directly affected; context only."),
      timestamp: run.updatedAt,
      humanDecision: proposal?.decision ?? "not_applicable",
      claimId: candidate.id,
    });
  }
  for (const frozen of run.hypotheses)
    if (!result.some((d) => d.hypothesisId === frozen.id)) {
      const current = research.hypotheses.find((h) => h.id === frozen.id),
        proposal = current?.proposals.find((p) => p.reason.includes(run.id));
      result.push({
        id: "delta-" + digest(run.id + frozen.id).slice(0, 24),
        hypothesisId: frozen.id,
        contractRevision: frozen.contracts.at(-1)!.revision,
        runId: run.id,
        relation: "neutral",
        sourceKeys: run.sourceKeys,
        previousEvidenceIds: frozen.deltas.map((d) => d.id),
        newEvidenceIds: [],
        previousStatus: frozen.status,
        proposedStatus: proposal?.to ?? frozen.status,
        reason:
          "No verified claim from this run directly addresses this contract. New material does not establish support or contradiction. Any needs_research recommendation reflects unresolved validation gaps, not positive evidence.",
        timestamp: run.updatedAt,
        humanDecision: proposal?.decision ?? "not_applicable",
      });
    }
  return result;
}
