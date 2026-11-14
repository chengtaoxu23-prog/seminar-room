/** Isolated browser acceptance using HTTP stubs. Never writes to the real research data directory. */
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import { existsSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import express from "express";
import { chromium } from "playwright-core";
import { createGtmApp } from "../server/gtm-api.js";
import { AuditRepository } from "../server/gtm-repository.js";
import { createGtmHttpProvider } from "../server/gtm-provider.js";
function storedZip(files: Record<string, string>) {
  let offset = 0;
  const parts: Buffer[] = [],
    central: Buffer[] = [];
  for (const [name, raw] of Object.entries(files)) {
    const filename = Buffer.from(name),
      data = Buffer.from(raw);
    let crc = 0xffffffff;
    for (const b of data) {
      crc ^= b;
      for (let i = 0; i < 8; i++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(filename.length, 26);
    parts.push(local, filename, data);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(data.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(filename.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, filename);
    offset += local.length + filename.length + data.length;
  }
  const c = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(c.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, c, end]);
}
function pdfFixture() {
  let text = "%PDF-1.4\n";
  const stream =
    "BT /F1 12 Tf 50 750 Td (ISOLATED TEST ONLY: public source parser fixture.) Tj ET\n";
  const offsets = [0],
    objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ];
  for (const [i, obj] of objects.entries()) {
    offsets.push(Buffer.byteLength(text));
    text += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  }
  const xref = Buffer.byteLength(text);
  text +=
    "xref\n0 6\n0000000000 65535 f \n" +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(text);
}
const dir = await mkdtemp(path.join(os.tmpdir(), "gtm-v04-browser-")),
  assets = path.join(dir, "inputs");
await mkdir(assets);
const rootRels =
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="TARGET"/></Relationships>';
const types = (part: string, type: string) =>
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/${part}" ContentType="${type}"/></Types>`;
await writeFile(
  path.join(assets, "test-research.docx"),
  storedZip({
    "[Content_Types].xml": types(
      "word/document.xml",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
    ),
    "_rels/.rels": rootRels.replace("TARGET", "word/document.xml"),
    "word/document.xml":
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>ISOLATED TEST ONLY</w:t></w:r></w:p><w:p><w:r><w:t>No customer demand claim.</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Germany</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>',
  }),
);
await writeFile(
  path.join(assets, "test-economics.xlsx"),
  storedZip({
    "[Content_Types].xml": types(
      "xl/workbook.xml",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
    ).replace(
      "</Types>",
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    ),
    "_rels/.rels": rootRels.replace("TARGET", "xl/workbook.xml"),
    "xl/workbook.xml":
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Economics" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml":
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><v>7</v></c><c r="B1"><f>A1*2</f><v>14</v></c><c r="C1"><f>SUM(A1:B1)</f></c></row></sheetData></worksheet>',
  }),
);
await writeFile(path.join(assets, "test-source.pdf"), pdfFixture());
await writeFile(
  path.join(assets, "test-new-evidence.txt"),
  "ISOLATED TEST ONLY: additional unrelated background.",
);
let calls = 0;
const provider = createGtmHttpProvider(
  {
    baseUrl: "http://127.0.0.1:9999/v1",
    model: "isolated-browser-http-stub",
    apiKey: "isolated-unit-canary",
  },
  async (_url, options) => {
    calls++;
    const body = JSON.parse(String(options?.body)),
      input = JSON.parse(body.messages[1].content),
      system = body.messages[0].content;
    const output: any = {
      summary: "ISOLATED HTTP STUB: no real research findings.",
      sections: [],
      claims: [],
      gaps: ["No validated customer evidence."],
    };
    if (input.kind === "plan")
      output.contracts = Array.from({ length: 3 }, (_, i) => ({
        statement: "Isolated acceptance contract " + i,
        scope: "Germany",
        market: "Germany",
        customerSegment: "SME",
        metric: "unknown",
        method: "interviews",
        supporting: "Purchase evidence required",
        falsification: "Explicit refusal",
        validationWindow: "unknown",
        decisionThreshold: "unknown",
      }));
    if (system.includes("prefix 'verifier-'")) {
      output.reviews = [];
      output.assessments = [];
    }
    return new Response(
      JSON.stringify({
        model: "isolated-browser-http-stub",
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        choices: [
          {
            finish_reason: "stop",
            message: { content: JSON.stringify(output) },
          },
        ],
      }),
      { status: 200 },
    );
  },
);
const service = createGtmApp(
  new AuditRepository(path.join(dir, "audits")),
  undefined,
  1,
  { mode: "real", model: provider.configuredModel, provider },
);
await service.init();
service.app.use(express.static(path.resolve("dist/web")));
service.app.get("*", (_q, r) =>
  r.sendFile(path.resolve("dist/web/index.html")),
);
const server = service.app.listen(0, "127.0.0.1");
await new Promise<void>((r) => server.once("listening", r));
const base = "http://127.0.0.1:" + (server.address() as any).port;
const executable = [
  process.env.CHROME_EXECUTABLE_PATH,
  path.join(
    process.env.LOCALAPPDATA ?? "",
    "Google/Chrome/Application/chrome.exe",
  ),
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => p && existsSync(p));
if (!executable)
  throw Error("Set CHROME_EXECUTABLE_PATH to an installed Chromium browser");
const browser = await chromium.launch({
    headless: true,
    executablePath: executable,
  }),
  page = await browser.newPage({ viewport: { width: 1440, height: 960 } }),
  errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
const log: string[] = [];
const state = () => fetch(base + "/api/gtm/workspace").then((r) => r.json());
async function waitFor(check: (v: any) => boolean) {
  for (let i = 0; i < 300; i++) {
    const v = await state();
    if (check(v)) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Browser acceptance state timeout");
}
async function nav(label: string) {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: new RegExp(label) })
    .click();
}
try {
  await page.goto(base);
  await page
    .getByLabel("项目名称", { exact: true })
    .fill("ISOLATED UI ACCEPTANCE");
  await page.getByLabel("目标市场", { exact: true }).fill("Germany");
  await page.getByLabel("客户类型", { exact: true }).fill("SME");
  await page
    .getByLabel("产品与商业背景", { exact: true })
    .fill("Isolated UI test; no real customer findings.");
  await page.getByRole("button", { name: "创建项目", exact: true }).click();
  await waitFor((v) => v.state.projects.length === 1);
  log.push("project creation");
  await nav("Evidence Ledger");
  await page
    .getByLabel("导入文件", { exact: true })
    .setInputFiles(
      ["test-research.docx", "test-economics.xlsx", "test-source.pdf"].map(
        (f) => path.join(assets, f),
      ),
    );
  await waitFor((v) => v.state.materials.length === 3);
  await page.getByRole("button", { name: /test-economics.xlsx/ }).click();
  await page.getByLabel("搜索原文或位置").fill("Cell B1");
  await page.getByText("Sheet Economics / Cell B1", { exact: true }).waitFor();
  assert.match(await page.locator(".rw-unit").innerText(), /A1\*2/);
  assert.match(await page.locator(".rw-unit").innerText(), /14/);
  log.push(
    "DOCX / XLSX / PDF chooser uploads and formula/cached-value inspection",
  );
  await page
    .getByLabel("导入文件", { exact: true })
    .setInputFiles(path.join(assets, "test-economics.xlsx"));
  await page.getByRole("status").filter({ hasText: "相同" }).waitFor();
  assert.equal((await state()).state.materials.length, 3);
  log.push("duplicate detection without another source");
  await nav("Overview");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "2 · AI 草拟 Contracts" }).click();
  await waitFor((v) => v.ledger.hypotheses.length === 3);
  await nav("Hypotheses");
  const cards = page.locator(".rw-contract");
  await cards
    .first()
    .getByLabel("支持证据标准", { exact: true })
    .fill("Edited in browser before lock");
  await cards.first().getByRole("button", { name: "锁定此版本" }).click();
  await waitFor((v) => v.ledger.hypotheses[0].contracts[0].lockedAt);
  assert.equal(
    (await state()).ledger.hypotheses[0].contracts[0].supporting,
    "Edited in browser before lock",
  );
  for (let i = 1; i < 3; i++) {
    await cards.nth(i).getByRole("button", { name: "锁定此版本" }).click();
    await waitFor((v) => v.ledger.hypotheses[i].contracts[0].lockedAt);
  }
  log.push("AI draft, edited criteria and explicit contract locks");
  await nav("Overview");
  await page
    .getByRole("button", { name: "启动八角色真实研究", exact: true })
    .click();
  await waitFor((v) =>
    v.state.runs.some(
      (r: any) => r.kind === "research" && r.status === "completed",
    ),
  );
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await nav("Hypotheses");
  const review = page.locator(".rw-review").first();
  await review.getByLabel("人工决定的状态").selectOption("inconclusive");
  await review
    .getByLabel("人工决定理由")
    .fill(
      "Isolated browser operator: insufficient evidence; retain uncertainty.",
    );
  await review.getByRole("button", { name: "接受 / 修改状态" }).click();
  await waitFor((v) =>
    v.ledger.events.some((e: any) => e.type === "Transition Modified"),
  );
  log.push("eight independent HTTP-stub roles and human review UI");
  await nav("Evidence Ledger");
  await page
    .getByLabel("导入文件", { exact: true })
    .setInputFiles(path.join(assets, "test-new-evidence.txt"));
  await waitFor((v) => v.state.materials.length === 4);
  await nav("Overview");
  await page.getByRole("button", { name: "仅研究新增材料 · Delta" }).click();
  const final = await waitFor((v) =>
    v.state.runs.some(
      (r: any) => r.kind === "delta" && r.status === "completed",
    ),
  );
  assert.equal(
    final.state.runs.find((r: any) => r.kind === "delta").calls.length,
    3,
  );
  assert.equal(
    final.state.runs.find((r: any) => r.kind === "research").calls.length,
    8,
  );
  log.push("new-material incremental run, without baseline regeneration");
  await nav("Reports");
  await page.getByRole("button", { name: "预览最新完整报告" }).click();
  await page.locator(".rw-report").waitFor();
  assert.match(
    await page.locator(".rw-report").innerText(),
    /Transition Modified/,
  );
  assert.match(await page.locator(".rw-report").innerText(), /market/);
  log.push("report preview includes baseline and human history");
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 960 });
    await nav("Evidence Ledger");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `horizontal overflow at ${width}`,
    );
    await page.screenshot({ path: path.join(dir, `isolated-ui-${width}.png`) });
  }
  log.push("1440 / 768 / 390 layouts without horizontal overflow");
  assert.deepEqual(errors, []);
  assert.equal(calls, 12);
  console.log(
    JSON.stringify(
      {
        mode: "ISOLATED HTTP STUB / NOT REAL RESEARCH",
        passed: log,
        modelRequests: calls,
        dataDirectory: dir,
        browserErrors: errors,
      },
      null,
      2,
    ),
  );
} catch(e){
  await page.screenshot({path:path.join(dir,'failure.png')});
  await writeFile(path.join(dir,'failure.html'),await page.content());
  console.error(JSON.stringify({isolatedFailureDirectory:dir,passed:log,body:(await page.locator('body').innerText()).slice(0,3000)}));throw e;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
}
