/** Explicit real acceptance case. Never invents human approval; final proposals remain pending. */
import { mkdir, writeFile } from "node:fs/promises";
import type { WorkspaceState, WorkspaceRun } from "../src/shared/workspace.js";
import type { ResearchState } from "../src/shared/research.js";
if (!process.argv.includes("--real-public-case"))
  throw Error(
    "Pass --real-public-case only after authorizing real requests and public material transmission",
  );
const root = process.env.GTM_ACCEPTANCE_URL ?? "http://127.0.0.1:4317",
  base = root + "/api/gtm";
const output = process.env.GTM_ACCEPTANCE_OUTPUT ?? "work/v04-real";
await mkdir(output, { recursive: true });
async function api<T = any>(p: string, body?: unknown): Promise<T> {
  const r = await fetch(
    base + p,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const d = await r.json();
  if (!r.ok) throw Error(d.error ?? "http_" + r.status);
  return d;
}
async function load() {
  return api<{
    state: WorkspaceState;
    ledger: ResearchState;
    provider: { mode: string; model: string };
  }>("/workspace");
}
async function wait(id: string) {
  let last = "";
  for (let tick = 0; tick < 600; tick++) {
    const { state } = await load(),
      r = state.runs.find((r) => r.id === id)!;
    const status =
      r.status + ":" + r.roles.map((r) => r.role + "=" + r.status).join(",");
    if (status !== last) {
      console.log(JSON.stringify({ runId: id, status, calls: r.calls.length }));
      last = status;
    }
    if (r.status !== "running") {
      await writeFile(output + "/" + id + ".json", JSON.stringify(r, null, 2));
      if (r.status !== "completed")
        throw Error("real_run_failed " + r.id + " " + r.error);
      return r;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw Error("acceptance_wait_timeout");
}
async function start(projectId: string, kind: WorkspaceRun["kind"]) {
  const run = await api<WorkspaceRun>(`/workspace/projects/${projectId}/runs`, {
    kind,
    consentToSend: true,
  });
  return wait(run.id);
}
const info = await load();
if (info.provider.mode !== "real") throw Error("real_mode_required");
const resumeId = process.argv
  .find((a) => a.startsWith("--resume-project="))
  ?.split("=")[1];
const p = resumeId
  ? info.state.projects.find((p) => p.id === resumeId)!
  : await api("/workspace/projects", {
      name: "Fathom · 德国市场可行性（独立公开案例）",
      market: "Germany / EU · 本次获取时点的公开资料",
      customer: "德国 10–49 人 B2B 软件服务团队；尚无访谈或付费验证",
      brief:
        "以真实 AI 会议助手 Fathom 为公开研究对象，判断其面向德国小型 B2B 团队的付费定位、竞争与采用障碍。独立公开资料分析，不是 Fathom 委托项目，也不表示其真实扩张计划。仅使用导入的官方价格与监管资料，区分厂商宣传、直接事实、推论与未知。没有真实用户访谈、试点客户、CAC、LTV 或转化率数据，不得创造。未知保持 unknown，不从企业 AI 普及率推导具体产品付费意愿。生成可反驳、待人工验证的商业假设。",
    });
if (!p) throw Error("resume_project_not_found");
console.log(
  JSON.stringify({
    projectId: p.id,
    url: root + "/?project=" + p.id,
    model: info.provider.model,
  }),
);
const imports = [];
for (const url of resumeId
  ? []
  : [
      "https://www.fathom.ai/pricing",
      "https://fireflies.ai/pricing",
      "https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai",
    ]) {
  const imported = await api(`/workspace/projects/${p.id}/materials`, { url });
  imports.push({ url, ...imported });
  console.log(JSON.stringify({ imported: url, duplicate: imported.duplicate }));
}
const plan =
  info.state.runs.find(
    (r) =>
      r.projectId === p.id && r.kind === "plan" && r.status === "completed",
  ) ?? (await start(p.id, "plan"));
let current = await load();
const contracts = current.ledger.hypotheses.filter((h) => h.projectId === p.id);
await writeFile(
  output + "/contracts-for-review.json",
  JSON.stringify(contracts, null, 2),
);
for (const h of contracts) {
  if (h.contracts.at(-1)!.lockedAt) continue;
  current = await load();
  await api("/research", {
    operation: "lock",
    hypothesisId: h.id,
    payload: {},
    actor: "assistant_acceptance",
    requestId: crypto.randomUUID(),
    expectedRevision: current.ledger.revision,
  });
}
console.log(
  "Public-case Contract locks saved/reused; this script does not create human business approval.",
);
const existing = info.state.runs.find(
  (r) => r.projectId === p.id && r.kind === "research",
);
if (existing && ["paused", "failed"].includes(existing.status))
  await api(`/workspace/runs/${existing.id}/resume`, {});
const research = existing
  ? await wait(existing.id)
  : await start(p.id, "research");
const pdf =
  "https://ec.europa.eu/eurostat/documents/7870049/23260410/KS-01-26-009-EN-N.pdf";
current = await load();
const oldDelta = [...current.state.runs]
  .reverse()
  .find((r) => r.projectId === p.id && r.kind === "delta");
if (!oldDelta) {
  const imported = await api(`/workspace/projects/${p.id}/materials`, {
    url: pdf,
  });
  imports.push({ url: pdf, ...imported });
  console.log(JSON.stringify({ imported: pdf }));
} else if (["failed", "paused"].includes(oldDelta.status))
  await api(`/workspace/runs/${oldDelta.id}/resume`, {});
const delta = oldDelta ? await wait(oldDelta.id) : await start(p.id, "delta");
current = await load();
const pending = current.ledger.hypotheses
  .filter((h) => h.projectId === p.id)
  .flatMap((h) => h.proposals.filter((p) => p.decision === "pending"));
const reportResponse = await fetch(`${base}/workspace/projects/${p.id}/report`);
if (!reportResponse.ok) throw Error("report_export_failed");
await writeFile(
  output + "/GTM-Research-Report.md",
  await reportResponse.text(),
);
const exported = await api(`/workspace/projects/${p.id}/export`);
await writeFile(
  output + "/Research-Record.json",
  JSON.stringify(exported, null, 2),
);
const runs = [plan, research, delta];
const result = {
  projectId: p.id,
  url: root + "/?project=" + p.id,
  provider: info.provider,
  imports: exported.materials.map((m: any) => ({
    url: m.url,
    title: m.title,
    format: m.format,
    materialKey: m.id + "@" + m.revision,
    fileHash: m.fileHash,
    units: m.units.length,
  })),
  runs: runs.map((r) => ({
    id: r.id,
    kind: r.kind,
    status: r.status,
    requests: r.calls.length,
    usage: r.calls.map((c) => ({
      role: c.role,
      status: c.status,
      usage: c.usage,
      error: c.error,
    })),
    coverage: r.coverage,
    verifiedClaims: r.verifiedClaims.length,
  })),
  humanApproval: pending.length
    ? "PENDING: not fabricated or delegated to AI"
    : "Recorded human decisions in the ledger; no decision created by this script",
  humanApprovedEvents: current.ledger.events.filter(
    (e) =>
      e.projectId === p.id &&
      e.actor === "user" &&
      e.type === "Transition Approved",
  ).length,
  totalRequests: runs.reduce((n, r) => n + r.calls.length, 0),
  failedRequests: runs.reduce(
    (n, r) => n + r.calls.filter((c) => c.status === "error").length,
    0,
  ),
  knownActualTokens: runs.reduce(
    (n, r) => n + r.calls.reduce((n, c) => n + (c.usage.totalTokens ?? 0), 0),
    0,
  ),
  pending: pending.length,
};
await writeFile(output + "/acceptance.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
