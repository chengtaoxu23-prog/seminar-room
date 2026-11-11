import type { HealthResponse, RoleConfig, RoleKey, SeminarSession } from '../../src/shared/types';
import { StageBadge, clockLabel } from './Common';

export function LineIcon({ name = 'grid' }: { name?: string }) {
  const paths: Record<string, string> = {
    grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    plus: 'M12 5v14 M5 12h14', chat: 'M4 4h16v12H9l-5 4z M8 8h8 M8 12h5',
    file: 'M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6 M9 16h6',
    clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 7v5l3 2',
    team: 'M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M2 21v-3a6 6 0 0 1 12 0v3 M16 4a4 4 0 0 1 0 7 M17 15a5 5 0 0 1 5 5',
    arrow: 'M5 12h14 M14 7l5 5-5 5', link: 'M10 14l4-4 M8 16l-2 2a4 4 0 0 1-5-5l5-5a4 4 0 0 1 5 0 M16 8l2-2a4 4 0 0 1 5 5l-5 5a4 4 0 0 1-5 0',
    check: 'M5 12l4 4L19 6', activity: 'M2 12h5l3-8 4 16 3-8h5',
    book: 'M12 5c-3-2-7-2-10 0v15c3-2 7-2 10 0 3-2 7-2 10 0V5c-3-2-7-2-10 0 M12 5v15',
  };
  return <svg className="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.grid} /></svg>;
}

export function ModelIdentity({ model }: { model?: string | null }) {
  // Keep synthetic identifiers in the audit log, outside the product's model identity.
  return <span className="model-identity">{!model ? '未配置模型' : /mock|test-only/i.test(model) ? '本地测试连接' : model}</span>;
}

