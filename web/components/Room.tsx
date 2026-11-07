import { useEffect, useRef, useState } from 'react';
import type { SeminarSession, SummaryContent } from '../../src/shared/types';
import { api, exportUrl } from '../api';
import { Discussion } from './Discussion';
import { MaterialPanel, type ActiveCitation } from './MaterialPanel';
import { SummaryPanel } from './SummaryPanel';
import { TechPanel } from './TechPanel';
import {
  DownloadIcon,
  PauseIcon,
  PlayIcon,
  Spinner,
  StageBadge,
  StopIcon,
  clockLabel,
  stopReasonLabels,
} from './Common';

export function Room({
  session,
  setSession,
  onExit,
}: {
  session: SeminarSession;
  setSession: (session: SeminarSession) => void;
  onExit: () => void;
}) {
  const [activeCitation, setActiveCitation] = useState<ActiveCitation | null>(null);
  const [composer, setComposer] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [savingSummary, setSavingSummary] = useState(false);
  const [techOpen, setTechOpen] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const isActive = session.stage === 'running' || session.stage === 'paused';
  const controlsLocked = busyAction !== null;

  useEffect(() => {
    if (session.stage === 'ended' && session.summary.status !== 'generating') return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const response = await api.session(session.id);
        if (cancelled) return;
        setPollError(null);
        setSession(response.session);
      } catch (error) {
        if (!cancelled) {
          setPollError(error instanceof Error ? error.message : '刷新会话失败。');
        }
      }
    }, session.stage === 'ended' ? 1500 : 1100);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [session.id, session.stage, session.summary.status, setSession]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !stickToBottom.current) return;
    node.scrollTo({ top: node.scrollHeight, behavior: 'auto' });
  }, [session.messages.length, session.activity.label]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const runAction = async (
    name: string,
    request: () => Promise<{ session: SeminarSession }>,
    nextNotice?: string,
  ) => {
    if (controlsLocked) return;
    setBusyAction(name);
    setActionError(null);
    try {
      const response = await request();
      setSession(response.session);
      if (nextNotice) setNotice(nextNotice);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '操作失败。');
    } finally {
      setBusyAction(null);
    }
  };

  const handlePause = () =>
    void runAction(
      'pause',
      () => api.pause(session.id),
      '已请求暂停：当前进行中的模型调用会完成，之后不再安排新调用。',
    );

  const handleResume = () =>
    void runAction('resume', () => api.resume(session.id), '已继续，由主持人重新决定下一步。');

  const handleEnd = () => {
    if (
      !window.confirm(
        '结束讨论后不会再有新的角色调用。系统会尝试生成总结，讨论记录保留。确定结束吗？',
      )
    ) {
      return;
    }
    void runAction(
      'end',
      () => api.end(session.id),
      '讨论已结束。总结员正在整理；之后可手动编辑并导出。',
    );
  };

  const handleSend = async () => {
    const text = composer.trim();
    if (!text || controlsLocked) return;
    setBusyAction('send');
    setActionError(null);
    try {
      const response = await api.sendMessage(session.id, text);
      setSession(response.session);
      setComposer('');
      stickToBottom.current = true;
      setNotice(
        session.stage === 'paused'
          ? '插话已保存为待回应；继续讨论后，主持人必须先安排相关参与者直接回应。'
          : '插话已交给主持人。下一步会优先安排相关参与者直接回应，而不是继续原顺序。',
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '发送失败。');
    } finally {
      setBusyAction(null);
    }
  };

  const handleRetry = () =>
    void runAction(
      'retry',
      () => api.retry(session.id),
      '已重试。若上次主持人的安排已完成，会从被点名者的发言继续。',
    );

  const saveSummary = async (summary: SummaryContent) => {
    setSavingSummary(true);
    setActionError(null);
    try {
      const response = await api.saveSummary(session.id, summary);
      setSession(response.session);
      setNotice('总结编辑已保存到服务端。');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '保存总结失败。');
    } finally {
      setSavingSummary(false);
    }
  };

  const regenerateSummary = async () => {
    setBusyAction('summary');
    setActionError(null);
    try {
      const response = await api.regenerateSummary(session.id);
      setSession(response.session);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '生成总结失败。');
    } finally {
      setBusyAction(null);
    }
  };

  const pendingCount = session.pendingUserMessageIds.length;

  return (
    <div className="room-shell">
      <header className="room-top">
        <button type="button" className="brand brand-button" onClick={onExit} title="返回首页">
          <span className="brand-mark">S</span>
          <span className="brand-word">SeminarRoom</span>
        </button>
        <div className="room-title">
          <span className="eyebrow">LIVE SEMINAR · 真实模型运行</span>
          <h1 title={session.config.topic}>{session.config.topic}</h1>
        </div>
        <div className="room-controls">
          <span className="round-chip">
            第 {session.round} / {session.limits.maxRounds} 轮
          </span>
          <StageBadge stage={session.stage} />
          {session.stage === 'running' && (
            <button type="button" className="btn btn-secondary btn-small" onClick={handlePause} disabled={controlsLocked}>
              {busyAction === 'pause' ? <Spinner size={13} /> : <PauseIcon />}
              暂停
            </button>
          )}
          {session.stage === 'paused' && (
            <button type="button" className="btn btn-primary btn-small" onClick={handleResume} disabled={controlsLocked}>
              {busyAction === 'resume' ? <Spinner size={13} /> : <PlayIcon />}
              继续
            </button>
          )}
          {session.stage === 'error' && (
            <button type="button" className="btn btn-primary btn-small" onClick={handleRetry} disabled={controlsLocked}>
              {busyAction === 'retry' ? <Spinner size={13} /> : <PlayIcon />}
              重试调用
            </button>
          )}
          {isActive || session.stage === 'error' ? (
            <button type="button" className="btn btn-danger btn-small" onClick={handleEnd} disabled={controlsLocked}>
              <StopIcon />
              结束
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost btn-small tech-toggle"
            onClick={() => setTechOpen(true)}
          >
            技术记录 <span className="count-mini">{session.calls.length}</span>
          </button>
          <div className="export-links">
            <a className="icon-link" href={exportUrl(session.id, 'md')} title="导出 Markdown">
              <DownloadIcon /> MD
            </a>
            <a className="icon-link" href={exportUrl(session.id, 'json')} title="导出 JSON">
              <DownloadIcon /> JSON
            </a>
          </div>
        </div>
      </header>

      <div className="status-rail">
        <div className="status-left">
          <span className={`live-dot ${session.stage === 'running' ? 'pulsing' : ''}`} />
          <span>
            {session.stage === 'running'
              ? session.activity.phase === 'idle'
                ? '等待下一步调度'
                : session.activity.label
              : session.stage === 'paused'
                ? '已暂停调度'
                : session.stage === 'ended'
                  ? `已结束：${stopReasonLabels[session.stopReason ?? ''] ?? session.stopReason}`
                  : '调用出错，等待重试'}
          </span>
          {pendingCount > 0 && <span className="pending-chip">{pendingCount} 条插话待回应</span>}
        </div>
        <div className="status-right">
          <span>
            {session.provider.model} · {session.provider.baseUrlHost}
          </span>
          <span>已保存 {clockLabel(session.updatedAt)}</span>
        </div>
      </div>

      {actionError && (
        <div className="banner banner-error">
          <strong>操作失败</strong>
          <span>{actionError}</span>
          <button type="button" className="banner-close" onClick={() => setActionError(null)}>
            ×
          </button>
        </div>
      )}
      {session.stage === 'error' && session.lastError && (
        <div className="banner banner-error">
          <strong>模型调用失败</strong>
          <span>{session.lastError.message}</span>
          <button type="button" className="btn btn-small btn-secondary" onClick={handleRetry}>
            重试
          </button>
        </div>
      )}
      {notice && (
        <div className="banner banner-info">
          <span>{notice}</span>
          <button type="button" className="banner-close" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      )}
      {pollError && (
        <div className="banner banner-warn">
          <span>自动刷新失败：{pollError} 页面保留最后一次成功状态。</span>
        </div>
      )}

      <main className="room-grid">
        <MaterialPanel
          segments={session.material.segments}
          questions={session.questions}
          activeCitation={activeCitation}
        />
        <section className="center-column">
          <Discussion
            messages={session.messages}
            roles={session.roles}
            activity={session.activity}
            stage={session.stage}
            scrollRef={scrollRef}
            onCite={setActiveCitation}
          />
          <div className="composer-wrap">
            {session.stage === 'ended' ? (
              <div className="ended-footer">
                <div>
                  <strong>讨论已结束</strong>
                  <span>
                    {stopReasonLabels[session.stopReason ?? ''] ?? session.stopReason}。记录与总结可导出。
                  </span>
                </div>
                <div className="export-links">
                  <a className="btn btn-secondary btn-small" href={exportUrl(session.id, 'md')}>
                    <DownloadIcon /> Markdown
                  </a>
                  <a className="btn btn-ghost btn-small" href={exportUrl(session.id, 'json')}>
                    <DownloadIcon /> JSON
                  </a>
                </div>
              </div>
            ) : session.stage === 'error' ? (
              <div className="composer-disabled">
                修复调用错误或结束讨论。结束仍会尝试用剩余预算生成总结。
              </div>
            ) : (
              <>
                <textarea
                  value={composer}
                  maxLength={800}
                  rows={2}
                  placeholder={
                    session.stage === 'paused'
                      ? '可以现在插话；它会排队，继续后主持人必须先安排直接回应。'
                      : '随时插话、追问或提出反例。Enter 发送，Shift + Enter 换行。'
                  }
                  onChange={(event) => setComposer(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      void handleSend();
                    }
                  }}
                />
                <div className="composer-actions">
                  <span className="composer-hint">
                    {composer.length} / 800
                    {session.stage === 'paused' && ' · 已暂停，不会立即调度'}
                  </span>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void handleSend()}
                    disabled={!composer.trim() || busyAction !== null}
                  >
                    {busyAction === 'send' ? <Spinner size={14} /> : null}
                    发言
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
        <SummaryPanel
          summary={session.summary}
          stage={session.stage}
          onSave={saveSummary}
          onRegenerate={regenerateSummary}
          onCite={setActiveCitation}
          saving={savingSummary}
          actionError={null}
        />
      </main>

      {techOpen && (
        <div className="drawer-backdrop" role="presentation" onClick={() => setTechOpen(false)}>
          <aside
            className="tech-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="技术记录"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="drawer-head">
              <div>
                <span className="eyebrow">TRACE</span>
                <h2>真实调用与状态</h2>
              </div>
              <button type="button" className="icon-btn" onClick={() => setTechOpen(false)} aria-label="关闭技术记录">
                ×
              </button>
            </div>
            <TechPanel session={session} defaultOpen />
          </aside>
        </div>
      )}
    </div>
  );
}
