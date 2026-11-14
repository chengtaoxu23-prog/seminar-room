/** UI acceptance only: isolated synthetic records, real repository/engine/API, no HTTP model. */
import { chromium, type Page } from "playwright-core";
import express from "express";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createGtmApp } from "../server/gtm-api.js";
import { AuditRepository } from "../server/gtm-repository.js";
import { createGtmMockProvider } from "../server/gtm-mock.js";
import { createGtmConfig } from "../server/gtm-config.js";
import type { GtmProvider } from "../server/gtm-provider.js";
import type { AuditRun, RedChallenge } from "../src/shared/gtm.js";

const output = process.argv[2];
if (!output) throw Error("Provide output directory");
await mkdir(output, { recursive: true });
await mkdir("work", { recursive: true });
const dir = await mkdtemp(path.resolve("work", "v02-browser-"));
const mock = createGtmMockProvider(100);
const provider: GtmProvider = {
  configuredModel: mock.configuredModel,
  async complete(req, signal) {
    const result = await mock.complete(req, signal),
      input = JSON.parse(req.messages[1].content).untrustedData;
    if (req.stage === "red_challenge") {
      const source = input.sources[0],
        paragraphs = source.paragraphs;
      const specs = [
        {
          id: "SYN-R01",
          risk_type: "unit_economics",
          severity: "high",
          description: "合成案例：获客成本与当前定价可能不匹配",
          claim: "合成渠道成本记录提示定价承受能力仍需检验。",
          reasoning:
            "成本上升可能压缩单位经济空间；缺少留存与毛利数据，不能直接判定不可持续。",
          assumptions: ["当前定价能够覆盖获客及服务成本。"],
          proposed_validation: [
            "按渠道收集 CAC、毛利与留存数据，检验回收周期。",
          ],
        },
        {
          id: "SYN-R02",
          risk_type: "market",
          severity: "medium",
          description: "合成案例：目标市场的付费需求尚未充分验证",
          claim: "小样本访谈不足以外推整体市场付费需求。",
          reasoning: "访谈仅提供探索线索，仍需要独立的付费行为数据。",
          assumptions: ["目标用户有稳定的付费意愿。"],
          proposed_validation: ["面向独立样本进行付费需求验证。"],
        },
        {
          id: "SYN-R03",
          risk_type: "distribution",
          severity: "low",
          description: "合成案例：渠道可持续性缺少独立材料",
          claim: "现有渠道的长期续约与扩张能力未知。",
          reasoning: "现有来源没有提供续约或渠道留存数据，保留未知。",
          assumptions: [],
          proposed_validation: ["收集渠道续约与留存记录。"],
        },
      ];
      const challenges = specs.map((s, i) => {
        const { claim, ...risk } = s;
        return {
          ...risk,
          claims: [
            {
              id: s.id + "-C01",
              text: claim,
              kind: "inference",
              reasoning: s.reasoning,
              citations:
                i === 2
                  ? []
                  : [
                      {
                        sourceId: source.id,
                        materialRevision: source.revision,
                        paragraphId: paragraphs[i]?.id ?? paragraphs[0].id,
                        quote: paragraphs[i]?.text ?? paragraphs[0].text,
                      },
                    ],
            },
          ],
        };
      }) as RedChallenge[];
      result.content = JSON.stringify({ challenges });
    } else if (req.stage === "red_verifier")
      result.content = JSON.stringify({
        reviews: input.expectedIds.map((claimId: string) => ({
          claimId,
          relation: claimId.startsWith("SYN-R01")
            ? "supported"
            : "partially_supported",
          directlyStated: false,
          reasoning: "固定合成语义记录，仅用于界面验收，不评价真实商业材料。",
        })),
      });
    return result;
  },
};
const service = createGtmApp(new AuditRepository(dir), undefined, 100, {
  mode: "mock",
  model: provider.configuredModel,
  provider,
});
await service.init();
service.app.use(express.static(path.resolve("dist/web")));
service.app.get("*", (_req, res) =>
  res.sendFile(path.resolve("dist/web/index.html")),
);
const server = service.app.listen(0, "127.0.0.1");
await new Promise<void>((r) => server.once("listening", r));
const root = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const api = async (url: string, method = "GET", body?: unknown) => {
  const r = await fetch(root + "/api/gtm" + url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const d = await r.json();
  assert.ok(r.ok, JSON.stringify(d));
  return d;
};
const create = async (name: string) =>
  api("/audits", "POST", {
    projectName: name,
    businessBrief:
      "Synthetic Demo：审查 AI SaaS 欧洲市场进入假设。本项目与来源均为合成验收数据。",
    targetMarket: "EU · Synthetic",
    background: "研究重点：获客成本、付费需求与渠道可持续性。",
  });
const waitDone = async (id: string) => {
  for (let i = 0; i < 200; i++) {
    const v = await api("/audits/" + id);
    if (v.audit.state.lifecycle !== "running") return v.audit as AuditRun;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw Error("Mock timeout");
};
const browser = await chromium.launch({
  executablePath:
    process.env.GTM_CHROMIUM_PATH ??
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: true,
});
const errors: string[] = [],
  checks: string[] = [];
let externalRequests = 0;
async function pageAt(width = 1440, height = 1000) {
  const p = await browser.newPage({ viewport: { width, height } });
  p.setDefaultTimeout(12000);
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await p.route("**/*", (route) => {
    if (new URL(route.request().url()).hostname !== "127.0.0.1") {
      externalRequests++;
      return route.abort();
    }
    return route.continue();
  });
  return p;
}
async function widthCheck(p: Page, width: number) {
  assert.equal(await p.evaluate(() => document.body.scrollWidth), width);
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth),
    width,
  );
}
try {
  const page = await pageAt();
  await page.goto(root);
  await page.getByRole("heading", { name: "创建第一个研究项目" }).waitFor();
  await page.screenshot({ path: path.join(output, "empty-project-hub.png") });
  checks.push("真实空状态，无合成项目计入统计");
  let v = await create("AI SaaS 欧洲市场进入 · Synthetic Demo");
  const id = v.audit.id;
  v = await api(`/audits/${id}/materials`, "POST", {
    title: "合成渠道与访谈记录",
    sourceType: "md",
    sourceKind: "other",
    rawContent:
      "Synthetic Demo：合成渠道记录显示获客成本持续上升，当前价格与留存未知。\n\nSynthetic Demo：访谈样本较少，未提供独立支付数据。",
    jurisdiction: "EU · Synthetic",
  });
  await api(`/audits/${id}/materials`, "POST", {
    title: "未选中的合成备忘录",
    sourceType: "txt",
    rawContent: "此来源不参与本次审计。",
  });
  await api(`/audits/${id}/selection`, "PUT", {
    selectedSourceIds: [v.audit.sources[0].id],
  });
  await api(`/audits/${id}/start`, "POST", {});
  const audit = await waitDone(id);
  assert.equal(audit.state.lifecycle, "completed");
  assert.equal(audit.execution?.findings?.length, 3);
  assert.deepEqual(
    audit.execution!.findings!.map((f) => f.claims[0].classification),
    ["inference", "hypothesis", "insufficient_evidence"],
  );
  await create("智能硬件市场研究 · Synthetic Draft");
  const cancel = await create("渠道方案审查 · Synthetic Cancelled");
  await api(`/audits/${cancel.audit.id}/start`, "POST", {});
  await api(`/audits/${cancel.audit.id}/cancel`, "POST", {});
  await waitDone(cancel.audit.id);
  await page.reload();
  await page.locator(".project-table tbody tr").nth(2).waitFor();
  assert.equal(
    await page.locator(".summary-item strong").nth(0).innerText(),
    "3",
  );
  assert.equal(
    await page.locator(".summary-item strong").nth(3).innerText(),
    "1",
  );
  await page.screenshot({ path: path.join(output, "project-hub.png"), fullPage: true });
  checks.push("项目汇总、持久化记录、材料数与待审查项目数");
  await page.getByLabel("搜索审计项目").fill("智能硬件");
  assert.equal(await page.locator(".project-table tbody tr").count(), 1);
  await page.getByLabel("搜索审计项目").fill("");
  await page
    .locator(".project-filters button")
    .filter({ hasText: /^草稿/ })
    .click();
  assert.equal(await page.locator(".project-table tbody tr").count(), 1);
  await page
    .locator(".project-filters button")
    .filter({ hasText: /^全部/ })
    .click();
  checks.push("项目搜索与状态筛选");
  await page.goto(root + `/?screen=audit&audit=${id}`);
  await page.locator(".risk-item").nth(2).waitFor();
  assert.equal(await page.locator(".phase-flow button").count(), 5);
  await page.locator(".risk-item").nth(1).click();
  await page
    .locator(".risk-detail .risk-title")
    .filter({ hasText: "付费需求" })
    .waitFor();
  assert.match(await page.locator(".risk-detail").innerText(), /hypothesis/);
  await page.locator(".risk-item").nth(2).click();
  await page
    .locator(".risk-detail .risk-title")
    .filter({ hasText: "渠道可持续性" })
    .waitFor();
  assert.match(await page.locator(".risk-detail").innerText(), /未提供引用/);
  checks.push("点击风险即时切换 Claim、证据与证据不足状态");
  await page
    .getByLabel("风险类型", { exact: true })
    .selectOption("unit_economics");
  assert.equal(await page.locator(".risk-item").count(), 1);
  await page.getByRole("button", { name: "重置筛选" }).click();
  await page.getByLabel("模型评估严重度").selectOption("medium");
  assert.equal(await page.locator(".risk-item").count(), 1);
  await page.getByRole("button", { name: "重置筛选" }).click();
  await page
    .getByLabel("证据分类", { exact: true })
    .selectOption("insufficient_evidence");
  assert.equal(await page.locator(".risk-item").count(), 1);
  await page.getByRole("button", { name: "重置筛选" }).click();
  await page.getByLabel("搜索风险").fill("不存在的合成词");
  await page.getByRole("heading", { name: "没有匹配的风险" }).waitFor();
  await page.getByRole("button", { name: "重置筛选" }).click();
  checks.push("风险类型、严重度、证据分类、搜索与无匹配状态");
  await page.locator(".risk-item").first().click();
  await page.locator(".phase-flow button").nth(3).click();
  await page.locator(".phase-detail").waitFor();
  assert.match(await page.locator(".phase-detail").innerText(), /开始：/);
  await page.locator(".phase-flow button").nth(3).click();
  const before = (await api("/audits/" + id)).audit;
  await page.getByRole("tab", { name: "人工审查", exact: true }).click();
  await page
    .getByLabel("审查备注", { exact: true })
    .fill("Synthetic review：收集独立渠道成本与留存数据。");
  await page
    .getByRole("button", { name: "Further Research · 进一步研究", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "人工判断已保存" })
    .waitFor();
  const after = (await api("/audits/" + id)).audit;
  assert.deepEqual(after.execution, before.execution);
  assert.deepEqual(after.ledger, before.ledger);
  await page.screenshot({ path: path.join(output, "human-review.png") });
  await page
    .getByLabel("人工审查状态", { exact: true })
    .selectOption("pending");
  assert.equal(await page.locator(".risk-item").count(), 2);
  await page
    .getByLabel("人工审查状态", { exact: true })
    .selectOption("further_research");
  assert.equal(await page.locator(".risk-item").count(), 1);
  await page.getByRole("button", { name: "重置筛选" }).click();
  await page.locator(".risk-item").first().click();
  await page.getByRole("tab", { name: /风险与证据/ }).click();
  assert.equal(
    await page.locator(".detail-scroll").evaluate((e) => e.scrollTop),
    0,
  );
  await page.screenshot({ path: path.join(output, "audit-workspace.png") });
  checks.push("独立人工审查、备注持久化、按人工状态筛选、机器记录不变");
  await page.getByRole("tab", { name: "Blue 抗辩", exact: true }).click();
  await page.getByText("unresolved", { exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, "blue-rebuttal.png") });
  await page.getByRole("tab", { name: /风险与证据/ }).click();
  await page.getByRole("button", { name: "查看报告", exact: true }).click();
  await page
    .getByRole("heading", { name: "GTM Risk Audit Report", exact: true })
    .waitFor();
  assert.equal(await page.locator(".report-toc>a").count(), 9);
  await page.screenshot({ path: path.join(output, "audit-report.png") });
  await page.screenshot({
    path: path.join(output, "audit-report-full.png"),
    fullPage: true,
  });
  await page
    .locator(".report-toc>a")
    .filter({ hasText: "材料覆盖与来源" })
    .click();
  await page
    .getByRole("heading", { name: "材料覆盖与来源", exact: true })
    .waitFor();
  assert.match(await page.locator("#report-coverage").innerText(), /未覆盖/);
  await page
    .locator(".report-toc>a")
    .filter({ hasText: "人工审查记录" })
    .click();
  assert.match(
    await page.locator("#report-reviews").innerText(),
    /收集独立渠道成本/,
  );
  const download = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "导出 Markdown", exact: true })
    .first()
    .click();
  await (await download).saveAs(path.join(output, "Synthetic-audit-report.md"));
  await page.reload();
  await page
    .getByRole("heading", { name: "GTM Risk Audit Report", exact: true })
    .waitFor();
  assert.deepEqual((await api("/audits/" + id)).audit.ledger, after.ledger);
  checks.push("报告九章、目录跳转、材料覆盖、独立审查、导出、刷新不重复调用");
  for (const [screen, heading] of [
    ["sources", "材料来源"],
    ["reports", "审计报告"],
    ["settings", "设置"],
    ["evaluations", "评测案例"],
  ]) {
    await page.goto(root + "/?screen=" + screen);
    await page.getByRole("heading", { name: heading, exact: true }).waitFor();
    await widthCheck(page, 1440);
  }
  checks.push("材料来源、报告列表、只读配置与 Planned 入口");
  await page.goto(root + `/?screen=audit&audit=${id}`);
  await page.locator(".risk-item").first().waitFor();
  await page.getByRole("button", { name: "材料", exact: true }).click();
  await page
    .getByText("材料与选择已冻结。调整输入请新建审计，原始记录保留。", {
      exact: false,
    })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "保存完整材料" }).count(),
    0,
  );
  checks.push("启动后材料只读，无虚假编辑入口");
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(root + `/?screen=audit&audit=${id}`);
  await page.locator(".risk-item").nth(2).waitFor();
  await widthCheck(page, 1024);
  await page.screenshot({ path: path.join(output, "tablet-audit.png") });
  const mobile = await pageAt(390, 844);
  for (const [screen, file] of [
    ["home", "mobile-hub.png"],
    ["audit", "mobile-audit.png"],
    ["report", "mobile-report.png"],
  ]) {
    await mobile.goto(
      root + `/?screen=${screen}${screen === "home" ? "" : `&audit=${id}`}`,
    );
    if (screen === "home")
      await mobile.locator(".project-table tbody tr").nth(2).waitFor();
    else if (screen === "audit")
      await mobile.locator(".risk-item").nth(2).waitFor();
    else await mobile.locator(".report-document").waitFor();
    await widthCheck(mobile, 390);
    await mobile.screenshot({ path: path.join(output, file), fullPage: true });
  }
  await mobile.goto(root + `/?screen=audit&audit=${id}`);
  await mobile.locator(".risk-item").nth(1).click();
  await mobile.getByRole("tab", { name: "人工审查", exact: true }).click();
  await mobile
    .getByLabel("审查备注", { exact: true })
    .fill("Synthetic mobile review");
  await mobile
    .getByRole("button", { name: "Accept · 接受", exact: true })
    .click();
  await mobile
    .getByRole("status")
    .filter({ hasText: "人工判断已保存" })
    .waitFor();
  await widthCheck(mobile, 390);
  await mobile.getByRole("button", { name: "打开导航", exact: true }).click();
  await mobile.getByRole("button", { name: "审计报告", exact: true }).click();
  await mobile
    .getByRole("heading", { name: "审计报告", exact: true })
    .waitFor();
  checks.push(
    "1024px 布局、390px 三页无页面横向溢出、手机风险切换/人工审查/导航",
  );
  // A genuinely budget-exhausted stored audit through the unchanged engine.
  const budgetConfig = createGtmConfig({ requests: { maxCalls: 1 } }),
    exhausted = await service.repository.save(
      (await import("../server/gtm-repository.js")).createAuditDraft(
        {
          businessBrief: "Synthetic budget exhaustion",
          projectName: "Synthetic Budget Exhausted",
        },
        [],
        [],
        budgetConfig,
      ),
      null,
    );
  await service.engine.start(exhausted.id);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(root + `/?screen=audit&audit=${exhausted.id}`);
  await page.getByRole("alert").first().waitFor();
  assert.match(
    await page.getByRole("alert").first().innerText(),
    /budget|预算/i,
  );
  await page.screenshot({ path: path.join(output, "budget-exhausted.png") });
  checks.push("实际预算耗尽错误状态可见，无伪造报告");
  assert.deepEqual(errors, []);
  assert.equal(externalRequests, 0);
  await writeFile(
    path.join(output, "v02-browser-result.json"),
    JSON.stringify(
      {
        mode: "MOCK / synthetic fixtures only",
        checks,
        consoleErrors: errors,
        externalBrowserRequests: externalRequests,
        realModelRequests: 0,
        fixtureAuditId: id,
        dataDirectory: dir,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      { passed: checks.length, checks, externalRequests, errors },
      null,
      2,
    ),
  );
} catch (e) {
  await writeFile(path.join(output, "v02-failure.txt"), String(e));
  throw e;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
}
