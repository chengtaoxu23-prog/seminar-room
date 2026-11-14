import { useEffect, useState } from "react";
import type { AuditRun } from "../src/shared/gtm";
import {
  Badge,
  base,
  date,
  decisions,
  Icon,
  riskNames,
  show,
  Usage,
} from "./gtm-ui";
import { Claims, Rebuttal, RiskOverview } from "./GtmEvidence";

const chapters = [
  ["summary", "执行摘要"],
  ["risks", "核心风险"],
  ["analysis", "证据与分析"],
  ["rebuttal", "Blue 抗辩"],
  ["unknowns", "关键未知与未解决问题"],
  ["experiments", "下一步验证实验"],
  ["coverage", "材料覆盖与来源"],
  ["reviews", "人工审查记录"],
  ["methods", "方法与局限"],
];
function Items({ items }: { items: string[] }) {
  return items.length ? (
    <ul>
      {items.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ul>
  ) : (
    <p className="muted">未提供</p>
  );
}
export default function GtmReport({ audit: a }: { audit: AuditRun }) {
  const r = a.execution!.report!,
    all = [...r.verifiedFindings, ...r.unsupportedChallenges],
    reviews = a.humanReviews ?? [],
    provider = a.providerSnapshot;
  const [active, setActive] = useState("summary");
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) setActive(e.target.id.replace("report-", ""));
      },
      { rootMargin: "-8% 0px -70% 0px" },
    );
    document
      .querySelectorAll(".report-section")
      .forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [a.id]);
  return (
    <div className="report-layout">
      <nav className="report-toc" aria-label="报告目录">
        <span className="eyebrow">CONTENTS</span>
        {chapters.map(([id, label], i) => (
          <a
            href={"#report-" + id}
            key={id}
            className={active === id ? "active" : ""}
            onClick={() => setActive(id)}
          >
            <small>{String(i + 1).padStart(2, "0")}</small>
            {label}
          </a>
        ))}
        <div className="report-toc-note">
          <Icon name="shield" />
          <b>Evidence-backed</b>
          <small>Human review required</small>
        </div>
      </nav>
      <article className="report-document">
        <header className="report-cover">
          <div className="sectionline">
            <span className="eyebrow">RESEARCH / GTM RISK AUDIT</span>
            <Badge tone={provider?.mode === "real" ? "amber" : "blue"}>
              {provider?.mode === "real" ? "AI-GENERATED DRAFT" : "MOCK DEMO"}
            </Badge>
          </div>
          <h1>GTM Risk Audit Report</h1>
          <h2>{a.context.projectName ?? "GTM 风险与盲点审计"}</h2>
          <p>
            {show(a.context.targetMarket)} ·{" "}
            {new Date(r.generatedAt).getFullYear()} · 证据审计 / 人工复核
          </p>
          <div className="report-metadata">
            <span>
              <Icon name="clock" size={14} />
              {date(r.generatedAt)}
            </span>
            <span>
              <Icon name="source" size={14} />
              {r.coverage.selected.length} 已选来源
            </span>
            <span>
              <Icon name="shield" size={14} />
              {all.length} 项质询
            </span>
            <span>
              模型：
              {show(provider?.model ?? a.ledger.calls[0]?.configuredModel)}
            </span>
          </div>
          <div className="report-usage">
            <Usage audit={a} />
          </div>
        </header>
        <section className="report-section" id="report-summary">
          <span className="chapter-number">01 / EXECUTIVE SUMMARY</span>
          <h2>执行摘要</h2>
          <p className="report-lead">
            本报告审查以下商业方案的进入市场假设，保留风险论证、原文引用、核验结果及未解决问题，供人工复核与后续研究。
          </p>
          <div className="brief-box">{a.context.businessBrief}</div>
          <p>
            本次形成 {all.length} 项模型质询，其中 {r.verifiedFindings.length}{" "}
            项达到服务端证据分类标准，{r.unsupportedChallenges.length}{" "}
            项未获充分支持。引用核验通过表示原文可定位，不代表商业风险已被客观证实。
          </p>
          <div className="report-stat-grid">
            <div>
              <strong>{r.verifiedFindings.length}</strong>
              <span>通过证据标准的质询</span>
            </div>
            <div>
              <strong>{r.unsupportedChallenges.length}</strong>
              <span>未支持 / 证据不足</span>
            </div>
            <div>
              <strong>{r.criticalUnknowns.length}</strong>
              <span>关键未知</span>
            </div>
            <div>
              <strong>
                {
                  all.filter(
                    (f) =>
                      !reviews.some((v) => v.challengeId === f.challenge.id),
                  ).length
                }
              </strong>
              <span>待人工审查</span>
            </div>
          </div>
          <div className="notice">
            {provider?.mode === "real"
              ? "AI 生成的审计初稿，正式使用前须经人工审查。"
              : "MOCK DEMO · 固定合成演示，不构成真实商业审计结论。"}
          </div>
        </section>
        <section className="report-section" id="report-risks">
          <span className="chapter-number">02 / KEY RISKS</span>
          <h2>核心风险</h2>
          <p className="muted">
            严重度为 Model assessed，不是客观概率。未获充分支持的质询单独保留。
          </p>
          {!all.length && <p>未提供风险，不强制生成结论。</p>}
          {all.map((f, i) => (
            <div className="report-risk" key={f.challenge.id}>
              <div className="sectionline">
                <span className="eyebrow">
                  {String(i + 1).padStart(2, "0")} /{" "}
                  {riskNames[f.challenge.risk_type]}
                </span>
                <Badge tone={f.challenge.severity}>
                  Model assessed · {f.challenge.severity}
                </Badge>
              </div>
              <h3>{f.challenge.description}</h3>
              <p>{f.challenge.reasoning}</p>
              <div className="sectionline">
                <Badge
                  tone={
                    r.verifiedFindings.some(
                      (v) => v.challenge.id === f.challenge.id,
                    )
                      ? "success"
                      : "amber"
                  }
                >
                  {r.verifiedFindings.some(
                    (v) => v.challenge.id === f.challenge.id,
                  )
                    ? "达到证据标准"
                    : "未支持 / 证据不足"}
                </Badge>
                <small>
                  {f.claims.length} Claims · {f.evidence_citations.length}{" "}
                  Evidence
                </small>
              </div>
            </div>
          ))}
        </section>
        <section className="report-section" id="report-analysis">
          <span className="chapter-number">03 / EVIDENCE & ANALYSIS</span>
          <h2>证据与分析</h2>
          <p className="muted">Claim 分类、语义关系和引用完整性分别记录。</p>
          {all.map((f, i) => (
            <details
              className="report-disclosure"
              key={f.challenge.id}
              open={i === 0}
            >
              <summary>
                <span>{f.challenge.description}</span>
                <small>{f.claims.length} Claims</small>
              </summary>
              <RiskOverview finding={f} />
              <Claims claims={f.claims} audit={a} />
            </details>
          ))}
          {!all.length && <p>未提供</p>}
        </section>
        <section className="report-section" id="report-rebuttal">
          <span className="chapter-number">04 / BLUE REBUTTAL</span>
          <h2>Blue 抗辩</h2>
          {r.rebuttals.length ? (
            r.rebuttals.map((b) => (
              <div className="report-subsection" key={b.rebuttal.challengeId}>
                <span className="eyebrow">{b.rebuttal.challengeId}</span>
                <Rebuttal audit={a} riskId={b.rebuttal.challengeId} />
              </div>
            ))
          ) : (
            <p>未提供</p>
          )}
        </section>
        <section className="report-section" id="report-unknowns">
          <span className="chapter-number">
            05 / UNKNOWNS & UNRESOLVED ISSUES
          </span>
          <h2>关键未知与未解决问题</h2>
          <Items items={r.criticalUnknowns} />
          <h3>未解决质询</h3>
          <Items
            items={r.rebuttals
              .filter((b) => b.rebuttal.response === "unresolved")
              .map(
                (b) =>
                  all.find((f) => f.challenge.id === b.rebuttal.challengeId)
                    ?.challenge.description ?? b.rebuttal.challengeId,
              )}
          />
          <h3>商业假设</h3>
          <Items items={r.initialProposal.key_assumptions} />
          <details>
            <summary>初始 Blue 方案</summary>
            <p>{r.initialProposal.value_prop}</p>
            <dl className="keyvalues">
              <dt>目标市场</dt>
              <dd>{show(r.initialProposal.target_market)}</dd>
              <dt>目标客户</dt>
              <dd>{show(r.initialProposal.target_customer)}</dd>
              <dt>定价模式</dt>
              <dd>{show(r.initialProposal.pricing_model)}</dd>
              <dt>渠道</dt>
              <dd>{r.initialProposal.gtm_channels.join("、") || "未提供"}</dd>
            </dl>
          </details>
        </section>
        <section className="report-section" id="report-experiments">
          <span className="chapter-number">06 / VALIDATION EXPERIMENTS</span>
          <h2>下一步验证实验</h2>
          <p className="muted">
            来自本次审计的 proposed
            validation；未记录的样本量、成功阈值和数据要求保持未知。
          </p>
          {r.validationExperiments.map((s, i) => (
            <div className="experiment" key={i}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <div>
                <h3>{s}</h3>
                <small>
                  相关质询：
                  {all
                    .filter((f) => f.challenge.proposed_validation.includes(s))
                    .map((f) => f.challenge.id)
                    .join("、") || "未提供"}
                </small>
              </div>
            </div>
          ))}
          {!r.validationExperiments.length && <p>未提供</p>}
        </section>
        <section className="report-section" id="report-coverage">
          <span className="chapter-number">
            07 / MATERIAL COVERAGE & SOURCES
          </span>
          <h2>材料覆盖与来源</h2>
          <p>
            已选 {r.coverage.selected.length} 个完整来源，未选{" "}
            {r.coverage.excluded.length} 个来源。存储容量不等于单次审计容量。
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>来源</th>
                  <th>覆盖状态</th>
                  <th>原始字符</th>
                  <th>估算 Token</th>
                </tr>
              </thead>
              <tbody>
                {[...r.coverage.selected, ...r.coverage.excluded].map((s) => (
                  <tr key={s.sourceId}>
                    <td>{s.title}</td>
                    <td>
                      <Badge tone={s.selected ? "success" : "neutral"}>
                        {s.selected ? "已覆盖" : "未覆盖"}
                      </Badge>
                    </td>
                    <td>{s.originalChars}</td>
                    <td>{s.estimatedTokens}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Source registry</h3>
          {r.sourceRegister.map((s) => (
            <details className="source-registry" key={s.id}>
              <summary>
                <Icon name="file" size={15} />
                {s.title}
                <small>{s.sourceKind ?? "unknown"}</small>
              </summary>
              <dl className="keyvalues">
                <dt>Source ID</dt>
                <dd>
                  <code>{s.id}</code>
                </dd>
                <dt>Material revision</dt>
                <dd>
                  <code>{s.revision}</code>
                </dd>
                <dt>原始链接</dt>
                <dd>{show(s.originalUrl)}</dd>
                <dt>发布日期</dt>
                <dd>{show(s.publishedAt)}</dd>
                <dt>获取时间</dt>
                <dd>{date(s.accessedAt)}</dd>
                <dt>辖区</dt>
                <dd>{show(s.jurisdiction)}</dd>
              </dl>
              <p className="source-paragraph">{s.rawContent}</p>
            </details>
          ))}
          {!r.sourceRegister.length && <p>未提供来源。</p>}
          <h3>引用完整性异常</h3>
          {r.citationFailures.some((v) => v.failures.length) ? (
            r.citationFailures
              .filter((v) => v.failures.length)
              .map((record, i) => (
                <div key={i}>
                  <b>
                    {record.stage} / {record.callId}
                  </b>
                  {record.failures.map((f, j) => (
                    <p key={j}>
                      {f.claimId} · {f.reason} · {f.candidate.sourceId} / P
                      {f.candidate.paragraphId} / {f.candidate.materialRevision}
                      <br />
                      {f.candidate.quote}
                    </p>
                  ))}
                </div>
              ))
          ) : (
            <p className="muted">无已记录异常。未选来源不参与本次核验。</p>
          )}
        </section>
        <section className="report-section" id="report-reviews">
          <span className="chapter-number">08 / HUMAN REVIEW</span>
          <h2>人工审查记录（独立于机器结果）</h2>
          {reviews.length ? (
            reviews.map((v) => (
              <div className="report-subsection" key={v.challengeId}>
                <div className="sectionline">
                  <b>{v.challengeId}</b>
                  <Badge tone="blue">{decisions[v.decision]}</Badge>
                </div>
                <p>{show(v.note)}</p>
                <small>{date(v.reviewedAt)}</small>
              </div>
            ))
          ) : (
            <p className="muted">尚未保存人工判断。</p>
          )}
          <p className="muted">
            此处显示当前独立审查记录。机器报告中的风险、Claim
            和核验记录保持原样。
          </p>
        </section>
        <section className="report-section" id="report-methods">
          <span className="chapter-number">09 / METHODS & LIMITATIONS</span>
          <h2>方法与局限</h2>
          <h3>审计方法</h3>
          <Items items={r.methodology} />
          <h3>使用局限</h3>
          <Items items={r.limitations} />
          <p className="muted">当前提供 Markdown 导出。PDF 导出尚未启用。</p>
        </section>
        <footer className="report-footer">
          <Icon name="shield" size={17} />
          <span>GTM-RedTeam · Evidence-backed · Human review required</span>
          <a href={base + "/audits/" + a.id + "/report?format=md"} download>
            导出 Markdown
          </a>
        </footer>
      </article>
    </div>
  );
}
