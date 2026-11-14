import { useEffect, useRef, useState } from "react";
import {
  AUDIT_PHASES,
  type AuditPhase,
  type AuditRun,
  type HumanReview,
} from "../src/shared/gtm";
import {
  type AuditView,
  Badge,
  classes,
  date,
  decisions,
  Empty,
  Icon,
  relations,
  riskNames,
  show,
  stateNames,
  Usage,
} from "./gtm-ui";
import { Claims, Rebuttal, RiskOverview } from "./GtmEvidence";

const phaseLabels = [
  "Blue Proposal",
  "Red Challenge",
  "Verifier",
  "Blue Rebuttal",
  "Report",
];
const shortLabels = [
  "商业方案",
  "风险质询",
  "证据核验",
  "单轮抗辩",
  "确定性收敛",
];
const summaries = (a: AuditRun) => [
  a.execution?.checkpoints.blue_proposal?.sealed
    ? "商业方案已保存。"
    : "等待商业方案。",
  a.execution?.checkpoints.red_challenge?.sealed
    ? "Red 质询已保存，等待独立核验。"
    : "等待风险质询。",
  a.execution?.findings
    ? `${a.execution.findings.length} 项质询 · ${a.execution.findings.reduce((n, f) => n + f.claims.length, 0)} 条 Claim 已核验。`
    : "等待引用与语义核验。",
  a.execution?.rebuttals
    ? `${a.execution.rebuttals.length} 项单轮抗辩已保存。`
    : a.state.substate === "rebuttal_verifying"
      ? "正在核验抗辩新增引用（内部子状态）。"
      : "等待 Blue 单轮抗辩。",
  a.execution?.report ? "确定性报告已生成。" : "等待前四阶段完成。",
];
function PhaseFlow({ audit: a }: { audit: AuditRun }) {
  const [detail, setDetail] = useState<AuditPhase | null>(null);
  const current = AUDIT_PHASES.indexOf(a.state.phase),
    i = detail ? AUDIT_PHASES.indexOf(detail) : -1;
  const calls = detail
    ? a.ledger.calls.filter((c) =>
        detail === "verifier"
          ? c.stage === "red_verifier"
          : detail === "blue_rebuttal"
            ? ["blue_rebuttal", "rebuttal_verifier"].includes(c.stage)
            : c.stage === detail,
      )
    : [];
  const status = (index: number) =>
    index < current || a.state.lifecycle === "completed"
      ? "已完成"
      : index === current
        ? a.state.lifecycle === "draft"
          ? "待启动"
          : stateNames[a.state.lifecycle]
        : "待执行";
  return (
    <section className="flow-area">
      <div className="sectionline">
        <span className="eyebrow">AUDIT WORKFLOW</span>
        <small>5 阶段 · 点击查看阶段记录</small>
      </div>
      <div className="phase-flow">
        {AUDIT_PHASES.map((p, j) => (
          <button
            key={p}
            className={
              (j < current || a.state.lifecycle === "completed"
                ? "done "
                : j === current && a.state.lifecycle !== "draft"
                  ? "current "
                  : "") + (detail === p ? "selected" : "")
            }
            aria-expanded={detail === p}
            onClick={() => setDetail(detail === p ? null : p)}
          >
            <span className="phase-node">
              {j < current || a.state.lifecycle === "completed" ? (
                <Icon name="check" size={15} />
              ) : (
                String(j + 1).padStart(2, "0")
              )}
            </span>
            <b>{phaseLabels[j]}</b>
            <small>
              {shortLabels[j]} · {status(j)}
            </small>
          </button>
        ))}
      </div>
      {detail && (
        <div className="phase-detail">
          <div>
            <b>
              {phaseLabels[i]} · {status(i)}
            </b>
            <p>{summaries(a)[i]}</p>
            {detail === a.state.phase && (
              <small>内部状态：{a.state.substate}</small>
            )}
          </div>
          <div>
            <small>开始：{date(calls[0]?.startedAt)}</small>
            <small>结束：{date(calls.at(-1)?.finishedAt)}</small>
            <small>调用时标；无独立阶段时标时显示未提供。</small>
          </div>
          <div>
            <small>错误信息</small>
            <b>
              {detail === a.state.phase
                ? show(a.execution?.lastError?.code)
                : show(calls.find((c) => c.errorCode)?.errorCode)}
            </b>
          </div>
        </div>
      )}
    </section>
  );
}
type Props = {
  view: AuditView;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<void>;
  change: (path: string, method: string, body: unknown) => Promise<AuditView>;
};
export default function GtmWorkspace({ view, busy, act, change }: Props) {
  const a = view.audit,
    findings = a.execution?.findings ?? [];
  const [selected, setSelected] = useState(""),
    [search, setSearch] = useState(""),
    [type, setType] = useState("all"),
    [severity, setSeverity] = useState("all"),
    [classification, setClassification] = useState("all"),
    [reviewFilter, setReviewFilter] = useState("all"),
    [tab, setTab] = useState("analysis"),
    [notes, setNotes] = useState<Record<string, string>>({}),
    [saved, setSaved] = useState("");
  const matches = findings.filter((f) => {
    const r = a.humanReviews?.find((r) => r.challengeId === f.challenge.id);
    return (
      (type === "all" || f.challenge.risk_type === type) &&
      (severity === "all" || f.challenge.severity === severity) &&
      (classification === "all" ||
        f.claims.some((c) => c.classification === classification)) &&
      (reviewFilter === "all" ||
        (reviewFilter === "pending" ? !r : r?.decision === reviewFilter)) &&
      [
        f.challenge.id,
        f.challenge.description,
        ...f.claims.map((c) => c.candidate.text),
      ]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  });
  const f = matches.find((f) => f.challenge.id === selected) ?? matches[0],
    r = a.humanReviews?.find((r) => r.challengeId === f?.challenge.id);
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    detailRef.current?.scrollTo({ top: 0 });
  }, [f?.challenge.id, tab]);
  const reset = () => {
    setSearch("");
    setType("all");
    setSeverity("all");
    setClassification("all");
    setReviewFilter("all");
  };
  return (
    <>
      <PhaseFlow audit={a} />
      <div className="usage-line">
        <Usage audit={a} />
        <span>
          {view.provider.mode === "mock"
            ? "固定合成输出 · 不构成真实商业结论"
            : "AI 审计初稿 · 须人工复核"}
        </span>
      </div>
      <div className="audit-layout">
        <section className="risk-explorer" aria-label="风险列表">
          <div className="sectionline">
            <h2>
              风险列表 <span>{findings.length}</span>
            </h2>
            <button className="text-button" onClick={reset}>
              重置筛选
            </button>
          </div>
          <div className="search-field">
            <Icon name="search" size={16} />
            <input
              aria-label="搜索风险"
              placeholder="搜索风险或 Claim…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="risk-filters">
            <select
              aria-label="风险类型"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="all">全部类型</option>
              {Object.entries(riskNames).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select
              aria-label="模型评估严重度"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              <option value="all">全部严重度</option>
              {["critical", "high", "medium", "low"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select
              aria-label="证据分类"
              value={classification}
              onChange={(e) => setClassification(e.target.value)}
            >
              <option value="all">全部证据分类</option>
              {Object.entries(classes).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select
              aria-label="人工审查状态"
              value={reviewFilter}
              onChange={(e) => setReviewFilter(e.target.value)}
            >
              <option value="all">全部审查状态</option>
              <option value="pending">待人工审查</option>
              {Object.entries(decisions).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="risk-list">
            {matches.map((item) => {
              const risk = item.challenge,
                review = a.humanReviews?.find((r) => r.challengeId === risk.id);
              return (
                <button
                  key={risk.id}
                  aria-pressed={f?.challenge.id === risk.id}
                  className={
                    "risk-item " + (f?.challenge.id === risk.id ? "active" : "")
                  }
                  onClick={() => {
                    setSelected(risk.id);
                    setSaved("");
                  }}
                >
                  <div className="sectionline">
                    <small>{risk.id}</small>
                    <Badge tone={risk.severity}>{risk.severity}</Badge>
                  </div>
                  <h3>{risk.description}</h3>
                  <p>{riskNames[risk.risk_type]} · Model assessed</p>
                  <div className="sectionline">
                    <small>
                      {item.claims.length} Claims ·{" "}
                      {item.evidence_citations.length} Evidence
                    </small>
                    <span className="risk-review">
                      {review ? "已审查" : "待审查"}
                    </span>
                  </div>
                  <small>
                    {[
                      ...new Set(
                        item.claims.map((c) => classes[c.classification]),
                      ),
                    ].join(" / ") || "未提供分类"}
                  </small>
                </button>
              );
            })}
            {!matches.length && (
              <Empty
                title={findings.length ? "没有匹配的风险" : "尚无风险结果"}
              >
                {findings.length
                  ? "调整筛选条件继续查看。"
                  : a.state.lifecycle === "running"
                    ? "正在执行审计，核验结果会自动更新。"
                    : "未提供风险；检查审计状态与阶段记录。"}
              </Empty>
            )}
          </div>
          <div className="explorer-note">
            <Icon name="shield" size={15} />
            <span>严重度来自模型评估，不是客观概率。</span>
          </div>
        </section>
        <section className="risk-detail" aria-label="风险详情">
          {f ? (
            <>
              <div
                className="detail-tabs"
                role="tablist"
                aria-label="风险详情视图"
              >
                {[
                  ["analysis", "风险与证据"],
                  ["rebuttal", "Blue 抗辩"],
                  ["review", "人工审查"],
                ].map(([key, label]) => (
                  <button
                    role="tab"
                    aria-selected={tab === key}
                    aria-controls="risk-tab-panel"
                    id={"risk-tab-" + key}
                    key={key}
                    className={tab === key ? "active" : ""}
                    onClick={() => setTab(key)}
                  >
                    {label}
                    {key === "analysis" && <span>{f.claims.length}</span>}
                  </button>
                ))}
              </div>
              <div
                className="detail-scroll"
                ref={detailRef}
                role="tabpanel"
                id="risk-tab-panel"
                aria-labelledby={"risk-tab-" + tab}
              >
                {tab === "analysis" && (
                  <>
                    <RiskOverview finding={f} />
                    <details className="audit-context">
                      <summary>本次商业背景</summary>
                      <p>{a.context.businessBrief}</p>
                    </details>
                    <div className="sectionline detail-section-title">
                      <h3>Claim analysis & evidence</h3>
                      <small>机器审计记录</small>
                    </div>
                    <Claims claims={f.claims} audit={a} />
                    <div className="detail-bottom">
                      <Rebuttal audit={a} riskId={f.challenge.id} />
                      <section className="review-summary">
                        <h3>Human Review</h3>
                        <Badge tone={r ? "success" : "neutral"}>
                          {r ? decisions[r.decision] : "待人工审查"}
                        </Badge>
                        <p>{show(r?.note)}</p>
                        <button onClick={() => setTab("review")}>
                          打开人工审查 <Icon name="arrow" size={14} />
                        </button>
                      </section>
                    </div>
                  </>
                )}
                {tab === "rebuttal" && (
                  <>
                    <RiskOverview finding={f} />
                    <Rebuttal audit={a} riskId={f.challenge.id} />
                    <div className="notice">
                      抗辩新增引用独立核验，Blue 回应不会覆盖原始 Red / Verifier
                      结果。
                    </div>
                  </>
                )}
                {tab === "review" && (
                  <>
                    <RiskOverview finding={f} />
                    <section className="human-review">
                      <div className="sectionline">
                        <h3>人工判断</h3>
                        <Badge tone={r ? "success" : "neutral"}>
                          {r ? "已保存" : "待审查"}
                        </Badge>
                      </div>
                      <p className="muted">
                        人工判断独立保存，不覆盖机器严重度、Claim
                        分类或引用核验。
                      </p>
                      <dl className="keyvalues">
                        <dt>当前判断</dt>
                        <dd>{r ? decisions[r.decision] : "未提供"}</dd>
                        <dt>已保存备注</dt>
                        <dd>{show(r?.note)}</dd>
                        <dt>审查时间</dt>
                        <dd>{date(r?.reviewedAt)}</dd>
                      </dl>
                      <label>
                        审查备注
                        <textarea
                          maxLength={a.configSnapshot.text.note}
                          rows={5}
                          value={notes[f.challenge.id] ?? r?.note ?? ""}
                          onChange={(e) => {
                            setNotes({
                              ...notes,
                              [f.challenge.id]: e.target.value,
                            });
                            setSaved("");
                          }}
                        />
                      </label>
                      <div className="review-actions">
                        {(
                          Object.keys(decisions) as HumanReview["decision"][]
                        ).map((d) => (
                          <button
                            key={d}
                            className={r?.decision === d ? "selected" : ""}
                            disabled={busy}
                            onClick={() =>
                              void act(async () => {
                                await change(
                                  "/reviews/" + f.challenge.id,
                                  "PUT",
                                  {
                                    decision: d,
                                    note:
                                      notes[f.challenge.id] ?? r?.note ?? "",
                                  },
                                );
                                setSaved("人工判断已保存");
                              })
                            }
                          >
                            {decisions[d]}
                          </button>
                        ))}
                      </div>
                      {saved && (
                        <p className="save-message" role="status">
                          <Icon name="check" size={15} />
                          {saved}
                        </p>
                      )}
                    </section>
                  </>
                )}
              </div>
            </>
          ) : (
            <Empty title="选择一项风险查看详情">
              Claim、原文证据、核验结果和人工判断会显示在这里。
            </Empty>
          )}
        </section>
      </div>
      <details className="ledger-details">
        <summary>调用记录与核验审计轨迹</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>阶段</th>
                <th>调用状态</th>
                <th>开始 / 结束</th>
                <th>完整请求估算 Token</th>
                <th>错误</th>
              </tr>
            </thead>
            <tbody>
              {a.ledger.calls.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.stage} · #{c.attempt}
                  </td>
                  <td>{c.status}</td>
                  <td>
                    {date(c.startedAt)} / {date(c.finishedAt)}
                  </td>
                  <td>{c.estimatedInputTokens.toLocaleString()}</td>
                  <td>{show(c.errorCode)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          {a.execution?.integrity.reduce((n, r) => n + r.failures.length, 0) ??
            0}{" "}
          条引用完整性异常记录。
          {a.execution?.needsManualRecovery
            ? "该审计需要手动恢复；当前接口不提供继续运行，请创建新的审计并保留原记录。"
            : ""}
        </p>
        <small>语义关系：{Object.values(relations).join(" / ")}</small>
      </details>
    </>
  );
}
