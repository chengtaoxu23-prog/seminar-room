import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const screenshotDir = process.env.SEMINAR_TEST_OUTPUT_DIR ?? 'docs/screenshots';
await mkdir(screenshotDir, { recursive: true });

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await chromium.launch({ executablePath: edge, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('dialog', (dialog) => void dialog.accept());

try {
  const health = await (await page.request.get('http://127.0.0.1:4318/api/health')).json();
  assert.equal(health.model, 'e2e-mock-not-a-real-model');
  assert.equal(health.baseUrlHost, '127.0.0.1:4320', 'E2E must use the local stub');
  await page.goto('http://127.0.0.1:4318/', { waitUntil: 'networkidle' });
  assert.match(await page.locator('.model-status').innerText(), /本地测试连接/);
  assert.ok(!(await page.locator('body').innerText()).includes('e2e-mock-not-a-real-model'));
  await page.getByRole('button', { name: '载入材料' }).first().click();
  await page.getByRole('button', { name: /生成三个问题/ }).click();

  await page.waitForSelector('h1:text("先确认要讨论什么")', { timeout: 15000 });
  await page.waitForFunction(
    () => document.querySelectorAll('.question-field textarea').length === 3,
    null,
    { timeout: 15000 },
  );
  const questionInputs = page.locator('.question-field textarea');
  assert.equal(await questionInputs.count(), 3);
  const questionCount = await questionInputs.count();
  const firstQuestion = await questionInputs.nth(0).inputValue();
  assert.ok(firstQuestion.length > 5);
  await questionInputs.nth(0).fill(`${firstQuestion}（先核对数据）`);
  await page.screenshot({ path: path.join(screenshotDir, 'setup-e2e-mock.png'), fullPage: false });

  await page.getByRole('button', { name: /开始研讨/ }).click();
  await page.waitForSelector('.room-shell');
  await page.waitForSelector('.stage-running');
  await page.waitForFunction(
    () => document.querySelectorAll('.participant-message').length >= 2,
    null,
    { timeout: 20000 },
  );
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(screenshotDir, 'room-e2e-mock.png') });

  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.waitForSelector('.stage-paused');
  await page.waitForTimeout(2200);
  const beforePauseMessages = await page.locator('.message').count();
  await page.waitForTimeout(1000);
  const afterPauseMessages = await page.locator('.message').count();
  assert.equal(afterPauseMessages, beforePauseMessages, 'no new messages while paused after the in-flight call settles');

  await page.locator('.composer-wrap textarea').fill('如果只在周五延长到 23:00，而不是 24:00，成本能不能降下来？');
  await page.getByRole('button', { name: '发言' }).click();
  await page.waitForSelector('.pending-chip');
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.waitForSelector('.direct-badge', { timeout: 20000 });
  await page.locator('.user-message').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(screenshotDir, 'room-user-interjection-e2e-mock.png') });

  await page.waitForSelector('.stage-ended', { timeout: 25000 });
  await page.getByRole('tab', {name: '成果总结'}).click();
  await page.getByRole('button', {name: '编辑成果', exact: true}).click();
  await page.waitForFunction(
    () => document.body.innerText.includes('可编辑') && document.querySelectorAll('.evidence-edit').length > 0,
    null,
    { timeout: 20000 },
  );
  const firstSummary = page.locator('.summary-item-edit textarea').first();
  await firstSummary.fill('已编辑：双方接受先做六周试行，但不能把 23:00 写成长期规则。');
  await page.getByRole('button', { name: '保存编辑' }).click();
  await page.waitForFunction(
    () => document.body.innerText.includes('已人工编辑'),
    null,
    { timeout: 10000 },
  );
  await page.screenshot({ path: path.join(screenshotDir, 'room-summary-e2e-mock.png') });

  await page.getByRole('button', { name: /技术记录/ }).click();
  await page.waitForSelector('.tech-drawer');
  await page.waitForTimeout(450);
  const callRows = await page.locator('.tech-table tbody tr').count();
  assert.ok(callRows >= 5, `expected real call rows, got ${callRows}`);
  const techText = await page.locator('.tech-drawer').innerText();
  assert.match(techText, /主持人/);
  assert.match(techText, /参与者/);
  assert.match(techText, /总结/);
  await page.screenshot({ path: path.join(screenshotDir, 'tech-trace-e2e-mock.png') });

  const sessionId = new URL(page.url()).searchParams.get('session');
  assert.ok(sessionId);
  const jsonResponse = await page.request.get(`http://127.0.0.1:4318/api/sessions/${sessionId}/export.json`);
  assert.equal(jsonResponse.status(), 200);
  const json = await jsonResponse.json();
  assert.equal(json.session.summary.consensus[0], '已编辑：双方接受先做六周试行，但不能把 23:00 写成长期规则。');
  assert.ok(json.session.calls.length >= 5);
  const mdResponse = await page.request.get(`http://127.0.0.1:4318/api/sessions/${sessionId}/export.md`);
  const markdown = await mdResponse.text();
  assert.match(markdown, /已编辑：双方接受先做六周试行/);
  assert.match(markdown, /技术记录（真实调用）/);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.room-shell');
  await page.waitForTimeout(1200);
  await page.getByRole('tab', {name: '成果总结'}).click();
  await page.getByRole('button', {name: '编辑成果', exact: true}).click();
  assert.equal(
    await page.locator('.summary-item-edit textarea').first().inputValue(),
    '已编辑：双方接受先做六周试行，但不能把 23:00 写成长期规则。',
  );

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(`http://127.0.0.1:4318/?session=${sessionId}`, { waitUntil: 'networkidle' });
  await mobile.waitForSelector('.room-shell');
  await mobile.screenshot({ path: path.join(screenshotDir, 'room-mobile.png') });
  assert.equal(await mobile.evaluate(() => document.body.scrollWidth), 390);

  assert.deepEqual(errors, [], 'browser console and page errors must fail E2E');
  console.log(
    JSON.stringify(
      {
        sessionId,
        questionCount,
        callRows,
        beforePauseMessages,
        afterPauseMessages,
        jsonSummaryEdited: true,
        markdownExported: true,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
