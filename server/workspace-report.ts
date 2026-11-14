import type {
  WorkspaceRun,
  ResearchProject,
  Material,
} from "../src/shared/workspace.js";
import type { ResearchState } from "../src/shared/research.js";
import { materialKey } from "./research-materials.js";
import { workspaceDeltas } from "./workspace-deltas.js";
const esc = (s: unknown) =>
  String(s ?? "unknown")
    .replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!)
    .replace(/[\\`*_[\]{}#!|]/g, "\\$&");
export function researchReport(
  project: ResearchProject,
  run: WorkspaceRun,
  materials: Material[],
  research: ResearchState,
  history: WorkspaceRun[] = [run],
): string {
  if (run.status !== "completed" || !run.committed)
    throw Error("incomplete_run_no_final_report");
  const hypotheses = research.hypotheses.filter(
      (h) => h.projectId === project.id,
    ),
    events = research.events.filter((e) =>
      hypotheses.some((h) => h.id === e.objectId),
    );
  const base =
    [...history]
      .reverse()
      .find(
        (r) =>
          r.projectId === project.id &&
          r.kind === "research" &&
          r.status === "completed" &&
          r.createdAt <= run.createdAt,
      ) ?? run;
  const included = history.filter(
    (r) =>
      r.projectId === project.id &&
      r.status === "completed" &&
      r.kind !== "plan" &&
      r.createdAt >= base.createdAt &&
      r.createdAt <= run.createdAt,
  );
  if (!included.length) included.push(run);
  const lines = [
    `# GTM Research Report · ${esc(project.name)}`,
    "",
    `Generated: ${new Date().toISOString()} · Run: ${run.id}`,
    "",
    `**REAL PROVIDER · ${esc(run.model)} · AI analysis requires human review. Public-source case research, not a real customer engagement.**`,
    "",
    `Target market: ${esc(project.market)} · Customer segment: ${esc(project.customer)}`,
    "",
    esc(project.brief),
    "",
    "## Evidence scope and limits",
    "",
    `${run.coverage.selectedUnits} / ${run.coverage.availableUnits} source units assessed; ${run.coverage.omittedUnits} units not assessed. ${esc(run.coverage.strategy)}`,
    "",
    "Publication dates marked unknown remain unknown. Acquisition time does not establish freshness. Vendor claims are attributed to their publisher. No measured customer demand, CAC or LTV is inferred from public pricing pages.",
    "",
    `Requests: ${run.calls.length} / ${run.maxCalls}. Provider-returned known tokens: ${run.calls.reduce((n, c) => n + (c.usage.totalTokens ?? 0), 0)}. Calls with missing usage: ${run.calls.filter((c) => c.usage.totalTokens === null).length}. Estimated input tokens are separate from actual usage.`,
    "",
    "## Hypothesis contracts and human status",
    "",
  ];
  for (const h of hypotheses) {
    const c = h.contracts.at(-1)!;
    lines.push(
      `### ${esc(h.id)} · r${c.revision} · ${esc(h.status)}`,
      esc(c.statement),
      "",
      `Market: ${esc(c.market ?? c.scope)} · Segment: ${esc(c.customerSegment)}`,
      `Supporting criteria: ${esc(c.supporting)}`,
      `Contradicting criteria: ${esc(c.falsification)}`,
      `Validation window: ${esc(c.validationWindow)}`,
      `Decision threshold: ${esc(c.decisionThreshold)}`,
      "",
      `Pending recommendations: ${h.proposals.filter((p) => p.decision === "pending").length}. Formal status changes only through human review.`,
      "",
    );
  }
  lines.push("## Verified claim ledger", "");
  for (const evidenceRun of included) {
    lines.push(
      `### Evidence run ${evidenceRun.id} · ${evidenceRun.kind}`,
      `Coverage: ${evidenceRun.coverage.selectedUnits}/${evidenceRun.coverage.availableUnits}; unassessed ${evidenceRun.coverage.omittedUnits}.`,
      "",
    );
    for (const claim of evidenceRun.verifiedClaims) {
      lines.push(
        `#### ${esc(claim.candidate.id)} · ${esc(claim.classification)}`,
        esc(claim.candidate.text),
        "",
        `Reasoning: ${esc(claim.candidate.reasoning)}`,
        `Verifier: ${esc(claim.semanticReview?.relation)} · ${esc(claim.semanticReview?.reasoning)}`,
        "",
      );
      for (const check of claim.citationChecks)
        if (check.ok) {
          const c = check.citation,
            selected = evidenceRun.selectedUnits.find(
              (u) =>
                u.sourceId === c.sourceId && u.paragraphId === c.paragraphId,
            ),
            material = materials.find(
              (m) => materialKey(m) === selected?.materialKey,
            );
          lines.push(
            `> ${esc(c.quote)}`,
            "",
            `Source ${esc(c.sourceId)} · ${esc(selected?.locator)} · text revision ${esc(c.materialRevision)} · material revision ${esc(material?.revision)} · original file hash ${esc(material?.fileHash)} · published ${esc(material?.publishedAt)} · acquired ${esc(material?.acquiredAt)}`,
            material?.url
              ? `Original: [public source](${material.url.replace(/[()]/g, (c) => encodeURIComponent(c))})`
              : "Original retained locally, available in Evidence Ledger.",
            "",
          );
        }
    }
  }
  lines.push(
    "## Research team analysis (AI advice; section prose is not independently verified)",
    "",
  );
  for (const analysisRun of included) {
    lines.push(`### ${analysisRun.kind} · ${analysisRun.id}`, "");
    for (const execution of analysisRun.roles) {
      lines.push(
        `#### ${esc(execution.role)} · ${execution.status}`,
        esc(execution.output?.summary),
        "",
      );
      for (const section of execution.output?.sections ?? [])
        lines.push(`##### ${esc(section.title)}`, esc(section.body), "");
      if (execution.output?.gaps.length)
        lines.push(
          "Evidence gaps:",
          ...execution.output.gaps.map((g) => "- " + esc(g)),
          "",
        );
    }
  }
  lines.push("## Evidence deltas and human decisions", "");
  for (const evidenceRun of included)
    for (const d of workspaceDeltas(evidenceRun, research))
      lines.push(
        `- Delta ${d.id}: ${d.relation}; affected hypothesis ${esc(d.hypothesisId ?? "none (context only)")}; previous ${esc(d.previousStatus)} → proposed ${esc(d.proposedStatus)}; human ${d.humanDecision}. ${esc(d.reason)}`,
      );
  for (const h of hypotheses)
    for (const d of h.deltas.filter((d) =>
      included.some((r) => r.id === d.runId),
    ))
      lines.push(
        `- ${esc(d.id)} · hypothesis ${esc(h.id)} r${d.contractRevision}: ${d.relation}; ${d.previousStatus} → proposed ${d.proposedStatus}. Previous evidence: ${d.previousEvidenceIds.map(esc).join(", ") || "none"}. ${esc(d.reason)}`,
      );
  for (const e of events)
    lines.push(
      `- ${e.at} · ${esc(e.type)} · ${esc(e.objectId)} r${e.contractRevision}: ${esc(e.from)} → ${esc(e.to)}. ${esc(e.reason)}. Evidence: ${e.evidenceIds.map(esc).join(", ") || "none"}. Decision ID: ${e.id}`,
    );
  lines.push("", "## Request audit", "");
  for (const auditedRun of history.filter((r) => r.projectId === project.id))
    for (const c of auditedRun.calls)
      lines.push(
        `- Run ${auditedRun.id} (${auditedRun.status}) · ${c.id} · ${c.role} attempt ${c.attempt} · ${c.status} · ${c.startedAt} · actual usage ${JSON.stringify(c.usage)} · estimated input ${c.estimatedInputTokens} · error ${esc(c.error ?? "none")}`,
      );
  return lines.join("\n") + "\n";
}
