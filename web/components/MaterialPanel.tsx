import { useEffect, useRef, useState } from 'react';
import type { DiscussionQuestion, MaterialSegment } from '../../src/shared/types';
import { QuoteIcon } from './Common';

export interface ActiveCitation {
  paragraphId: number;
  quote: string;
  nonce: number;
}

export function MaterialPanel({
  segments,
  questions,
  activeCitation,
}: {
  segments: MaterialSegment[];
  questions: DiscussionQuestion[];
  activeCitation: ActiveCitation | null;
}) {
  const refs = useRef(new Map<number, HTMLElement>());
  const [flashId, setFlashId] = useState<number | null>(null);

  useEffect(() => {
    if (!activeCitation) return;
    setFlashId(activeCitation.paragraphId);
    const node = refs.current.get(activeCitation.paragraphId);
    node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timer = window.setTimeout(() => setFlashId(null), 1800);
    return () => window.clearTimeout(timer);
  }, [activeCitation]);

  return (
    <aside className="side-panel material-panel" aria-label="材料与讨论问题">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">SOURCE</span>
          <h2>材料</h2>
        </div>
        <span className="count-chip">{segments.length} 段</span>
      </div>
      <p className="panel-hint">引用均带编号；点击任意引用可定位并标出原文。</p>

      {questions.length > 0 && (
        <section className="questions-box" aria-label="讨论问题">
          <span className="eyebrow">QUESTIONS</span>
          <ol>
            {questions.map((question) => (
              <li key={question.id}>{question.text}</li>
            ))}
          </ol>
        </section>
      )}

      <div className="segment-list">
        {segments.map((segment) => (
          <article
            key={segment.id}
            ref={(node) => {
              if (node) refs.current.set(segment.id, node);
              else refs.current.delete(segment.id);
            }}
            className={`material-segment ${flashId === segment.id ? 'is-flashing' : ''}`}
            id={`material-${segment.id}`}
          >
            <div className="segment-meta">
              <span className="segment-id">
                <QuoteIcon />
                材料 {segment.id}
              </span>
              <span>{segment.chars} 字</span>
            </div>
            <p>
              {activeCitation?.paragraphId === segment.id
                ? highlight(segment.text, activeCitation.quote)
                : segment.text}
            </p>
          </article>
        ))}
      </div>
    </aside>
  );
}

function highlight(text: string, quote: string) {
  if (!quote) return text;
  const index = text.indexOf(quote);
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + quote.length)}</mark>
      {text.slice(index + quote.length)}
    </>
  );
}
