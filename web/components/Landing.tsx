import { useState } from 'react';
import type { ExampleMaterial, HealthResponse, ReplayScript, SeminarSession } from '../../src/shared/types';
import { ArrowIcon, Spinner, StageBadge, clockLabel } from './Common';

import { WorkspaceNav, TeamPanel, ModelIdentity, LineIcon } from './WorkspaceUI';

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
  const [creating, setCreating] = useState(false);
  const [material, setMaterial] = useState('');
  const [topic, setTopic] = useState('');
  const [style, setStyle] = useState('balanced');
  const [names, setNames] = useState({ host: '', a: '', b: '' });
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [replayLoading, setReplayLoading] = useState<string | null>(null);

  const loadSample = (sample: ExampleMaterial) => {
    setCreating(true);
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
    <div className="research-shell landing-shell">
      <WorkspaceNav onHome={() => setCreating(false)} onCreate={() => setCreating(true)} />
      <div className="research-body">
        <header className="workspace-bar"><div><LineIcon />我的研究空间<span>/</span><strong>{creating ? '新建研讨' : '概览'}</strong></div><span className="connection-indicator"><i />{health?.configured ? '服务已配置' : '服务未配置'}<span className="alpha-label">ALPHA</span></span></header>
        <div className="research-home-grid">
          <main className="workspace-main">
            <div className="page-title-row"><div><span className="eyebrow">{creating ? 'NEW RESEARCH' : 'RESEARCH WORKSPACE'}</span><h1>{creating ? '准备一项研究' : '让不同观点，在这里交汇。'}</h1><p>{creating ? '提供共同材料、明确问题，让三位成员从同一份证据开始。' : '材料、讨论与成果，在同一个研究空间持续推进。'}</p></div>{!creating && <button className="btn btn-primary" onClick={() => setCreating(true)}><LineIcon name="plus" />新建研讨</button>}</div>
            {healthError && <div className="banner banner-error"><strong>服务连接失败</strong><span>{healthError}</span><button className="btn btn-secondary" onClick={() => window.location.reload()}>重试连接</button></div>}
            {!health?.configured && <div className="banner banner-info"><LineIcon name="link" /><span>尚未配置模型服务。你可以先查看示例回放，了解协作过程。</span></div>}
            {creating ? <section className="create-workspace"><div className="creation-steps"><span className="active">01 材料与主题</span><span>02 确认问题</span><span>03 团队研讨</span></div>
          <div className="create-card" id="create-panel">
            <div className="card-head">
              <div>
                <span className="eyebrow">START HERE</span>
                <h2>新建一场研讨</h2>
              </div>
              <span className="step-chip">01 / 材料准备</span>
            </div>

            <label className="field">
              <span className="field-label">
                材料 <em>会被自动编号分段</em>
              </span>
              <textarea
                value={material}
                onChange={(event) => setMaterial(event.target.value)}
                rows={9}
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
                      服务连接 · <ModelIdentity model={health.model} />
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
            </section> : <>
              <section className="current-research" id="recent-sessions">
                <div className="section-title"><h2><LineIcon name="chat" />最近研究</h2><span>本机最近一次会话</span></div>
                {lastSession ? <>
                  <div className="project-title-row"><div className="project-glyph"><LineIcon name="book" /></div><div><span className="project-type">教学研究 / 材料研讨</span><h2>{lastSession.config.topic}</h2></div><StageBadge stage={lastSession.stage} /></div>
                  <div className="research-metrics"><div><strong>{lastSession.round}<small> / {lastSession.limits.maxRounds}</small></strong><span>研讨轮次</span></div><div><strong>{lastSession.messages.length}</strong><span>团队消息</span></div><div><strong>{lastSession.material.segments.length}</strong><span>材料段落</span></div><div><strong>{lastSession.summary.status === 'ready' ? '已形成' : lastSession.summary.status === 'generating' ? '整理中' : '待形成'}</strong><span>研究成果</span></div></div>
                  <div className="project-bottom"><div className="team-avatar-stack"><span>H</span><span>A</span><span>B</span><small>3 位固定成员参与</small></div><button className="btn btn-secondary" onClick={onResume}>继续这个研讨<LineIcon name="arrow" /></button></div>
                </> : <div className="research-start"><div className="research-orbit"><span>H</span><i /><span>A</span><i /><span>B</span></div><h2>为你的第一个问题，建立共同语境</h2><p>主持人组织讨论，两位参与者独立论证，再回到证据交叉回应。</p><button className="btn btn-secondary" onClick={() => setCreating(true)}>创建第一场研讨<LineIcon name="arrow" /></button></div>}
              </section>
              <section className="research-path"><div className="section-title"><h2>从材料到成果</h2><span>现有研讨流程</span></div><div className="path-stages">{[['file','共同材料','编号与原文核验'],['team','团队研讨','主持推进 · 双方回应'],['chat','交叉讨论','插话 · 质疑 · 分歧'],['check','研究成果','总结 · 编辑 · 导出']].map(([icon,title,sub],i)=><div key={title}><span className="path-number">0{i+1}</span><LineIcon name={icon}/><strong>{title}</strong><small>{sub}</small></div>)}</div></section>
              <section className="recent-activity"><div className="section-title"><h2><LineIcon name="activity" />最近活动</h2><span>来自已保存消息</span></div>{lastSession?.messages.length ? lastSession.messages.slice(-3).reverse().map(m=><div className="activity-event" key={m.id}><span className={`event-dot event-${m.actorId}`} /><div><strong>{m.actorName}<small>{m.role === 'host' ? '主持推进' : m.role === 'user' ? '用户插话' : '参与讨论'}</small></strong><p>{m.text || m.blocks[0]?.text}</p></div><time>{clockLabel(m.createdAt)}</time></div>) : <p className="quiet-empty">还没有研究活动。开始研讨后，这里展示真实的团队进展。</p>}</section>
              <section className="test-materials"><div className="section-title"><h2><LineIcon name="book" />常用测试材料</h2><span>虚构材料 · 用于测试</span></div><div className="material-tiles">{examples.map((sample,index)=><article key={sample.id}><span className="sample-tag">0{index+1} / {sample.tag}</span><h3>{sample.title}</h3><p>{sample.description}</p><button className="text-button" onClick={()=>loadSample(sample)}>载入材料<LineIcon name="arrow"/></button></article>)}</div>{replays.map(replay=><button key={replay.id} className="replay-entry" disabled={replayLoading !== null} onClick={()=>void openReplay(replay.id)}><LineIcon name="chat"/><div><strong>查看示例回放</strong><span>{replay.title} · 预置脚本，非实时模型</span></div><LineIcon name="arrow"/></button>)}</section>
            </>}
            {createError && !creating && <div className="inline-error">{createError}</div>}
          </main>
          <aside className="home-team-rail"><TeamPanel session={creating ? null : lastSession} health={health}/><section className="connection-panel"><div className="section-title"><h2><LineIcon name="link"/>当前模型连接</h2></div><span className="model-status"><i/><ModelIdentity model={health?.model}/></span><p>三个角色使用同一服务配置。此处显示配置标识。</p></section><div className="workspace-principle"><LineIcon name="check"/><strong>证据先于结论</strong><p>保留分歧，区分材料事实与模型推断。每条引用都能回到原文。</p></div></aside>
        </div>
      </div>
    </div>
  );
}
