import { useEffect, useState } from "react";
import type {
  Contract,
  Hypothesis,
  ResearchState,
} from "../src/shared/research";
import type {
  Material,
  WorkspaceRun,
  WorkspaceState,
} from "../src/shared/workspace";
import "./real-workspace.css";
const base = "/api/gtm";
async function api<T = any>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(
    base + url,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await r.json();
  if (!r.ok) throw Error(data.error ?? "请求失败");
  return data;
}
type View = {
  state: WorkspaceState;
  ledger: ResearchState;
  provider: { mode: string; model: string } | null;
  search: { configured: boolean; reason: string };
};
const nav = [
  ["overview", "◈", "Overview", "研究总览"],
  ["market", "↗", "Market Research", "市场研究"],
  ["competitor", "▦", "Competitors", "竞争情报"],
  ["customer", "◎", "Customers", "客户研究"],
  ["business", "◇", "Business Model", "商业模式"],
  ["hypotheses", "◉", "Hypotheses", "假设契约"],
  ["evidence", "▤", "Evidence Ledger", "证据账本"],
  ["decisions", "↳", "Decision History", "决策历史"],
  ["reports", "▧", "Reports", "研究报告"],
];
const roleName: Record<string, string> = {
  planner: "Research Planner",
  market: "Market Intelligence",
  competitor: "Competitor Intelligence",
  customer: "Customer Research",
  business: "Business Model Intelligence",
  redteam: "Red-Team Analyst",
  verifier: "Evidence Verifier",
  decision: "Decision Analyst",
};
const dt = (s?: string | null) =>
  s ? new Date(s).toLocaleString("zh-CN") : "未知";
