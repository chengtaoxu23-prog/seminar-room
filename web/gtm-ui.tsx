import type { ReactNode } from "react";
import type { AuditRun, GtmConfig } from "../src/shared/gtm";

export type ProviderInfo = { mode: "mock" | "real"; model: string };
export type AuditView = {
  failure?: {
    code: string;
    message: string;
    phase: string;
    substate: string;
    used: number;
    total: number;
    remaining: number;
    reportGenerated: boolean;
  } | null;
  provider: ProviderInfo;
  mode: string;
  audit: AuditRun;
  storedChars: number;
  firstRequestEstimate: number;
  overLimitReason: string | null;
  recovery: string;
};
export type HistoryItem = {
  id: string;
  name: string;
  state: AuditRun["state"];
  createdAt: string;
  updatedAt: string;
  hasReport: boolean;
  targetMarket: string | null;
  provider: ProviderInfo;
  sourceCount: number;
  riskCount: number;
  pendingReviewCount: number;
};
export type Configuration = { config: GtmConfig; provider: ProviderInfo };
export const base = "/api/gtm";
export async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch(base + path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error ?? "请求失败");
  return data;
}
export const show = (s: unknown) =>
  s === null || s === undefined || s === "" ? "未提供" : String(s);
export const date = (s?: string | null) =>
  s
    ? new Date(s).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "未提供";
export const stateNames = {
  draft: "草稿",
  running: "运行中",
  paused: "已暂停",
  failed: "失败",
  cancelled: "已取消",
  completed: "已完成",
};
export const decisions = {
  include: "Accept · 接受",
  further_research: "Further Research · 进一步研究",
  not_applicable: "Not Applicable · 不适用",
};
export const riskNames = {
  market: "市场需求",
  competition: "竞争",
  compliance: "合规",
  pricing: "定价",
  unit_economics: "单位经济",
  distribution: "分销渠道",
};
export const classes = {
  material_fact: "材料事实",
  inference: "推论",
  hypothesis: "假设",
  insufficient_evidence: "证据不足",
};
export const relations = {
  supported: "支持",
  partially_supported: "部分支持",
  unsupported: "不支持",
  insufficient_evidence: "证据不足",
};
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    folder: <path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9H3z" />,
    source: (
      <>
        <path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5" />
      </>
    ),
    report: (
      <>
        <path d="M14 3H5v18h14V8zM14 3v6h5M8 13h8M8 17h6" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    back: <path d="M19 12H5m5-5-5 5 5 5" />,
    check: <path d="m5 12 4 4L19 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    shield: (
      <>
        <path d="m12 3 8 3v6c0 4-8 9-8 9s-8-5-8-9V6z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="m10 3-1 3-3 1-3 3 2 2-1 4 3 2 2-1 3 4 3-2 1-3 4-1 1-4-3-1-1-4-4-1z" />
      </>
    ),
    chart: (
      <>
        <path d="M4 20h16M6 16v-5M12 16V5M18 16V8" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4" />
      </>
    ),
    link: (
      <>
        <path d="m9 15 6-6m-6-2 2-2a5 5 0 0 1 7 7l-2 2M8 10l-2 2a5 5 0 0 0 7 7l2-2" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    warning: (
      <>
        <path d="m12 3 10 18H2zM12 9v5M12 17h.01" />
      </>
    ),
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    file: (
      <>
        <path d="M14 3H5v18h14V8zM14 3v6h5" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.file}
    </svg>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
export function Status({ state }: { state: AuditRun["state"]["lifecycle"] }) {
  return (
    <Badge
      tone={
        state === "completed"
          ? "success"
          : state === "running"
            ? "blue"
            : state === "failed"
              ? "danger"
              : "neutral"
      }
    >
      <span className="status-dot" />
      {stateNames[state]}
    </Badge>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name="folder" size={25} />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
export function Usage({ audit }: { audit: AuditRun }) {
  const u = audit.ledger.usage;
  return (
    <span>
      实际调用{" "}
      <b>
        {u.calls} / {audit.configSnapshot.requests.maxCalls}
      </b>
      <span className="separator">·</span>实际 Token{" "}
      <b>
        {u.availability === "unavailable"
          ? "不可用"
          : `${u.knownTotalTokens.toLocaleString()}${u.availability === "partial" ? `（缺失 ${u.missingUsageCalls} 次）` : ""}`}
      </b>
    </span>
  );
}