export function WorkspaceNav({ session, onHome, onCreate, onOutput, output = false }: {
  session?: SeminarSession | null; onHome: () => void; onCreate?: () => void; onOutput?: (output: boolean) => void; output?: boolean;
}) {
  return <aside className="research-nav" aria-label="工作空间导航">
    <button className="brand brand-button" onClick={onHome}><span className="brand-symbol"><LineIcon name="team" /></span><span>SeminarRoom<small>RESEARCH WORKSPACE</small></span></button>
    <div className="workspace-switch"><span className="workspace-square">研</span><div>我的研究空间<small>本地 · Alpha</small></div></div>
    {onCreate && <button className="new-research-button" onClick={onCreate}><LineIcon name="plus" />新建研讨<kbd>＋</kbd></button>}
    <div className="nav-section-label">工作空间</div>
    <button className={`research-nav-item ${!session ? 'active' : ''}`} onClick={onHome}><LineIcon />研究概览</button>
    {session ? <>
      <button className={`research-nav-item ${!output ? 'active' : ''}`} onClick={() => onOutput?.(false)}><LineIcon name="chat" />研讨空间<span className="nav-count">{session.messages.length}</span></button>
      <button className={`research-nav-item ${output ? 'active' : ''}`} onClick={() => onOutput?.(true)}><LineIcon name="file" />研究成果</button>
      {output && <div className="output-directory"><span className="nav-section-label">文档目录</span>{['共识', '分歧', '材料依据', '未解决问题'].map((name, index) => <button key={name} onClick={() => document.querySelectorAll('.summary-panel .summary-scroll:not([hidden]) .summary-section')[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}><span>0{index + 1}</span>{name}</button>)}</div>}
      <div className="nav-section-label">当前研究</div><div className="nav-project"><span className="project-dot" />{session.config.topic}</div>
      <div className="nav-project-meta"><StageBadge stage={session.stage} /><span>{session.material.segments.length} 段材料</span></div>
    </> : <a className="research-nav-item" href="#recent-sessions"><LineIcon name="clock" />最近研讨与历史</a>}
    <div className="nav-foot"><LineIcon name="book" /><div>教学研究<small>首个内置应用</small></div><span>α</span></div>
  </aside>;
}

export const fallbackRoles: Record<RoleKey, RoleConfig> = { host: { name: '主持人', seat: '协调与问题推进' }, a: { name: '参与者 A', seat: '材料分析与论证' }, b: { name: '参与者 B', seat: '交叉讨论与质疑' } };

export function TeamPanel({ session, health, compact = false }: { session?: SeminarSession | null; health?: HealthResponse | null; compact?: boolean }) {
  const roles = session?.roles ?? fallbackRoles;
  return <section className={`team-panel ${compact ? 'team-compact' : ''}`} aria-label="Agent 团队">
    <div className="section-title"><h2><LineIcon name="team" />AI Team</h2><span>3 位成员</span></div>
    <p className="team-caption">固定三角色 · 独立上下文</p>
    {(['host', 'a', 'b'] as const).map(key => {
      const latest = session?.messages.filter(m => m.actorId === key).at(-1);
      const active = session?.activity.actorId === key && session.activity.phase !== 'idle';
      const failure = session && Object.values(session.userResponses ?? {}).some(p => p.failedActor === key);
      const state = active ? '正在处理' : failure ? '回应失败' : !session ? '尚未开始' : session.stage === 'paused' ? '已暂停' : session.stage === 'ended' ? '已结束' : session.stage === 'error' ? '等待恢复' : '等待调度';
      const count = session?.messages.filter(m => m.actorId === key).length ?? 0;
      return <article key={key} className={`agent-card agent-${key} ${active ? 'agent-active' : ''}`}>
        <div className="agent-identity"><span className={`agent-avatar identity-${key}`}>{key === 'host' ? <LineIcon name="team" /> : key.toUpperCase()}</span><div><strong>{roles[key].name}</strong><span>{key === 'host' ? 'Moderator / 主持人' : `Participant ${key.toUpperCase()}`}</span></div><span className={`member-state ${active ? 'is-working' : ''}`}>{state}</span></div>
        <div className="member-model"><LineIcon name="link" /><ModelIdentity model={session?.provider.model ?? health?.model} /></div>
        <p className="member-task">{active ? session.activity.label : latest?.text || roles[key].seat}</p>
        {session && <div className="member-footer"><span>{count} 条已完成发言</span><span>{latest ? clockLabel(latest.createdAt) : '尚无活动'}</span></div>}
      </article>;
    })}
    <div className="team-flow"><span>主持推进</span><i /><span>独立论证</span><i /><span>交叉回应</span></div>
  </section>;
}

export function EvidenceInspector({ session, onCite }: { session: SeminarSession; onCite: (citation: { paragraphId: number; quote: string; nonce: number }) => void }) {
  return <aside className="evidence-inspector" aria-label="成果依据与核验">
    <div className="section-title"><h2><LineIcon name="link" />来源与核验</h2><span>{session.summary.evidence.length} 条依据</span></div>
    <div className="review-facts"><div><strong>{session.summary.consensus.length}</strong><span>共识</span></div><div><strong>{session.summary.disagreements.length}</strong><span>分歧</span></div><div><strong>{session.summary.unresolved.length}</strong><span>待研究</span></div></div>
    <div className="inspector-label">引用来源</div>
    {session.summary.evidence.map((e, i) => <button key={i} className="source-note" onClick={() => onCite({ paragraphId: e.paragraphId, quote: e.quote, nonce: Date.now() })}><span><LineIcon name="file" />材料 P{String(e.paragraphId).padStart(2, '0')}<LineIcon name="arrow" /></span><blockquote>{e.quote}</blockquote><small>{e.note}</small></button>)}
    {!session.summary.evidence.length && <p className="inspector-empty">尚无经过核验的总结引用。</p>}
    <div className="inspector-label">未解决问题</div>{session.summary.unresolved.map((text, i) => <p className="open-question" key={i}><span>0{i + 1}</span>{text}</p>)}
    <div className="review-note"><LineIcon name="check" /><p>引用按原文逐字核对。<br />模型共识仍需人工审阅。</p></div>
  </aside>;
}
