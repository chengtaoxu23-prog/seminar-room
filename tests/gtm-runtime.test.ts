import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {configureGtmRuntime} from '../server/gtm-runtime.js';
import {createGtmApp} from '../server/gtm-api.js';import {AuditRepository} from '../server/gtm-repository.js';
import {createGtmMockProvider} from '../server/gtm-mock.js';import type {GtmRequest} from '../server/gtm-provider.js';
const syntheticEnv={GTM_PROVIDER:'openai-compatible',GTM_BASE_URL:'https://transport-stub.invalid/v1',GTM_MODEL:'stub-model',GTM_API_KEY:'synthetic-test-only-secret'};
test('runtime configuration constructs real adapter without sending HTTP and ignores real credentials in mock mode',()=>{
 let calls=0;const send:typeof fetch=async()=>{calls++;throw Error('must not send');};
 const r=configureGtmRuntime(syntheticEnv,send);assert.equal(r.runtime.mode,'real');assert.equal(r.config.requests.maxCalls,5);assert.equal(calls,0);
 const m=configureGtmRuntime({GTM_PROVIDER:'mock',GTM_API_KEY:'ignored',GTM_MODEL:'ignored'},send);assert.equal(m.runtime.mode,'mock');assert.equal(m.runtime.model,'MOCK-synthetic-only');assert.equal(calls,0);
});
test('configuration rejects missing fields, invalid transport and limits; never falls back',()=>{
 for(const env of [{GTM_PROVIDER:'typo'},{...syntheticEnv,GTM_API_KEY:''},{...syntheticEnv,GTM_BASE_URL:'http://remote.invalid/v1'},{...syntheticEnv,GTM_BASE_URL:'https://name:password@host.invalid/v1'},{...syntheticEnv,GTM_BASE_URL:'https://host.invalid/v1?api_key=secret'},{...syntheticEnv,GTM_MAX_CALLS:'11'},{...syntheticEnv,GTM_TIMEOUT_MS:'NaN'},{...syntheticEnv,GTM_MODEL:syntheticEnv.GTM_API_KEY}])assert.throws(()=>configureGtmRuntime(env));
});
async function service(failure?:'http'|'schema'|'invalid_json'){
 const dir=await mkdtemp(path.join(os.tmpdir(),'gtm-real-stub-'));let calls=0;
 const mock=createGtmMockProvider(0);
 const send:typeof fetch=async(_url,init)=>{
  calls++;assert.equal(String(_url),'https://transport-stub.invalid/v1/chat/completions');assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer '+syntheticEnv.GTM_API_KEY);assert.ok(!String(init?.body).includes(syntheticEnv.GTM_API_KEY));
  if(failure==='http')return new Response('sensitive-provider-body',{status:503});
  if(failure==='invalid_json')return new Response('not-json',{status:200});
  const body=JSON.parse(String(init?.body));
  // Infer by existing prompt role text, not a real model. This is a transport stub.
  const system=body.messages[0].content as string;const actualStage=system.includes('Propose an initial')?'blue_proposal':system.includes('independent commercial auditor')?'red_challenge':system.includes('responding ONCE')?'blue_rebuttal':system.includes('reviewing Blue rebuttal')?'rebuttal_verifier':'red_verifier';
  const response=await mock.complete({stage:actualStage,messages:body.messages,maxOutputTokens:body.max_tokens,tools:[]} as GtmRequest,new AbortController().signal);
  return new Response(JSON.stringify({model:'stub-returned-model',choices:[{finish_reason:'stop',message:{content:failure==='schema'?'{}':response.content}}],usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15}}),{status:200});
 };
 // Transport fixture uses the P1-C candidate budget; default-five validation above remains unchanged.
 const configured=configureGtmRuntime({...syntheticEnv,GTM_MAX_CALLS:'8'},send),repo=new AuditRepository(dir),s=createGtmApp(repo,configured.config,0,configured.runtime);await s.init();
 const server=s.app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const port=(server.address() as {port:number}).port;
 const api=async(url:string,method='GET',body?:unknown)=>{const response=await fetch(`http://127.0.0.1:${port}/api/gtm`+url,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
 const created=await api('/audits','POST',{businessBrief:'Synthetic adapter validation — not real market research.'});const id=created.data.audit.id;
 const finish=async()=>{for(let i=0;i<200;i++){const a=(await api('/audits/'+id)).data.audit;if(a.state.lifecycle!=='running')return a;await new Promise(r=>setTimeout(r,10));}throw Error('stub timeout');};
 return {id,api,repo,calls:()=>calls,finish,async close(){server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await rm(dir,{recursive:true,force:true});}};
}
test('real API requires explicit consent and preserves model identity, usage and truthful exported label (HTTP stub only)',async()=>{
 const f=await service();try{
 const cfg=await f.api('/config');assert.equal(cfg.data.mode,'REAL PROVIDER');assert.equal(cfg.data.provider.model,'stub-model');assert.ok(!JSON.stringify(cfg.data).includes(syntheticEnv.GTM_API_KEY));
 assert.equal((await f.api(`/audits/${f.id}/start`,'POST',{})).status,400);assert.equal((await f.api(`/audits/${f.id}/start`,'POST',{consentToSend:false})).status,400);assert.equal(f.calls(),0);
 const added=await f.api(`/audits/${f.id}/materials`,'POST',{title:'Synthetic material',rawContent:'Five synthetic interviews. No willingness to pay evidence.',sourceType:'txt'});await f.api(`/audits/${f.id}/selection`,'PUT',{selectedSourceIds:[added.data.audit.sources[0].id]});
 assert.equal((await f.api(`/audits/${f.id}/start`,'POST',{consentToSend:true})).status,202);const a=await f.finish();assert.equal(a.state.lifecycle,'completed',JSON.stringify(a.execution?.lastError));assert.equal(f.calls(),4);assert.equal(a.ledger.usage.knownTotalTokens,60);assert.equal(a.ledger.calls[0].returnedModel,'stub-returned-model');
 const report=await f.api(`/audits/${f.id}/report`);assert.match(report.data.markdown,/REAL PROVIDER/);assert.doesNotMatch(report.data.markdown,/MOCK DEMO/);assert.ok(!JSON.stringify(a).includes(syntheticEnv.GTM_API_KEY));
 await assert.rejects(f.repo.update(f.id,a=>{a.providerSnapshot={mode:'mock',model:'tampered'};}));
 }finally{await f.close();}
});
test('real HTTP failure remains failed, with no mock result or sensitive provider body',async()=>{const f=await service('http');try{await f.api(`/audits/${f.id}/start`,'POST',{consentToSend:true});const a=await f.finish();assert.equal(a.state.lifecycle,'failed');assert.equal(a.execution.report,null);assert.equal(a.execution.lastError.code,'http_error');assert.equal(f.calls(),1);assert.ok(!JSON.stringify(a).includes('sensitive-provider-body'));}finally{await f.close();}});
test('invalid real structured output exhausts existing repair only; no mock fallback',async()=>{const f=await service('schema');try{await f.api(`/audits/${f.id}/start`,'POST',{consentToSend:true});const a=await f.finish();assert.equal(a.state.lifecycle,'failed');assert.equal(a.execution.report,null);assert.equal(f.calls(),2);assert.equal(a.execution.lastError.code,'invalid_structure');}finally{await f.close();}});
test('invalid provider response JSON is reported distinctly without a fake successful audit',async()=>{const f=await service('invalid_json');try{await f.api(`/audits/${f.id}/start`,'POST',{consentToSend:true});const a=await f.finish();assert.equal(a.state.lifecycle,'failed');assert.equal(a.execution.lastError.code,'invalid_response');assert.equal(a.execution.report,null);assert.equal(f.calls(),1);}finally{await f.close();}});
