/** Offline browser E2E against isolated data and the actual built React UI. */
import {chromium} from 'playwright-core';
import express from 'express';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createGtmApp} from '../server/gtm-api.js';
import {AuditRepository} from '../server/gtm-repository.js';
const output=process.argv[2];if(!output)throw Error('Provide output directory');await mkdir(output,{recursive:true});
await mkdir('work',{recursive:true});const dir=await mkdtemp(path.resolve('work','p2-browser-'));
const service=createGtmApp(new AuditRepository(dir),undefined,200);await service.init();
service.app.use(express.static(path.resolve('dist/web')));service.app.get('*',(_req,res)=>res.sendFile(path.resolve('dist/web/index.html')));
const server=service.app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const port=(server.address() as {port:number}).port;
const browser=await chromium.launch({executablePath:process.env.GTM_CHROMIUM_PATH??'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1'){errors.push('Unexpected external request: '+u.origin);return route.abort();}return route.continue();});
try{
 await page.goto(`http://127.0.0.1:${port}`);
 await page.getByLabel('审计名称',{exact:true}).fill('合成浏览器验收');await page.getByLabel('商业描述',{exact:true}).fill('合成材料：准备进入海外市场，需研究付费需求。');await page.getByLabel('目标市场',{exact:true}).fill('合成市场');await page.getByLabel('其他补充',{exact:true}).fill('这不是实际商业研究。');
 await page.getByRole('button',{name:'创建审计并添加材料'}).click();await page.getByLabel('上传 UTF-8 TXT / MD',{exact:true}).setInputFiles({name:'合成未选中材料.md',mimeType:'text/markdown',buffer:Buffer.from('合成上传材料：此来源不参与本次审计。','utf8')});await page.getByLabel('来源名称',{exact:true}).inputValue().then(async()=>{await page.waitForFunction(()=>{const el=document.querySelector('input[type=file]')?.closest('form')?.querySelector('textarea');return el?.value.includes('合成上传材料');});});await page.getByRole('button',{name:'保存完整材料'}).click();await page.getByRole('button',{name:'删除',exact:true}).waitFor();await page.getByLabel('来源名称',{exact:true}).fill('合成访谈记录');await page.getByLabel('粘贴文本 / 文件原文',{exact:true}).fill('合成访谈仅覆盖五人。\n\n尚无独立付费研究数据。');await page.getByRole('button',{name:'保存完整材料'}).click();
 const selection=page.getByRole('checkbox',{name:'选择 合成访谈记录'});await selection.click();await page.waitForFunction(()=>{const p=document.querySelector('progress');return p&&p.value>0;});await page.screenshot({path:path.join(output,'p2-home.png'),fullPage:true});
 await page.getByRole('button',{name:'启动 Mock 审计'}).click();await page.getByRole('heading',{name:'人工判断',exact:true}).waitFor();
 await page.getByText('unresolved · 合成演示：没有独立支持的反驳证据，保持未解决。',{exact:true}).waitFor();
 await page.locator('details summary').first().click();await page.getByLabel('审查备注',{exact:true}).fill('需要补充独立付费研究。');await page.getByRole('button',{name:'需进一步研究',exact:true}).click();await page.getByText('已保存备注：需要补充独立付费研究。',{exact:true}).waitFor();await page.screenshot({path:path.join(output,'p2-audit.png'),fullPage:true});
 await page.getByRole('button',{name:'报告',exact:true}).click();await page.getByRole('heading',{name:'人工审查记录（独立于机器结果）'}).waitFor();await page.screenshot({path:path.join(output,'p2-report.png'),fullPage:true});
 const downloadPromise=page.waitForEvent('download');await page.getByRole('link',{name:'导出 Markdown'}).click();const download=await downloadPromise;await download.saveAs(path.join(output,'P2-MOCK-report.md'));
 const id=new URL(page.url()).searchParams.get('audit');const api=()=>page.request.get(`http://127.0.0.1:${port}/api/gtm/audits/${id}`).then(r=>r.json());const before=await api();await page.reload();await page.getByRole('heading',{name:'人工审查记录（独立于机器结果）'}).waitFor();const after=await api();assert.deepEqual(after.audit.ledger,before.audit.ledger);assert.deepEqual(after.audit.humanReviews,before.audit.humanReviews);assert.equal(await page.locator('.history').count(),1);
 // Independent browser cancellation path; GET reload cannot replay requests.
 await page.getByRole('button',{name:'＋ 新建审计'}).click();await page.getByLabel('商业描述',{exact:true}).fill('取消路径合成测试');await page.getByRole('button',{name:'创建审计并添加材料'}).click();await page.getByRole('button',{name:'启动 Mock 审计'}).click();await page.getByRole('button',{name:'取消审计',exact:true}).click();await page.getByText(/状态：已取消/).waitFor();const cancelId=new URL(page.url()).searchParams.get('audit');await page.reload();await page.getByText(/状态：已取消/).waitFor();await page.screenshot({path:path.join(output,'p2-cancelled.png'),fullPage:true});
 const mobile=await browser.newPage({viewport:{width:390,height:844}});await mobile.goto(`http://127.0.0.1:${port}`);await mobile.screenshot({path:path.join(output,'p2-mobile.png'),fullPage:true});assert.equal(await mobile.evaluate(()=>document.body.scrollWidth),390);
 assert.deepEqual(errors,[]);await writeFile(path.join(output,'p2-browser-result.json'),JSON.stringify({mode:'MOCK',realProviderRequests:0,fullPath:'passed',cancelAndRefresh:'passed',reloadLedgerUnchanged:true,consoleErrors:errors,auditId:id,cancelledAuditId:cancelId,dataDirectory:dir},null,2));console.log('Mock browser E2E passed; output: '+output);
}finally{await browser.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
