import type { Stage } from '../../src/shared/types';

export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-hidden="true" />;
}

const stageText: Record<Stage, string> = {
  draft: '准备中',
  running: '研讨进行中',
  paused: '已暂停',
  ended: '已结束',
  error: '调用出错',
};

export function StageBadge({ stage }: { stage: Stage }) {
  return (
    <span className={`stage-badge stage-${stage}`}>
      <span className="stage-dot" />
      {stageText[stage]}
    </span>
  );
}

export function PauseIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="4" y="3" width="4" height="14" rx="1" fill="currentColor" />
      <rect x="12" y="3" width="4" height="14" rx="1" fill="currentColor" />
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5 3.8v12.4c0 .8.9 1.3 1.6.9l9.3-6.2c.6-.4.6-1.4 0-1.8L6.6 2.9c-.7-.4-1.6.1-1.6.9Z" fill="currentColor" />
    </svg>
  );
}

export function StopIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="4" y="4" width="12" height="12" rx="2" fill="currentColor" />
    </svg>
  );
}

export function DownloadIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 2v9m0 0 3.4-3.4M10 11 6.6 7.6M4 13v2.5c0 .8.7 1.5 1.5 1.5h9c.8 0 1.5-.7 1.5-1.5V13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10h11m0 0-4-4m4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function QuoteIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 3.5h4.2v4.2H4.3c.1 1.6.9 2.6 2.4 3.1l-.7 1.7C3.4 11.7 2.5 9.7 2.5 7V3.5Zm6.8 0H13.5v4.2h-2.4c.1 1.6.9 2.6 2.4 3.1l-.7 1.7c-2.6-.8-3.5-2.8-3.5-5.5V3.5Z" fill="currentColor" />
    </svg>
  );
}

export function clockLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function dateTimeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const blockLabels: Record<string, string> = {
  claim: '观点',
  evidence: '材料证据',
  concession: '让步 / 修正',
  question: '提问',
  background: '模型背景 · 非材料',
};

export const stopReasonLabels: Record<string, string> = {
  host_end: '主持人判断讨论可以收束',
  round_limit: '达到轮次上限',
  user_end: '用户主动结束',
  call_limit: '达到模型调用上限',
  api_error: '模型调用失败',
};
