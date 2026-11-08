import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
function findRepo(dir){for(let p=dir;;p=path.dirname(p)){if(existsSync(path.join(p,'package.json')))return p;if(path.dirname(p)===p)throw Error('Set SEMINAR_REPO_ROOT to the repository root');}}
const repoRoot=process.env.SEMINAR_REPO_ROOT||findRepo(import.meta.dirname);
const require=createRequire(path.join(repoRoot,'package.json'));
const {chromium}=require('playwright-core');
const root=path.resolve(import.meta.dirname,'..');
const evidence=process.env.SEMINAR_DESIGN_QA_DIR||await (await import('node:fs/promises')).mkdtemp(path.join(os.tmpdir(),'seminarroom-design-qa-'));
const out=evidence+'/screenshots';const baseUrl=(process.env.SEMINAR_DESIGN_BASE_URL||'http://127.0.0.1:4350').replace(/\/$/,'');
await mkdir(out,{recursive:true});await mkdir(evidence+'/downloads',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const results=[],errors=[],remote=[];let page;
const key='seminarroom-v12-stage0-baseline-v1';
const data=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
const click=(a,v)=>page.locator(`[data-action="${a}"]${v?`[data-value="${v}"]`:''}`).first().click();
const go=async r=>{await page.evaluate(r=>location.hash=r,r);await page.locator('main h1').first().waitFor();};
const shot=async name=>{await page.screenshot({path:out+'/'+name+'.png',animations:'disabled'});};
async function fresh(route='workspace',viewport={width:1440,height:900}){
 if(page)await page.context().close();const c=await browser.newContext({viewport,acceptDownloads:true,reducedMotion:'reduce'});page=await c.newPage();
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(baseUrl+'/')&&!r.url().startsWith('blob:'))remote.push(r.url());});
 await page.goto(baseUrl+'/prototype/#'+route);await page.locator('main h1').first().waitFor();
}
async function check(name,fn){try{await fn();results.push({name,pass:true});console.log('PASS',name);}catch(e){results.push({name,pass:false,error:e.message});console.log('FAIL',name,e.message);await shot('FAIL-'+results.length);}}
async function scenario(v){await click('scenario');await click('set-scenario',v);}
try{
 await fresh();
 await check('A: create / material / inline team / planned connection / questions / interjection / pause / resume / summary',async()=>{
  await click('create');await click('wizard-next');assert.match(await page.locator('#wizard-error').innerText(),/填写/);
  await page.locator('#wizard-title').fill('浏览器验收 · 证据研究');await page.locator('#wizard-goal').fill('区分现有观察与待验证解释，交付可核验方案。');await click('wizard-next');
  await page.locator('#wizard-material').fill('甲组在两次观察中记录到学习行为变化，但没有对照组，不能据此推出因果关系。\n\n乙组补充访谈与修订记录，明确需要连续观察才能判断长期影响。');await click('wizard-next');
  await page.locator('[data-wizard-name="a"]').fill('证据机器人');await shot('flow-A-team-wizard');await click('wizard-next');await page.locator('#wizard-connection').selectOption('c2');await click('wizard-prev');assert.equal(await page.locator('[data-wizard-name="a"]').inputValue(),'证据机器人');await click('wizard-next');assert.equal(await page.locator('#wizard-connection').inputValue(),'c2');await click('wizard-next');
  assert.match(await page.locator('main h1').first().innerText(),/浏览器验收/);assert.equal((await data()).materials.length,2);assert.equal((await data()).output,'');
  await click('plan');await page.locator('[data-action="start-session"]').waitFor();await page.locator('#dialog textarea').first().fill('这些观察支持哪些结论？');await click('start-session');assert.equal((await data()).session.stage,'running');
  await click('pause');await page.locator('#interjection').fill('请保留两个解释之间的分歧。');await click('send');assert.equal((await data()).session.pending.length,1);await shot('flow-A-paused-pending');await click('resume');await click('advance');await click('advance');assert.equal((await data()).session.pending.length,0);assert.equal((await data()).session.messages.filter(m=>m.kind==='直接回应').length,2);
  await click('end');assert.equal((await data()).session.stage,'ended');await shot('state-ended-summary-generating');await page.waitForTimeout(550);assert.equal((await data()).session.summary,'ready');await click('open-output');assert.equal(await page.locator('.source-card').count(),2);assert.doesNotMatch(await page.locator('.source-foot').innerText(),/P03/);
  await go('workspace');await click('select-project','p1');assert.equal((await data()).materials.length,3);assert.equal((await data()).projectTitle,'书法教学中的反馈与练习设计');
 });
 await fresh('room');
 await check('B: citation → exact paragraph → original message → edit / draft / reload / save / MD + JSON',async()=>{
  await page.locator('#m2 [data-action="source"]').click();assert.equal(await page.locator('#source-paragraph mark').innerText(),(await data()).materials[0].text);await shot('flow-B-source-highlight');await click('return-message','m2');assert.match(await page.locator('#m2').getAttribute('class'),/message-highlight/);await click('open-output');await click('edit-output');
  const saved=(await data()).output;const draft=saved+'\n\n人工补充：保持研究结论的适用边界。';await page.locator('#output-editor').fill(draft);await page.locator('#draft-notice').waitFor();await shot('state-unsaved-draft');await page.reload();assert.equal(await page.locator('#output-editor').inputValue(),draft);
  await click('export-menu');let download=page.waitForEvent('download');await click('export-json');let d=await download;await d.saveAs(evidence+'/downloads/unsaved-export.json');let j=JSON.parse(await readFile(evidence+'/downloads/unsaved-export.json','utf8'));assert.equal(j.artifact.content,saved);
  await click('save-output');assert.equal((await data()).draftOutput,null);await click('edit-output');assert.match(await page.locator('#document').innerText(),/人工补充/);
  for(const [action,file] of [['export-md','saved.md'],['export-json','saved.json']]){await click('export-menu');download=page.waitForEvent('download');await click(action);d=await download;await d.saveAs(evidence+'/downloads/'+file);}
  j=JSON.parse(await readFile(evidence+'/downloads/saved.json','utf8'));assert.equal(j.artifact.content,draft);assert.match(await readFile(evidence+'/downloads/saved.md','utf8'),/人工补充/);assert.equal(j.references.length,3);
 });
 await fresh('tasks');
 await check('C: assignment / immutable run identity / failure / retry / handoff / approval / once-only artifact update',async()=>{
  await page.locator('#task-owner').selectOption('a');await click('assign-task');await click('start-task');await click('fail-task');await shot('flow-C-task-failed');await page.locator('#task-owner').selectOption('b');await click('assign-task');await click('retry-task');let t=(await data()).tasks[1];assert.equal(t.attempts[0].agentId,'a');assert.equal(t.attempts[1].agentId,'b');await click('complete-task');assert.equal((await data()).tasks[2].status,'待执行');const upstream=(await data()).tasks[1].outputRef;await click('open-task','T-03');await click('start-task');assert.ok((await data()).tasks[2].attempts.at(-1).inputRefs.includes(upstream));await click('complete-task');let version=(await data()).version;assert.equal((await data()).tasks[2].status,'待审批');await click('approve-task');const reviewed=await page.locator('#review-candidate-content').innerText();const reviewedHash=await page.locator('#review-hash').innerText();assert.equal(reviewedHash,createHash('sha256').update(reviewed).digest('hex'));assert.notEqual(reviewed,(await data()).output);await shot('flow-C-approval');await click('accept-task');assert.equal((await data()).output,reviewed);assert.equal((await data()).approvals.at(-1).targetHash,reviewedHash);assert.equal((await data()).version,version+1);assert.equal((await data()).tasks[2].applied,true);assert.equal(await page.locator('[data-action="approve-task"]').count(),0);await page.reload();assert.equal((await data()).version,version+1);await shot('flow-C-handoff-completed');
 });
 await fresh('room');
 await check('Six regression interaction mappings: preserved pending / successful responder / manual restart / ended / paused error / summary updates',async()=>{
  await scenario('partial');let before=(await data()).session;assert.equal(before.pending[0],'user-demo');assert.equal(before.messages.filter(m=>m.addresses?.includes('user-demo')&&m.actor==='a').length,1);await click('retry-session');let after=(await data()).session;assert.equal(after.pending.length,0);assert.equal(after.messages.filter(m=>m.addresses?.includes('user-demo')&&m.actor==='a').length,1);await shot('state-retry-preserved-A');
  await scenario('interrupted');before=(await data()).session;await page.reload();await page.waitForTimeout(600);assert.equal((await data()).session.stage,'paused');assert.equal((await data()).session.messages.length,before.messages.length);await shot('state-interrupted-manual');await click('resume');
  await scenario('paused-failure');assert.equal((await data()).session.stage,'paused');assert.match(await page.locator('[role="alert"]').innerText(),/失败/);await shot('state-paused-failure');
  await scenario('ended');assert.equal(await page.locator('[data-action="advance"]').count(),0);assert.equal(await page.locator('[data-action="resume"]').count(),0);
 });
 await fresh('room');
 await check('Offline: draft retained, no simulated execution, reconnection does not advance',async()=>{
  await scenario('offline');await page.locator('#interjection').fill('断线时保留的追问。');let n=(await data()).session.messages.length;await click('advance');assert.equal((await data()).session.messages.length,n);await click('send');assert.equal((await data()).session.pending.length,0);assert.equal((await data()).interjectionDraft,'断线时保留的追问。');await shot('state-offline-draft');await click('reconnect');assert.equal((await data()).session.messages.length,n);assert.equal(await page.locator('#interjection').inputValue(),'断线时保留的追问。');await click('send');assert.equal((await data()).session.pending.length,1);
 });
 await fresh('workspace');
 await check('Keyboard / modal Escape + focus / native focus containment / command search / menu dismissal / tab arrows',async()=>{
  await page.locator('[data-action="create"]').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#dialog').evaluate(d=>d.contains(document.activeElement)),true);for(let i=0;i<10;i++)await page.keyboard.press('Tab');assert.equal(await page.locator('#dialog').evaluate(d=>d.contains(document.activeElement)),true);await page.keyboard.press('Escape');await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>document.activeElement.dataset.action),'create');
  await page.keyboard.press('Control+k');await page.locator('#command-search').fill('教学观察');await page.locator('#search-results button:visible').first().click();assert.match(await page.locator('main h1').first().innerText(),/材料/);
  await go('output');await click('export-menu');assert.equal(await page.locator('[data-action="export-menu"]').getAttribute('aria-expanded'),'true');await page.keyboard.press('Escape');assert.equal(await page.locator('[data-action="export-menu"]').getAttribute('aria-expanded'),'false');assert.equal(await page.evaluate(()=>document.activeElement.dataset.action),'export-menu');await click('export-menu');await page.locator('main h1').first().click();assert.equal(await page.locator('.export-menu').count(),0);
  await go('room');await page.locator('[role="tab"]').first().focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('[role="tab"][aria-selected="true"]').innerText(),'材料');assert.equal(await page.locator('[role="tabpanel"]').getAttribute('aria-labelledby'),'tab-room-tab-material');await click('room-tab','trace');assert.match(await page.locator('[role="tabpanel"]').innerText(),/接口返回模型：未验证/);await shot('state-audit-inspector');
 });
 await fresh('connections');
 await check('Connections: config labels distinct from real identity, mock testing, stable Agent identity',async()=>{
  const ids=(await data()).agents.map(a=>a.id);await click('test-connection');assert.match(await page.locator('#connection-result').innerText(),/模拟测试中/);await shot('state-connection-testing');await page.waitForTimeout(650);assert.match(await page.locator('#connection-result').innerText(),/非真实测试/);assert.match(await page.locator('#connection-result').innerText(),/接口实际返回模型：未验证/);await page.locator('[data-assign-model="a"]').selectOption({index:2});assert.deepEqual((await data()).agents.map(a=>a.id),ids);await shot('state-connection-simulated-result');assert.equal(await page.locator('input[type=password]').count(),0);
 });
 await fresh();
 await check('Empty / loading / failure / retry states are actionable',async()=>{
  for(const v of ['empty','loading','error']){await scenario(v);await shot('state-'+v);}await click('retry-ui');await page.waitForTimeout(550);assert.match(await page.locator('main h1').first().innerText(),/工作台/);
 });
 await fresh('room');
 await check('Multiple interjections: each message retains separate acknowledgements',async()=>{
  await page.locator('#interjection').fill('第一条追问');await click('send');const first=(await data()).session.pending[0];await click('advance');await page.locator('#interjection').fill('第二条追问');await click('send');const second=(await data()).session.pending[1];await click('advance');await click('advance');const st=(await data()).session;assert.equal(st.pending.length,0);assert.equal(st.messages.filter(m=>m.actor==='a'&&m.addresses?.includes(first)).length,1);assert.equal(st.messages.filter(m=>m.actor==='a'&&m.addresses?.includes(second)).length,1);assert.equal(st.messages.filter(m=>m.actor==='b'&&m.addresses?.includes(first)).length,1);
 });
 await fresh('workspace');
 await check('Planning cancellation cannot overwrite a newly opened dialog; confirmed questions persist',async()=>{
  await click('select-project','p2');await click('plan');await page.keyboard.press('Escape');await click('help');await page.waitForTimeout(500);assert.equal(await page.locator('#dialog-title').innerText(),'原型说明与能力边界');await page.keyboard.press('Escape');await click('plan');await page.locator('[data-question="0"]').waitFor();await page.locator('[data-question="0"]').fill('人工确认后的研究问题');await click('start-session');assert.equal((await data()).session.questions[0],'人工确认后的研究问题');assert.match(await page.locator('#m1').innerText(),/人工确认后的研究问题/);
 });
 await fresh('room');
 await check('Ended summary resumes its synthetic completion after refresh',async()=>{
  await click('end');await page.reload();await page.waitForTimeout(650);assert.equal((await data()).session.stage,'ended');assert.equal((await data()).session.summary,'ready');assert.equal(await page.locator('[data-action="advance"]').count(),0);
 });
 await fresh('output');
 await check('Review belongs to a saved version; editing invalidates prior approval',async()=>{
  await click('output-tab','review');await click('open-review');await click('accept-review');assert.match(await page.locator('.sources-panel').innerText(),/已批准/);await click('edit-output');await page.locator('#output-editor').fill((await data()).output+'\n\n新修订');await click('save-output');assert.equal((await data()).approved,false);assert.match(await page.locator('.sources-panel').innerText(),/待人工审阅/);
 });
 await fresh('output');
 await check('Specific failures: summary retry / saved-draft recovery / connection failure identity',async()=>{
  await scenario('summary-error');await page.locator('[role="alert"]').waitFor();await shot('state-summary-error');await click('summarize');await page.waitForTimeout(550);assert.equal((await data()).session.summary,'ready');
  const saved=(await data()).output;await scenario('save-error');assert.equal((await data()).output,saved);assert.notEqual((await data()).draftOutput,null);await shot('state-save-error-preserved');await click('save-output');assert.equal((await data()).draftOutput,null);assert.match((await data()).output,/保存失败演示草稿/);assert.equal((await data()).lastSaveError,'');
  await scenario('connection-failure');assert.match(await page.locator('#connection-result').innerText(),/模拟测试失败/);assert.match(await page.locator('#connection-result').innerText(),/未验证/);await shot('state-connection-failure');
 });

 await fresh('tasks');
 await check('V1.2 workflow blueprint / dependency gate / stale candidate refuses approval',async()=>{
  await click('workflow-blueprint');assert.match(await page.locator('#dialog').innerText(),/Coordinator/);assert.match(await page.locator('#dialog').innerText(),/冻结候选/);await shot('workflow-blueprint');await page.keyboard.press('Escape');
  await click('open-task','T-03');assert.equal(await page.locator('[data-action="start-task"]').isDisabled(),true);
  await click('open-task','T-02');await click('start-task');await click('complete-task');await click('open-task','T-03');await click('start-task');await click('complete-task');const candidate=(await data()).tasks[2].candidate;
  await go('output');await click('edit-output');await page.locator('#output-editor').fill((await data()).output+'\n\n人工改变基线');await click('save-output');await go('tasks');await click('approve-task');assert.equal((await data()).tasks[2].status,'待修改');assert.equal((await data()).tasks[2].applied,undefined);assert.equal((await data()).tasks[2].candidate.id,candidate.id);assert.match((await data()).output,/人工改变基线/);
 });
 const layout=[];

 for(const viewport of [{width:1440,height:900},{width:1024,height:768},{width:390,height:844}]){
  await fresh('workspace',viewport);
  for(const route of ['workspace','project','team','room','output','connections','materials','tasks']){
   await check(`Layout ${route} ${viewport.width}×${viewport.height}`,async()=>{
    await go(route);await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(90);
    const dims=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(dims.scroll<=dims.width,JSON.stringify(dims));
    const a11y=await page.evaluate(()=>({unnamed:[...document.querySelectorAll('button')].filter(el=>el.getBoundingClientRect().width&&!el.textContent.trim()&&!el.getAttribute('aria-label')).length,panels:[...document.querySelectorAll('[role=tab]')].every(el=>document.getElementById(el.getAttribute('aria-controls'))),focus:getComputedStyle(document.querySelector('.btn')||document.querySelector('button')).fontFamily}));assert.equal(a11y.unnamed,0);assert.equal(a11y.panels,true);layout.push({route,viewport,...dims,...a11y});
    await shot(route+'-'+viewport.width);await page.screenshot({path:out+'/'+route+'-'+viewport.width+'-full.png',fullPage:true,animations:'disabled'});
   });
  }
  if(viewport.width===390)await check('Mobile navigation + keyboard + composer controls reachable',async()=>{
   await click('nav-toggle');assert.equal(await page.locator('.mobile-menu').getAttribute('aria-expanded'),'true');await page.keyboard.press('Escape');assert.equal(await page.locator('.mobile-menu').getAttribute('aria-expanded'),'false');await go('room');await page.evaluate(()=>scrollTo(0,0));let box=await page.locator('[data-action="pause"]').boundingBox();assert.ok(box.y>=0&&box.y+box.height<=844);await page.locator('#interjection').fill('移动端插话');await click('send');await click('pause');assert.equal((await data()).session.stage,'paused');await shot('mobile-paused-control');assert.equal(await page.emulateMedia({reducedMotion:'reduce'}).then(()=>page.locator('.btn').first().evaluate(e=>getComputedStyle(e).transitionDuration)),'0s');
  });
 }
 await fresh('tasks',{width:390,height:844});
 await check('V1.2 narrow candidate review stays readable and applies the reviewed text',async()=>{
  await click('start-task');await click('complete-task');await click('open-task','T-03');await click('start-task');await click('complete-task');await click('approve-task');
  const reviewed=await page.locator('#review-candidate-content').innerText();assert.equal(await page.locator('#dialog').evaluate(d=>d.scrollWidth<=d.clientWidth),true);await page.locator('#review-comment').fill('已核对候选内容与材料边界。');await shot('candidate-review-390');await click('accept-task');assert.equal((await data()).output,reviewed);assert.equal((await data()).approvals.at(-1).comment,'已核对候选内容与材料边界。');
 });
 assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
 await writeFile(evidence+'/layout-results.json',JSON.stringify(layout,null,2));
}finally{
 await writeFile(evidence+'/test-results.json',JSON.stringify({date:'2026-11-08',browser:'Microsoft Edge / Playwright Core',results,pageErrors:errors,externalRequests:remote,passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length},null,2));await browser.close();
}
console.log('QA output:',evidence);if(results.some(r=>!r.pass))process.exitCode=1;
