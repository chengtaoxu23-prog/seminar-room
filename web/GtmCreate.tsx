import { useState } from "react";
import type { GtmConfig } from "../src/shared/gtm";
import {
  type AuditView,
  type ProviderInfo,
  Badge,
  date,
  Empty,
  Icon,
  show,
} from "./gtm-ui";

type Props = {
  view: AuditView | null;
  config: GtmConfig | null;
  provider: ProviderInfo;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<void>;
  create: (context: Record<string, string>) => Promise<void>;
  change: (path: string, method: string, body: unknown) => Promise<AuditView>;
  openAudit: () => void;
};
const steps = ["审计背景", "添加材料", "选择来源", "确认并启动"];
export default function GtmCreate({
  view,
  config,
  provider,
  busy,
  act,
  create,
  change,
  openAudit,
}: Props) {
  const [step, setStep] = useState(view ? 1 : 0),
    [name, setName] = useState(""),
    [brief, setBrief] = useState(""),
    [market, setMarket] = useState(""),
    [background, setBackground] = useState("");
  const [title, setTitle] = useState(""),
    [content, setContent] = useState(""),
    [kind, setKind] = useState("unknown"),
    [url, setUrl] = useState(""),
    [publishedAt, setPublishedAt] = useState(""),
    [jurisdiction, setJurisdiction] = useState(""),
    [sourceType, setSourceType] = useState<"pasted_text" | "txt" | "md">(
      "pasted_text",
    ),
    [consent, setConsent] = useState(false);
  const a = view?.audit,
    cfg = a?.configSnapshot ?? config,
    draft = !a || a.state.lifecycle === "draft",
    isReal = provider.mode === "real";
  const upload = async (file: File) => {
    if (!/\.(txt|md)$/i.test(file.name))
      throw Error("仅支持 UTF-8 TXT / MD。PDF 文本提取尚未启用。");
    if (cfg && file.size > cfg.capacity.maxSourceChars * 4)
      throw Error("文件超过单份材料容量，请选择较小的完整来源。");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      await file.arrayBuffer(),
    );
    setTitle(file.name);
    setContent(text);
    setSourceType(/\.md$/i.test(file.name) ? "md" : "txt");
  };
  return (
    <div className="create-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">NEW AUDIT / SETUP</span>
          <h1>{a ? "审计准备" : "新建审计"}</h1>
          <p>明确研究问题，选择完整来源，再启动审计。</p>
        </div>
        <Badge>
          {a ? (draft ? "草稿已保存至本地" : "材料快照已冻结") : "本地工作空间"}
        </Badge>
      </div>
      <nav className="setup-steps" aria-label="创建审计步骤">
        {steps.map((s, i) => (
          <button
            key={s}
            disabled={busy || (!a && i > 0)}
            aria-current={step === i ? "step" : undefined}
            className={step === i ? "active" : i < step ? "done" : ""}
            onClick={() => setStep(i)}
          >
            <span>{i < step ? <Icon name="check" size={14} /> : i + 1}</span>
            {s}
          </button>
        ))}
      </nav>
      {!draft && (
        <div className="notice">
          材料与选择已冻结。调整输入请新建审计，原始记录保留。
          <button onClick={openAudit}>
            进入审计工作台 <Icon name="arrow" size={14} />
          </button>
        </div>
      )}
      {step === 0 && (
        <section className="setup-section">
          <div className="section-title">
            <h2>Audit basics</h2>
            <p>商业描述是必填项。项目创建后，商业背景作为本次审计输入保存。</p>
          </div>
          {a ? (
            <>
              <h3>{show(a.context.projectName)}</h3>
              <dl className="keyvalues">
                <dt>商业描述</dt>
                <dd>{a.context.businessBrief}</dd>
                <dt>目标市场</dt>
                <dd>{show(a.context.targetMarket)}</dd>
                <dt>商业目标与补充</dt>
                <dd>{show(a.context.background)}</dd>
              </dl>
              <button className="primary" onClick={() => setStep(1)}>
                继续添加材料 <Icon name="arrow" size={15} />
              </button>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void act(async () => {
                  await create({
                    businessBrief: brief,
                    ...(name ? { projectName: name } : {}),
                    ...(market ? { targetMarket: market } : {}),
                    ...(background ? { background } : {}),
                  });
                  setStep(1);
                });
              }}
            >
              <label>
                审计名称
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={cfg?.text.short}
                  placeholder="例如：欧洲市场进入方案审查"
                  autoFocus
                />
              </label>
              <label>
                商业描述
                <textarea
                  required
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  maxLength={cfg?.text.businessBrief}
                  placeholder="描述产品、目标客户、商业模式和希望审查的问题。"
                  rows={5}
                />
              </label>
              <div className="form-grid">
                <label>
                  目标市场
                  <input
                    value={market}
                    onChange={(e) => setMarket(e.target.value)}
                    maxLength={cfg?.text.long}
                    placeholder="地区 / 行业 / 客群"
                  />
                </label>
                <label>
                  其他补充
                  <textarea
                    value={background}
                    onChange={(e) => setBackground(e.target.value)}
                    maxLength={cfg?.text.note}
                    placeholder="商业目标、已知约束及补充背景"
                    rows={2}
                  />
                </label>
              </div>
              <div className="form-footer">
                <small>商业描述 {Array.from(brief).length} 字符</small>
                <button className="primary" disabled={busy || !cfg}>
                  创建审计并添加材料 <Icon name="arrow" size={15} />
                </button>
              </div>
            </form>
          )}
        </section>
      )}
      {step === 1 && a && (
        <section className="setup-section">
          <div className="section-title">
            <h2>Sources & materials</h2>
            <p>保存完整原文与来源信息。支持 UTF-8 TXT、MD 和粘贴文本。</p>
          </div>
          <div className="source-setup">
            <div>
              {draft && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act(async () => {
                      await change("/materials", "POST", {
                        title,
                        rawContent: content,
                        sourceType,
                        sourceKind: kind,
                        ...(url ? { originalUrl: url } : {}),
                        ...(publishedAt ? { publishedAt } : {}),
                        ...(jurisdiction ? { jurisdiction } : {}),
                      });
                      setContent("");
                      setTitle("");
                      setSourceType("pasted_text");
                      setUrl("");
                      setPublishedAt("");
                      setJurisdiction("");
                    });
                  }}
                >
                  <label className="file-input">
                    上传 UTF-8 TXT / MD
                    <input
                      type="file"
                      accept=".txt,.md"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void act(() => upload(f));
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <div className="form-grid">
                    <label>
                      来源名称
                      <input
                        required
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        maxLength={cfg?.text.short}
                      />
                    </label>
                    <label>
                      来源类型
                      <select
                        value={kind}
                        onChange={(e) => setKind(e.target.value)}
                      >
                        {Object.entries({
                          unknown: "未分类",
                          official: "官方资料",
                          financial_report: "财务报告",
                          legal: "法律法规",
                          media: "媒体",
                          forum: "社区论坛",
                          other: "其他",
                        }).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    粘贴文本 / 文件原文
                    <textarea
                      required
                      value={content}
                      onChange={(e) => {
                        setContent(e.target.value);
                        setSourceType("pasted_text");
                      }}
                      rows={7}
                    />
                  </label>
                  <details className="metadata">
                    <summary>来源元数据（选填）</summary>
                    <label>
                      原始链接
                      <input
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        maxLength={cfg?.text.long}
                      />
                    </label>
                    <div className="form-grid">
                      <label>
                        发布日期
                        <input
                          type="date"
                          value={publishedAt}
                          onChange={(e) => setPublishedAt(e.target.value)}
                        />
                      </label>
                      <label>
                        辖区
                        <input
                          value={jurisdiction}
                          onChange={(e) => setJurisdiction(e.target.value)}
                          maxLength={cfg?.text.short}
                        />
                      </label>
                    </div>
                  </details>
                  <div className="form-footer">
                    <small>
                      原始字符数 {Array.from(content).length.toLocaleString()} ·{" "}
                      {sourceType.toUpperCase()}
                    </small>
                    <button disabled={busy}>保存完整材料</button>
                  </div>
                </form>
              )}
              {!draft && (
                <p className="notice">
                  来源原文已冻结，可从右侧查看已保存记录。
                </p>
              )}
            </div>
            <div className="saved-sources">
              <div className="sectionline">
                <h3>已保存来源</h3>
                <Badge>{a.sources.length}</Badge>
              </div>
              {!a.sources.length ? (
                <Empty title="尚无来源">
                  保存材料后，在下一步选择本次审计使用的来源。
                </Empty>
              ) : (
                a.sources.map((s) => (
                  <details key={s.id}>
                    <summary>
                      <Icon name="file" size={16} />
                      {s.title}
                      <small>
                        {Array.from(s.rawContent).length.toLocaleString()} 字符
                      </small>
                    </summary>
                    <p className="source-paragraph">{s.rawContent}</p>
                    <small>
                      {s.id} · revision {s.revision} · {date(s.accessedAt)}
                    </small>
                  </details>
                ))
              )}
              <p className="muted">
                材料存储与本次审计容量分别计算。保存后仍需选择来源。
              </p>
            </div>
          </div>
          <div className="form-footer">
            <button onClick={() => setStep(0)}>上一步</button>
            <button className="primary" onClick={() => setStep(2)}>
              选择来源 <Icon name="arrow" size={15} />
            </button>
          </div>
        </section>
      )}
      {step === 2 && a && view && (
        <section className="setup-section">
          <div className="section-title">
            <h2>Source selection</h2>
            <p>按完整来源选择，超限时阻止启动，原文不会被静默截断。</p>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>选中</th>
                  <th>完整来源</th>
                  <th>原始字符</th>
                  <th>估算 Token</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {a.selection.sources.map((s) => (
                  <tr key={s.sourceId}>
                    <td>
                      <input
                        aria-label={"选择 " + s.title}
                        type="checkbox"
                        checked={s.selected}
                        disabled={!draft || busy}
                        onChange={() =>
                          void act(async () => {
                            await change("/selection", "PUT", {
                              selectedSourceIds: s.selected
                                ? a.selection.selectedSourceIds.filter(
                                    (x) => x !== s.sourceId,
                                  )
                                : [
                                    ...a.selection.selectedSourceIds,
                                    s.sourceId,
                                  ],
                            });
                          })
                        }
                      />
                    </td>
                    <td>
                      <b>{s.title}</b>
                      <small className="truncate-id">{s.sourceId}</small>
                    </td>
                    <td>{s.originalChars.toLocaleString()}</td>
                    <td>{s.estimatedTokens.toLocaleString()}</td>
                    <td>
                      <button
                        className="text-button"
                        disabled={!draft || busy}
                        onClick={() =>
                          void act(async () => {
                            await change(
                              "/materials/" + s.sourceId,
                              "DELETE",
                              {},
                            );
                          })
                        }
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!a.sources.length && (
            <Empty
              title="尚无可选来源"
              action={<button onClick={() => setStep(1)}>添加材料</button>}
            >
              也可以在没有材料时运行；结果将明确保留证据不足。
            </Empty>
          )}
          <Budget view={view} />
          <div className="form-footer">
            <button onClick={() => setStep(1)}>上一步</button>
            <button
              className="primary"
              onClick={() => {
                setConsent(false);
                setStep(3);
              }}
            >
              确认输入 <Icon name="arrow" size={15} />
            </button>
          </div>
        </section>
      )}
      {step === 3 && a && view && (
        <section className="setup-section">
          <div className="section-title">
            <h2>Review & run</h2>
            <p>审计启动后，商业背景、材料与来源选择将被冻结。</p>
          </div>
          <h3>{show(a.context.projectName)}</h3>
          <p>{a.context.businessBrief}</p>
          <dl className="keyvalues">
            <dt>目标市场</dt>
            <dd>{show(a.context.targetMarket)}</dd>
            <dt>商业目标与补充</dt>
            <dd>{show(a.context.background)}</dd>
            <dt>所选完整来源</dt>
            <dd>
              {a.selection.sources
                .filter((s) => s.selected)
                .map((s) => s.title)
                .join("、") || "未选择来源"}
            </dd>
            <dt>Provider / Model</dt>
            <dd>
              <Badge tone={isReal ? "amber" : "blue"}>
                {isReal ? "REAL PROVIDER" : "MOCK DEMO"}
              </Badge>{" "}
              {provider.model}
            </dd>
            <dt>调用预算</dt>
            <dd>
              最多 {cfg?.requests.maxCalls} 次，每模型阶段最多{" "}
              {cfg?.requests.maxPerStage} 次，含共享修复额度。
            </dd>
          </dl>
          <Budget view={view} />
          {draft && (
            <>
              <label className="consent">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>
                  {isReal
                    ? "我确认本次输入，并同意将商业描述、目标市场、补充说明与所选材料发送给配置的模型供应商。"
                    : "我已确认本次输入，启动固定合成 Mock 演示，不发起真实模型请求。"}
                </span>
              </label>
              <div className="form-footer">
                <button onClick={() => setStep(2)}>上一步</button>
                <button
                  className="primary"
                  disabled={busy || !consent || !!view.overLimitReason}
                  onClick={() =>
                    void act(async () => {
                      await change(
                        "/start",
                        "POST",
                        isReal ? { consentToSend: true } : {},
                      );
                      openAudit();
                    })
                  }
                >
                  {isReal ? "启动真实审计" : "启动 Mock 审计"}{" "}
                  <Icon name="arrow" size={15} />
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
function Budget({ view }: { view: AuditView }) {
  const a = view.audit,
    cfg = a.configSnapshot;
  return (
    <div className="budget">
      <div className="sectionline">
        <h3>容量与预算</h3>
        <small>工程估算 ≠ 实际 usage</small>
      </div>
      <div className="budget-grid">
        <div>
          <span>材料存储字符</span>
          <b>
            {view.storedChars.toLocaleString()}{" "}
            <small>/ {cfg.capacity.maxTotalChars.toLocaleString()}</small>
          </b>
        </div>
        <div>
          <span>选中材料字符</span>
          <b>{a.selection.selectedChars.toLocaleString()}</b>
        </div>
        <div>
          <span>所选材料估算 Token</span>
          <b>
            {a.selection.estimatedMaterialTokens.toLocaleString()}{" "}
            <small>
              / {cfg.capacity.materialEstimatedTokens.toLocaleString()}
            </small>
          </b>
        </div>
        <div>
          <span>首轮完整请求估算</span>
          <b>
            {view.firstRequestEstimate.toLocaleString()}{" "}
            <small>
              / {cfg.capacity.requestEstimatedInputTokens.toLocaleString()}
            </small>
          </b>
        </div>
      </div>
      <progress
        aria-label="所选材料预算"
        value={a.selection.estimatedMaterialTokens}
        max={cfg.capacity.materialEstimatedTokens}
      />
      <p className={view.overLimitReason ? "error" : "muted"}>
        {view.overLimitReason ??
          "当前材料与首轮请求未超配置预算。后续每次调用前独立检查。"}
      </p>
    </div>
  );
}
