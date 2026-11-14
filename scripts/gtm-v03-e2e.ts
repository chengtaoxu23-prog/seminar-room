import express from "express";
import path from "node:path";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { createGtmApp } from "../server/gtm-api.js";
import { AuditRepository } from "../server/gtm-repository.js";
const output = process.argv[2];
if (!output) throw Error("Output directory required");
await mkdir(output, { recursive: true });
await mkdir("work", { recursive: true });
const dir = await mkdtemp(path.resolve("work", "v03-e2e-"));
const service = createGtmApp(new AuditRepository(dir), undefined, 1);
await service.init();
service.app.use(express.static(path.resolve("dist/web")));
service.app.get("*", (_q, r) =>
  r.sendFile(path.resolve("dist/web/index.html")),
);
const server = service.app.listen(0, "127.0.0.1");
await new Promise<void>((r) => server.once("listening", r));
const root = "http://127.0.0.1:" + (server.address() as { port: number }).port;
const browser = await chromium.launch({
    executablePath:
      process.env.GTM_CHROMIUM_PATH ??
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  }),
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(12000);
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
let external = 0;
await page.route("**/*", (route) => {
  if (new URL(route.request().url()).hostname !== "127.0.0.1") {
    external++;
    return route.abort();
  }
  return route.continue();
});
const get = async () => {
  const r = await page.request.get(root + "/api/gtm/research");
  return r.json();
};
try {
  await page.goto(root + "/?screen=hypotheses");
  await page.getByRole("heading", { name: "尚无假设", exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, "01-empty.png") });
  await page
    .getByLabel("Statement", { exact: true })
    .fill("Synthetic：目标客户会为服务付费吗？");
  await page
    .getByRole("button", { name: "创建 Contract", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Lock Contract", exact: true })
    .click();
  await page
    .getByRole("button", { name: "创建 Contract 新版本", exact: true })
    .waitFor();
  const initial = await get(),
    id = initial.hypotheses[0].id;
  assert.equal(initial.hypotheses[0].contracts[0].metric, "");
  await page.screenshot({
    path: path.join(output, "02-locked-contract.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Evidence Delta", exact: true })
    .click();
  await page.getByLabel("导入 TXT / MD / CSV").setInputFiles({
    name: "synthetic.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "segment,observation\nexample,No payment commitment observed.",
    ),
  });
  await page
    .getByRole("button", { name: "保存完整新材料", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll('select[aria-label="新增来源"] option')
        .length === 2,
  );
  let state = await get();
  await page
    .getByLabel("新增来源", { exact: true })
    .selectOption(state.hypotheses[0].sources[0].id);
  await page
    .getByLabel("引用原文", { exact: true })
    .fill("This quote does not exist");
  await page
    .getByRole("button", { name: "生成 Mock Evidence Delta", exact: true })
    .click();
  await page.getByRole("alert").filter({ hasText: "无效 Citation" }).waitFor();
  await page.screenshot({ path: path.join(output, "03-invalid-citation.png") });
  await page
    .getByLabel("引用原文", { exact: true })
    .fill("No payment commitment observed.");
  await page
    .getByRole("button", { name: "生成 Mock Evidence Delta", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".research-detail .claim").length === 1,
  );
  state = await get();
  assert.equal(state.hypotheses[0].status, "unassessed");
  await page.getByRole("button", { name: "Human Review", exact: true }).click();
  await page
    .getByLabel("人工决定理由", { exact: true })
    .fill("Synthetic：证据不足，拒绝状态变化。");
  await page.getByRole("button", { name: "拒绝建议", exact: true }).click();
  await page.waitForFunction(() =>
    document
      .querySelector(".research-detail")
      ?.textContent?.includes("rejected"),
  );
  assert.equal((await get()).hypotheses[0].status, "unassessed");
  await page
    .getByRole("button", { name: "Evidence Delta", exact: true })
    .click();
  await page
    .getByLabel("来源名称", { exact: true })
    .fill("Synthetic second source");
  await page
    .getByLabel("完整原文", { exact: true })
    .fill("Independent synthetic evidence for demonstration.");
  await page.getByLabel("导入格式", { exact: true }).selectOption("txt");
  await page
    .getByRole("button", { name: "保存完整新材料", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll('select[aria-label="新增来源"] option')
        .length === 3,
  );
  state = await get();
  await page
    .getByLabel("新增来源", { exact: true })
    .selectOption(state.hypotheses[0].sources[1].id);
  await page
    .getByLabel("离线演示方向", { exact: true })
    .selectOption("supporting");
  await page
    .getByRole("button", { name: "生成 Mock Evidence Delta", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".research-detail .claim").length === 2,
  );
  await page.screenshot({
    path: path.join(output, "04-evidence-delta.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Human Review", exact: true }).click();
  await page
    .getByLabel("人工决定理由", { exact: true })
    .fill("Synthetic fixture only：人工批准，非商业结论");
  await page
    .getByRole("button", { name: "接受建议", exact: true })
    .last()
    .click();
  await page.waitForFunction(() =>
    document
      .querySelector(".research-detail h2")
      ?.textContent?.includes("supported"),
  );
  await page.screenshot({
    path: path.join(output, "05-human-review.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Evidence Delta", exact: true })
    .click();
  await page.getByRole("checkbox").first().check();
  await page
    .getByRole("button", { name: "运行 Hypothesis Mock 审计", exact: true })
    .click();
  await page
    .locator(".research-detail a")
    .filter({ hasText: "Contract r1" })
    .waitFor();
  state = await get();
  const auditId = state.hypotheses[0].audits[0].auditId;
  const audit = await (
    await page.request.get(root + "/api/gtm/audits/" + auditId)
  ).json();
  assert.equal(audit.audit.state.lifecycle, "completed");
  await page
    .getByRole("button", { name: "Decision Timeline", exact: true })
    .click();
  await page.getByText("Transition Approved", { exact: true }).waitFor();
  await page.screenshot({
    path: path.join(output, "06-timeline.png"),
    fullPage: true,
  });
  const dl = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "导出完整 Decision Ledger", exact: true })
    .last()
    .click();
  await (await dl).saveAs(path.join(output, "decision-ledger.json"));
  const before = await get();
  await page.reload();
  await page
    .getByRole("button", { name: "Decision Timeline", exact: true })
    .click();
  await page.getByText("Transition Approved", { exact: true }).waitFor();
  assert.deepEqual(await get(), before);
  await page.getByRole("button", { name: "Contract", exact: true }).click();
  await page
    .getByLabel("Supporting Criteria", { exact: true })
    .fill("New human criteria");
  await page
    .getByRole("button", { name: "创建 Contract 新版本", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Lock Contract", exact: true })
    .waitFor();
  state = await get();
  assert.equal(state.hypotheses[0].contracts.length, 2);
  assert.equal(state.hypotheses[0].contracts[0].supporting, "");
  await page
    .getByRole("button", {
      name: "Case 001 · 导入并锁定 T0 Contracts",
      exact: true,
    })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".research-item").length === 4,
  );
  await page
    .getByRole("button", { name: "Evidence Delta", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Case 001 · 加入 T1 政策提案短摘录",
      exact: true,
    })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll('select[aria-label="新增来源"] option')
        .length === 3,
  );
  state = await get();
  const caseH = state.hypotheses.at(-1);
  assert.ok(caseH.sources[0].publishedAt <= "2023-06-30");
  assert.equal(caseH.sources[1].publishedAt, "2024-09-13");
  await page
    .getByLabel("新增来源", { exact: true })
    .selectOption(caseH.sources[1].id);
  await page
    .getByLabel("离线演示方向", { exact: true })
    .selectOption("inconclusive");
  await page
    .getByRole("button", { name: "生成 Mock Evidence Delta", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".research-detail .claim").length === 1,
  );
  await page.getByRole("button", { name: "Human Review", exact: true }).click();
  await page
    .getByLabel("人工决定理由", { exact: true })
    .fill("历史来源真实；分析是 Mock。只批准证据不足，不推断 Temu 经营结果。");
  await page.getByRole("button", { name: "接受建议", exact: true }).click();
  await page.waitForFunction(() =>
    document
      .querySelector(".research-detail h2")
      ?.textContent?.includes("inconclusive"),
  );
  await page.screenshot({
    path: path.join(output, "07-temu-review.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Case 001", exact: true }).click();
  await page
    .getByRole("heading", {
      name: "Case 001 · Temu 美国市场历史证据回放",
      exact: true,
    })
    .waitFor();
  await page.screenshot({
    path: path.join(output, "08-case-sources.png"),
    fullPage: true,
  });
  const finalState = await get();
  await writeFile(
    path.join(output, "complete-demo-ledger.json"),
    JSON.stringify(finalState, null, 2),
  );
  const caseHypotheses = finalState.hypotheses.filter((h: any) =>
    h.contracts[0].statement.startsWith("H-00"),
  );
  await writeFile(
    path.join(output, "temu-t0-contracts.json"),
    JSON.stringify(
      caseHypotheses.map((h: any) => ({
        hypothesisId: h.id,
        contract: h.contracts[0],
      })),
      null,
      2,
    ),
  );
  await writeFile(
    path.join(output, "temu-t1-delta.json"),
    JSON.stringify(
      caseHypotheses.flatMap((h: any) => h.deltas),
      null,
      2,
    ),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Decision Timeline", exact: true })
    .click();
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth),
    390,
  );
  await page.screenshot({
    path: path.join(output, "09-mobile.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  assert.equal(external, 0);
  await writeFile(
    path.join(output, "result.json"),
    JSON.stringify(
      {
        passed: true,
        contractLockAndVersions: true,
        sourceRevisions: true,
        invalidCitationRejected: true,
        incrementalComparison: true,
        rejectionPreservesStatus: true,
        approvalRecorded: true,
        reloadRestores: true,
        auditLinked: true,
        temuOfflineReplay: true,
        export: true,
        mobileWidth: 390,
        errors,
        externalRequests: external,
        dataDirectory: dir,
        originalHypothesisId: id,
      },
      null,
      2,
    ),
  );
  console.log("v0.3 offline browser E2E passed");
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
}
