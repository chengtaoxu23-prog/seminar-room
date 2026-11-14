import { randomUUID } from "node:crypto";
import type { SourceSnapshot, VerifiedClaim } from "../src/shared/gtm.js";
import type {
  AgentOutput,
  Material,
  ResearchClaim,
  ResearchProject,
  ResearchRole,
  WorkspaceRun,
} from "../src/shared/workspace.js";
import { RESEARCH_ROLES } from "../src/shared/workspace.js";
import type { Hypothesis, HypothesisStatus } from "../src/shared/research.js";
import type { RuntimeProvider } from "./gtm-runtime.js";
import { WorkspaceRepository } from "./workspace-repository.js";
import { ResearchRepository } from "./research-repository.js";
import { createSource, segmentSource } from "./gtm-sources.js";
import { createAuditDraft } from "./gtm-repository.js";
import { checkClaims, applyReviews, semanticInput } from "./gtm-execution.js";
import { parseSemanticReviews } from "./gtm-schema.js";
import { estimateRequestTokens } from "./gtm-budget.js";
import { rolePrompt, parseAgentOutput } from "./research-agents.js";
import { digest, materialKey } from "./research-materials.js";
import { SchemaError } from "./validation.js";
const now = () => new Date().toISOString();
export function selectResearchSources(
  project: ResearchProject,
  materials: Material[],
  query: string,
) {
  const tokens = [
    ...new Set(
      query.toLowerCase().match(/[a-z]{3,}|[\u4e00-\u9fff]{2,5}/g) ?? [],
    ),
  ];
  const all = materials.flatMap((m) =>
    m.units.map((u) => ({
      m,
      u,
      score: tokens.reduce(
        (n, t) => n + (u.text.toLowerCase().includes(t) ? 1 : 0),
        0,
      ),
    })),
  );
  const selected: typeof all = [];
  let chars = 0;
  const add = (entry: (typeof all)[number]) => {
    if (
      selected.length >= 20 ||
      chars + entry.u.text.length > 48000 ||
      selected.includes(entry)
    )
      return;
    selected.push(entry);
    chars += entry.u.text.length;
  };
  // At least one relevant unit per material, then lexical relevance. Full original remains available.
  for (const m of materials) {
    const best = all
      .filter((e) => e.m === m)
      .sort((a, b) => b.score - a.score)[0];
    if (best) add(best);
  }
  for (const entry of all.sort((a, b) => b.score - a.score)) add(entry);
  const sources: SourceSnapshot[] = [],
    selectedUnits: WorkspaceRun["selectedUnits"] = [],
    included = new Set<string>();
  let contextChars = 0;
  for (const { m, u } of selected) {
    const center = m.units.indexOf(u),
      near = m.units
        .slice(Math.max(0, center - 2), center + 3)
        .filter((v) => !included.has(materialKey(m) + v.id));
    if (
      !near.length ||
      contextChars + near.reduce((n, v) => n + v.text.length, 0) > 48000
    )
      continue;
    const raw = near.map((v) => v.text).join("\n\n"),
      id =
        m.id +
        "-" +
        m.revision.slice(7, 15) +
        "-" +
        near[0].id +
        "-g" +
        digest(raw).slice(0, 8);
    const source = createSource({
      id,
      title: (
        m.title +
        " · " +
        near[0].locator +
        " – " +
        near.at(-1)!.locator
      ).slice(0, 490),
      sourceType: "txt",
      rawContent: raw,
      accessedAt: m.acquiredAt,
      ...(m.url ? { originalUrl: m.url } : {}),
      ...(m.publishedAt ? { publishedAt: m.publishedAt } : {}),
    });
    sources.push(source);
    let paragraphId = 1;
    for (const unit of near) {
      included.add(materialKey(m) + unit.id);
      contextChars += unit.text.length;
      for (const _p of segmentSource(unit.text))
        selectedUnits.push({
          materialKey: materialKey(m),
          unitId: unit.id,
          sourceId: id,
          locator: unit.locator,
          paragraphId: paragraphId++,
        });
    }
  }
  return {
    sources,
    selectedUnits,
    coverage: {
      availableUnits: all.length,
      selectedUnits: included.size,
      omittedUnits: all.length - included.size,
      strategy:
        "Bounded lexical retrieval + source diversity + adjacent context (20 windows / 48000 characters). Entire source retained; omitted units are NOT assessed.",
    },
  };
}
export class WorkspaceEngine {
  private active = new Map<string, Promise<void>>();
  constructor(
    readonly repo: WorkspaceRepository,
    readonly research: ResearchRepository,
    readonly runtime?: RuntimeProvider,
  ) {}
  async init() {
    const s = await this.repo.load();
    if (s.runs.some((r) => r.status === "running"))
      await this.repo.update((s) => {
        for (const run of s.runs)
          if (run.status === "running") {
            run.status = "paused";
            run.error =
              "Process interrupted; review and explicitly resume. In-flight requests may have been billed.";
            run.updatedAt = now();
            for (const call of run.calls)
              if (call.status === "pending") {
                call.status = "interrupted";
                call.finishedAt = now();
                call.error = "interrupted_usage_unknown";
              }
            for (const role of run.roles)
              if (role.status === "running") {
                role.status = "failed";
                role.error = "interrupted";
              }
          }
      });
  }
  async create(
    projectId: string,
    kind: WorkspaceRun["kind"],
    consent: boolean,
  ): Promise<WorkspaceRun> {
    if (this.runtime?.mode !== "real")
      throw new SchemaError("真实研究必须配置真实 Provider；禁止自动回退 Mock");
    if (!consent)
      throw new SchemaError("请确认将所选材料发送到当前真实 DeepSeek Provider");
    const state = await this.repo.load(),
      project = state.projects.find((p) => p.id === projectId);
    if (!project) throw new SchemaError("研究项目不存在");
    if (
      state.runs.some(
        (r) => r.projectId === projectId && r.status === "running",
      )
    )
      throw new SchemaError("项目已有运行中的任务");
    const hypotheses = (await this.research.load()).hypotheses.filter(
      (h) => h.projectId === projectId,
    );
    if (
      kind !== "plan" &&
      (!hypotheses.length ||
        hypotheses.some((h) => !h.contracts.at(-1)?.lockedAt))
    )
      throw new SchemaError("请先生成并人工锁定所有当前 Contract");
    if (kind === "plan" && hypotheses.length)
      throw new SchemaError("项目已有 Contracts，请编辑或创建新版本");
    let keys = project.materialKeys;
    if (kind === "delta") {
      const assessed = new Set(
        state.runs
          .filter(
            (r) =>
              r.projectId === projectId &&
              r.committed &&
              r.kind !== "plan" &&
              r.hypotheses.every((old) =>
                hypotheses.some(
                  (h) =>
                    h.id === old.id &&
                    h.contracts.at(-1)!.revision ===
                      old.contracts.at(-1)!.revision,
                ),
              ),
          )
          .flatMap((r) => r.sourceKeys),
      );
      keys = keys.filter((key) => !assessed.has(key));
      if (!keys.length)
        throw new SchemaError("没有未评估的新材料；相同内容不重复请求模型");
    }
    const materials = keys
      .map((key) => state.materials.find((m) => materialKey(m) === key)!)
      .filter(Boolean);
    if (!materials.length) throw new SchemaError("请先导入真实来源");
    const selection = selectResearchSources(
      project,
      materials,
      project.brief +
        " " +
        hypotheses.map((h) => JSON.stringify(h.contracts.at(-1))).join(" "),
    );
    const roles: ResearchRole[] =
      kind === "plan"
        ? ["planner"]
        : kind === "delta"
          ? ["redteam", "verifier", "decision"]
          : [...RESEARCH_ROLES];
    const run: WorkspaceRun = {
      id: randomUUID(),
      projectId,
      kind,
      status: "running",
      createdAt: now(),
      updatedAt: now(),
      model: this.runtime.model,
      mode: "real",
      maxCalls: 16,
      calls: [],
      roles: roles.map((role) => ({
        role,
        status: "waiting",
        output: null,
        error: null,
      })),
      sourceKeys: keys,
      ...selection,
      hypotheses: structuredClone(hypotheses),
      verifiedClaims: [],
      error: null,
      committed: false,
    };
    await this.repo.update((s) => {
      if (
        s.runs.some((r) => r.projectId === projectId && r.status === "running")
      )
        throw new SchemaError("项目任务已在另一请求中启动");
      s.runs.push(run);
    });
    return run;
  }
  launch(id: string): void {
    if (this.active.has(id)) return;
    const task = this.execute(id).finally(() => this.active.delete(id));
    this.active.set(id, task);
    void task.catch(() => {});
  }
  async wait(id: string) {
    await this.active.get(id);
    return this.run(id);
  }
  async run(id: string) {
    return (
      (await this.repo.load()).runs.find((r) => r.id === id) ??
      Promise.reject(new SchemaError("运行不存在"))
    );
  }
  private async mutate(id: string, fn: (run: WorkspaceRun) => void) {
    await this.repo.update((s) => {
      const r = s.runs.find((r) => r.id === id);
      if (!r) throw Error("run_not_found");
      fn(r);
      r.updatedAt = now();
    });
  }
  async resume(id: string) {
    const r = await this.run(id);
    if (r.status === "completed" || r.status === "running")
      throw new SchemaError("只有失败或中断的任务可以恢复");
    if (r.model !== this.runtime?.model || this.runtime.mode !== "real")
      throw new SchemaError("Provider 与冻结的运行不一致");
    const next = r.roles.find((x) => x.status !== "completed");
    if (r.calls.length >= 16)
      throw new SchemaError(
        "本次运行 16 次共享请求额度已用完；失败记录保留，禁止免费重试",
      );
    await this.mutate(id, (r) => {
      r.status = "running";
      r.error = null;
    });
    this.launch(id);
  }
  private checked(run: WorkspaceRun): VerifiedClaim[] {
    return checkClaims(
      run.roles.flatMap((r) => r.output?.claims ?? []),
      run.sources,
      createAuditDraft({ businessBrief: "Research evidence verification" }),
    );
  }
  private async execute(id: string) {
    try {
      let run = await this.run(id);
      const project = (await this.repo.load()).projects.find(
        (p) => p.id === run.projectId,
      )!;
      for (const execution of run.roles) {
        if (execution.status === "completed") continue;
        run = await this.run(id);
        const role = execution.role;
        const contracts = run.hypotheses.map((h) => ({
          id: h.id,
          status: h.status,
          contract: h.contracts.at(-1),
          previousEvidence: h.deltas.map((d) => ({
            id: d.id,
            relation: d.relation,
            text: d.claim.candidate.text,
            classification: d.claim.classification,
            reason: d.reason,
          })),
        }));
        const handoffs = run.roles
          .filter((r) => r.status === "completed")
          .map((r) => ({
            role: r.role,
            summary: r.output!.summary,
            claims: r.output!.claims,
            gaps: r.output!.gaps,
          }));
        let payload: any = {
          kind: run.kind,
          project,
          hypotheses: contracts,
          sourceSnapshots: run.sources.map((s) => ({
            id: s.id,
            revision: s.revision,
            title: s.title,
            publishedAt: s.publishedAt ?? "unknown",
            accessedAt: s.accessedAt,
            paragraphs: s.paragraphs.map((p) => ({ id: p.id, text: p.text })),
          })),
          coverage: run.coverage,
          handoffs,
          currentDate: now(),
          publicationNote:
            "acquiredAt does not prove publication date or current accuracy",
        };
        if (role === "verifier")
          payload = {
            kind: run.kind,
            project,
            hypotheses: contracts,
            claimContracts: run.roles
              .flatMap((r) => r.output?.claims ?? [])
              .map((c) => ({
                claimId: c.id,
                hypothesisId: c.hypothesisId,
                proposedDirection: c.direction,
              })),
            evidence: semanticInput(this.checked(run), run.sources),
            sourceMetadata: run.sources.map((s) => ({
              id: s.id,
              title: s.title,
              publishedAt: s.publishedAt ?? "unknown",
              accessedAt: s.accessedAt,
            })),
            currentDate: now(),
          };
        if (role === "decision")
          payload = {
            kind: run.kind,
            project,
            hypotheses: contracts,
            coverage: run.coverage,
            handoffs: run.roles
              .filter((r) => r.output)
              .map((r) => ({
                role: r.role,
                summary: r.output!.summary,
                claimIds: r.output!.claims.map((c) => c.id),
              })),
            evidenceGaps: run.roles
              .filter((r) =>
                ["planner", "redteam", "verifier"].includes(r.role),
              )
              .flatMap((r) => r.output?.gaps ?? []),
            verifiedClaims: run.verifiedClaims.map((c) => ({
              id: c.candidate.id,
              text: c.candidate.text,
              kind: c.candidate.kind,
              classification: c.classification,
              semanticReview: c.semanticReview,
              citations: c.citationChecks
                .filter((v) => v.ok)
                .map((v) => (v.ok ? v.citation : null)),
            })),
            verifierAssessments: run.roles.find((r) => r.role === "verifier")
              ?.output?.assessments,
            evidenceScope:
              "Use only verified claims; no new factual claims or source access in this role.",
            currentDate: now(),
          };
        let repair: string | null = null;
        for (;;) {
          run = await this.run(id);
          if (run.calls.length >= 16) throw Error("request_budget_exhausted");
          const attempt = run.calls.filter((c) => c.role === role).length + 1;
          const request = {
            stage:
              role === "verifier"
                ? ("red_verifier" as const)
                : ("blue_proposal" as const),
            messages: [
              { role: "system" as const, content: rolePrompt(role, run.kind) },
              {
                role: "user" as const,
                content: JSON.stringify({
                  ...payload,
                  ...(repair ? { repairRequired: repair } : {}),
                }),
              },
            ],
            maxOutputTokens: 8192,
            tools: [] as never[],
            ...(/^deepseek-/i.test(run.model)
              ? { thinking: { type: "disabled" as const } }
              : {}),
          };
          const estimated = estimateRequestTokens(request);
          if (estimated > 49152)
            throw Error("estimated_context_budget_exceeded_no_truncation");
          if (
            this.runtime?.provider.sanitize?.(JSON.stringify(request)).blocked
          )
            throw Error("secret_in_request_blocked_before_dispatch");
          const callId = randomUUID();
          await this.mutate(id, (r) => {
            const x = r.roles.find((x) => x.role === role)!;
            x.status = "running";
            x.error = null;
            r.calls.push({
              id: callId,
              role,
              attempt,
              startedAt: now(),
              finishedAt: null,
              status: "pending",
              request,
              requestHash: digest(JSON.stringify(request)),
              response: null,
              estimatedInputTokens: estimated,
              usage: {
                promptTokens: null,
                completionTokens: null,
                totalTokens: null,
              },
              returnedModel: null,
              httpStatus: null,
              finishReason: null,
              error: null,
            });
          });
          let output: AgentOutput;
          try {
            if (!this.runtime || this.runtime.mode !== "real")
              throw Error("real_provider_required");
            const response = await this.runtime.provider.complete(
              request,
              new AbortController().signal,
            );
            const sanitized = this.runtime.provider.sanitize?.(
              response.content,
            ) ?? { text: response.content, blocked: false };
            await this.mutate(id, (r) => {
              const c = r.calls.find((c) => c.id === callId)!;
              c.response = sanitized.blocked
                ? "[blocked_secret_in_output]"
                : sanitized.text;
              c.usage = response.usage;
              c.returnedModel = response.returnedModel;
              c.httpStatus = response.httpStatus;
              c.finishReason = response.finishReason;
            });
            if (sanitized.blocked) throw Error("secret_in_output_blocked");
            if (response.finishReason !== "stop" || response.toolCalls?.length)
              throw Error("truncated_or_unexpected_finish");
            output = parseAgentOutput(
              role,
              run.kind,
              JSON.parse(response.content),
            );
            if (
              output.claims.some(
                (c) =>
                  c.hypothesisId &&
                  !run.hypotheses.some((h) => h.id === c.hypothesisId),
              )
            )
              throw Error("unknown_hypothesis_id");
            const checked = checkClaims(
              output.claims,
              run.sources,
              createAuditDraft({ businessBrief: "Citation validation" }),
            );
            const failures = checked.flatMap((c) =>
              c.citationChecks.filter((v) => !v.ok),
            );
            if (failures.length)
              throw Error(
                "citation_integrity_failed: " + JSON.stringify(failures),
              );
            if (role === "verifier") {
              const eligible = this.checked(run)
                .filter((c) => c.citationChecks.some((v) => v.ok))
                .map((c) => c.candidate.id);
              parseSemanticReviews(
                { reviews: output.reviews },
                undefined,
                eligible,
              );
              const assessments = output.assessments ?? [];
              if (
                assessments.length !== eligible.length ||
                new Set(assessments.map((a) => a.claimId)).size !==
                  eligible.length ||
                assessments.some(
                  (a) =>
                    !eligible.includes(a.claimId) ||
                    a.hypothesisId !==
                      (run.roles
                        .flatMap((r) => r.output?.claims ?? [])
                        .find((c) => c.id === a.claimId)?.hypothesisId ?? ""),
                )
              )
                throw Error("verifier_assessment_ids_mismatch");
            }
            await this.mutate(id, (r) => {
              const c = r.calls.find((c) => c.id === callId)!;
              c.status = "ok";
              c.finishedAt = now();
              const e = r.roles.find((e) => e.role === role)!;
              e.output = output;
              e.status = "completed";
              if (role === "verifier")
                r.verifiedClaims = applyReviews(
                  this.checked(r),
                  output.reviews!,
                );
            });
            break;
          } catch (e) {
            const raw = e instanceof Error ? e.message : "request_failed";
            const error = this.runtime?.provider.sanitize?.(raw).text ?? raw;
            await this.mutate(id, (r) => {
              const c = r.calls.find((c) => c.id === callId)!;
              c.status = "error";
              c.finishedAt = now();
              c.error = error;
              if (typeof (e as any)?.httpStatus === "number")
                c.httpStatus = (e as any).httpStatus;
              const execution = r.roles.find((e) => e.role === role)!;
              execution.status = "failed";
              execution.error = error;
            });
            if (attempt === 1 && !/secret|budget|configuration/.test(error)) {
              repair = error;
              continue;
            }
            throw Error(error);
          }
        }
      }
      run = await this.run(id);
      await this.commit(run);
      await this.mutate(id, (r) => {
        r.committed = true;
        r.status = "completed";
        r.error = null;
      });
    } catch (e) {
      await this.mutate(id, (r) => {
        r.status = /budget/.test(String(e)) ? "paused" : "failed";
        r.error = e instanceof Error ? e.message : "run_failed";
      });
    }
  }
  private async commit(run: WorkspaceRun) {
    const requestId = "workspace-" + run.id;
    for (let retry = 0; retry < 3; retry++) {
      const current = await this.research.load();
      try {
        await this.research.transact(
          requestId,
          current.revision,
          {
            actor: "agent",
            runId: run.id,
            kind: run.kind,
            outputs: run.roles.map((r) => r.output),
          },
          (s, emit) => {
            if (run.kind === "plan") {
              for (const draft of run.roles[0].output!.contracts!) {
                const at = now();
                const h: Hypothesis = {
                  id: randomUUID(),
                  projectId: run.projectId,
                  createdAt: at,
                  updatedAt: at,
                  status: "unassessed",
                  statusRevision: 1,
                  contracts: [
                    { ...draft, revision: 1, createdAt: at, lockedAt: null },
                  ],
                  sources: [],
                  deltas: [],
                  proposals: [],
                  audits: [],
                };
                s.hypotheses.push(h);
                emit(
                  "AI Contract Drafted",
                  h,
                  "Research Planner draft; human editing and lock required",
                  [],
                  null,
                );
              }
              return;
            }
            const candidates = run.roles.flatMap((r) => r.output?.claims ?? []);
            for (const frozen of run.hypotheses) {
              const h = s.hypotheses.find((h) => h.id === frozen.id);
              if (
                !h ||
                h.contracts.at(-1)!.revision !==
                  frozen.contracts.at(-1)!.revision ||
                !h.contracts.at(-1)!.lockedAt ||
                h.status !== frozen.status
              )
                throw Error(
                  "contract_or_status_changed_during_run_research_retained",
                );
              const revision = h.contracts.at(-1)!.revision,
                prior = h.deltas
                  .filter((d) => d.contractRevision === revision)
                  .map((d) => d.id),
                ids: string[] = [];
              for (const verified of run.verifiedClaims) {
                const candidate = candidates.find(
                  (c) => c.id === verified.candidate.id,
                )!;
                if (candidate.hypothesisId !== h.id) continue;
                const assessment = run.roles
                  .find((r) => r.role === "verifier")
                  ?.output?.assessments?.find(
                    (a) => a.claimId === candidate.id,
                  );
                const relation =
                  verified.classification === "insufficient_evidence" ||
                  verified.classification === "hypothesis"
                    ? "insufficient_evidence"
                    : (assessment?.direction ?? "insufficient_evidence");
                const id = randomUUID();
                ids.push(id);
                const src = verified.candidate.citations[0];
                h.deltas.push({
                  id,
                  runId: run.id,
                  contractRevision: revision,
                  sourceId: src.sourceId,
                  sourceRevision: src.materialRevision,
                  previousEvidenceIds: prior,
                  relation,
                  mode: "REAL PROVIDER",
                  claim: verified,
                  reason:
                    (verified.semanticReview?.reasoning ??
                      "No semantic support") +
                    " Contract relevance: " +
                    (assessment?.reasoning ?? "unknown"),
                  createdAt: now(),
                  previousStatus: h.status,
                });
                for (const citation of verified.candidate.citations) {
                  const source = run.sources.find(
                    (x) => x.id === citation.sourceId,
                  )!;
                  if (
                    !h.sources.some(
                      (s) =>
                        s.id === source.id && s.revision === source.revision,
                    )
                  )
                    h.sources.push(source);
                }
              }
              const relations = h.deltas
                .filter((d) => d.contractRevision === revision)
                .map((d) => d.relation);
              const c = h.contracts.at(-1)!,
                criteriaUnknown =
                  !c.decisionThreshold ||
                  !c.validationWindow ||
                  /unknown|待人工|待填写/i.test(
                    c.decisionThreshold + " " + c.validationWindow,
                  );
              const met = run.roles
                .find((r) => r.role === "verifier")
                ?.output?.assessments?.some(
                  (a) => a.hypothesisId === h.id && a.criteriaMet,
                );
              const to: HypothesisStatus = criteriaUnknown
                ? "needs_research"
                : relations.includes("supporting") &&
                    relations.includes("contradicting")
                  ? "needs_research"
                  : relations.includes("contradicting")
                    ? "challenged"
                    : relations.includes("supporting") && met
                      ? "supported"
                      : "inconclusive";
              for (const id of ids)
                h.deltas.find((d) => d.id === id)!.proposedStatus = to;
              emit(
                "Evidence Delta Assessed",
                h,
                `Real ${run.kind} run ${run.id}; ${ids.length} new evidence records. Omitted source units: ${run.coverage.omittedUnits}. Contract thresholds require human review.`,
                ids,
              );
              h.proposals.push({
                id: randomUUID(),
                contractRevision: revision,
                from: h.status,
                to,
                evidenceIds: ids,
                reason: `AI recommendation from verified evidence (${run.id}); supporting evidence does not automatically meet the locked decision threshold. Human review required.`,
                decision: "pending",
                createdAt: now(),
              });
              emit(
                "Transition Proposed",
                h,
                "Pending human approval; official status unchanged",
                ids,
              );
            }
          },
        );
        return;
      } catch (e) {
        if (
          e instanceof SchemaError &&
          e.message.includes("记录已变化") &&
          retry < 2
        )
          continue;
        throw e;
      }
    }
  }
}
