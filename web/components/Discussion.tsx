import { ModelIdentity } from './WorkspaceUI';
import type { RefObject } from 'react';
import type {
  Activity,
  RoleKey,
  RoleConfig,
  SeminarMessage,
  Stage,
} from '../../src/shared/types';
import { Spinner, blockLabels, clockLabel } from './Common';
import type { ActiveCitation } from './MaterialPanel';

const actionLabels: Record<string, string> = {
  invite: '安排发言',
  clarify: '要求澄清',
  end: '结束讨论',
};

export function Discussion({
  messages,
  roles,
  activity,
  stage,
  scrollRef,
  onCite,
  replay = false,
  model,
}: {
  messages: SeminarMessage[];
  roles: Record<RoleKey, RoleConfig>;
  activity: Activity;
  stage: Stage;
  scrollRef?: RefObject<HTMLDivElement | null>;
  onCite: (citation: ActiveCitation) => void;
  replay?: boolean;
  model?: string;
}) {
  const byId = new Map(messages.map((message) => [message.id, message]));

  const addressLabel = (ids: string[]): string => {
    const labels = ids
      .map((id) => {
        const message = byId.get(id);
        if (!message) return null;
        if (message.actorId === 'user') return '你';
        if (message.role === 'host') return '主持人';
        return message.actorName;
      })
      .filter((label): label is string => Boolean(label));
    return [...new Set(labels)].slice(0, 4).join('、');
  };

  return (
    <section className="discussion-panel" aria-label="讨论记录" ref={scrollRef}>
      <div className="discussion-inner">
        {messages.length === 0 && (
          <div className="empty-discussion">
            <div className="empty-mark">“</div>
            <h3>研讨刚刚开始</h3>
            <p>
              {activity.phase !== 'idle'
                ? activity.label
                : '主持人会先读材料，再决定请谁发言。这里不会预载剧本。'}
            </p>
          </div>
        )}

        {messages.map((message) => {
          if (message.role === 'host') {
            const isEnd = message.hostAction?.action === 'end';
            return (
              <article
                key={message.id}
                id={`message-${message.id}`}
                className={`message host-message ${isEnd ? 'host-end' : ''}`}
              >
                <div className="host-rail" aria-hidden="true" />
                <div className="message-main">
                  <div className="message-head">
                    <span className="host-badge">主持人</span>
                    <strong>{message.actorName}</strong>
                    <span className="message-time">{clockLabel(message.createdAt)}</span>{model && <ModelIdentity model={model} />}
                    {message.hostAction && (
                      <span className={`action-chip action-${message.hostAction.action}`}>
                        {actionLabels[message.hostAction.action] ?? message.hostAction.action}
                        {message.hostAction.participantId
                          ? ` · ${roles[message.hostAction.participantId].name}`
                          : ''}
                      </span>
                    )}
                  </div>
                  <p className="host-text">{message.text}</p>
                  {message.hostAction?.action === 'end' && message.hostAction.endReason && (
                    <p className="end-reason">结束理由：{message.hostAction.endReason}</p>
                  )}
                  {message.hostAction?.addressUserMessageIds.length ? (
                    <div className="address-row">
                      <span className="addr-label">直接回应你</span>
                    </div>
                  ) : null}
                  {!replay && message.hostAction?.focus && message.hostAction.action !== 'end' && (
                    <div className="focus-row">本轮聚焦：{message.hostAction.focus}</div>
                  )}
                </div>
              </article>
            );
          }

          if (message.role === 'user') {
            return (
              <article key={message.id} id={`message-${message.id}`} className="message user-message">
                <div className="user-bubble">
                  <div className="message-head user-head">
                    <span>你</span>
                    <span className="message-time">{clockLabel(message.createdAt)}</span>
                  </div>
                  <p>{message.text}</p>
                </div>
              </article>
            );
          }

          const participant = message.participant;
          const addressed = addressLabel(participant?.addresses ?? []);
          return (
            <article
              key={message.id}
                id={`message-${message.id}`}
              className={`message participant-message participant-${message.actorId}`}
            >
              <div className="avatar" aria-hidden="true">
                {message.actorName.slice(0, 1)}
              </div>
              <div className="message-main">
                <div className="message-head">
                  <strong>{message.actorName}</strong>
                  <span className="seat-label">
                    {roles[message.actorId as RoleKey]?.seat ?? '参与者'}
                  </span>
                  <span className="message-time">{clockLabel(message.createdAt)}</span>{model && <ModelIdentity model={model} />}
                  {participant?.directToUser && <span className="direct-badge">直接回应你</span>}
                </div>
                {addressed && <div className="address-row">回应：{addressed}</div>}
                <div className="blocks">
                  {message.blocks.map((block, index) => (
                    <div key={`${message.id}-${index}`} className={`block block-${block.type}`}>
                      <span className="block-label">{blockLabels[block.type] ?? block.type}</span>
                      <StructuredText text={block.text} />
                      {block.citations.length > 0 && (
                        <div className="citation-row">
                          {block.citations.map((citation, citationIndex) => (
                            <button
                              key={`${citation.paragraphId}-${citationIndex}`}
                              type="button"
                              className="citation"
                              title={citation.quote}
                              onClick={() =>
                                onCite({
                                  paragraphId: citation.paragraphId,
                                  quote: citation.quote,
                                  nonce: Date.now(),
                                })
                              }
                            >
                              材料 {citation.paragraphId}
                              <span className="citation-quote">“{citation.quote}”</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {block.unverified && (
                        <div className="inline-warning">有引用未通过逐字核对，已隐藏，不作为材料依据。</div>
                      )}
                    </div>
                  ))}
                </div>
                {participant?.stanceUpdate.changed && (
                  <div className="stance-update">
                    <span>立场有调整</span>
                    {participant.stanceUpdate.note}
                  </div>
                )}
                {participant?.directResponseWarning && (
                  <div className="inline-warning">{participant.directResponseWarning}</div>
                )}
                {participant && participant.citationWarnings.length > 0 && (
                  <details className="citation-warnings">
                    <summary>引用核对提示 {participant.citationWarnings.length} 条</summary>
                    <ul>
                      {participant.citationWarnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </article>
          );
        })}

        {!replay && activity.phase !== 'idle' && (
          <div className={`thinking-row thinking-${activity.actorId ?? 'system'}`}>
            <Spinner size={14} />
            <span>{activity.label}</span>
            <span className="thinking-note">正在等待成员响应</span>
          </div>
        )}

        {!replay && stage === 'paused' && (
          <div className="paused-note">已暂停。当前轮次结束后不会再安排新的角色调用；继续后恢复。</div>
        )}
      </div>
    </section>
  );
}

// A small, safe renderer for model-authored blocks. Never interprets HTML.
export function StructuredText({ text }: { text: string }) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return <div className="structured-text">{parts.map((part, index) => {
    if (part.startsWith('```')) {
      const lines = part.slice(3, -3).split('\n');
      const language = lines.shift();
      return <pre key={index}><code data-language={language}>{lines.join('\n')}</code></pre>;
    }
    return part.split(/\n\s*\n/).map((paragraph, i) => {
      const lines = paragraph.split('\n');
      if (lines.every(line => /^\s*[-*]\s/.test(line))) return <ul key={`${index}-${i}`}>{lines.map((line,j)=><li key={j}>{line.replace(/^\s*[-*]\s/,'')}</li>)}</ul>;
      if (lines.every(line => /^\s*\d+[.)]\s/.test(line))) return <ol key={`${index}-${i}`}>{lines.map((line,j)=><li key={j}>{line.replace(/^\s*\d+[.)]\s/,'')}</li>)}</ol>;
      if (lines.every(line => /^>\s?/.test(line))) return <blockquote key={`${index}-${i}`}>{lines.map(line=>line.replace(/^>\s?/, '')).join('\n')}</blockquote>;
      return paragraph.trim() ? <p key={`${index}-${i}`}>{paragraph}</p> : null;
    });
  })}</div>;
}
