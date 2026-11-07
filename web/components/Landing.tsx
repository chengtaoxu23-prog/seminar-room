import { useState } from 'react';
import type { ExampleMaterial, HealthResponse, ReplayScript, SeminarSession } from '../../src/shared/types';
import { ArrowIcon, Spinner, StageBadge } from './Common';

type ReplayMeta = Pick<ReplayScript, 'id' | 'title' | 'description' | 'notice'>;

export function Landing({
  health,
  examples,
  replays,
  lastSession,
  onResume,
  onCreate,
  onReplay,
  healthError,
}: {
  health: HealthResponse | null;
  examples: ExampleMaterial[];
  replays: ReplayMeta[];
  lastSession: SeminarSession | null;
  onResume: () => void;
  onCreate: (input: {
    material: string;
    topic: string;
    style: string;
    roles?: Record<string, { name: string }>;
  }) => Promise<void>;
  onReplay: (id: string) => Promise<void>;
  healthError: string | null;
}) {
  const [material, setMaterial] = useState('');
  const [topic, setTopic] = useState('');
  const [style, setStyle] = useState('balanced');
  const [names, setNames] = useState({ host: '', a: '', b: '' });
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [replayLoading, setReplayLoading] = useState<string | null>(null);

  const loadSample = (sample: ExampleMaterial) => {
    setMaterial(sample.material);
    setTopic(sample.topic);
    setCreateError(null);
    window.setTimeout(() => {
      document.getElementById('create-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 40);
  };

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setCreateError(null);
    try {
      const roles: Record<string, { name: string }> = {};
      for (const key of ['host', 'a', 'b'] as const) {
        if (names[key].trim()) roles[key] = { name: names[key].trim() };
      }
      await onCreate({
        material,
        topic,
        style,
        ...(Object.keys(roles).length ? { roles } : {}),
      });
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : '创建失败。');
    } finally {
      setSubmitting(false);
    }
  };

  const openReplay = async (id: string) => {
    setReplayLoading(id);
    try {
      await onReplay(id);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : '加载回放失败。');
    } finally {
      setReplayLoading(null);
    }
  };

  const canSubmit =
    Boolean(health?.configured) && material.trim().length >= 20 && topic.trim().length >= 2 && !submitting;

  return (
    <div className="landing-shell">
      <header className="site-header">
        <div className="brand">
          <span className="brand-mark">S</span>
          <span className="brand-word">SeminarRoom</span>
        </div>
        <div className="site-header-right">
          <span className="open-badge">开源 · 本地运行</span>
          {health?.configured ? (
            <span className="model-status configured">
              <span className="status-dot" /> {health.model}
            </span>
          ) : (
            <span className="model-status not-configured">
              <span className="status-dot" /> 未配置模型
            </span>
          )}
        </div>
      </header>

      <main className="landing-main">
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">MATERIAL → SEMINAR</span>
            <h1>
              把一段材料，
              <br />
              变成一场<span>真正的研讨课。</span>
            </h1>
            <p className="hero-lede">
              粘贴材料，提出主题。主持人和两位参与者各自读取材料、独立调用模型，围绕你真正关心的问题推进最多六轮。你可以随时插话、暂停或结束。
            </p>
            <div className="hero-points">
              <span>编号材料</span>
              <span>逐字引用核对</span>
              <span>真实调用记录</span>
              <span>可编辑总结</span>
            </div>
          </div>
          <div className="hero-note">
            <span className="note-index">01</span>
            <p>不是先写好剧本再播放。每一步由主持人根据刚发生的对话重新决定谁发言。</p>
            <span className="note-index">02</span>
            <p>材料不支持时，参与者必须说“不足以判断”，而不是补一个漂亮的结论。</p>
          </div>
        </section>

        {healthError && (
          <div className="banner banner-error">
            <strong>本地服务不可用</strong>
            <span>{healthError}</span>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => window.location.reload()}
            >
              重试连接
            </button>
          </div>
        )}

        {health && !health.configured && (
          <div className="config-banner">
            <div>
              <strong>还没有配置模型 API</strong>
              <p>
                示例回放可以直接看。真实研讨需要服务端环境变量 <code>OPENAI_API_KEY</code>，可选{' '}
                <code>OPENAI_BASE_URL</code> 与 <code>OPENAI_MODEL</code>。密钥不会进入浏览器。
              </p>
            </div>
            <code>seminar-room/.env.local</code>
          </div>
        )}

        {lastSession && (
          <div className="resume-strip">
            <div>
              <span className="eyebrow">LAST SESSION</span>
              <strong>{lastSession.config.topic}</strong>
              <span>
                第 {lastSession.round} 轮 · {lastSession.calls.length} 次调用
              </span>
            </div>
            <div className="resume-actions">
              <StageBadge stage={lastSession.stage} />
              <button type="button" className="btn btn-secondary btn-small" onClick={onResume}>
                继续这个研讨
                <ArrowIcon />
              </button>
            </div>
          </div>
        )}

        <section className="landing-grid">
          <div className="paper-card create-card" id="create-panel">
            <div className="card-head">
              <div>
                <span className="eyebrow">START HERE</span>
                <h2>新建一场研讨</h2>
              </div>
              <span className="step-chip">约 3 分钟</span>
            </div>

            <label className="field">
              <span className="field-label">
                材料 <em>会被自动编号分段</em>
              </span>
              <textarea
                value={material}
                onChange={(event) => setMaterial(event.target.value)}
                rows={10}
                maxLength={50_000}
                placeholder="粘贴一段中文材料。可以包含数据、引述、互相冲突的说法，或明显的信息缺口……"
              />
              <span className="field-foot">
                <span>{material.length.toLocaleString()} / 50,000 字符</span>
                <span>示例材料均为虚构，仅用于测试</span>
              </span>
            </label>

            <label className="field">
              <span className="field-label">讨论主题</span>
              <input
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                maxLength={200}
                placeholder="例如：这份数据是否足以支持延长开放时间？"
              />
            </label>

            <details className="advanced">
              <summary>可选：角色名称与讨论风格</summary>
              <div className="role-grid">
                <label>
                  主持人
                  <input
                    value={names.host}
                    maxLength={24}
                    placeholder="林序"
                    onChange={(event) => setNames({ ...names, host: event.target.value })}
                  />
                </label>
                <label>
                  参与者 A
                  <input
                    value={names.a}
                    maxLength={24}
                    placeholder="周证"
                    onChange={(event) => setNames({ ...names, a: event.target.value })}
                  />
                </label>
                <label>
                  参与者 B
                  <input
                    value={names.b}
                    maxLength={24}
                    placeholder="陈疑"
                    onChange={(event) => setNames({ ...names, b: event.target.value })}
                  />
                </label>
                <label>
                  讨论风格
                  <select value={style} onChange={(event) => setStyle(event.target.value)}>
                    <option value="balanced">平衡：支持与反例并重</option>
                    <option value="evidence-first">证据优先：先分清材料与推断</option>
                    <option value="critical">压力测试：主动寻找反例</option>
                  </select>
                </label>
              </div>
            </details>

            {createError && <div className="inline-error">{createError}</div>}

            <div className="create-actions">
              <div className="create-meta">
                {health?.configured ? (
                  <>
                    <span className="status-dot green" />
                    <span>
                      真实模型 · {health.model} @ {health.baseUrlHost}
                    </span>
                  </>
                ) : (
                  <span>配置密钥后可创建真实研讨</span>
                )}
              </div>
              <button
                type="button"
                className="btn btn-primary btn-large"
                disabled={!canSubmit}
                onClick={() => void submit()}
              >
                {submitting ? <Spinner size={15} /> : null}
                {submitting ? '正在创建…' : '生成三个问题'}
                {!submitting && <ArrowIcon />}
              </button>
            </div>
            {health?.configured && (
              <p className="privacy-note">
                创建后先调用一次模型生成问题，你可以修改后再开始。材料与讨论保存在本机{' '}
                <code>data/sessions</code>。
              </p>
            )}
          </div>

          <aside className="samples-column">
            <div className="samples-head">
              <div>
                <span className="eyebrow">TEST CORPUS</span>
                <h2>三份测试材料</h2>
              </div>
              <span className="count-chip">自撰</span>
            </div>
            <p className="samples-intro">
              分别覆盖合理分歧、材料不足、相互冲突。每一份都可用于验证引用和“不编造依据”。
            </p>
            {examples.map((sample, index) => (
              <article className="sample-card" key={sample.id}>
                <div className="sample-top">
                  <span className={`sample-tag tag-${index}`}>{sample.tag}</span>
                  <span className="sample-number">0{index + 1}</span>
                </div>
                <h3>{sample.title}</h3>
                <p>{sample.description}</p>
                <div className="sample-topic">
                  <span>主题</span>
                  {sample.topic}
                </div>
                <div className="sample-actions">
                  <button type="button" className="text-button" onClick={() => loadSample(sample)}>
                    载入材料 <ArrowIcon />
                  </button>
                  {sample.id === 'commons-hours' &&
                    replays.map((replay) => (
                      <button
                        type="button"
                        className="text-button replay-link"
                        key={replay.id}
                        onClick={() => void openReplay(replay.id)}
                        disabled={replayLoading !== null}
                      >
                        {replayLoading === replay.id ? <Spinner size={12} /> : null}
                        查看示例回放
                      </button>
                    ))}
                </div>
              </article>
            ))}

            {replays.length > 0 && (
              <button
                type="button"
                className="replay-banner"
                onClick={() => void openReplay(replays[0].id)}
                disabled={replayLoading !== null}
              >
                <div className="play-disc">▶</div>
                <div>
                  <strong>示例回放 · 非实时模型</strong>
                  <span>看完整交互如何发生，再决定是否配置真实模型。</span>
                </div>
                <ArrowIcon />
              </button>
            )}
          </aside>
        </section>
      </main>

      <footer className="site-footer">
        <span>SeminarRoom · 独立实现，MIT License</span>
        <span>借鉴 OpenMAIC 的多 Agent 课堂机制，不复用其代码</span>
      </footer>
    </div>
  );
}
