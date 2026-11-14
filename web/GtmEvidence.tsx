import type {
  AuditRun,
  VerifiedClaim,
  VerifiedChallenge,
} from "../src/shared/gtm";
import {
  Badge,
  classes,
  date,
  decisions,
  Icon,
  relations,
  riskNames,
  show,
} from "./gtm-ui";

export function Claims({
  claims,
  audit,
}: {
  claims: VerifiedClaim[];
  audit: AuditRun;
}) {
  if (!claims.length) return <p className="muted">Claim：未提供</p>;
  return (
    <div className="claims">
      {claims.map((claim) => (
        <article className="claim" key={claim.candidate.id}>
          <div className="sectionline">
            <span className="eyebrow">CLAIM / {claim.candidate.id}</span>
            <Badge
              tone={
                claim.classification === "insufficient_evidence"
                  ? "amber"
                  : "blue"
              }
            >
              {classes[claim.classification]} · {claim.classification}
            </Badge>
          </div>
          <h3>{claim.candidate.text}</h3>
          <p className="muted">{show(claim.candidate.reasoning)}</p>

          <div className="evidence-label">
            <Icon name="link" size={15} /> 原文证据{" "}
            <span>{claim.citationChecks.length}</span>
          </div>
          {!claim.citationChecks.length && (
            <div className="notice">未提供引用，不能建立材料证据链。</div>
          )}
          {claim.citationChecks.map((check, i) => {
            const c = check.ok ? check.citation : check.candidate,
              source = audit.sources.find(
                (s) => s.id === c.sourceId && s.revision === c.materialRevision,
              ),
              paragraph = source?.paragraphs.find(
                (p) => p.id === c.paragraphId,
              );
            return (
              <div
                className={"evidence " + (!check.ok ? "invalid" : "")}
                key={i}
              >
                <div className="sectionline">
                  <b>
                    {show(source?.title)} · P{c.paragraphId}
                  </b>
                  <Badge tone={check.ok ? "success" : "danger"}>
                    {check.ok ? "Citation verified" : "Citation failed"}
                  </Badge>
                </div>
                <blockquote>{c.quote}</blockquote>
                <div className="evidence-meta">
                  <span>
                    Source ID <code>{c.sourceId}</code>
                  </span>
                  <span>
                    Material Revision <code>{c.materialRevision}</code>
                  </span>
                  <span>
                    Paragraph ID <code>{c.paragraphId}</code>
                  </span>
                  <span>
                    核验{" "}
                    <b>{check.ok ? check.citation.matchMode : check.reason}</b>
                  </span>
                </div>
                <details>
                  <summary>查看来源段落与元数据</summary>
                  <p className="source-paragraph">{show(paragraph?.text)}</p>
                  <dl className="keyvalues">
                    <dt>来源类型</dt>
                    <dd>{show(source?.sourceKind)}</dd>
                    <dt>原始链接</dt>
                    <dd>{show(source?.originalUrl)}</dd>
                    <dt>发布日期</dt>
                    <dd>{show(source?.publishedAt)}</dd>
                    <dt>获取时间</dt>
                    <dd>{date(source?.accessedAt)}</dd>
                    <dt>辖区</dt>
                    <dd>{show(source?.jurisdiction)}</dd>
                  </dl>
                </details>
              </div>
            );
          })}
          <div className="semantic">
            <Icon name="shield" />
            <div>
              <b>
                Semantic Review ·{" "}
                {claim.semanticReview
                  ? relations[claim.semanticReview.relation]
                  : "未提供"}
              </b>
              <p>{show(claim.semanticReview?.reasoning)}</p>
              <small>
                材料直接陈述：
                {claim.semanticReview
                  ? claim.semanticReview.directlyStated
                    ? "是"
                    : "否"
                  : "未提供"}
              </small>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
export function RiskOverview({ finding }: { finding: VerifiedChallenge }) {
  const r = finding.challenge;
  return (
    <>
      <div className="sectionline">
        <span className="eyebrow">
          {r.id} / {riskNames[r.risk_type]}
        </span>
        <Badge tone={r.severity}>Model assessed · {r.severity}</Badge>
      </div>
      <h2 className="risk-title">{r.description}</h2>
      <p>{r.reasoning}</p>
      <details className="context-box">
        <summary>相关商业假设（{r.assumptions.length}）</summary>
        {r.assumptions.length ? (
          <ul>
            {r.assumptions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">未提供</p>
        )}
      </details>
    </>
  );
}
export function Rebuttal({
  audit,
  riskId,
}: {
  audit: AuditRun;
  riskId: string;
}) {
  const b = audit.execution?.rebuttals?.find(
    (b) => b.rebuttal.challengeId === riskId,
  );
  return (
    <section className="rebuttal">
      <div className="sectionline">
        <h3>Blue Rebuttal</h3>
        <Badge>{b?.rebuttal.response ?? "未提供"}</Badge>
      </div>
      <p>{show(b?.rebuttal.reasoning)}</p>
      {!!b?.claims.length && <Claims claims={b.claims} audit={audit} />}
      <p className="muted">
        新增引用：{b?.evidence_citations.length ?? 0} · 抗辩 Claim：
        {b?.claims.length ?? 0}
      </p>
      {b?.rebuttal.response === "unresolved" && (
        <div className="notice">
          未解决问题：
          {
            audit.execution?.findings?.find((f) => f.challenge.id === riskId)
              ?.challenge.description
          }
        </div>
      )}
    </section>
  );
}
export function ReviewRecord({
  audit,
  riskId,
}: {
  audit: AuditRun;
  riskId: string;
}) {
  const r = audit.humanReviews?.find((r) => r.challengeId === riskId);
  return (
    <div>
      <b>{r ? decisions[r.decision] : "待人工审查"}</b>
      <p>{show(r?.note)}</p>
      <small>审查时间：{date(r?.reviewedAt)}</small>
    </div>
  );
}
