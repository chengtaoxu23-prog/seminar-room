import { useEffect, useMemo, useState } from 'react';
import type { SeminarSummary, Stage, SummaryContent } from '../../src/shared/types';
import { Spinner } from './Common';
import type { ActiveCitation } from './MaterialPanel';

interface EditableProps {
  summary: SeminarSummary;
  stage: Stage;
  onSave: (summary: SummaryContent) => Promise<void>;
  onRegenerate: () => Promise<void>;
  onCite: (citation: ActiveCitation) => void;
  saving: boolean;
  actionError: string | null;
}

function contentOf(summary: SeminarSummary): SummaryContent {
  return {
    consensus: summary.consensus,
    disagreements: summary.disagreements,
    evidence: summary.evidence,
    unresolved: summary.unresolved,
  };
}

function Section({
  title,
  hint,
  items,
  placeholder,
  onChange,
  onAdd,
  onRemove,
}: {
  title: string;
  hint: string;
  items: string[];
  placeholder: string;
  onChange: (index: number, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <section className="summary-section">
      <div className="summary-section-head">
        <h3>{title}</h3>
        <span>{items.length}</span>
      </div>
      <p className="summary-hint">{hint}</p>
      {items.length === 0 && <p className="summary-empty">暂无</p>}
      {items.map((item, index) => (
        <div className="summary-item-edit" key={`${title}-${index}`}>
          <textarea
            value={item}
            rows={2}
            maxLength={320}
            placeholder={placeholder}
            onChange={(event) => onChange(index, event.target.value)}
            aria-label={`${title}第 ${index + 1} 项`}
          />
          <button
            type="button"
            className="icon-btn"
            onClick={() => onRemove(index)}
            aria-label={`删除${title}第 ${index + 1} 项`}
            title="删除"
          >
            ×
          </button>
        </div>
      ))}
      {items.length < 5 && (
        <button type="button" className="add-item" onClick={onAdd}>
          + 添加一条
        </button>
      )}
    </section>
  );
}

export function SummaryPanel({
  summary,
  stage,
  onSave,
  onRegenerate,
  onCite,
  saving,
  actionError,
}: EditableProps) {
  const [draft, setDraft] = useState<SummaryContent>(() => contentOf(summary));
  const serverContent = useMemo(() => contentOf(summary), [summary]);

  useEffect(() => {
    setDraft(contentOf(summary));
    // Reset only when the server produces or saves a new summary version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.generatedAt, summary.editedAt, summary.status]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(serverContent);

  const setList = (
    key: 'consensus' | 'disagreements' | 'unresolved',
    index: number,
    value: string,
  ) => {
    setDraft((current) => {
      const next = [...current[key]];
      next[index] = value;
      return { ...current, [key]: next };
    });
  };

  const add = (key: 'consensus' | 'disagreements' | 'unresolved') => {
    setDraft((current) => ({ ...current, [key]: [...current[key], ''] }));
  };

  const remove = (key: 'consensus' | 'disagreements' | 'unresolved', index: number) => {
    setDraft((current) => ({ ...current, [key]: current[key].filter((_, i) => i !== index) }));
  };

  if (summary.status === 'none') {
    return (
      <aside className="side-panel summary-panel" aria-label="讨论总结">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">SYNTHESIS</span>
            <h2>共识与分歧</h2>
          </div>
        </div>
        <div className="summary-placeholder">
          <div className="summary-orbit" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <h3>{stage === 'ended' ? '等待总结员' : '讨论结束后形成'}</h3>
          <p>
            {stage === 'ended'
              ? '总结尚未生成。可以手动请求一次独立总结调用。'
              : '总结只整理实际发言和材料原文，不会提前写死；结束后由独立总结员生成，并可编辑。'}
          </p>
          {stage === 'ended' && (
            <button type="button" className="btn btn-secondary" onClick={() => void onRegenerate()}>
              生成总结
            </button>
          )}
        </div>
        {actionError && <div className="inline-error">{actionError}</div>}
      </aside>
    );
  }

  if (summary.status === 'generating') {
    return (
      <aside className="side-panel summary-panel" aria-label="讨论总结">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">SYNTHESIS</span>
            <h2>共识与分歧</h2>
          </div>
        </div>
        <div className="summary-placeholder">
          <Spinner size={24} />
          <h3>总结员正在整理</h3>
          <p>共识、分歧、材料依据和未解决问题会分别列出；引用会再次逐字核对。</p>
        </div>
      </aside>
    );
  }

  if (summary.status === 'error') {
    return (
      <aside className="side-panel summary-panel" aria-label="讨论总结">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">SYNTHESIS</span>
            <h2>共识与分歧</h2>
          </div>
        </div>
        <div className="summary-placeholder summary-error">
          <h3>总结生成失败</h3>
          <p>{summary.error ?? '未知错误。'}</p>
          <button type="button" className="btn btn-secondary" onClick={() => void onRegenerate()}>
            重试总结
          </button>
        </div>
        {actionError && <div className="inline-error">{actionError}</div>}
      </aside>
    );
  }

  return (
    <aside className="side-panel summary-panel" aria-label="讨论总结">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">SYNTHESIS</span>
          <h2>共识与分歧</h2>
        </div>
        <span className="editable-chip">可编辑</span>
      </div>
      <div className="summary-meta">
        <span>独立总结调用</span>
        <span>{summary.editedAt ? '已人工编辑' : '模型生成'}</span>
      </div>
      {summary.warnings.length > 0 && (
        <details className="summary-warnings">
          <summary>总结核对提示 {summary.warnings.length} 条</summary>
          <ul>
            {summary.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="summary-scroll">
        <Section
          title="共识"
          hint="只写双方实际表达过的共同点。"
          items={draft.consensus}
          placeholder="一条共识"
          onChange={(index, value) => setList('consensus', index, value)}
          onAdd={() => add('consensus')}
          onRemove={(index) => remove('consensus', index)}
        />
        <Section
          title="分歧"
          hint="保留不同立场，不强行调和。"
          items={draft.disagreements}
          placeholder="一条仍存在的分歧"
          onChange={(index, value) => setList('disagreements', index, value)}
          onAdd={() => add('disagreements')}
          onRemove={(index) => remove('disagreements', index)}
        />

        <section className="summary-section">
          <div className="summary-section-head">
            <h3>材料依据</h3>
            <span>{draft.evidence.length}</span>
          </div>
          <p className="summary-hint">引文由服务端逐字核对；点击定位原文。</p>
          {draft.evidence.length === 0 && (
            <p className="summary-empty">没有通过核对的材料依据，不补写。</p>
          )}
          {draft.evidence.map((item, index) => (
            <div className="evidence-edit" key={`${item.paragraphId}-${index}`}>
              <button
                type="button"
                className="citation citation-small"
                onClick={() =>
                  onCite({
                    paragraphId: item.paragraphId,
                    quote: item.quote,
                    nonce: Date.now(),
                  })
                }
              >
                材料 {item.paragraphId}
              </button>
              <blockquote>“{item.quote}”</blockquote>
              <input
                value={item.note}
                maxLength={240}
                placeholder="这条依据支持/反驳了什么"
                aria-label={`材料依据 ${index + 1} 说明`}
                onChange={(event) => {
                  const note = event.target.value;
                  setDraft((current) => ({
                    ...current,
                    evidence: current.evidence.map((entry, entryIndex) =>
                      entryIndex === index ? { ...entry, note } : entry,
                    ),
                  }));
                }}
              />
            </div>
          ))}
        </section>

        <Section
          title="未解决问题"
          hint="具体到下一步要验证什么。"
          items={draft.unresolved}
          placeholder="一个仍未解决的问题"
          onChange={(index, value) => setList('unresolved', index, value)}
          onAdd={() => add('unresolved')}
          onRemove={(index) => remove('unresolved', index)}
        />
        <p className="summary-caveat">
          AI 研讨是观点演练，不等同事实核查；引用核对只证明原文存在，不证明结论正确。
        </p>
      </div>

      {actionError && <div className="inline-error">{actionError}</div>}
      <div className="summary-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!dirty || saving}
          onClick={() => void onSave(draft)}
        >
          {saving ? <Spinner size={14} /> : null}
          {saving ? '保存中…' : dirty ? '保存编辑' : '已保存'}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-small"
          disabled={saving}
          onClick={() => {
            if (window.confirm('重新生成会覆盖当前编辑，继续吗？')) void onRegenerate();
          }}
        >
          重新生成
        </button>
      </div>
    </aside>
  );
}

export function ReadOnlySummary({
  summary,
  onCite,
}: {
  summary: SeminarSummary;
  onCite: (citation: ActiveCitation) => void;
}) {
  return (
    <aside className="side-panel summary-panel" aria-label="示例总结">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">SAMPLE SYNTHESIS</span>
          <h2>共识与分歧</h2>
        </div>
        <span className="editable-chip">示例</span>
      </div>
      <p className="replay-mini-note">以下为回放脚本的一部分，不是实时总结。</p>
      <div className="summary-scroll">
        <section className="summary-section">
          <div className="summary-section-head">
            <h3>共识</h3>
          </div>
          <ul className="read-list">
            {summary.consensus.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section className="summary-section">
          <div className="summary-section-head">
            <h3>分歧</h3>
          </div>
          <ul className="read-list">
            {summary.disagreements.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section className="summary-section">
          <div className="summary-section-head">
            <h3>材料依据</h3>
          </div>
          {summary.evidence.map((item) => (
            <div className="evidence-read" key={`${item.paragraphId}-${item.quote}`}>
              <button
                type="button"
                className="citation citation-small"
                onClick={() =>
                  onCite({ paragraphId: item.paragraphId, quote: item.quote, nonce: Date.now() })
                }
              >
                材料 {item.paragraphId}
              </button>
              <blockquote>“{item.quote}”</blockquote>
              {item.note && <p>{item.note}</p>}
            </div>
          ))}
        </section>
        <section className="summary-section">
          <div className="summary-section-head">
            <h3>未解决问题</h3>
          </div>
          <ul className="read-list">
            {summary.unresolved.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>
    </aside>
  );
}
