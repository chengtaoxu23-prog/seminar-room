import { chromium } from 'playwright-core';
import path from 'node:path';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await chromium.launch({ executablePath: edge, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

await page.goto('http://127.0.0.1:4317/', { waitUntil: 'networkidle' });
await page.screenshot({ path: 'docs/screenshots/landing-full.png', fullPage: true });
console.log('landing title:', await page.title());
console.log('health badge:', await page.locator('.model-status').innerText());

await page.goto('http://127.0.0.1:4317/?replay=commons-hours-replay', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: '显示完整回放' }).click();
await page.waitForTimeout(420);
const scroll = await page.locator('.discussion-panel').evaluate((node) => ({
  top: node.scrollTop,
  height: node.clientHeight,
  scrollHeight: node.scrollHeight,
}));
const lastVisible = await page.locator('.message').last().isVisible();
await page.screenshot({ path: 'docs/screenshots/replay-full.png' });
await page.locator('.user-message').scrollIntoViewIfNeeded();
await page.waitForTimeout(250);
await page.screenshot({ path: 'docs/screenshots/replay-user-interjection.png' });
console.log('replay scroll:', scroll, 'last visible:', lastVisible);
console.log('replay messages:', await page.locator('.message').count());
console.log('summary visible:', await page.locator('.summary-panel').isVisible());

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await mobile.goto('http://127.0.0.1:4317/', { waitUntil: 'networkidle' });
await mobile.screenshot({ path: 'docs/screenshots/landing-mobile.png', fullPage: false });
console.log('mobile body scroll width:', await mobile.evaluate(() => document.body.scrollWidth));

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
