import GtmResearch from './GtmResearch';
import { useEffect, useRef, useState } from "react";
import type { GtmConfig } from "../src/shared/gtm";
import GtmCreate from "./GtmCreate";
import GtmWorkspace from "./GtmWorkspace";
import GtmReport from "./GtmReport";
import {
  type AuditView,
  type Configuration,
  type HistoryItem,
  type ProviderInfo,
  Badge,
  base,
  date,
  Empty,
  Icon,
  request,
  show,
  Status,
} from "./gtm-ui";
import "./gtm.css";

const navigation = [
  ["home", "grid", "项目总览"],
  ["projects", "folder", "审计项目"],
  ["hypotheses", "shield", "假设研究"],
  ["sources", "source", "材料来源"],
  ["reports", "report", "审计报告"],
  ["evaluations", "chart", "评测案例"],
  ["settings", "settings", "设置"],
];
function route() {
  const q = new URLSearchParams(location.search),
    id = q.get("audit") ?? "",
    raw = q.get("screen") ?? "home";
  return {
    id,
    screen:
      raw === "home" && id
        ? "create"
        : navigation.some((n) => n[0] === raw) ||
            ["create", "audit", "report"].includes(raw)
          ? raw
          : "home",
  };
}
export default function GtmApp() {
  const initial = route();
  const [id, setId] = useState(initial.id),
    [screen, setScreen] = useState(initial.screen),
    [view, setView] = useState<AuditView | null>(null),
    [history, setHistory] = useState<HistoryItem[]>([]),
    [historyReady, setHistoryReady] = useState(false),
    [configuration, setConfiguration] = useState<GtmConfig | null>(null),
    [provider, setProvider] = useState<ProviderInfo | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0),
    [menu, setMenu] = useState(false),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all");
  const idRef = useRef(id);
  idRef.current = id;
  const a = view?.audit.id === id ? view.audit : undefined,
    activeProvider = (a ? view?.provider : null) ?? provider,
    modeLabel = activeProvider
      ? activeProvider.mode === "mock"
        ? "MOCK DEMO"
        : "REAL PROVIDER"
      : "加载模式…";
  const navigate = (
    nextId: string,
    nextScreen: string,
    nextView?: AuditView,
  ) => {
    if (nextId !== id) setView(nextView ?? null);
    setId(nextId);
    setScreen(nextScreen);
    setError("");
    setMenu(false);
    const q = new URLSearchParams();
    if (nextId) q.set("audit", nextId);
    q.set("screen", nextScreen);
    window.history.pushState(null, "", "?" + q);
    window.scrollTo(0, 0);
  };
  const refreshHistory = async () => {
    setHistory(await request<HistoryItem[]>("/audits"));
    setHistoryReady(true);
  };
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refreshHistory();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const reload = () => {
    setError("");
    setRetry((n) => n + 1);
  };
  useEffect(() => {
    let alive = true;
    const pop = () => {
      const r = route();
      setId(r.id);
      setScreen(r.screen);
      setError("");
      setMenu(false);
    };
    window.addEventListener("popstate", pop);
    void Promise.all([
      request<Configuration>("/config"),
      request<HistoryItem[]>("/audits"),
    ])
      .then(([c, h]) => {
        if (alive) {
          setConfiguration(c.config);
          setProvider(c.provider);
          setHistory(h);
          setHistoryReady(true);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
      window.removeEventListener("popstate", pop);
    };
  }, [retry]);
  useEffect(() => {
    if (!id) {
      setView(null);
      return;
    }
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const read = async () => {
      try {
        const v = await request<AuditView>("/audits/" + id);
        if (!alive) return;
        setView((old) =>
          old?.audit.id === v.audit.id &&
          old.audit.recordRevision > v.audit.recordRevision
            ? old
            : v,
        );
        if (v.audit.state.lifecycle === "running")
          timer = setTimeout(read, 550);
        else
          void refreshHistory().catch((e) => {
            if (alive) setError(e.message);
          });
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    void read();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id, retry, a?.state.lifecycle]);
  useEffect(() => {
    if (!history.some((h) => h.state.lifecycle === "running")) return;
    const timer = setInterval(
      () => void refreshHistory().catch((e) => setError(e.message)),
      2000,
    );
    return () => clearInterval(timer);
  }, [history.some((h) => h.state.lifecycle === "running")]);
  useEffect(() => {
    document.title =
      (a?.context.projectName ? a.context.projectName + " · " : "") +
      "GTM-RedTeam";
  }, [a?.context.projectName]);
  const change = async (path: string, method: string, body: unknown) => {
    const changingId = id;
    const v = await request<AuditView>(
      "/audits/" + changingId + path,
      method,
      body,
    );
    if (idRef.current === changingId)
      setView((old) =>
        old?.audit.id === v.audit.id &&
        old.audit.recordRevision > v.audit.recordRevision
          ? old
          : v,
      );
    return v;
  };
  const open = (h: HistoryItem) =>
    navigate(h.id, h.state.lifecycle === "draft" ? "create" : "audit");
  const selectedNav = ["create", "audit", "report"].includes(screen)
    ? "projects"
    : screen;
  const shown = history.filter(
    (h) =>
      (filter === "all" || h.state.lifecycle === filter) &&
      [h.name, h.targetMarket, h.provider.model]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const projectActions = (
    <button className="primary" onClick={() => navigate("", "create")}>
      <Icon name="plus" size={16} />
      新建审计
    </button>
  );
  return (
    <div className="gtm">
      <aside className={"sidebar " + (menu ? "mobile-open" : "")}>
        <a
          className="brand"
          href="?screen=home"
          onClick={(e) => {
            e.preventDefault();
            navigate("", "home");
          }}
        >
          <span className="brand-mark">
            <Icon name="source" size={23} />
          </span>
          <span>
            GTM-RedTeam<small>Intelligence Workspace</small>
          </span>
        </a>
        <div className="workspace-label">
          <span className="workspace-avatar">W</span>
          <div>
            Local Workspace<small>本地单用户工作空间</small>
          </div>
          <Badge>v0.3</Badge>
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav aria-label="主导航">
          {navigation.map(([key, icon, label]) => (
            <button
              key={key}
              aria-current={selectedNav === key ? "page" : undefined}
              className={selectedNav === key ? "active" : ""}
              onClick={() => {
                setFilter("all");
                setSearch("");
                navigate("", key);
              }}
            >
              <Icon name={icon} />
              <span>{label}</span>
              {key === "evaluations" && <small>Planned</small>}
              {key === "projects" && historyReady && (
                <span className="nav-count">{history.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-recent">
          <div className="sectionline">
            <span className="nav-label">RECENT PROJECTS</span>
            <span>{historyReady ? Math.min(history.length, 4) : "—"}</span>
          </div>
          {history.slice(0, 4).map((h) => (
            <button
              className={"history " + (h.id === id ? "active" : "")}
              key={h.id}
              onClick={() => open(h)}
            >
              <span className={"project-dot " + h.state.lifecycle} />
              <span className="truncate">{h.name}</span>
            </button>
          ))}
          {historyReady && !history.length && <p>尚无审计项目</p>}
        </div>
        <div className="sidebar-bottom">
          <Icon name="shield" size={19} />
          <div>
            Evidence-backed<small>人工复核 · 证据可追溯</small>
          </div>
          <button
            aria-label="关闭导航"
            className="mobile-close icon-button"
            onClick={() => setMenu(false)}
          >
            <Icon name="close" />
          </button>
        </div>
      </aside>
      {menu && (
        <button
          aria-label="关闭导航遮罩"
          className="sidebar-overlay"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="workspace-shell">
        <header className="workspace-top">
          <div className="breadcrumb">
            <button
              aria-label="打开导航"
              className="mobile-menu icon-button"
              onClick={() => setMenu(!menu)}
            >
              <Icon name="menu" />
            </button>
            <span>Workspace</span>
            <span>/</span>
            <b>
              {["audit", "report", "create"].includes(screen)
                ? screen === "report"
                  ? "审计报告"
                  : screen === "create"
                    ? "审计准备"
                    : "审计工作台"
                : navigation.find((n) => n[0] === screen)?.[2]}
            </b>
          </div>
          <div className="top-actions">
            <Badge tone={activeProvider?.mode === "real" ? "amber" : "blue"}>
              {modeLabel}
            </Badge>
            <button
              className="icon-button"
              aria-label="刷新工作空间"
              title="刷新工作空间"
              onClick={reload}
            >
              <Icon name="clock" size={16} />
            </button>
            <span className="user-avatar">W</span>
          </div>
        </header>
        <main
          className={
            "main-content " +
            (["audit", "report"].includes(screen) ? screen + "-page" : "")
          }
        >
          {error && (
            <div className="error" role="alert">
              <Icon name="warning" />
              <span>{error}</span>
              <button onClick={reload}>重新加载</button>
              <button
                className="icon-button"
                aria-label="关闭错误提示"
                onClick={() => setError("")}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          )}
          {["home", "projects", "sources", "reports"].includes(screen) && (
            <>
              <div className="page-title">
                <div>
                  <span className="eyebrow">GTM INTELLIGENCE WORKSPACE</span>
                  <h1>
                    {screen === "home"
                      ? "项目总览"
                      : screen === "projects"
                        ? "审计项目"
                        : screen === "sources"
                          ? "材料来源"
                          : "审计报告"}
                  </h1>
                  <p>
                    {screen === "home"
                      ? "管理研究项目，追溯证据，审查商业假设。"
                      : screen === "projects"
                        ? "从商业背景到证据审计，保留每次研究记录。"
                        : screen === "sources"
                          ? "按审计项目管理来源、完整原文和材料修订。"
                          : "阅读已完成的审计报告，保留证据与人工判断。"}
                  </p>
                </div>
                {projectActions}
              </div>
              {screen === "home" && (
                <div className="summary-grid">
                  {[
                    ["审计项目", history.length, "folder", "全部本地项目"],
                    [
                      "正在运行",
                      history.filter((h) => h.state.lifecycle === "running")
                        .length,
                      "clock",
                      "五阶段审计流程",
                    ],
                    [
                      "已完成报告",
                      history.filter((h) => h.hasReport).length,
                      "report",
                      "可导出 Markdown",
                    ],
                    [
                      "待人工审查项目",
                      history.filter((h) => h.pendingReviewCount > 0).length,
                      "shield",
                      `${history.reduce((n, h) => n + h.pendingReviewCount, 0)} 项风险待审查`,
                    ],
                  ].map(([label, value, icon, note]) => (
                    <div className="summary-item" key={label}>
                      <div>
                        <span>{label}</span>
                        <Icon name={String(icon)} size={18} />
                      </div>
                      <strong>{historyReady ? value : "—"}</strong>
                      <small>{historyReady ? note : "加载实际记录…"}</small>
                    </div>
                  ))}
                </div>
              )}
              {(screen === "home" || screen === "projects") && (
                <section className="project-section">
                  <div className="section-title-row">
                    <div>
                      <h2>
                        {screen === "home" ? "最近审计项目" : "全部审计项目"}{" "}
                        <span>{historyReady ? history.length : "—"}</span>
                      </h2>
                      <p>项目状态与统计均来自本地审计记录。</p>
                    </div>
                    <div className="search-field">
                      <Icon name="search" size={16} />
                      <input
                        aria-label="搜索审计项目"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="搜索项目、市场或模型…"
                      />
                    </div>
                  </div>
                  <div className="project-filters" aria-label="项目状态筛选">
                    {[
                      ["all", "全部"],
                      ["running", "运行中"],
                      ["completed", "已完成"],
                      ["draft", "草稿"],
                      ["failed", "失败"],
                      ["cancelled", "已取消"],
                      ["paused", "已暂停"],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        aria-pressed={filter === key}
                        className={filter === key ? "active" : ""}
                        onClick={() => setFilter(key)}
                      >
                        {label}
                        <span>
                          {historyReady
                            ? key === "all"
                              ? history.length
                              : history.filter((h) => h.state.lifecycle === key)
                                  .length
                            : "—"}
                        </span>
                      </button>
                    ))}
                  </div>
                  {!historyReady ? (
                    <div className="loading" role="status">
                      正在加载审计项目…
                    </div>
                  ) : shown.length ? (
                    <div className="table-scroll">
                      <table className="project-table">
                        <thead>
                          <tr>
                            <th>项目名称</th>
                            <th>目标市场</th>
                            <th>Provider / Model</th>
                            <th>审计状态</th>
                            <th>更新时间</th>
                            <th>报告</th>
                            <th>
                              <span className="sr-only">进入项目</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {shown.map((h) => (
                            <tr key={h.id}>
                              <td>
                                <button
                                  className="project-name"
                                  onClick={() => open(h)}
                                >
                                  <span className="project-icon">
                                    <Icon name="folder" size={17} />
                                  </span>
                                  <span>
                                    {h.name}
                                    <small>
                                      {h.sourceCount} 来源 · {h.riskCount} 风险
                                      {h.pendingReviewCount > 0
                                        ? ` · ${h.pendingReviewCount} 待审查`
                                        : ""}
                                    </small>
                                  </span>
                                </button>
                              </td>
                              <td>{show(h.targetMarket)}</td>
                              <td>
                                <span className="model-name">
                                  {h.provider.model}
                                </span>
                                <small>
                                  {h.provider.mode === "mock"
                                    ? "MOCK DEMO"
                                    : "REAL PROVIDER"}
                                </small>
                              </td>
                              <td>
                                <Status state={h.state.lifecycle} />
                              </td>
                              <td className="nowrap">{date(h.updatedAt)}</td>
                              <td>
                                {h.hasReport ? (
                                  <button
                                    className="text-button"
                                    onClick={() => navigate(h.id, "report")}
                                  >
                                    查看报告
                                  </button>
                                ) : (
                                  <small>未生成</small>
                                )}
                              </td>
                              <td>
                                <button
                                  className="icon-button"
                                  aria-label={"进入项目 " + h.name}
                                  onClick={() => open(h)}
                                >
                                  <Icon name="arrow" size={16} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty
                      title={
                        history.length ? "没有匹配的项目" : "创建第一个研究项目"
                      }
                      action={
                        history.length ? (
                          <button
                            onClick={() => {
                              setSearch("");
                              setFilter("all");
                            }}
                          >
                            清除筛选
                          </button>
                        ) : (
                          projectActions
                        )
                      }
                    >
                      {history.length
                        ? "调整搜索或状态筛选。"
                        : "从商业问题和来源材料出发，形成可追溯的审计记录。"}
                    </Empty>
                  )}
                  <div className="section-footnote">
                    本地持久化记录 · 页面刷新不会重新启动审计
                    <span>归档与项目编辑：Planned</span>
                  </div>
                </section>
              )}
              {screen === "home" && <SyntheticPreview />}
              {screen === "sources" && (
                <section className="project-section">
                  <div className="section-title-row">
                    <h2>项目来源库</h2>
                    <span className="muted">材料保存在对应审计项目内</span>
                  </div>
                  {!historyReady ? (
                    <div className="loading">正在加载来源记录…</div>
                  ) : history.length ? (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>审计项目</th>
                            <th>已存来源</th>
                            <th>状态</th>
                            <th>操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.map((h) => (
                            <tr key={h.id}>
                              <td>{h.name}</td>
                              <td>{h.sourceCount}</td>
                              <td>
                                <Status state={h.state.lifecycle} />
                              </td>
                              <td>
                                <button
                                  onClick={() => navigate(h.id, "create")}
                                >
                                  {h.state.lifecycle === "draft"
                                    ? "管理材料"
                                    : "查看冻结材料"}{" "}
                                  <Icon name="arrow" size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty title="尚无材料来源" action={projectActions}>
                      先创建审计项目，再添加完整来源。
                    </Empty>
                  )}
                </section>
              )}
              {screen === "reports" && (
                <section className="project-section">
                  <div className="section-title-row">
                    <h2>已生成报告</h2>
                    <small>Markdown 导出 · PDF Planned</small>
                  </div>
                  {!historyReady ? (
                    <div className="loading">正在加载报告…</div>
                  ) : history.some((h) => h.hasReport) ? (
                    <div className="report-list">
                      {history
                        .filter((h) => h.hasReport)
                        .map((h) => (
                          <button
                            key={h.id}
                            onClick={() => navigate(h.id, "report")}
                          >
                            <span className="project-icon">
                              <Icon name="report" size={22} />
                            </span>
                            <span>
                              <h3>{h.name}</h3>
                              <small>
                                {show(h.targetMarket)} ·{" "}
                                {h.provider.mode === "mock"
                                  ? "MOCK DEMO"
                                  : "REAL PROVIDER"}{" "}
                                · 更新 {date(h.updatedAt)}
                              </small>
                            </span>
                            <Badge tone="success">报告已生成</Badge>
                            <Icon name="arrow" size={18} />
                          </button>
                        ))}
                    </div>
                  ) : (
                    <Empty title="尚无审计报告" action={projectActions}>
                      完成审计后，报告会自动出现在这里。
                    </Empty>
                  )}
                </section>
              )}
            </>
          )}
          {screen === "hypotheses" && <GtmResearch/>}
          {screen === "evaluations" && (
            <>
              <div className="page-title">
                <div>
                  <span className="eyebrow">EVALUATIONS</span>
                  <h1>评测案例</h1>
                  <p>评测案例管理尚未接入产品。</p>
                </div>
                <Badge>Planned</Badge>
              </div>
              <section className="project-section">
                <Empty title="评测工作区待实现">
                  当前可通过首页的 Synthetic Demo 了解证据链，通过 Mock
                  审计验证流程。它们不构成真实模型质量评测。
                </Empty>
              </section>
            </>
          )}
          {screen === "settings" && (
            <>
              <div className="page-title">
                <div>
                  <span className="eyebrow">WORKSPACE SETTINGS</span>
                  <h1>设置</h1>
                  <p>只读运行配置。模型与密钥由本机配置管理。</p>
                </div>
                <Badge>只读</Badge>
              </div>
              {configuration && provider ? (
                <section className="setup-section settings">
                  <h2>Provider & runtime</h2>
                  <dl className="keyvalues">
                    <dt>运行模式</dt>
                    <dd>{modeLabel}</dd>
                    <dt>当前模型</dt>
                    <dd>{provider.model}</dd>
                    <dt>最大调用次数</dt>
                    <dd>{configuration.requests.maxCalls}</dd>
                    <dt>每模型阶段最多调用</dt>
                    <dd>{configuration.requests.maxPerStage}</dd>
                    <dt>存储容量</dt>
                    <dd>
                      {configuration.capacity.maxTotalChars.toLocaleString()}{" "}
                      字符
                    </dd>
                    <dt>材料估算 Token 预算</dt>
                    <dd>
                      {configuration.capacity.materialEstimatedTokens.toLocaleString()}
                    </dd>
                    <dt>完整请求估算 Token 预算</dt>
                    <dd>
                      {configuration.capacity.requestEstimatedInputTokens.toLocaleString()}
                    </dd>
                    <dt>估算器</dt>
                    <dd>{configuration.estimator.version} · 未做真实校准</dd>
                  </dl>
                  <div className="notice">
                    本页不会显示或修改 API 密钥。实际 Token usage
                    仅使用供应商返回值，缺失时显示“不可用”。
                  </div>
                </section>
              ) : (
                <div className="loading">正在加载配置…</div>
              )}
            </>
          )}
          {["create", "audit", "report"].includes(screen) && (
            <>
              {id && !a ? (
                <div className="loading" role="status">
                  {error
                    ? "审计加载失败，请检查错误提示。"
                    : "正在加载审计记录…"}
                </div>
              ) : (
                <>
                  {screen === "create" && (
                    <GtmCreate
                      view={view}
                      config={configuration}
                      provider={
                        activeProvider ?? { mode: "mock", model: "未提供" }
                      }
                      busy={busy}
                      act={act}
                      create={async (context) => {
                        const v = await request<AuditView>(
                          "/audits",
                          "POST",
                          context,
                        );
                        navigate(v.audit.id, "create", v);
                      }}
                      change={change}
                      openAudit={() => navigate(id, "audit")}
                    />
                  )}
                  {a && screen !== "create" && (
                    <>
                      <div className="audit-header">
                        <button
                          className="text-button back-link"
                          onClick={() => navigate("", "projects")}
                        >
                          <Icon name="back" size={14} />
                          返回项目
                        </button>
                        <div className="audit-heading-row">
                          <div>
                            <div className="sectionline">
                              <span className="eyebrow">
                                PROJECT /{" "}
                                {screen === "report" ? "REPORT" : "AUDIT"}
                              </span>
                              <Status state={a.state.lifecycle} />
                            </div>
                            <h1>
                              {a.context.projectName ?? "GTM 风险与盲点审计"}
                            </h1>
                            <p>
                              {show(a.context.targetMarket)} <span>·</span>{" "}
                              {activeProvider?.model ?? "未提供"} <span>·</span>{" "}
                              更新 {date(a.updatedAt)}
                            </p>
                          </div>
                          <div className="audit-actions">
                            <button onClick={() => navigate(id, "create")}>
                              <Icon name="source" size={15} />
                              材料
                            </button>
                            {a.state.lifecycle === "running" && (
                              <button
                                className="danger-button"
                                disabled={busy}
                                onClick={() =>
                                  void act(async () => {
                                    await change("/cancel", "POST", {});
                                  })
                                }
                              >
                                取消审计
                              </button>
                            )}
                            {screen === "report" ? (
                              <>
                                <button onClick={() => navigate(id, "audit")}>
                                  审计工作台
                                </button>
                                <a
                                  className="button primary"
                                  href={
                                    base + "/audits/" + id + "/report?format=md"
                                  }
                                  download
                                >
                                  <Icon name="download" size={15} />
                                  导出 Markdown
                                </a>
                              </>
                            ) : (
                              <button
                                className="primary"
                                disabled={!a.execution?.report}
                                onClick={() => navigate(id, "report")}
                              >
                                <Icon name="report" size={15} />
                                查看报告
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                      {view?.failure && (
                        <div className="error" role="alert">
                          <Icon name="warning" />
                          <span>
                            {view.failure.code} · {view.failure.message}
                            <small>
                              阶段 {view.failure.phase} /{" "}
                              {view.failure.substate} · 请求 {view.failure.used}
                              /{view.failure.total} · 剩余{" "}
                              {view.failure.remaining} · 报告
                              {view.failure.reportGenerated
                                ? "已生成"
                                : "未生成"}
                            </small>
                          </span>
                        </div>
                      )}
                      {screen === "audit" && view && (
                        <GtmWorkspace
                          key={a.id}
                          view={view}
                          busy={busy}
                          act={act}
                          change={change}
                        />
                      )}
                      {screen === "report" &&
                        (a.execution?.report ? (
                          <GtmReport audit={a} />
                        ) : (
                          <Empty
                            title="报告尚未生成"
                            action={
                              <button onClick={() => navigate(id, "audit")}>
                                返回审计工作台
                              </button>
                            }
                          >
                            报告将在五阶段审计完成后生成。
                          </Empty>
                        ))}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </main>
        <footer className="workspace-footer">
          <span>
            GTM-RedTeam <b>v0.3 Alpha</b>
          </span>
          <span>本地工作空间 · Evidence-backed research</span>
        </footer>
      </div>
    </div>
  );
}
function SyntheticPreview() {
  return (
    <section className="finding-preview">
      <div className="section-title-row">
        <div>
          <h2>审计成果预览</h2>
          <p>从风险论证到独立人工审查，保留完整证据链。</p>
        </div>
        <Badge tone="blue">Synthetic Demo · 非项目记录</Badge>
      </div>
      <div className="preview-layout">
        <div className="preview-risk">
          <span className="eyebrow">ILLUSTRATIVE FINDING</span>
          <h3>海外获客成本可能超出定价承受能力</h3>
          <p>
            以下内容仅用于展示产品的审计方式，不计入项目统计，也不代表真实研究结论。
          </p>
          <div className="preview-chain">
            {["Risk", "Claim", "Evidence", "Verifier", "Human Review"].map(
              (s, i) => (
                <span key={s}>
                  {i > 0 && <Icon name="arrow" size={12} />}
                  <b>{s}</b>
                </span>
              ),
            )}
          </div>
        </div>
        <div className="preview-evidence">
          <div className="sectionline">
            <span>
              <Icon name="link" size={15} /> 合成材料 · Paragraph 18
            </span>
            <Badge>示意证据</Badge>
          </div>
          <blockquote>
            “Customer acquisition costs increased significantly…”
          </blockquote>
          <small>该句为合成界面示例，不能据此认定商业风险。</small>
          <details>
            <summary>查看示例证据链</summary>
            <dl className="keyvalues">
              <dt>Claim</dt>
              <dd>当前获客成本与定价可能不匹配（推论示例）。</dd>
              <dt>Verification</dt>
              <dd>示例未执行实际引用或语义核验。</dd>
              <dt>Human Review</dt>
              <dd>建议进一步研究（示意，未保存为人工记录）。</dd>
            </dl>
          </details>
        </div>
      </div>
    </section>
  );
}
