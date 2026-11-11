import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import http from 'node:http';import net from 'node:net';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {AuditRepository,createAuditDraft} from '../server/gtm-repository.js';import {transitionAuditState} from '../server/gtm-state.js';
test('actual application index startup scans GTM pending, serves legacy health and makes zero model HTTP requests',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'gtm-bootstrap-'));let modelRequests=0;const mock=http.createServer((_q,s)=>{modelRequests++;s.writeHead(500).end('{}');});await new Promise<void>(resolve=>mock.listen(0,'127.0.0.1',resolve));const modelPort=(mock.address() as net.AddressInfo).port;
 const probe=net.createServer();await new Promise<void>(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=(probe.address() as net.AddressInfo).port;await new Promise<void>(resolve=>probe.close(()=>resolve()));
 let child:ReturnType<typeof spawn>|null=null;
 try{
  const repo=new AuditRepository(path.join(dir,'data','audits'));let a=await repo.save(createAuditDraft({businessBrief:'synthetic boot test'}),null);a.state=transitionAuditState(a.state,{type:'start'});a=await repo.save(a,a.recordRevision);await repo.reserve(a.id,a.recordRevision,{stage:'blue_proposal',commandId:'boot-pending',configuredModel:'mock',estimatedInputTokens:100});
  child=spawn(process.execPath,['--import',new URL('../node_modules/tsx/dist/loader.mjs',import.meta.url).href,fileURLToPath(new URL('../server/index.ts',import.meta.url))],{cwd:dir,windowsHide:true,env:{...process.env,SEMINAR_PORT:String(port),SEMINAR_DATA_DIR:path.join(dir,'data','sessions'),OPENAI_API_KEY:'synthetic-bootstrap-only',OPENAI_BASE_URL:`http://127.0.0.1:${modelPort}/v1`,OPENAI_MODEL:'mock'},stdio:['ignore','pipe','pipe']});
  let ready=false,logs='';child.stdout!.on('data',b=>{logs+=String(b);if(logs.includes(`http://127.0.0.1:${port}`))ready=true;});child.stderr!.on('data',b=>logs+=String(b));
  const deadline=Date.now()+8000;while(!ready){if(child.exitCode!==null||Date.now()>deadline)throw Error('Isolated application startup failed');await new Promise(r=>setTimeout(r,10));}
  const health=await fetch(`http://127.0.0.1:${port}/api/health`);assert.equal(health.status,200);assert.equal((await health.json() as {ok:boolean}).ok,true);
  const loaded=(await repo.load(a.id)).audit;assert.equal(loaded.state.lifecycle,'paused');assert.equal(loaded.ledger.calls[0].status,'interrupted');assert.equal(loaded.ledger.calls.length,1);assert.equal(modelRequests,0);assert.ok(!logs.includes('synthetic-bootstrap-only'));
 }finally{
  if(child&&child.exitCode===null){const done=new Promise<void>(resolve=>child!.once('exit',()=>resolve()));child.kill();await done;}
  await new Promise<void>(resolve=>mock.close(()=>resolve()));assert.equal(path.dirname(dir),os.tmpdir());await rm(dir,{recursive:true,force:true});
 }
});
