import type { Express, Request, Response, NextFunction } from "express";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { ResearchRepository } from "./research-repository.js";
import { AuditRepository, createAuditDraft } from "./gtm-repository.js";
import { GtmAuditEngine } from "./gtm-engine.js";
import { createSource } from "./gtm-sources.js";
import { checkClaims, applyReviews, semanticInput } from "./gtm-execution.js";
import { parseSemanticReviews } from "./gtm-schema.js";
import { SchemaError } from "./validation.js";
import type { Contract, Hypothesis, Proposal } from "../src/shared/research.js";
import fixture from "../examples/temu-case-001/registry.json";
const fail = (message: string): never => {
  throw new SchemaError(message);
};
const text = (v: unknown, max = 12000) =>
  typeof v === "string" && v.length <= max ? v : fail("无效文本或文本超限");
function fields(v: unknown, allowed: string[]): Record<string, any> {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).some((k) => !allowed.includes(k))
  )
    fail("不支持的输入字段");
  return v as Record<string, any>;
}
function contract(v: unknown, revision: number): Contract {
  const p = fields(v, [
    "statement",
    "scope",
    "metric",
    "method",
    "supporting",
    "falsification",
    "market",
    "customerSegment",
    "validationWindow",
    "decisionThreshold",
  ]);
  if (!text(p.statement).trim()) fail("Statement 不能为空");
  return {
    revision,
    statement: p.statement,
    scope: text(p.scope ?? ""),
    metric: text(p.metric ?? ""),
    method: text(p.method ?? ""),
    supporting: text(p.supporting ?? ""),
    falsification: text(p.falsification ?? ""),
    createdAt: new Date().toISOString(),
    lockedAt: null,
    ...(p.market !== undefined ? { market: text(p.market, 500) } : {}),
    ...(p.customerSegment !== undefined
      ? { customerSegment: text(p.customerSegment, 500) }
      : {}),
    ...(p.validationWindow !== undefined
      ? { validationWindow: text(p.validationWindow, 500) }
      : {}),
    ...(p.decisionThreshold !== undefined
      ? { decisionThreshold: text(p.decisionThreshold, 2000) }
      : {}),
  };
}
export function parseCSV(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (closed && ![",", "\n", "\r"].includes(c))
      fail("CSV 结束引号后存在非法字符");
    if (c === '"') {
      if (quoted && raw[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted) {
        quoted = false;
        closed = true;
      } else if (cell === "") quoted = true;
      else fail("CSV 引号位置无效");
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
      closed = false;
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && raw[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      closed = false;
    } else cell += c;
  }
  if (quoted) fail("CSV 引号未闭合");
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  if (!rows.length || rows.some((r) => r.length !== rows[0].length))
    fail("CSV 列数不一致或为空");
  return rows;
}
export function mountResearchApi(
  app: Express,
  audits: AuditRepository,
  engine: GtmAuditEngine,
  mode: "mock" | "real",
) {
  const repo = new ResearchRepository(path.join(audits.dir, "hypotheses"));
  const wrap =
    (fn: (q: Request, r: Response) => Promise<void>) =>
    (q: Request, r: Response, n: NextFunction) => {
      void fn(q, r).catch(n);
    };
  app.get(
    "/api/gtm/research",
    wrap(async (_q, r) => {
      r.json(await repo.load());
    }),
  );
  app.get("/api/gtm/research/case", (_q, r) => r.json(fixture));
  app.get(
    "/api/gtm/research/export",
    wrap(async (_q, r) => {
      r.attachment("decision-ledger.json").json(await repo.load());
    }),
  );
  app.post(
    "/api/gtm/research",
    wrap(async (q, r) => {
      const b = fields(q.body, [
        "requestId",
        "expectedRevision",
        "operation",
        "hypothesisId",
        "payload",
        "actor",
      ]);
      const operation = text(b.operation, 80),
        p = b.payload ?? {};
      if (
        b.actor !== undefined &&
        !["user", "assistant_acceptance"].includes(b.actor)
      )
        fail("操作者类型无效");
      const result = await repo.transact(
        text(b.requestId, 100),
        b.expectedRevision,
        b,
        async (s, emit) => {
          const create = (v: unknown) => {
            const at = new Date().toISOString();
            const h: Hypothesis = {
              id: randomUUID(),
              createdAt: at,
              updatedAt: at,
              status: "unassessed",
              statusRevision: 1,
              contracts: [contract(v, 1)],
              sources: [],
              deltas: [],
              proposals: [],
              audits: [],
            };
            s.hypotheses.push(h);
            emit("Hypothesis Created", h, "Human-created draft", [], null);
            return h;
          };
          if (operation === "create") {
            create(p);
            return;
          }
          if (operation === "case_t0") {
            fields(p, []);
            if (
              s.hypotheses.some((h) =>
                fixture.hypotheses.includes(h.contracts[0].statement),
              )
            )
              fail("Case 001 已导入，请选择现有假设");
            for (const statement of fixture.hypotheses) {
              const h = create({
                statement,
                scope: "Temu US · T0 2023-06-30",
                method: "Historical primary-source review; no hindsight",
                supporting: "需存在直接相关且可追溯的材料；量化标准待设定",
                falsification: "需存在可核验的相反证据；量化标准待设定",
              });
              h.contracts[0].lockedAt = new Date().toISOString();
              emit(
                "Contract Locked",
                h,
                "Human requested T0 replay contract lock",
              );
              const source = fixture.sources[0];
              if (source.publishedAt > fixture.T0) fail("T0 来源超出截面");
              h.sources.push(
                createSource({
                  id: randomUUID(),
                  title: source.title,
                  sourceType: "txt",
                  rawContent: source.raw,
                  originalUrl: source.url,
                  publishedAt: source.publishedAt,
                  accessedAt: new Date().toISOString(),
                  sourceKind: "official",
                }),
              );
              emit(
                "Evidence Added",
                h,
                "T0 primary-source excerpt; committee claims are attributed, not independently confirmed",
                [h.sources[0].id],
              );
            }
            return;
          }
          const h =
              s.hypotheses.find((h) => h.id === b.hypothesisId) ??
              fail("Hypothesis 不存在"),
            c = h.contracts.at(-1)!;
          if (operation === "edit" || operation === "revise") {
            if (operation === "edit" && c.lockedAt)
              fail("锁定 Contract 不可编辑；请新建版本");
            if (operation === "revise" && !c.lockedAt) fail("请先锁定当前草案");
            const next = contract(
              p,
              operation === "edit" ? c.revision : c.revision + 1,
            );
            if (operation === "edit")
              h.contracts[h.contracts.length - 1] = next;
            else h.contracts.push(next);
            emit(
              operation === "edit"
                ? "Contract Draft Edited"
                : "Contract Revised",
              h,
              "Human edited validation contract",
            );
            return;
          }
          if (operation === "lock") {
            if (c.lockedAt) fail("Contract 已锁定");
            if (Object.keys(p).length) {
              Object.assign(c, contract(p, c.revision));
              emit(
                "Contract Draft Edited",
                h,
                "Saved validation criteria before explicit lock",
              );
            }
            c.lockedAt = new Date().toISOString();
            const from = h.status;
            h.status = "unassessed";
            h.statusRevision = c.revision;
            emit(
              "Contract Locked",
              h,
              b.actor === "assistant_acceptance"
                ? "Assistant acceptance operator locked the public-source case under the task brief; not a human commercial decision"
                : "Human explicitly locked this revision; assessment starts unassessed",
              [],
              from,
            );
            return;
          }
          if (operation === "source" || operation === "case_t1") {
            let input = p;
            if (operation === "case_t1") {
              fields(p, []);
              const f = fixture.sources[1];
              if (f.publishedAt > fixture.T1) fail("T1 时间不匹配");
              input = {
                title: f.title,
                rawContent: f.raw,
                format: "txt",
                url: f.url,
                publishedAt: f.publishedAt,
              };
            } else
              fields(p, [
                "title",
                "rawContent",
                "format",
                "url",
                "publishedAt",
              ]);
            const raw = text(input.rawContent, 100000),
              format = text(input.format, 10);
            if (!["txt", "md", "csv"].includes(format))
              fail("仅支持 TXT / MD / CSV");
            if (format === "csv") parseCSV(raw);
            if (h.sources.length >= 20) fail("本假设材料上限 20 份");
            const source = createSource({
              id: randomUUID(),
              title: text(input.title, 200),
              sourceType: format === "md" ? "md" : "txt",
              rawContent: raw,
              ...(input.url ? { originalUrl: text(input.url) } : {}),
              ...(input.publishedAt
                ? { publishedAt: text(input.publishedAt, 100) }
                : {}),
              accessedAt: new Date().toISOString(),
            });
            if (h.sources.some((s) => s.revision === source.revision))
              fail("相同原文 Revision 已存在，不重复加入证据");
            h.sources.push(source);
            emit(
              "Evidence Added",
              h,
              format === "csv"
                ? "CSV parsed for shape, original text retained as citation source"
                : "完整来源新增；旧来源及修订不替换",
              [source.id],
            );
            return;
          }
          if (!c.lockedAt) fail("请先锁定当前 Contract");
          const propose = (
            to: Proposal["to"],
            reason: string,
            evidenceIds: string[],
            auditId?: string,
          ) => {
            const proposal: Proposal = {
              id: randomUUID(),
              contractRevision: c.revision,
              from: h.status,
              to,
              evidenceIds,
              reason,
              decision: "pending",
              createdAt: new Date().toISOString(),
              ...(auditId ? { auditId } : {}),
            };
            h.proposals.push(proposal);
            emit("Transition Proposed", h, reason, evidenceIds);
          };
          if (operation === "delta") {
            if (mode !== "mock")
              fail(
                "离线 fixture 仅用于隔离演示；请在真实研究工作区执行增量研究",
              );
            fields(p, ["sourceId", "paragraphId", "quote", "fixture"]);
            const source =
              h.sources.find((x) => x.id === p.sourceId) ?? fail("来源不存在");
            if (
              h.deltas.some(
                (d) =>
                  d.sourceId === source.id &&
                  d.sourceRevision === source.revision &&
                  d.contractRevision === c.revision,
              )
            )
              fail("该版本来源已评估；不重复分析");
            const relation = p.fixture ?? "inconclusive";
            if (
              !["supporting", "contradicting", "inconclusive"].includes(
                relation,
              )
            )
              fail("无效 Mock fixture");
            const audit = createAuditDraft(
              { businessBrief: c.statement },
              [source],
              [source.id],
            );
            const claims = checkClaims(
              [
                {
                  id: randomUUID(),
                  text:
                    "MOCK / SYNTHETIC " +
                    relation +
                    " argument concerning: " +
                    c.statement,
                  kind: "inference",
                  reasoning:
                    "Offline fixture selected by human; no actual model reasoning or keyword inference.",
                  citations: [
                    {
                      sourceId: source.id,
                      materialRevision: source.revision,
                      paragraphId: p.paragraphId,
                      quote: text(p.quote, 220),
                    },
                  ],
                },
              ],
              [source],
              audit,
            );
            if (!claims[0].citationChecks.every((v) => v.ok))
              fail("无效 Citation 被拒绝，不能成为证据");
            semanticInput(claims, [source]);
            const reviews = parseSemanticReviews(
              {
                reviews: [
                  {
                    claimId: claims[0].candidate.id,
                    relation:
                      relation === "inconclusive"
                        ? "insufficient_evidence"
                        : "supported",
                    directlyStated: false,
                    reasoning:
                      "MOCK / SYNTHETIC: fixed semantic fixture; not a Temu research finding.",
                  },
                ],
              },
              audit.configSnapshot,
              [claims[0].candidate.id],
            );
            const assessed = applyReviews(claims, reviews.reviews)[0],
              previous = h.deltas
                .filter((d) => d.contractRevision === c.revision)
                .map((d) => d.id),
              id = randomUUID();
            h.deltas.push({
              id,
              contractRevision: c.revision,
              sourceId: source.id,
              sourceRevision: source.revision,
              previousEvidenceIds: previous,
              relation,
              mode: "MOCK / SYNTHETIC",
              claim: assessed,
              reason:
                "Only this newly selected source assessed; prior assessments reused by ID. Direction is a human-selected demonstration fixture.",
              createdAt: new Date().toISOString(),
            });
            emit(
              "Delta Assessed",
              h,
              "MOCK delta against " +
                previous.length +
                " existing evidence records",
              [id],
            );
            const prior = h.deltas
                .filter((d) => d.contractRevision === c.revision)
                .map((d) => d.relation),
              to =
                prior.includes("supporting") && prior.includes("contradicting")
                  ? "needs_research"
                  : relation === "supporting"
                    ? "supported"
                    : relation === "contradicting"
                      ? "challenged"
                      : "inconclusive";
            propose(
              to,
              "MOCK / SYNTHETIC proposed update; human approval required",
              [id],
            );
            return;
          }
          if (operation === "audit") {
            if (mode !== "mock")
              fail(
                "Hypothesis 审计本轮仅允许离线 Mock 服务；不调用真实 Provider",
              );
            fields(p, ["sourceIds"]);
            if (
              !Array.isArray(p.sourceIds) ||
              p.sourceIds.length === 0 ||
              new Set(p.sourceIds).size !== p.sourceIds.length
            )
              fail("请选择完整且不重复的来源");
            const sources = p.sourceIds.map(
              (id: string) =>
                h.sources.find((x) => x.id === id) ?? fail("来源不存在"),
            );
            const draft = createAuditDraft(
              {
                projectName: "Hypothesis " + h.id + " / r" + c.revision,
                businessBrief: c.statement,
                background: JSON.stringify(c),
              },
              sources,
              p.sourceIds,
            );
            draft.providerSnapshot = {
              mode: "mock",
              model: "MOCK-synthetic-only",
            };
            const key = createHash("sha256")
              .update(h.id + ":" + b.requestId)
              .digest("hex");
            draft.id =
              key.slice(0, 8) +
              "-" +
              key.slice(8, 12) +
              "-4" +
              key.slice(13, 16) +
              "-a" +
              key.slice(17, 20) +
              "-" +
              key.slice(20, 32);
            let saved;
            try {
              saved = (await audits.load(draft.id)).audit;
              if (
                JSON.stringify(saved.context) !==
                  JSON.stringify(draft.context) ||
                JSON.stringify(saved.sources) !== JSON.stringify(draft.sources)
              )
                fail("同一审计请求的输入不一致");
            } catch (e) {
              if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
              saved = await audits.save(draft, null);
            }
            h.audits.push({
              auditId: saved.id,
              contractRevision: c.revision,
              sourceIds: p.sourceIds,
            });
            emit(
              "Audit Linked",
              h,
              "Explicit offline audit; selected source scope frozen",
              p.sourceIds,
            );
            const completed = await engine.start(saved.id);
            if (completed.state.lifecycle !== "completed")
              fail("审计未完成，请查看 Audits 中记录");
            propose(
              "needs_research",
              "MOCK audit completed; review findings before changing formal status",
              [],
              saved.id,
            );
            return;
          }
          if (operation === "review") {
            fields(p, ["proposalId", "decision", "reason", "newStatus"]);
            const proposal =
              h.proposals.find((v) => v.id === p.proposalId) ??
              fail("建议不存在");
            if (proposal.decision !== "pending")
              fail("建议已处理，不重复改变状态");
            if (
              !["approved", "rejected", "further_research"].includes(p.decision)
            )
              fail("人工决定无效");
            const reason = text(p.reason);
            if (!reason.trim()) fail("请填写人工决定理由");
            if (proposal.contractRevision !== c.revision)
              fail("建议属于旧 Contract，请保留历史并重新分析");
            if (p.decision === "approved" && proposal.from !== h.status)
              fail("建议依据的正式状态已变化，请重新评估");
            if (
              p.newStatus !== undefined &&
              (![
                "unassessed",
                "supported",
                "challenged",
                "inconclusive",
                "needs_research",
              ].includes(p.newStatus) ||
                p.decision !== "approved")
            )
              fail("只有人工接受时可以明确指定状态");
            const from = h.status;
            proposal.decision = p.decision;
            proposal.reviewNote = reason;
            proposal.reviewedAt = new Date().toISOString();
            if (p.decision === "approved") {
              h.status = p.newStatus ?? proposal.to;
              proposal.reviewedStatus = h.status;
              h.statusRevision = c.revision;
            }
            emit(
              p.decision === "approved"
                ? p.newStatus && p.newStatus !== proposal.to
                  ? "Transition Modified"
                  : "Transition Approved"
                : p.decision === "rejected"
                  ? "Transition Rejected"
                  : "Further Research Requested",
              h,
              reason,
              proposal.evidenceIds,
              from,
            );
            return;
          }
          fail("不支持的操作");
        },
      );
      r.json(result);
    }),
  );
  return repo;
}
