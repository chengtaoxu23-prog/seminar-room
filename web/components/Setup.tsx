import { useEffect, useState } from 'react';
import type { HealthResponse, SeminarSession } from '../../src/shared/types';
import { ArrowIcon, Spinner, StageBadge, clockLabel } from './Common';

const styleLabels: Record<string, string> = {
  balanced: '平衡',
  'evidence-first': '证据优先',
  critical: '压力测试',
};

export function Setup({
  session,
  health,
  planning,
  planError,
  onBack,
  onRetryPlan,
  onStart,
}: {
  session: SeminarSession;
  health: HealthResponse | null;
  planning: boolean;
  planError: string | null;
  onBack: () => void;
  onRetryPlan: () => Promise<void>;
  onStart: (questions: string[]) => Promise<void>;
}) {
  const [questions, setQuestions] = useState<string[]>(() => {
    const existing = session.questions.map((question) => question.text);
    return existing.length === 3 ? existing : ['', '', ''];
  });
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const existing = session.questions.map((question) => question.text);
    if (existing.length === 3) setQuestions(existing);
  }, [session.questions]);

  const start = async () => {
    if (starting || planning) return;
    setStarting(true);
    setError(null);
    try {
      await onStart(questions.map((question) => question.trim()));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '启动失败。');
    } finally {
      setStarting(false);
    }
  };

  const canStart =
    !planning &&
    questions.length === 3 &&
    questions.every((question) => question.trim().length >= 4) &&
    Boolean(health?.configured) &&
    !starting;

  return (
    <div className="setup-shell">
      <header className="site-header">
        <button type="button" className="brand brand-button" onClick={onBack}>
          <span className="brand-mark">S</span>
          <span className="brand-word">SeminarRoom</span>
        </button>
        <div className="setup-progress">
          <span className="done">材料</span>
          <span className="active">三个问题</span>
          <span>研讨</span>
        </div>
        <div className="site-header-right">
          <span className="session-id">草稿 · {session.id.slice(0, 8)}</span>
          <StageBadge stage={session.stage} />
        </div>
      </header>

      <main className="setup-main">
        <div className="setup-title">
          <div>
            <span className="eyebrow">PREPARE</span>
            <h1>先确认要讨论什么</h1>
            <p>
              主持人已按材料与主题拟了三个问题。你可以直接修改；开始后，主持人仍会自己决定先问谁、何时收束。
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-small" onClick={onBack}>
            返回首页
          </button>
        </div>

        {!health?.configured && (
          <div className="banner banner-error">
            <strong>模型未配置</strong>
            <span>无法生成问题或开始真实研讨。请先配置服务端环境变量并重启。</span>
          </div>
        )}
        {planError && (
          <div className="banner banner-error">
            <strong>问题生成失败</strong>
            <span>{planError}</span>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => void onRetryPlan()}
              disabled={planning}
            >
              重试
            </button>
          </div>
        )}

        <div className="setup-grid">
          <section className="setup-material">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">SOURCE</span>
                <h2>{session.material.segments.length} 段材料</h2>
              </div>
              <span className="count-chip">{session.material.raw.length.toLocaleString()} 字符</span>
            </div>
            <p className="panel-hint">编号将在引用和导出中保持一致。示例材料为虚构测试文本。</p>
            <div className="setup-segments">
              {session.material.segments.map((segment) => (
                <article className="material-segment" key={segment.id}>
                  <div className="segment-meta">
                    <span className="segment-id">材料 {segment.id}</span>
                    <span>{segment.chars} 字</span>
                  </div>
                  <p>{segment.text}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="setup-questions paper-card">
            <div className="card-head">
              <div>
                <span className="eyebrow">THREE QUESTIONS</span>
                <h2>这场研讨要回答什么</h2>
              </div>
              <span className="step-chip">{planning ? '生成中' : '可编辑'}</span>
            </div>

            {planning && session.questions.length !== 3 ? (
              <div className="planning-state">
                <Spinner size={22} />
                <h3>正在生成三个问题</h3>
                <p>这是一次真实的模型调用。材料已编号，问题会尽量落到具体事实、冲突或证据缺口上。</p>
                <div className="planning-skeleton">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            ) : (
              <div className="question-editor">
                {[0, 1, 2].map((index) => (
                  <label className="question-field" key={index}>
                    <span className="question-number">0{index + 1}</span>
                    <textarea
                      value={questions[index] ?? ''}
                      rows={2}
                      maxLength={120}
                      placeholder={`第 ${index + 1} 个讨论问题`}
                      onChange={(event) => {
                        const next = [...questions];
                        next[index] = event.target.value;
                        setQuestions(next);
                      }}
                      disabled={planning}
                    />
                    <span className="question-count">{questions[index]?.length ?? 0}/120</span>
                  </label>
                ))}
                <button
                  type="button"
                  className="text-button regenerate"
                  disabled={planning}
                  onClick={() => {
                    if (window.confirm('重新生成会覆盖当前三个问题，继续吗？')) void onRetryPlan();
                  }}
                >
                  重新生成三个问题
                </button>
              </div>
            )}

            <div className="setup-roles">
              <div>
                <span className="role-avatar host">{session.roles.host.name.slice(0, 1)}</span>
                <strong>{session.roles.host.name}</strong>
                <small>主持人</small>
              </div>
              <div>
                <span className="role-avatar a">{session.roles.a.name.slice(0, 1)}</span>
                <strong>{session.roles.a.name}</strong>
                <small>{session.roles.a.seat}</small>
              </div>
              <div>
                <span className="role-avatar b">{session.roles.b.name.slice(0, 1)}</span>
                <strong>{session.roles.b.name}</strong>
                <small>{session.roles.b.seat}</small>
              </div>
            </div>

            <dl className="setup-facts">
              <div>
                <dt>讨论风格</dt>
                <dd>{styleLabels[session.config.style]}</dd>
              </div>
              <div>
                <dt>模型</dt>
                <dd>
                  {session.provider.model} @ {session.provider.baseUrlHost}
                </dd>
              </div>
              <div>
                <dt>硬上限</dt>
                <dd>
                  {session.limits.maxRounds} 轮 · {session.limits.maxCalls} 次调用 ·{' '}
                  {session.limits.maxOutputTokens} 输出 token
                </dd>
              </div>
              <div>
                <dt>已用调用</dt>
                <dd>
                  {session.calls.length} 次（问题生成） · 最近保存 {clockLabel(session.updatedAt)}
                </dd>
              </div>
            </dl>

            {error && <div className="inline-error">{error}</div>}

            <div className="setup-start">
              <p>
                开始后，主持人和两位参与者会各自发起真实模型调用。你可以随时暂停、插话或结束；结束后不会再新增角色调用。
              </p>
              <button
                type="button"
                className="btn btn-primary btn-large"
                disabled={!canStart}
                onClick={() => void start()}
              >
                {starting ? <Spinner size={15} /> : null}
                {starting ? '正在启动…' : '开始研讨'}
                {!starting && <ArrowIcon />}
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
