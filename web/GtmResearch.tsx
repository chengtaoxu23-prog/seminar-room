import { useEffect, useState } from "react";
import type { ResearchState, Contract } from "../src/shared/research";
import { request, Badge, Empty, date } from "./gtm-ui";
const labels = {
  statement: "Statement",
  scope: "Market / Customer Scope",
  metric: "Metric",
  method: "Validation Method",
  supporting: "Supporting Criteria",
  falsification: "Falsification Criteria",
};
const blank = {
  statement: "",
  scope: "",
  metric: "",
  method: "",
  supporting: "",
  falsification: "",
};
export default function GtmResearch() {
  const [state, setState] = useState<ResearchState | null>(null),
    [selected, setSelected] = useState(
      new URLSearchParams(location.search).get("hypothesis") ?? "",
    ),
    [draft, setDraft] = useState(blank),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("contract"),
    [title, setTitle] = useState(""),
    [raw, setRaw] = useState(""),
    [format, setFormat] = useState("txt"),
    [sourceId, setSourceId] = useState(""),
    [paragraph, setParagraph] = useState(1),
    [quote, setQuote] = useState(""),
    [direction, setDirection] = useState("inconclusive"),
    [reason, setReason] = useState(""),
    [scope, setScope] = useState<string[]>([]),
    [registry, setRegistry] = useState<any>(null);
  const h = state?.hypotheses.find((h) => h.id === selected),
    c = h?.contracts.at(-1),
    source = h?.sources.find((s) => s.id === sourceId);
  const load = async () => setState(await request<ResearchState>("/research"));
  useEffect(() => {
    void load().catch((e) => setError(e.message));
    void request("/research/case")
      .then(setRegistry)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    setDraft(
      c
        ? (Object.fromEntries(
            Object.keys(blank).map((k) => [k, c[k as keyof Contract]]),
          ) as typeof blank)
        : blank,
    );
    setSourceId("");
    setScope([]);
    setReason("");
  }, [selected, c?.revision, c?.lockedAt]);
  useEffect(() => {
    if (source) {
      setParagraph(1);
      setQuote(source.paragraphs[0]?.text.slice(0, 200) ?? "");
    }
  }, [sourceId]);
  const choose = (id: string) => {
    setSelected(id);
    setTab("contract");
    const q = new URLSearchParams(location.search);
    q.set("hypothesis", id);
    window.history.replaceState(null, "", "?" + q);
  };
  const command = async (
    operation: string,
    payload: unknown = {},
    hypothesisId = selected,
  ) => {
    if (!state) return;
    setBusy(true);
    setError("");
    try {
      const next = await request<ResearchState>("/research", "POST", {
        requestId: crypto.randomUUID(),
        expectedRevision: state.revision,
        operation,
        hypothesisId,
        payload,
      });
      setState(next);
      if (operation === "create" || operation === "case_t0")
        choose(next.hypotheses.at(-1)!.id);
    } catch (e) {
      setError((e as Error).message);
      await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  };
  const upload = async (file: File) => {
    try {
      const ext = file.name.split(".").at(-1)?.toLowerCase();
      if (!ext || !["txt", "md", "csv"].includes(ext))
        throw Error("仅支持 TXT / MD / CSV");
      if (file.size > 400000) throw Error("文件过大");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
      setFormat(ext);
      setTitle(file.name);
      setRaw(text);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="research">
      <div className="page-title">
        <div>
          <span className="eyebrow">V0.3 ALPHA / COMMERCIAL RESEARCH</span>
          <h1>Hypothesis Board</h1>
          <p>锁定验证契约 → 增量证据 → 审计 → 人工审批 → 决策记录</p>
        </div>
        <Badge tone="amber">OFFLINE · MOCK / SYNTHETIC</Badge>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
          <button onClick={() => void load()}>重新加载</button>
        </div>
      )}
      <div className="notice">
        自动分析全部为明确选择的离线
        fixture，不是实际模型推理。原始来源与引文核验可真实检查；证据方向和状态建议仅供交互演示，不构成
        Temu 商业结论。
      </div>
      <div className="research-actions">
        <button
          onClick={() => {
            choose("");
            setDraft(blank);
          }}
        >
          新建假设
        </button>
        <button disabled={busy} onClick={() => void command("case_t0")}>
          Case 001 · 导入并锁定 T0 Contracts
        </button>
        <a className="button" href="/api/gtm/research/export" download>
          导出完整 Decision Ledger
        </a>
        <button onClick={() => setTab("case")}>案例来源与操作说明</button>
      </div>
      {!state ? (
        <div className="loading">加载假设记录…</div>
      ) : (
        <div className="research-grid">
          <section className="project-section research-board">
            <div className="section-title-row">
              <h2>假设列表 · {state.hypotheses.length}</h2>
            </div>
            {!state.hypotheses.length && (
              <Empty title="尚无假设">
                创建 Contract，或导入离线历史回放。
              </Empty>
            )}
            {state.hypotheses.map((item) => (
              <button
                className={
                  "research-item " + (selected === item.id ? "selected" : "")
                }
                key={item.id}
                onClick={() => choose(item.id)}
              >
                <b>{item.contracts.at(-1)!.statement}</b>
                <span>
                  <Badge>
                    {item.status} · r{item.statusRevision}
                  </Badge>{" "}
                  r{item.contracts.at(-1)!.revision} ·{" "}
                  {item.contracts.at(-1)!.lockedAt ? "Locked" : "Draft"}
                </span>
                <small>
                  {item.deltas.length} Delta ·{" "}
                  {
                    item.proposals.filter((p) => p.decision === "pending")
                      .length
                  }{" "}
                  待审查
                </small>
                <small>
                  最近证据：{item.deltas.at(-1)?.relation ?? "未提供"} ·{" "}
                  {date(item.updatedAt)}
                </small>
              </button>
            ))}
          </section>
          <section className="setup-section research-detail">
            <div className="research-tabs">
              {["contract", "evidence", "review", "timeline", "case"].map(
                (t) => (
                  <button
                    key={t}
                    className={tab === t ? "selected" : ""}
                    onClick={() => setTab(t)}
                  >
                    {
                      {
                        contract: "Contract",
                        evidence: "Evidence Delta",
                        review: "Human Review",
                        timeline: "Decision Timeline",
                        case: "Case 001",
                      }[t]
                    }
                  </button>
                ),
              )}
            </div>
            {tab === "contract" && (
              <>
                <div className="sectionline">
                  <h2>
                    {h ? "Hypothesis Detail" : "创建 Hypothesis Contract"}
                  </h2>
                  {c && (
                    <Badge>
                      r{c.revision} · {c.lockedAt ? "Locked" : "Draft"}
                    </Badge>
                  )}
                </div>
                {h && (
                  <p className="muted">
                    ID：{h.id} · 正式状态 {h.status}（r{h.statusRevision}）
                    <br />
                    创建 {date(h.createdAt)} · 更新 {date(h.updatedAt)}
                  </p>
                )}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void command(
                      h ? (c?.lockedAt ? "revise" : "edit") : "create",
                      draft,
                    );
                  }}
                >
                  {Object.entries(labels).map(([key, label]) => (
                    <label key={key}>
                      {label}
                      <textarea
                        required={key === "statement"}
                        aria-label={label}
                        rows={key === "statement" ? 3 : 2}
                        value={draft[key as keyof typeof blank]}
                        placeholder="待设定"
                        onChange={(e) =>
                          setDraft({ ...draft, [key]: e.target.value })
                        }
                      />
                    </label>
                  ))}
                  <div className="research-actions">
                    <button disabled={busy} className="primary">
                      {!h
                        ? "创建 Contract"
                        : c?.lockedAt
                          ? "创建 Contract 新版本"
                          : "保存草案"}
                    </button>
                    {h && !c?.lockedAt && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void command("lock")}
                      >
                        Lock Contract
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!!h}
                      onClick={() =>
                        setDraft({
                          ...blank,
                          statement:
                            draft.statement ||
                            "Synthetic Demo：该商业假设需要验证。",
                        })
                      }
                    >
                      Mock 草案模板（不补指标）
                    </button>
                  </div>
                </form>
                {h && (
                  <details>
                    <summary>Contract 版本历史 · {h.contracts.length}</summary>
                    {h.contracts.map((v) => (
                      <article className="context-box" key={v.revision}>
                        <b>
                          r{v.revision} · {date(v.lockedAt)}
                        </b>
                        {Object.entries(labels).map(([k, label]) => (
                          <p key={k}>
                            {label}：
                            {String(v[k as keyof Contract] || "待设定")}
                          </p>
                        ))}
                      </article>
                    ))}
                  </details>
                )}
              </>
            )}
            {tab === "evidence" &&
              (h ? (
                <>
                  <h2>Supporting / Contradicting / Inconclusive Evidence</h2>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void command("source", {
                        title,
                        rawContent: raw,
                        format,
                      });
                    }}
                  >
                    <label>
                      导入 TXT / MD / CSV
                      <input
                        type="file"
                        accept=".txt,.md,.csv"
                        onChange={(e) => {
                          if (e.target.files?.[0])
                            void upload(e.target.files[0]);
                        }}
                      />
                    </label>
                    <label>
                      来源名称
                      <input
                        required
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                      />
                    </label>
                    <label>
                      完整原文
                      <textarea
                        aria-label="完整原文"
                        required
                        rows={4}
                        value={raw}
                        onChange={(e) => setRaw(e.target.value)}
                      />
                    </label>
                    <label>
                      导入格式
                      <select
                        aria-label="导入格式"
                        value={format}
                        onChange={(e) => setFormat(e.target.value)}
                      >
                        {["txt", "md", "csv"].map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </label>
                    <button disabled={busy}>保存完整新材料</button>
                  </form>
                  <button
                    disabled={busy}
                    onClick={() => void command("case_t1")}
                  >
                    Case 001 · 加入 T1 政策提案短摘录
                  </button>
                  <hr />
                  <h3>Evidence Delta · 只评估所选新来源</h3>
                  <label>
                    新增来源
                    <select
                      aria-label="新增来源"
                      value={sourceId}
                      onChange={(e) => setSourceId(e.target.value)}
                    >
                      <option value="">请选择</option>
                      {h.sources.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  {source && (
                    <>
                      <small>
                        Source ID {source.id}
                        <br />
                        Revision {source.revision} · 发布{" "}
                        {source.publishedAt ?? "未提供"}
                      </small>
                      <details>
                        <summary>完整来源原文与段落</summary>
                        {source.paragraphs.map((p) => (
                          <p key={p.id}>
                            P{p.id} · {p.text}
                          </p>
                        ))}
                      </details>
                      <label>
                        Paragraph ID
                        <input
                          type="number"
                          min={1}
                          value={paragraph}
                          onChange={(e) => setParagraph(Number(e.target.value))}
                        />
                      </label>
                      <label>
                        引用原文
                        <textarea
                          aria-label="引用原文"
                          value={quote}
                          onChange={(e) => setQuote(e.target.value)}
                          maxLength={220}
                        />
                      </label>
                      <label>
                        离线演示方向（人工选择，不是模型判断）
                        <select
                          aria-label="离线演示方向"
                          value={direction}
                          onChange={(e) => setDirection(e.target.value)}
                        >
                          {["supporting", "contradicting", "inconclusive"].map(
                            (x) => (
                              <option key={x}>{x}</option>
                            ),
                          )}
                        </select>
                      </label>
                      <button
                        disabled={busy || !c?.lockedAt}
                        onClick={() =>
                          void command("delta", {
                            sourceId,
                            paragraphId: paragraph,
                            quote,
                            fixture: direction,
                          })
                        }
                      >
                        生成 Mock Evidence Delta
                      </button>
                    </>
                  )}
                  <h3>Evidence Delta 历史</h3>
                  {h.deltas.map((d) => (
                    <article className="claim" key={d.id}>
                      <div className="sectionline">
                        <Badge tone="amber">{d.mode}</Badge>
                        <b>
                          {d.relation} · Contract r{d.contractRevision}
                        </b>
                      </div>
                      <blockquote>
                        {d.claim.candidate.citations[0].quote}
                      </blockquote>
                      <p>{d.reason}</p>
                      <small>
                        Source {d.sourceId}
                        <br />
                        Revision {d.sourceRevision}
                        <br />
                        既有证据 {d.previousEvidenceIds.length} 条，新增 1 条 ·
                        Citation verified
                      </small>
                    </article>
                  ))}
                  <h3>Run Red-Team Audit for Hypothesis</h3>
                  <p className="muted">
                    复用五阶段引擎，固定
                    Mock；绑定当前锁定版本，明确选择完整来源。
                  </p>
                  {h.sources.map((s) => (
                    <label className="consent" key={s.id}>
                      <input
                        type="checkbox"
                        checked={scope.includes(s.id)}
                        onChange={(e) =>
                          setScope(
                            e.target.checked
                              ? [...scope, s.id]
                              : scope.filter((x) => x !== s.id),
                          )
                        }
                      />
                      {s.title}
                    </label>
                  ))}
                  <button
                    disabled={busy || !c?.lockedAt || !scope.length}
                    onClick={() => void command("audit", { sourceIds: scope })}
                  >
                    运行 Hypothesis Mock 审计
                  </button>
                  {h.audits.map((a) => (
                    <p key={a.auditId}>
                      <a href={"?screen=audit&audit=" + a.auditId}>
                        审计 {a.auditId} · Contract r{a.contractRevision} ·{" "}
                        {a.sourceIds.length} 来源
                      </a>
                    </p>
                  ))}
                </>
              ) : (
                <Empty title="请先选择或创建假设" />
              ))}
            {tab === "review" &&
              (h ? (
                <>
                  <h2>
                    Human Review · 当前正式状态 {h.status}（r{h.statusRevision}
                    ）
                  </h2>
                  <label>
                    人工决定理由
                    <textarea
                      aria-label="人工决定理由"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="请记录批准、拒绝或进一步研究的理由"
                    />
                  </label>
                  {h.proposals.map((p) => (
                    <article className="claim" key={p.id}>
                      <Badge tone="amber">MOCK / SYNTHETIC</Badge>
                      <h3>
                        {p.from} → {p.to} · r{p.contractRevision}
                      </h3>
                      <p>{p.reason}</p>
                      <small>
                        关联证据 {p.evidenceIds.join(", ") || "未提供"} ·{" "}
                        {p.decision}
                      </small>
                      {p.auditId && (
                        <p>
                          <a href={"?screen=report&audit=" + p.auditId}>
                            查看关联审计报告
                          </a>
                        </p>
                      )}
                      <div className="research-actions">
                        {[
                          ["approved", "接受建议"],
                          ["rejected", "拒绝建议"],
                          ["further_research", "要求进一步研究"],
                        ].map(([decision, label]) => (
                          <button
                            disabled={
                              busy || p.decision !== "pending" || !reason.trim()
                            }
                            key={decision}
                            onClick={() =>
                              void command("review", {
                                proposalId: p.id,
                                decision,
                                reason,
                              })
                            }
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      {p.reviewNote && (
                        <p>
                          人工备注：{p.reviewNote} · {date(p.reviewedAt)}
                        </p>
                      )}
                    </article>
                  ))}
                  {!h.proposals.length && (
                    <Empty title="尚无待审查建议">
                      先生成 Evidence Delta 或运行关联审计。
                    </Empty>
                  )}
                </>
              ) : (
                <Empty title="请选择假设" />
              ))}
            {tab === "timeline" && (
              <>
                <h2>Decision Timeline · Append-only</h2>
                <p className="muted">
                  旧事件不覆盖；以下展示{h ? "当前假设" : "全部假设"}的历史。
                </p>
                {state.events
                  .filter((e) => !h || e.objectId === h.id)
                  .map((e) => (
                    <article className="claim" key={e.id}>
                      <div className="sectionline">
                        <b>{e.type}</b>
                        <small>
                          {date(e.at)} · r{e.contractRevision}
                        </small>
                      </div>
                      <p>
                        {e.from ?? "—"} → {e.to}
                        {e.proposedStatus
                          ? " · 建议状态 " + e.proposedStatus
                          : ""}{" "}
                        · {e.reason}
                      </p>
                      <small>
                        Object {e.objectId}
                        <br />
                        Evidence {e.evidenceIds.join(", ") || "未提供"}
                        <br />
                        Event {e.id}
                      </small>
                      {e.evidenceIds.map((id) => {
                        const delta = e.after.deltas.find((d) => d.id === id);
                        const source = e.after.sources.find(
                          (s) => s.id === (delta?.sourceId ?? id),
                        );
                        return source ? (
                          <details key={id}>
                            <summary>证据来源：{source.title}</summary>
                            <p>
                              Source {source.id}
                              <br />
                              Revision {source.revision}
                              <br />
                              发布 {source.publishedAt ?? "未提供"}
                            </p>
                            {source.originalUrl && (
                              <a
                                href={source.originalUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                原始来源
                              </a>
                            )}
                            {delta && (
                              <blockquote>
                                P
                                {delta.claim.candidate.citations[0].paragraphId}{" "}
                                · {delta.claim.candidate.citations[0].quote}
                              </blockquote>
                            )}
                          </details>
                        ) : null;
                      })}
                    </article>
                  ))}
                <a className="button" href="/api/gtm/research/export" download>
                  导出完整 Decision Ledger
                </a>
              </>
            )}
            {tab === "case" && registry && (
              <>
                <h2>Case 001 · Temu 美国市场历史证据回放</h2>
                <p>
                  T0 = {registry.T0} · T1 = {registry.T1}
                </p>
                <div className="notice">{registry.limitations}</div>
                {registry.sources.map((s: any) => (
                  <article className="claim" key={s.id}>
                    <h3>{s.title}</h3>
                    <p>
                      原始发布日期：{s.publishedAt} · 核实日期：
                      {registry.checkedAt}
                    </p>
                    <a href={s.url} target="_blank" rel="noreferrer">
                      原始政府来源
                    </a>
                    <p>定位：{s.locator}</p>
                    <blockquote>{s.raw}</blockquote>
                    <small>{s.note}</small>
                  </article>
                ))}
                <ol>
                  <li>
                    点击“导入并锁定 T0 Contracts”，生成三个独立假设及 T0
                    短摘录。
                  </li>
                  <li>
                    在 Evidence Delta 中选择 T0 来源，生成 Inconclusive Mock
                    建议，人工接受或拒绝。
                  </li>
                  <li>
                    加入 T1 短摘录，只对该来源生成新增
                    Delta。拟议政策不视为已生效。
                  </li>
                  <li>
                    选择来源运行 Mock 审计，进入 Human
                    Review，填写理由后作出决定。
                  </li>
                  <li>
                    查看 Timeline、旧 Contract
                    版本与导出的完整账本。所有语义结论均为演示，不是 Temu
                    真实结论。
                  </li>
                </ol>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

import "./research.css";
