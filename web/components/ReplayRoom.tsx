import { useEffect, useRef, useState } from 'react';
import type { ReplayScript } from '../../src/shared/types';
import { Discussion } from './Discussion';
import { MaterialPanel, type ActiveCitation } from './MaterialPanel';
import { ReadOnlySummary } from './SummaryPanel';
import { PauseIcon, PlayIcon, Spinner } from './Common';

export function ReplayRoom({
  replay,
  onExit,
}: {
  replay: ReplayScript;
  onExit: () => void;
}) {
  const [revealed, setRevealed] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [activeCitation, setActiveCitation] = useState<ActiveCitation | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const complete = revealed >= replay.messages.length;
  const stage = complete ? 'ended' : 'running';

  useEffect(() => {
    if (!playing || complete) return;
    const timer = window.setTimeout(() => setRevealed((value) => Math.min(value + 1, replay.messages.length)), 2300);
    return () => window.clearTimeout(timer);
  }, [playing, revealed, complete, replay.messages.length]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTo({ top: node.scrollHeight, behavior: 'auto' });
  }, [revealed]);

  return (
    <div className="room-shell replay-shell">
      <header className="room-top">
        <button type="button" className="brand brand-button" onClick={onExit}>
          <span className="brand-mark">S</span>
          <span className="brand-word">SeminarRoom</span>
        </button>
        <div className="room-title">
          <span className="eyebrow replay-eyebrow">示例回放 · 非实时模型输出</span>
          <h1>{replay.title}</h1>
        </div>
        <div className="room-controls">
          <span className="replay-pill">预置脚本</span>
          <button type="button" className="btn btn-secondary btn-small" onClick={onExit}>
            返回首页
          </button>
        </div>
      </header>

      <div className="replay-notice">
        <strong>示例回放</strong>
        <span>{replay.notice}</span>
        <span className="replay-zero">0 次实时模型调用</span>
      </div>

      <main className="room-grid">
        <MaterialPanel
          segments={replay.material.segments}
          questions={replay.questions}
          activeCitation={activeCitation}
        />
        <section className="center-column">
          <Discussion
            messages={replay.messages.slice(0, revealed)}
            roles={replay.roles}
            activity={{ phase: 'idle', actorId: null, label: '', startedAt: null }}
            stage={stage}
            scrollRef={scrollRef}
            onCite={setActiveCitation}
            replay
          />
          <div className="replay-controls">
            <div className="replay-progress">
              <span style={{ width: `${(revealed / replay.messages.length) * 100}%` }} />
            </div>
            <div className="replay-control-row">
              <span className="replay-step">
                {revealed} / {replay.messages.length} 条发言
              </span>
              <div className="replay-buttons">
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() => {
                    setPlaying(false);
                    setRevealed(0);
                  }}
                >
                  重新开始
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() => {
                    setPlaying(false);
                    setRevealed((value) => Math.max(0, value - 1));
                  }}
                  disabled={revealed === 0}
                >
                  上一条
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-small replay-play"
                  onClick={() => {
                    if (complete) {
                      setRevealed(0);
                      setPlaying(true);
                    } else {
                      setPlaying((value) => !value);
                    }
                  }}
                >
                  {playing && !complete ? <PauseIcon /> : <PlayIcon />}
                  {complete ? '重新播放' : playing ? '暂停' : '播放'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() => {
                    setPlaying(false);
                    setRevealed((value) => Math.min(replay.messages.length, value + 1));
                  }}
                  disabled={complete}
                >
                  下一条
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() => {
                    setPlaying(false);
                    setRevealed(replay.messages.length);
                  }}
                  disabled={complete}
                >
                  显示完整回放
                </button>
              </div>
            </div>
            <p className="replay-caption">
              这是预先编写的演示，用来展示交互形态，不证明模型能力，也不构成事实证据。真实研讨的每一次调用都会记录在技术记录中。
            </p>
          </div>
        </section>
        {complete ? (
          <ReadOnlySummary summary={replay.summary} onCite={setActiveCitation} />
        ) : (
          <aside className="side-panel summary-panel" aria-label="示例总结等待中">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">SAMPLE SYNTHESIS</span>
                <h2>共识与分歧</h2>
              </div>
            </div>
            <div className="summary-placeholder">
              {playing ? <Spinner size={20} /> : <span className="replay-dot">▮</span>}
              <h3>{playing ? '回放进行中' : '已暂停回放'}</h3>
              <p>回放结束后展示脚本中的总结；它不是实时模型生成的。</p>
            </div>
          </aside>
        )}
      </main>
    </div>
  );
}