const key = (m: Material) => m.id + "@" + m.revision;
const emptyContract = {
  statement: "",
  market: "",
  customerSegment: "",
  scope: "",
  metric: "",
  method: "",
  supporting: "",
  falsification: "",
  validationWindow: "",
  decisionThreshold: "",
};
const contractLabels: Record<string, string> = {
  statement: "商业假设",
  market: "目标市场",
  customerSegment: "客户群体",
  scope: "研究范围",
  metric: "衡量指标",
  method: "验证方法",
  supporting: "支持证据标准",
  falsification: "反证标准",
  validationWindow: "验证时间窗口",
  decisionThreshold: "决策门槛",
};
function ContractEditor({
  h,
  act,
}: {
  h: Hypothesis;
  act: (op: string, payload?: unknown, hid?: string) => Promise<void>;
}) {
  const c = h.contracts.at(-1)!;
  const [draft, setDraft] = useState(emptyContract),
    [editing, setEditing] = useState(false);
  useEffect(() => {
    setDraft(
      Object.fromEntries(
        Object.keys(emptyContract).map((k) => [
          k,
          c[k as keyof Contract] ?? "",
        ]),
      ) as typeof emptyContract,
    );
    setEditing(false);
  }, [h.id, c.revision, c.lockedAt]);
  return (
    <article className="rw-card rw-contract">
      <div className="rw-row">
        <span className="rw-tag">
          r{c.revision} · {c.lockedAt ? "Locked" : "Draft"}
        </span>
        <span className={"rw-status " + h.status}>
          {h.status} · r{h.statusRevision}
        </span>
      </div>
      <h3>{c.statement}</h3>
      <small className="rw-mono">{h.id}</small>
      {!c.lockedAt || editing ? (
        <>
          <div className="rw-form-grid">
            {Object.entries(contractLabels).map(([k, label]) => (
              <label key={k}>
                {label}
                <textarea
                  aria-label={label}
                  value={draft[k as keyof typeof draft]}
                  onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <div className="rw-actions">
            <button
              onClick={() =>
                void act(c.lockedAt ? "revise" : "edit", draft, h.id)
              }
            >
              {c.lockedAt ? "保存为新版本" : "保存草案"}
            </button>
            {!c.lockedAt && (
              <button
                className="primary"
                onClick={() => void act("lock", draft, h.id)}
              >
                锁定此版本
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <dl className="rw-criteria">
            {[
              "market",
              "customerSegment",
              "supporting",
              "falsification",
              "validationWindow",
              "decisionThreshold",
            ].map((k) => (
              <div key={k}>
                <dt>{contractLabels[k]}</dt>
                <dd>{String(c[k as keyof Contract] ?? "unknown")}</dd>
              </div>
            ))}
          </dl>
          <button onClick={() => setEditing(true)}>
            修改标准 · 创建新版本
          </button>
        </>
      )}
      <details>
        <summary>版本历史 · {h.contracts.length}</summary>
        {h.contracts.map((v) => (
          <div className="rw-history" key={v.revision}>
            <b>
              r{v.revision} · {dt(v.lockedAt)}
            </b>
            <p>{v.statement}</p>
            <small>
              {v.supporting} / {v.falsification}
            </small>
          </div>
        ))}
      </details>
      {h.proposals
        .filter((p) => p.decision === "pending")
        .map((p) => (
          <Review key={p.id} h={h} proposalId={p.id} act={act} />
        ))}
    </article>
  );
}
function Review({
  h,
  proposalId,
  act,
}: {
  h: Hypothesis;
  proposalId: string;
  act: (op: string, payload?: unknown, hid?: string) => Promise<void>;
}) {
  const p = h.proposals.find((p) => p.id === proposalId)!;
  const [reason, setReason] = useState(""),
    [newStatus, setNewStatus] = useState(p.to);
  return (
    <div className="rw-review">
      <span className="rw-tag amber">待人工审查</span>
      <b>
        {p.from} → 建议 {p.to}
      </b>
      <p>{p.reason}</p>
      <small>
        证据 {p.evidenceIds.length} 条 · Contract r{p.contractRevision}
      </small>
      <label>
        人工决定的状态
        <select
          aria-label="人工决定的状态"
          value={newStatus}
          onChange={(e) => setNewStatus(e.target.value as typeof newStatus)}
        >
          {[
            "unassessed",
            "supported",
            "challenged",
            "inconclusive",
            "needs_research",
          ].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <textarea
        aria-label="人工决定理由"
        placeholder="对照锁定标准，记录接受、修改或拒绝的理由"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="rw-actions">
        {[
          ["approved", "接受 / 修改状态"],
          ["rejected", "拒绝建议"],
          ["further_research", "继续研究"],
        ].map(([decision, label]) => (
          <button
            key={decision}
            disabled={!reason.trim()}
            onClick={() =>
              void act(
                "review",
                {
                  proposalId,
                  decision,
                  reason,
                  ...(decision === "approved" ? { newStatus } : {}),
                },
                h.id,
              )
            }
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
export default function GtmRealWorkspace() {
  const params = new URLSearchParams(location.search);
  const [view, setView] = useState<View | null>(null),
    [projectId, setProjectId] = useState(params.get("project") ?? ""),
    [tab, setTab] = useState(params.get("section") ?? "overview"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [showCreate, setShowCreate] = useState(false),
    [newProject, setNewProject] = useState({
      name: "",
      brief: "",
      market: "",
      customer: "",
    }),
    [url, setUrl] = useState(""),
    [consent, setConsent] = useState(false),
    [sourceKey, setSourceKey] = useState(""),
    [query, setQuery] = useState(""),
    [relation, setRelation] = useState("all"),
    [hypothesisFilter, setHypothesisFilter] = useState("all"),
    [since, setSince] = useState(""),
    [selectedRun, setSelectedRun] = useState(""),
    [report, setReport] = useState("");
  const load = async () => {
    const v = await api<View>("/workspace");
    setView(v);
    setProjectId((old) => old || v.state.projects[0]?.id || "");
    return v;
  };
  const [evidenceSource, setEvidenceSource] = useState("all");
  useEffect(() => {
    document.title = "GTM-RedTeam · Research Workspace";
    void load().catch((e) => setError(e.message));
  }, []);
  const running = view?.state.runs.some((r) => r.status === "running");
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(
      () => void load().catch((e) => setError(e.message)),
      1800,
    );
    return () => clearInterval(timer);
  }, [running]);
  const project = view?.state.projects.find((p) => p.id === projectId),
    hypotheses =
      view?.ledger.hypotheses.filter((h) => h.projectId === projectId) ?? [],
    runs = view?.state.runs.filter((r) => r.projectId === projectId) ?? [],
    run = runs.find((r) => r.id === selectedRun) ?? runs.at(-1),
    materials =
      view?.state.materials.filter((m) =>
        project?.materialKeys.includes(key(m)),
      ) ?? [],
    events =
      view?.ledger.events.filter((e) =>
        hypotheses.some((h) => h.id === e.objectId),
      ) ?? [],
    pending = hypotheses.flatMap((h) =>
      h.proposals.filter((p) => p.decision === "pending"),
    );
  const navigate = (section: string, pid = projectId) => {
    setTab(section);
    setProjectId(pid);
    setReport("");
    const q = new URLSearchParams();
    if (pid) q.set("project", pid);
    q.set("section", section);
    history.replaceState(null, "", "?" + q);
    window.scrollTo(0, 0);
  };
  const action = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const command = async (
    operation: string,
    payload: unknown = {},
    hid?: string,
  ) =>
    action(async () => {
      if (!view) return;
      await api("/research", {
        requestId: crypto.randomUUID(),
        expectedRevision: view.ledger.revision,
        operation,
        hypothesisId: hid,
        payload,
      });
    });
  const start = async (kind: string) =>
    action(async () => {
      const r = await api<WorkspaceRun>(
        `/workspace/projects/${projectId}/runs`,
        { kind, consentToSend: consent },
      );
      setSelectedRun(r.id);
      setNotice("真实研究已启动；刷新后可继续查看进度。");
    });
  const upload = async (file: File) => {
    if (file.size > 20_000_000) throw Error("单个文件上限 20 MB");
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () => reject(Error("文件读取失败"));
      reader.readAsDataURL(file);
    });
    const result = await api(`/workspace/projects/${projectId}/materials`, {
      name: file.name,
      base64,
    });
    setNotice(result.message);
  };
  const inspect = (sid: string, pid: number) => {
    const location = runs
      .flatMap((r) => r.selectedUnits)
      .find((u) => u.sourceId === sid && u.paragraphId === pid);
    if (location) {
      setSourceKey(location.materialKey);
      setQuery(location.locator);
      navigate("evidence");
    }
  };
  const material = materials.find((m) => key(m) === sourceKey) ?? materials[0];
  const deltas = runs
    .flatMap((r) =>
      (r.deltas ?? []).map((d) => ({
        r,
        d,
        h: hypotheses.find((h) => h.id === d.hypothesisId),
      })),
    )
    .filter(
      ({ d }) =>
        (hypothesisFilter === "all" || d.hypothesisId === hypothesisFilter) &&
        (relation === "all" || d.relation === relation) &&
        (evidenceSource === "all" || d.sourceKeys.includes(evidenceSource)) &&
        (!since || d.timestamp.slice(0, 10) >= since),
    );
  const unitMatches =
    material?.units.filter(
      (u) =>
        !query ||
        u.text.toLowerCase().includes(query.toLowerCase()) ||
        u.locator.toLowerCase().includes(query.toLowerCase()),
    ) ?? [];
  const baseline = [...runs]
    .reverse()
    .find(
      (r) =>
        r.kind === "research" &&
        r.status === "completed" &&
        (!run || r.createdAt <= run.createdAt),
    );
  const evidenceRuns = runs.filter(
    (r) =>
      r.kind !== "plan" &&
      r.verifiedClaims.length &&
      (!run || r.createdAt <= run.createdAt) &&
      (!baseline || r.createdAt >= baseline.createdAt),
  );
  const visibleClaims = evidenceRuns.flatMap((r) =>
    r.verifiedClaims.map((c) => ({ r, c })),
  );
  const evidence = (filter?: string) => (
    <div className="rw-stack">
      {visibleClaims
        .filter(({ c }) => !filter || c.candidate.id.startsWith(filter + "-"))
        .map(({ r, c }) => (
          <article className="rw-evidence" key={r.id + c.candidate.id}>
            <div className="rw-row">
              <span className="rw-tag">{c.classification}</span>
              <small>
                {c.candidate.id} · {dt(r.createdAt)}
              </small>
            </div>
            <p>{c.candidate.text}</p>
            <p className="rw-muted">
              {c.semanticReview?.reasoning ?? "未完成语义核验"}
            </p>
            {c.citationChecks.map((v, i) =>
              v.ok ? (
                <blockquote key={i}>
                  <p>{v.citation.quote}</p>
                  <button
                    onClick={() =>
                      inspect(v.citation.sourceId, v.citation.paragraphId)
                    }
                  >
                    {r.selectedUnits.find(
                      (u) =>
                        u.sourceId === v.citation.sourceId &&
                        u.paragraphId === v.citation.paragraphId,
                    )?.locator ?? v.citation.sourceId}{" "}
                    ↗ 查看原文
                  </button>
                  <small>
                    引用：{v.citation.matchMode} · 语义：
                    {c.semanticReview?.relation ?? "unknown"}
                  </small>
                </blockquote>
              ) : (
                <p key={i} className="rw-error">
                  引用失败：{v.reason}
                </p>
              ),
            )}
          </article>
        ))}
      {!visibleClaims.some(
        ({ c }) => !filter || c.candidate.id.startsWith(filter + "-"),
      ) && (
        <div className="rw-empty">
          尚无核验证据。完成真实研究后，原文与服务端分类会显示在这里。
        </div>
      )}
    </div>
  );
  const roleCard = (role: string) => {
    const historical = [...runs]
      .reverse()
      .find(
        (r) =>
          (!run || r.createdAt <= run.createdAt) &&
          r.status === "completed" &&
          r.roles.some((e) => e.role === role && e.output),
      );
    const current = run?.roles.find((r) => r.role === role);
    const execution = current ?? historical?.roles.find((r) => r.role === role);
    return (
      <article className="rw-card" key={role}>
        <div className="rw-row">
          <h3>{roleName[role]}</h3>
          <span className="rw-tag">{execution?.status ?? "未运行"}</span>
        </div>
        {execution?.error && <p className="rw-error">{execution.error}</p>}
        {!current && historical && (
          <small className="rw-muted">
            沿用 {dt(historical.createdAt)} 的研究结果
          </small>
        )}
        {execution?.output ? (
          <>
            <p className="rw-lead">{execution.output.summary}</p>
            <small className="rw-muted">
              以下为 AI 研究分析，事实支持关系请查看核验证据。
            </small>
            {execution.output.sections.map((s, i) => (
              <div className="rw-section" key={i}>
                <h4>{s.title}</h4>
                <p>{s.body}</p>
              </div>
            ))}
            {!!execution.output.gaps.length && (
              <div className="rw-gaps">
                <h4>证据缺口</h4>
                <ul>
                  {execution.output.gaps.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <div className="rw-empty">
            {execution?.status === "running"
              ? "正在请求真实 Provider…"
              : "完成资料导入和 Contract 锁定后开始研究。"}
          </div>
        )}
      </article>
    );
  };
  return (
    <div className="rw-app">
      <aside className="rw-sidebar">
        <a className="rw-brand" href="/">
          GTM<span>RedTeam</span>
          <small>RESEARCH WORKSPACE</small>
        </a>
        <label className="rw-project-label">
          研究项目
          <select
            aria-label="研究项目"
            value={projectId}
            onChange={(e) => {
              setSelectedRun("");
              navigate("overview", e.target.value);
            }}
          >
            <option value="">选择项目</option>
            {view?.state.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="rw-new"
          onClick={() => {
            setShowCreate(true);
            navigate("overview");
          }}
        >
          ＋ 新建研究项目
        </button>
        <nav>
          {nav.map(([id, icon, en, zh]) => (
            <button
              className={tab === id ? "active" : ""}
              key={id}
              onClick={() => navigate(id)}
            >
              <span>{icon}</span>
              <div>
                {en}
                <small>{zh}</small>
              </div>
              {id === "hypotheses" && pending.length > 0 && (
                <b>{pending.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="rw-sidebar-foot">
          <span className="rw-live-dot" />{" "}
          {view?.provider?.mode === "real"
            ? "REAL PROVIDER"
            : "真实 Provider 未配置"}
          <small>{view?.provider?.model ?? "读取配置中"}</small>
          <a href="?screen=projects">历史审计工作台 ↗</a>
        </div>
      </aside>
      <div className="rw-body">
        <header className="rw-topbar">
          <span>
            Research / {nav.find((n) => n[0] === tab)?.[2] ?? "Workspace"}
          </span>
          <div className="rw-row">
            <span className="rw-tag">v0.4 · LOCAL WORKSPACE</span>
            <button
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await load();
                })
              }
            >
              刷新
            </button>
          </div>
        </header>
        <main aria-busy={busy}>
          <div className="rw-page-heading">
            <div>
              <span className="rw-eyebrow">
                CONTINUOUS EVIDENCE · HUMAN DECISIONS
              </span>
              <h1>
                {nav.find((n) => n[0] === tab)?.[2] ?? "Research Workspace"}
              </h1>
              <p>
                {project?.name ?? "为下一次商业判断建立证据链"}
                {project && " · " + project.market}
              </p>
            </div>
            {project && (
              <span className="rw-tag">
                {runs.some((r) => r.status === "running")
                  ? "● 研究进行中"
                  : "等待你的下一步"}
              </span>
            )}
          </div>
          {error && (
            <div className="rw-alert rw-error" role="alert">
              {error}
              <button onClick={() => setError("")}>关闭</button>
            </div>
          )}
          {notice && (
            <div className="rw-alert" role="status">
              {notice}
            </div>
          )}
          {!view && <div className="rw-empty">正在读取本地研究记录…</div>}
          {(showCreate || (view && !view.state.projects.length)) && (
            <form
              className="rw-card rw-create"
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  const p = await api("/workspace/projects", newProject);
                  setProjectId(p.id);
                  setShowCreate(false);
                  setNewProject({
                    name: "",
                    brief: "",
                    market: "",
                    customer: "",
                  });
                  navigate("overview", p.id);
                });
              }}
            >
              <h2>建立研究项目</h2>
              <p>围绕真实商业问题组织资料、假设与决策。</p>
              <div className="rw-form-grid">
                {[
                  ["name", "项目名称"],
                  ["market", "目标市场"],
                  ["customer", "客户类型"],
                ].map(([k, label]) => (
                  <label key={k}>
                    {label}
                    <input
                      required
                      value={newProject[k as keyof typeof newProject]}
                      onChange={(e) =>
                        setNewProject({ ...newProject, [k]: e.target.value })
                      }
                    />
                  </label>
                ))}
              </div>
              <label>
                产品与商业背景
                <textarea
                  required
                  rows={4}
                  value={newProject.brief}
                  onChange={(e) =>
                    setNewProject({ ...newProject, brief: e.target.value })
                  }
                  placeholder="产品解决什么问题？目前需要决定什么？哪些信息仍不确定？"
                />
              </label>
              <div className="rw-actions">
                <button className="primary" disabled={busy}>
                  创建项目
                </button>
                {view?.state.projects.length !== 0 && (
                  <button type="button" onClick={() => setShowCreate(false)}>
                    取消
                  </button>
                )}
              </div>
            </form>
          )}
          {project && (
            <>
              {tab === "overview" && (
                <>
                  <div className="rw-stats">
                    {[
                      ["研究材料", materials.length, "完整原件与定位"],
                      ["商业假设", hypotheses.length, "人工锁定验证标准"],
                      ["待人工决定", pending.length, "AI 不改变正式状态"],
                      ["决策事件", events.length, "保留完整历史"],
                    ].map(([label, n, sub]) => (
                      <div className="rw-stat" key={label}>
                        <small>{label}</small>
                        <strong>{n}</strong>
                        <span>{sub}</span>
                      </div>
                    ))}
                  </div>
                  <div className="rw-two-col">
                    <section className="rw-card">
                      <h2>Research brief</h2>
                      <p className="rw-lead">{project.brief}</p>
                      <dl className="rw-criteria">
                        <div>
                          <dt>目标市场</dt>
                          <dd>{project.market}</dd>
                        </div>
                        <div>
                          <dt>目标客户</dt>
                          <dd>{project.customer}</dd>
                        </div>
                      </dl>
                      <div className="rw-actions">
                        <button onClick={() => navigate("evidence")}>
                          1 · 导入真实资料
                        </button>
                        <button
                          disabled={
                            busy ||
                            !consent ||
                            !materials.length ||
                            !!hypotheses.length
                          }
                          onClick={() => void start("plan")}
                        >
                          2 · AI 草拟 Contracts
                        </button>
                        <button onClick={() => navigate("hypotheses")}>
                          3 · 修改并锁定假设
                        </button>
                      </div>
                      <label className="rw-checkbox">
                        <input
                          type="checkbox"
                          checked={consent}
                          onChange={(e) => setConsent(e.target.checked)}
                        />
                        将所选研究材料发送到当前真实 Provider，最多 16
                        次请求／运行；实际 usage 可核查。
                      </label>
                      <div className="rw-actions">
                        <button
                          className="primary"
                          disabled={
                            busy ||
                            !consent ||
                            !hypotheses.length ||
                            hypotheses.some(
                              (h) => !h.contracts.at(-1)!.lockedAt,
                            ) ||
                            runs.some((r) => r.status === "running")
                          }
                          onClick={() => void start("research")}
                        >
                          启动八角色真实研究
                        </button>
                        <button
                          disabled={
                            busy ||
                            !consent ||
                            !hypotheses.length ||
                            runs.some((r) => r.status === "running")
                          }
                          onClick={() => void start("delta")}
                        >
                          仅研究新增材料 · Delta
                        </button>
                      </div>
                      <small className="rw-muted">
                        外部搜索未配置。可导入公开 URL；不会虚构搜索结果。
                      </small>
                    </section>
                    <section className="rw-card">
                      <h2>待决定与证据缺口</h2>
                      {pending.length ? (
                        <p>
                          {pending.length} 条状态建议等待人工审查。
                          <button onClick={() => navigate("hypotheses")}>
                            打开假设工作区
                          </button>
                        </p>
                      ) : (
                        <p className="rw-muted">暂无待批准的状态变化。</p>
                      )}
                      {run?.roles
                        .flatMap((r) => r.output?.gaps ?? [])
                        .slice(0, 7)
                        .map((g, i) => (
                          <p className="rw-gap-line" key={i}>
                            {g}
                          </p>
                        ))}
                      <h4>最新市场研究</h4>
                      <p>
                        {[...runs]
                          .reverse()
                          .find((r) =>
                            r.roles.some(
                              (x) => x.role === "market" && x.output,
                            ),
                          )
                          ?.roles.find((x) => x.role === "market")?.output
                          ?.summary ?? "尚未产生市场研究结果。"}
                      </p>
                    </section>
                  </div>
                </>
              )}
              {[
                "overview",
                "market",
                "competitor",
                "customer",
                "business",
                "reports",
              ].includes(tab) &&
                runs.length > 0 && (
                  <section className="rw-run-panel">
                    <div className="rw-row">
                      <h2>Research execution</h2>
                      <select
                        aria-label="研究运行"
                        value={run?.id ?? ""}
                        onChange={(e) => {
                          setSelectedRun(e.target.value);
                          setReport("");
                        }}
                      >
                        {[...runs].reverse().map((r) => (
                          <option value={r.id} key={r.id}>
                            {dt(r.createdAt)} · {r.kind} · {r.status}
                          </option>
                        ))}
                      </select>
                    </div>
                    {run && (
                      <>
                        <div className="rw-agent-strip">
                          {run.roles.map((r) => (
                            <div className={r.status} key={r.role}>
                              <small>{roleName[r.role]}</small>
                              <b>{r.status}</b>
                            </div>
                          ))}
                        </div>
                        <p className="rw-muted">
                          真实请求 {run.calls.length} / {run.maxCalls} · 剩余{" "}
                          {run.maxCalls - run.calls.length} · 已知实际 Token{" "}
                          {run.calls.reduce(
                            (n, c) => n + (c.usage.totalTokens ?? 0),
                            0,
                          )}{" "}
                          · 缺少 usage 的调用{" "}
                          {
                            run.calls.filter(
                              (c) => c.usage.totalTokens === null,
                            ).length
                          }{" "}
                          · 覆盖片段 {run.coverage.selectedUnits}/
                          {run.coverage.availableUnits}（未评估{" "}
                          {run.coverage.omittedUnits}）
                        </p>
                        {run.error && (
                          <div className="rw-alert rw-error">
                            {run.error}
                            <button
                              disabled={busy}
                              onClick={() =>
                                void action(async () => {
                                  await api(
                                    `/workspace/runs/${run.id}/resume`,
                                    {},
                                  );
                                })
                              }
                            >
                              恢复未完成阶段
                            </button>
                          </div>
                        )}
                        <details>
                          <summary>请求记录、实际 usage 与错误</summary>
                          <div className="rw-table-wrap">
                            <table>
                              <thead>
                                <tr>
                                  <th>Agent / attempt</th>
                                  <th>状态</th>
                                  <th>Actual usage</th>
                                  <th>Input estimate</th>
                                  <th>错误</th>
                                </tr>
                              </thead>
                              <tbody>
                                {run.calls.map((c) => (
                                  <tr key={c.id}>
                                    <td>
                                      {roleName[c.role]} / {c.attempt}
                                      <small>{dt(c.startedAt)}</small>
                                    </td>
                                    <td>{c.status}</td>
                                    <td>
                                      {c.usage.totalTokens ?? "unknown"}
                                      <small>
                                        in {c.usage.promptTokens ?? "?"} / out{" "}
                                        {c.usage.completionTokens ?? "?"}
                                      </small>
                                    </td>
                                    <td>{c.estimatedInputTokens}</td>
                                    <td>{c.error ?? "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      </>
                    )}
                  </section>
                )}
              {["market", "competitor", "customer", "business"].includes(
                tab,
              ) && (
                <>
                  <div className="rw-two-col">
                    {roleCard(tab)}
                    <section className="rw-card">
                      <h2>可追溯核验证据</h2>
                      {evidence(tab)}
                    </section>
                  </div>
                  <div className="rw-two-col">
                    {roleCard("redteam")}
                    {roleCard("verifier")}
                  </div>
                  {roleCard("decision")}
                </>
              )}
              {tab === "hypotheses" && (
                <>
                  {hypotheses.length === 0 ? (
                    <div className="rw-empty">
                      先导入资料，在 Overview 中让 Research Planner 草拟 3–5
                      条商业假设。
                    </div>
                  ) : (
                    <div className="rw-stack">
                      {hypotheses.map((h) => (
                        <ContractEditor h={h} key={h.id} act={command} />
                      ))}
                    </div>
                  )}
                </>
              )}
              {tab === "evidence" && (
                <>
                  <section className="rw-card">
                    <div className="rw-row">
                      <div>
                        <h2>Source library</h2>
                        <p>
                          PDF · DOCX · XLSX · CSV · TXT · Markdown · HTML / URL
                        </p>
                      </div>
                      <label className="rw-upload">
                        ＋ 导入文件
                        <input
                          aria-label="导入文件"
                          type="file"
                          disabled={busy}
                          accept=".pdf,.docx,.xlsx,.csv,.txt,.md,.html"
                          multiple
                          onChange={(e) => {
                            const files = Array.from(e.target.files ?? []);
                            void action(async () => {
                              for (const file of files) await upload(file);
                            });
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                    <form
                      className="rw-url-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void action(async () => {
                          const result = await api(
                            `/workspace/projects/${projectId}/materials`,
                            { url },
                          );
                          setNotice(result.message);
                          setUrl("");
                        });
                      }}
                    >
                      <input
                        aria-label="公开来源 URL"
                        type="url"
                        required
                        placeholder="https://… 公开资料 URL"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                      />
                      <button disabled={busy}>获取公开网页</button>
                    </form>
                    <small className="rw-muted">
                      原文件完整保留；扫描 PDF 无文字层时明确报错。Excel
                      公式与缓存值分开保存，缓存值不代表重新计算结果。
                    </small>
                    <div className="rw-source-grid">
                      {materials.map((m) => (
                        <button
                          className={
                            material?.fileHash === m.fileHash ? "selected" : ""
                          }
                          key={key(m)}
                          onClick={() => {
                            setSourceKey(key(m));
                            setQuery("");
                          }}
                        >
                          <span className="rw-tag">
                            {m.format.toUpperCase()}
                          </span>
                          <b>{m.title}</b>
                          <small>
                            {m.units.length} 个定位片段 ·{" "}
                            {Math.ceil(m.bytes / 1024)} KB
                          </small>
                          <small>
                            获取 {dt(m.acquiredAt)} · 发布 {dt(m.publishedAt)}
                          </small>
                        </button>
                      ))}
                    </div>
                    {materials.length === 0 && (
                      <div className="rw-empty">
                        尚未导入资料。选择真实文件或公开网页开始研究。
                      </div>
                    )}
                  </section>
                  {material && (
                    <section className="rw-card">
                      <div className="rw-row">
                        <h2>{material.title}</h2>
                        <a
                          className="rw-button"
                          href={`${base}/workspace/materials/${material.fileHash}/original`}
                          download
                        >
                          下载原文件
                        </a>
                      </div>
                      <p className="rw-mono">
                        Source {material.id}
                        <br />
                        Revision {material.revision}
                      </p>
                      {material.url && (
                        <a href={material.url} target="_blank" rel="noreferrer">
                          查看公开来源 ↗
                        </a>
                      )}
                      <p className="rw-muted">
                        发布日期：{material.publishedAt ?? "unknown"} ·{" "}
                        {material.publicationBasis ?? "尚无可核实的发布日期"}
                      </p>
                      {material.warnings.map((w, i) => (
                        <p className="rw-warning" key={i}>
                          {w}
                        </p>
                      ))}
                      <input
                        aria-label="搜索原文或位置"
                        placeholder="搜索原文、页码、Sheet / Cell…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                      <p className="rw-muted">
                        匹配 {unitMatches.length} 个片段。当前显示前 60
                        个；完整内容保存在原件和研究记录导出中。
                      </p>
                      {unitMatches.slice(0, 60).map((u) => (
                        <div className="rw-unit" key={u.id}>
                          <b>{u.locator}</b>
                          <small>{u.id}</small>
                          <pre>{u.text}</pre>
                          {u.formula !== undefined && (
                            <dl className="rw-criteria">
                              <div>
                                <dt>Formula</dt>
                                <dd>{u.formula || "shared / array"}</dd>
                              </div>
                              <div>
                                <dt>Cached value</dt>
                                <dd>{u.cachedValue ?? "unknown"}</dd>
                              </div>
                            </dl>
                          )}
                        </div>
                      ))}
                    </section>
                  )}
                  <section className="rw-card">
                    <h2>Evidence Delta</h2>
                    <div className="rw-filters">
                      <select
                        aria-label="按来源筛选"
                        value={evidenceSource}
                        onChange={(e) => setEvidenceSource(e.target.value)}
                      >
                        <option value="all">全部来源</option>
                        {materials.map((m) => (
                          <option key={key(m)} value={key(m)}>
                            {m.title}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="按假设筛选"
                        value={hypothesisFilter}
                        onChange={(e) => setHypothesisFilter(e.target.value)}
                      >
                        <option value="all">全部假设</option>
                        {hypotheses.map((h) => (
                          <option value={h.id} key={h.id}>
                            {h.contracts.at(-1)!.statement}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="按证据方向筛选"
                        value={relation}
                        onChange={(e) => setRelation(e.target.value)}
                      >
                        {[
                          "all",
                          "supporting",
                          "contradicting",
                          "contextual",
                          "neutral",
                          "duplicate",
                          "insufficient_evidence",
                        ].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                      <input
                        aria-label="证据起始日期"
                        type="date"
                        value={since}
                        onChange={(e) => setSince(e.target.value)}
                      />
                    </div>
                    {deltas.map(({ h, d, r }) => (
                      <article className="rw-evidence" key={d.id}>
                        <div className="rw-row">
                          <span className="rw-tag">{d.relation}</span>
                          <small>
                            {r.kind} · {r.id.slice(0, 8)}
                          </small>
                        </div>
                        <h4>
                          {h?.contracts.find(
                            (c) => c.revision === d.contractRevision,
                          )?.statement ?? "背景资料 · 未直接影响商业假设"}
                        </h4>
                        <p>
                          {d.previousStatus ?? "不适用"} → 建议{" "}
                          {d.proposedStatus ?? "不适用"}
                          {h && ` · 当前正式状态 ${h.status}`}
                        </p>
                        <p>
                          {
                            r.verifiedClaims.find(
                              (c) => c.candidate.id === d.claimId,
                            )?.candidate.text
                          }
                        </p>
                        <p className="rw-muted">{d.reason}</p>
                        <small>
                          旧证据 {d.previousEvidenceIds.length} 条 · 新证据{" "}
                          {d.newEvidenceIds.length} 条 · {dt(d.timestamp)} ·
                          REAL PROVIDER
                        </small>
                        <details>
                          <summary>Previous / New Evidence IDs</summary>
                          {[...d.previousEvidenceIds, ...d.newEvidenceIds].map(
                            (id) => (
                              <p className="rw-mono" key={id}>
                                {id} ·{" "}
                                {
                                  h?.deltas.find((x) => x.id === id)?.claim
                                    .candidate.text
                                }
                              </p>
                            ),
                          )}
                        </details>
                        <p>人工决定：{d.humanDecision}</p>
                      </article>
                    ))}
                    {(project.imports ?? [])
                      .filter(
                        (i) =>
                          i.classification === "duplicate" &&
                          (relation === "all" || relation === "duplicate"),
                      )
                      .map((i) => (
                        <article className="rw-evidence" key={i.id}>
                          <span className="rw-tag">duplicate</span>
                          <p>
                            {i.name} ·
                            相同文件哈希，不重复作为新证据，不调用模型。
                          </p>
                          <small>
                            {dt(i.at)} · {i.fileHash}
                          </small>
                        </article>
                      ))}
                    {deltas.length === 0 && (
                      <div className="rw-empty">
                        尚无匹配的 Delta。添加新材料后，在 Overview
                        执行增量研究。
                      </div>
                    )}
                  </section>
                </>
              )}
              {tab === "decisions" && (
                <section className="rw-card">
                  <div className="rw-row">
                    <h2>判断如何发生变化</h2>
                    <a
                      className="rw-button"
                      href={`${base}/workspace/projects/${projectId}/export`}
                      download
                    >
                      导出研究记录
                    </a>
                  </div>
                  <p className="rw-muted">
                    记录包括 AI 建议与人工决定；只有人工批准会改变正式状态。
                  </p>
                  <div className="rw-timeline">
                    {[...events].reverse().map((e) => (
                      <article key={e.id}>
                        <time>{dt(e.at)}</time>
                        <h3>{e.type}</h3>
                        <p>
                          {e.from ?? "初始"} → {e.to}
                          {e.proposedStatus && ` · 建议 ${e.proposedStatus}`}
                        </p>
                        <p>{e.reason}</p>
                        <small>
                          {e.objectId} · Contract r{e.contractRevision} ·{" "}
                          {e.evidenceIds.length} 条关联证据
                          {` · ${e.actor === "user" ? "人工" : e.actor === "agent" ? "研究 Agent" : e.actor === "assistant_acceptance" ? "助手验收操作" : "历史记录"}`}
                        </small>
                        <details>
                          <summary>决策 ID 与完整性哈希</summary>
                          <p className="rw-mono">
                            {e.id}
                            <br />
                            {e.hash}
                            <br />
                            Previous: {e.previousHash}
                          </p>
                        </details>
                      </article>
                    ))}
                  </div>
                  {!events.length && (
                    <div className="rw-empty">
                      创建假设后，这里将保留契约、证据、建议及人工决策的完整过程。
                    </div>
                  )}
                </section>
              )}
              {tab === "reports" && (
                <>
                  <section className="rw-card">
                    <h2>GTM Research Report</h2>
                    <p>
                      由确定性代码组装研究结果、精确引文、模型核验、证据缺口和人工决策。未完成的运行不会生成完整报告。
                    </p>
                    <div className="rw-actions">
                      <button
                        disabled={
                          busy ||
                          !runs.some(
                            (r) =>
                              r.status === "completed" && r.kind !== "plan",
                          )
                        }
                        onClick={() =>
                          void action(async () => {
                            const r = await fetch(
                              `${base}/workspace/projects/${projectId}/report`,
                            );
                            if (!r.ok) {
                              const d = await r.json();
                              throw Error(d.error);
                            }
                            setReport(await r.text());
                          })
                        }
                      >
                        预览最新完整报告
                      </button>
                      <a
                        className="rw-button"
                        href={`${base}/workspace/projects/${projectId}/report`}
                        download
                      >
                        导出 Markdown
                      </a>
                      <a
                        className="rw-button"
                        href={`${base}/workspace/projects/${projectId}/export`}
                        download
                      >
                        导出完整研究记录 JSON
                      </a>
                    </div>
                    {report && <pre className="rw-report">{report}</pre>}
                  </section>
                  {roleCard("decision")}
                </>
              )}
              {tab === "overview" && run && (
                <div className="rw-two-col">
                  {roleCard("planner")}
                  {roleCard("redteam")}
                </div>
              )}
            </>
          )}
          <footer className="rw-footer">
            GTM-RedTeam · A Persistent Evidence Ledger for Go-to-Market
            Decisions.<span>证据可追溯 · 未知保持未知 · 决策由人负责</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
