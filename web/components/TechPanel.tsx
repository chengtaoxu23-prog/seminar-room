import type { SeminarSession } from '../../src/shared/types';
import { clockLabel, stopReasonLabels } from './Common';

const roleLabels: Record<string, string> = {
  planner: '备课',
  host: '主持人',
  participant: '参与者',
  summarizer: '总结',
};

const purposeLabels: Record<string, string> = {
  plan_questions: '生成问题',
  host_turn: '主持决策',
  participant_turn: '角色发言',
  summary: '生成总结',
  schema_repair: '校验修复',
};

export function TechPanel({
  session,
  defaultOpen = false,
}: {
  session: SeminarSession;
  defaultOpen?: boolean;
}) {
  const tokensKnown = session.calls.filter(
    (call) => call.status === 'ok' && call.usage.totalTokens !== null,
  ).length;
  return (
    <details className={`tech-panel ${defaultOpen ? 'tech-panel-open' : ''}`} open={defaultOpen}>
      <summary>
        <span className="tech-title">技术记录</span>
        <span className="tech-stat">{session.calls.length} 次模型请求</span>
        <span className="tech-stat">{session.usage.totalTokens} tokens</span>
        <span className="tech-stat">独立上下文</span>
        <span className="tech-chevron" aria-hidden="true">
          ⌄
        </span>
      </summary>
      <div className="tech-body">
        <div className="tech-grid">
          <div>
            <span>状态</span>
            <strong>{session.stage}</strong>
          </div>
          <div>
            <span>停止原因</span>
            <strong>{session.stopReason ? stopReasonLabels[session.stopReason] ?? session.stopReason : '—'}</strong>
          </div>
          <div>
            <span>轮次</span>
            <strong>
              {session.round} / {session.limits.maxRounds}
            </strong>
          </div>
          <div>
            <span>调用</span>
            <strong>
              {session.calls.length} / {session.limits.maxCalls}
            </strong>
          </div>
          <div>
            <span>模型</span>
            <strong>
              {session.provider.model} · {session.provider.baseUrlHost}
            </strong>
          </div>
          <div>
            <span>Token（接口返回）</span>
            <strong>
              {session.usage.promptTokens} 入 / {session.usage.completionTokens} 出
              {tokensKnown < session.calls.filter((call) => call.status === 'ok').length
                ? ` · ${session.usage.usageMissingCalls} 次未返回`
                : ''}
            </strong>
          </div>
          <div>
            <span>当前活动</span>
            <strong>{session.activity.phase === 'idle' ? '空闲' : session.activity.label}</strong>
          </div>
          <div>
            <span>保存</span>
            <strong>服务端 JSON · {clockLabel(session.updatedAt)}</strong>
          </div>
        </div>

        <p className="tech-note">
          下表是服务端真实请求记录。调用数包含失败请求与工具续调；Token 只记录接口实际返回，未返回则显示 unknown。上下文指纹来自各角色独立组装的上下文，不保存提示词与密钥，也不估算费用。
        </p>

        {session.lastError && (
          <div className="tech-error">
            <strong>{session.lastError.code}</strong>
            <span>{session.lastError.message}</span>
            <small>{clockLabel(session.lastError.at)}</small>
          </div>
        )}

        <div className="tech-table-wrap">
          <table className="tech-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>角色 / 用途</th>
                <th>轮</th>
                <th>状态</th>
                <th>耗时</th>
                <th>Token</th>
                <th>上下文</th>
                <th>工具</th>
              </tr>
            </thead>
            <tbody>
              {session.calls.length === 0 && (
                <tr>
                  <td colSpan={8} className="tech-empty">
                    尚无模型调用。
                  </td>
                </tr>
              )}
              {session.calls.map((call) => (
                <tr key={call.id} className={call.status === 'error' ? 'call-error' : ''}>
                  <td>{clockLabel(call.startedAt)}</td>
                  <td>
                    <strong>{call.actorName}</strong>
                    <span className="tech-sub">
                      {roleLabels[call.role]} · {purposeLabels[call.purpose] ?? call.purpose}
                      {call.schemaRetry ? ' · 二次校验' : ''}
                    </span>
                  </td>
                  <td>{call.round}</td>
                  <td>
                    <span className={`call-status status-${call.status}`}>
                      {call.status === 'ok' ? '完成' : call.status === 'aborted' ? '取消' : '失败'}
                    </span>
                    {call.httpStatus && <span className="tech-sub">HTTP {call.httpStatus}</span>}
                    {call.validationError && <span className="tech-sub">校验失败</span>}
                  </td>
                  <td>{call.durationMs} ms</td>
                  <td>
                    {call.usage.totalTokens === null ? (
                      <span className="tech-sub">接口未返回</span>
                    ) : (
                      `${call.usage.promptTokens ?? '?'} / ${call.usage.completionTokens ?? '?'}`
                    )}
                  </td>
                  <td>
                    <code>{call.contextHash}</code>
                  </td>
                  <td>
                    {call.toolCalls.length === 0
                      ? '—'
                      : call.toolCalls.map((tool) => (
                          <span key={`${call.id}-${tool.at}`} className="tool-chip">
                            {tool.name} [{tool.segmentIds.join(',') || '∅'}]
                          </span>
                        ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {session.calls.some((call) => call.error || call.validationError) && (
          <details className="tech-errors">
            <summary>错误详情</summary>
            <ul>
              {session.calls.map((call) =>
                call.error || call.validationError ? (
                  <li key={`${call.id}-error`}>
                    <strong>{call.actorName}</strong> · {call.error || call.validationError}
                  </li>
                ) : null,
              )}
            </ul>
          </details>
        )}

        <details className="tech-decisions">
          <summary>主持人决策记录 · {session.decisions.length} 条</summary>
          <ol>
            {session.decisions.map((decision) => (
              <li key={decision.id}>
                <span>第 {decision.round} 轮</span>
                <strong>{decision.action}</strong>
                <span>{decision.participantId ? session.roles[decision.participantId].name : '—'}</span>
                <p>{decision.reason}</p>
                {decision.addressUserMessageIds.length > 0 && (
                  <em>包含直接回应用户的安排</em>
                )}
              </li>
            ))}
          </ol>
        </details>
      </div>
    </details>
  );
}
