import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,copyFile,rename,readdir} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {AuditRepository,createAuditDraft} from '../server/gtm-repository.js';
import {estimateTokens,estimateRequestTokens} from '../server/gtm-budget.js';import {DEFAULT_GTM_CONFIG,createGtmConfig} from '../server/gtm-config.js';
test('v2 English/Chinese/mixed/finance/numbers/URLs/code estimates are explicit and conservative by category',()=>{
 assert.equal(DEFAULT_GTM_CONFIG.estimator.version,'gtm-conservative-v2');assert.equal(DEFAULT_GTM_CONFIG.estimator.cjkTokensPerCodePoint,1.75);assert.equal(DEFAULT_GTM_CONFIG.estimator.otherTokensPerCodePoint,0.35);
 const english='We plan to enter the overseas market with a subscription product. '.repeat(20),chinese='目标市场客户需求与价格支付意愿仍需验证。'.repeat(20);
 assert.ok(estimateTokens(english)<english.length);assert.ok(estimateTokens(chinese)>chinese.length);assert.ok(estimateTokens(english+chinese)>estimateTokens(english));
 for(const text of ['1234567890'.repeat(80),'Revenue\t2024\t2025\nUSD\t1000000\t1250000','https://example.invalid/a?budget=1000000&cost=2345','const price = {usd:100000, percent:5};','%%%$$$€€€\\\\{}[]'.repeat(30)])assert.ok(estimateTokens(text)>=Array.from(text).length,text);
});
for(const failure of ['copy','backup_replace','primary_replace','write'] as const)test(`atomic save ${failure} failure never removes primary or destroys valid backup`,async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'gtm-fault-'));try{
  const repo=new AuditRepository(dir);let a=await repo.save(createAuditDraft({businessBrief:'previous'}),null);a.context.projectName='current';a=await repo.save(a,a.recordRevision);
  const file=path.join(dir,a.id+'.json'),before=await readFile(file,'utf8'),bak=await readFile(file+'.bak','utf8');let observed=0;
  const check=async()=>{assert.equal(await readFile(file,'utf8'),before);observed++;};
  const failing=new AuditRepository(dir,{copyFile:async(x,y,mode)=>{await check();if(failure==='copy')throw Error('synthetic copy');return copyFile(x,y,mode);},rename:async(x,y)=>{await check();if((failure==='backup_replace'&&String(y).endsWith('.bak'))||(failure==='primary_replace'&&String(y)===file))throw Error('synthetic rename');return rename(x,y);},writeFile:async(h,p)=>{await check();if(failure==='write'){await h.writeFile('{partial');throw Error('synthetic interruption');}await h.writeFile(p,'utf8');}});
  a.context.projectName='next';await assert.rejects(failing.save(a,a.recordRevision));assert.ok(observed>0);assert.equal(await readFile(file,'utf8'),before);assert.ok(JSON.parse(await readFile(file+'.bak','utf8')));if(failure==='copy'||failure==='backup_replace'||failure==='write')assert.equal(await readFile(file+'.bak','utf8'),bak);
  assert.ok((await readdir(dir)).every(n=>!n.endsWith('.tmp')));
 }finally{assert.equal(path.dirname(dir),os.tmpdir());await rm(dir,{recursive:true,force:true});}
});
test('startup cleans only owned stale temporary files, preserving primary and backup',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'gtm-fault-'));try{const repo=new AuditRepository(dir);let a=await repo.save(createAuditDraft({businessBrief:'one'}),null);a.context.projectName='two';a=await repo.save(a,a.recordRevision);const stale=`.${a.id}.json.${randomUUID()}.tmp`;await writeFile(path.join(dir,stale),'{partial');await writeFile(path.join(dir,'user.tmp'),'preserve');await repo.init();assert.ok(!(await readdir(dir)).includes(stale));assert.equal(await readFile(path.join(dir,'user.tmp'),'utf8'),'preserve');assert.equal((await repo.load(a.id)).audit.context.projectName,'two');assert.ok(JSON.parse(await readFile(path.join(dir,a.id+'.json.bak'),'utf8')));}finally{assert.equal(path.dirname(dir),os.tmpdir());await rm(dir,{recursive:true,force:true});}
});

test('v2 request estimate separates JSON envelope from English prose without discounting financial/code content',()=>{
 const prose='The business plans to enter an overseas market with a subscription service. '.repeat(100);
 const request={messages:[{role:'user',content:JSON.stringify({sources:[{rawContent:prose}]})}]};
 const cost=estimateRequestTokens(request);assert.ok(cost<JSON.stringify(request).length);assert.ok(cost>estimateTokens(prose));
 const finance={messages:[{role:'user',content:JSON.stringify({sources:[{rawContent:'1234567890'.repeat(700)}]})}]};assert.ok(estimateRequestTokens(finance)>cost);
});

test('legacy v1 snapshot preserves CRLF character accounting and remains readable without migration',async()=>{
 const config=createGtmConfig();config.estimator={version:'gtm-conservative-v1',cjkTokensPerCodePoint:2,otherTokensPerCodePoint:1,safetyFactor:1.25,requestOverheadTokens:256};assert.equal(estimateTokens('A\r\n\r\n中',config),9);
 const {createSource}=await import('../server/gtm-sources.js');const dir=await mkdtemp(path.join(os.tmpdir(),'gtm-fault-'));
 try{const repo=new AuditRepository(dir),source=createSource({id:'v1',title:'旧估算快照',sourceType:'txt',accessedAt:'2026-11-10',rawContent:'A\r\n\r\n中'},config);const draft=createAuditDraft({businessBrief:'旧审计'},[source],['v1'],config);assert.equal(draft.selection.estimatedMaterialTokens,9);const saved=await repo.save(draft,null);assert.equal((await repo.load(saved.id)).audit.configSnapshot.estimator.version,'gtm-conservative-v1');}finally{assert.equal(path.dirname(dir),os.tmpdir());await rm(dir,{recursive:true,force:true});}
});
