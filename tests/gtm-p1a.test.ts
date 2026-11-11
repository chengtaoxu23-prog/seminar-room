import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm, rename } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createGtmConfig, DEFAULT_GTM_CONFIG, validateGtmConfig } from '../server/gtm-config.js';
import { createGtmSchemas, parseRedChallenges, parseBlueRebuttals, parseSemanticReviews, parseSourceInput, parseBlueProposal, type JsonSchema } from '../server/gtm-schema.js';
import { createSource, validateSourceSet, validateEvidenceCitation, deriveEvidenceCitations } from '../server/gtm-sources.js';
import { estimateTokens, estimateRequestTokens, assessSourceSelection, emptyRequestLedger, reserveRequest, settleRequest, validateRequestLedger, type CallOutcome } from '../server/gtm-budget.js';
import { initialAuditState, transitionAuditState, requestStageForState, validateAuditState, assertAuditStateChange } from '../server/gtm-state.js';
import { AuditRepository, createAuditDraft, AuditConflictError, AuditRecoveryRequiredError, AuditStorageError, validateAuditRun } from '../server/gtm-repository.js';
import { AUDIT_PHASES, MODEL_STAGES, type AuditPosition, type RequestLedger, type ModelStage } from '../src/shared/gtm.js';
const t0='2026-11-10T00:00:00.000Z',t1='2026-11-10T00:00:01.000Z';
const source=(rawContent='价格为100美元，客户获取成本尚未提供。',id='s1')=>createSource({id,title:'合成来源',sourceType:'pasted_text',accessedAt:t0,rawContent});
const citation=()=>{const s=source();return {sourceId:s.id,materialRevision:s.revision,paragraphId:1,quote:'价格为100美元'};};
const fixture=()=>({challenges:Array.from({length:8},(_,i)=>({id:`r${i}`,risk_type:'pricing',description:'缺少定价验证',reasoning:'材料无法证明支付意愿',assumptions:[],proposed_validation:['访谈客户'],severity:'medium',claims:Array.from({length:4},(_,j)=>({id:`r${i}c${j}`,text:'尚需验证',kind:'inference',reasoning:'缺少需求观察',citations:Array.from({length:3},citation)}))}))});
const outcome=(patch:Partial<CallOutcome>={}):CallOutcome=>({status:'ok',returnedModel:'actual-model',finishedAt:t1,durationMs:1000,httpStatus:200,usage:{promptTokens:10,completionTokens:5,totalTokens:15},finishReason:'stop',schemaValid:true,errorCode:null,...patch});
const input=(stage:ModelStage,commandId:string,repairReason?:'structure'|'citation')=>({stage,commandId,configuredModel:'configured-model',estimatedInputTokens:100,startedAt:t0,...(repairReason?{repairReason}:{})});
async function withRepo(run:(repo:AuditRepository,dir:string)=>Promise<void>){
  const dir=await mkdtemp(path.join(os.tmpdir(),'gtm-p1a-'));
  try{const repo=new AuditRepository(dir);await repo.init();await run(repo,dir);}
  finally{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.ok(path.basename(dir).startsWith('gtm-p1a-'));await rm(dir,{recursive:true,force:true});}
}
test('approved config defaults and hard boundaries cannot be silently exceeded',()=>{
  assert.deepEqual(DEFAULT_GTM_CONFIG.structure,{maxRisks:8,maxClaimsPerRisk:4,maxCitationsPerClaim:3});
  assert.equal(DEFAULT_GTM_CONFIG.capacity.maxTotalChars,300000);assert.equal(DEFAULT_GTM_CONFIG.capacity.maxSources,20);
  assert.equal(DEFAULT_GTM_CONFIG.capacity.materialEstimatedTokens,24576);assert.equal(DEFAULT_GTM_CONFIG.capacity.requestEstimatedInputTokens,49152);
  assert.deepEqual(DEFAULT_GTM_CONFIG.requests.outputTokens,{blue_proposal:2048,red_challenge:16384,red_verifier:8192,blue_rebuttal:12288,rebuttal_verifier:8192});
  assert.throws(()=>createGtmConfig({requests:{maxCalls:11}}));assert.throws(()=>createGtmConfig({capacity:{maxTotalChars:300001}}));
  assert.throws(()=>createGtmConfig({capacity:{maxSources:21}}));assert.throws(()=>createGtmConfig({estimator:{safetyFactor:0.9}}));
  assert.throws(()=>createGtmConfig({requests:{outputTokens:{red_challenge:0}}}));
  const bad=createGtmConfig();(bad.structure as {maxClaimsPerRisk:number}).maxClaimsPerRisk=5;assert.throws(()=>validateGtmConfig(bad));
  assert.throws(()=>{DEFAULT_GTM_CONFIG.capacity.maxSources=99;});
});
test('config drives schemas, every unconstrained long string has a maxLength',()=>{
  const cfg=createGtmConfig({text:{long:50,businessBrief:100},capacity:{maxSourceChars:100,maxTotalChars:200}});
  assert.throws(()=>parseBlueProposal({target_market:null,target_customer:null,value_prop:'x'.repeat(51),pricing_model:null,gtm_channels:[],key_assumptions:[],unknowns:[]},cfg));
  assert.equal(parseSourceInput({id:'s',title:'来源',sourceType:'txt',accessedAt:t0,rawContent:'x'.repeat(100)},cfg).rawContent.length,100);
  assert.throws(()=>parseSourceInput({id:'s',title:'来源',sourceType:'txt',accessedAt:t0,rawContent:'x'.repeat(101)},cfg));
  const walk=(schema:JsonSchema)=>{const types=Array.isArray(schema.type)?schema.type:[schema.type];if(types.includes('string')&&!schema.enum)assert.ok(schema.maxLength!==undefined);Object.values(schema.properties??{}).forEach(walk);if(schema.items)walk(schema.items);};
  Object.values(createGtmSchemas(cfg)).forEach(walk);
});
test('8×4×3 Red boundary is complete, extra risk/claim/citation and long text fail without truncation',()=>{
  const f=fixture(),parsed=parseRedChallenges(f);assert.equal(parsed.challenges.length,8);assert.equal(parsed.challenges.flatMap(r=>r.claims).length,32);assert.equal(parsed.challenges.flatMap(r=>r.claims.flatMap(c=>c.citations)).length,96);
  const cases=[()=>{f.challenges.push({...f.challenges[0],id:'extra'});},()=>{f.challenges[0].claims.push({...f.challenges[0].claims[0],id:'extra'});},()=>{f.challenges[0].claims[0].citations.push(citation());},()=>{f.challenges[0].reasoning='长'.repeat(2001);}];
  for(const mutate of cases){const before=JSON.stringify(f);mutate();assert.throws(()=>parseRedChallenges(f));Object.assign(f,JSON.parse(before));}
  assert.equal(f.challenges[0].claims[0].citations.length,3);assert.deepEqual(parseRedChallenges({challenges:[]}),{challenges:[]});
});
test('rebuttal has same bounds; zero-citation claim permitted; dual evidence and model classification rejected',()=>{
  const red=fixture();const rebuttals={rebuttals:red.challenges.map(r=>({challengeId:r.id,response:'unresolved',reasoning:'继续研究',claims:r.claims}))};
  assert.equal(parseBlueRebuttals(rebuttals).rebuttals.length,8);
  rebuttals.rebuttals[0].claims[0].citations=[];assert.equal(parseBlueRebuttals(rebuttals).rebuttals[0].claims[0].citations.length,0);
  assert.throws(()=>parseRedChallenges({challenges:[{...red.challenges[0],evidence_citations:[citation()]}]}));
  assert.throws(()=>parseRedChallenges({challenges:[{...red.challenges[0],claims:[{...red.challenges[0].claims[0],classification:'material_fact'}]}]}));
  assert.throws(()=>parseRedChallenges({challenges:[{...red.challenges[0],claims:[{...red.challenges[0].claims[0],evidence_citations:[]}]}]}));
  rebuttals.rebuttals[0].claims.push({...red.challenges[1].claims[0],id:'extra'});assert.throws(()=>parseBlueRebuttals(rebuttals));
});
test('semantic/rebuttal expected ID sets reject omissions, additions, duplicates and allow reordering',()=>{
  const review=(claimId:string)=>({claimId,relation:'supported',directlyStated:false,reasoning:'推断受支持'});
  assert.equal(parseSemanticReviews({reviews:[review('b'),review('a')]},DEFAULT_GTM_CONFIG,['a','b']).reviews.length,2);
  for(const ids of [['a'],['a','x'],['a','a']])assert.throws(()=>parseSemanticReviews({reviews:ids.map(review)},DEFAULT_GTM_CONFIG,['a','b']));
  assert.throws(()=>parseBlueRebuttals({rebuttals:[]},DEFAULT_GTM_CONFIG,['r1']));
});
test('300000 Unicode code points and 20 full sources are enforced independently of UTF-16',()=>{
  const s=source('😀'.repeat(300000));assert.equal(s.rawContent.length,600000);validateSourceSet([s]);
  assert.throws(()=>source('😀'.repeat(300001)));
  assert.throws(()=>validateSourceSet([source('x'.repeat(150000),'a'),source('x'.repeat(150001),'b')]));
  validateSourceSet(Array.from({length:20},(_,i)=>source('完整来源',String(i))));
  assert.throws(()=>validateSourceSet(Array.from({length:21},(_,i)=>source('完整来源',String(i)))));
});
test('source selection preserves all raw text and reports estimates; changing whole-source selection recomputes',()=>{
  const sources=[source('中'.repeat(18000),'long'),source('short source','short')],before=structuredClone(sources);
  const all=assessSourceSelection(sources,['long','short']);assert.equal(all.withinBudget,false);assert.deepEqual(all.overBudgetSourceIds,['long','short']);assert.equal(all.sources[0].originalChars,18000);
  const selected=assessSourceSelection(sources,['short']);assert.equal(selected.withinBudget,true);assert.equal(selected.sources[0].selected,false);assert.equal(selected.estimateOnly,true);assert.equal(selected.estimatorVersion,'gtm-conservative-v2');assert.deepEqual(sources,before);
  assert.throws(()=>assessSourceSelection(sources,['missing']));assert.throws(()=>assessSourceSelection(sources,['short','short']));assert.equal(assessSourceSelection(sources,[]).estimatedMaterialTokens,0);
  assert.ok(estimateTokens('中文')>estimateTokens('ab'));assert.ok(estimateRequestTokens({data:'abc'})>estimateTokens('abc'));
});
test('real-source exact match returns before NFC; normalized only runs on fallback and keeps original quote',()=>{
  const s=source('价格为１００美元。'),c={sourceId:s.id,materialRevision:s.revision,paragraphId:1,quote:'价格为１００美元。'};
  const original=String.prototype.normalize;let normalizations=0;
  try{String.prototype.normalize=function(form){normalizations++;return original.call(this,form);};const exact=validateEvidenceCitation(c,[s]);assert.equal(exact.ok&&exact.citation.matchMode,'exact');assert.equal(normalizations,0);
    const fallback=validateEvidenceCitation({...c,quote:'价格为100美元。'},[s]);assert.equal(fallback.ok&&fallback.citation.matchMode,'normalized');assert.ok(normalizations>0);assert.equal(fallback.ok&&fallback.citation.quote,'价格为100美元。');
  }finally{String.prototype.normalize=original;}
});
test('five top phases, internal rebuttal verification, no second Blue/Red round, terminal guards',()=>{
  let state=transitionAuditState(initialAuditState(),{type:'start'});const phases=[state.phase];
  const positions:AuditPosition[]=[{phase:'blue_proposal',substate:'validated'},{phase:'red_challenge',substate:'generating'},{phase:'red_challenge',substate:'validated'},{phase:'verifier',substate:'citation_check'},{phase:'verifier',substate:'reviewing'},{phase:'verifier',substate:'verified'},{phase:'blue_rebuttal',substate:'generating'},{phase:'blue_rebuttal',substate:'citation_check'},{phase:'blue_rebuttal',substate:'rebuttal_verifying'},{phase:'blue_rebuttal',substate:'verified'},{phase:'convergence',substate:'assembling'},{phase:'convergence',substate:'assembled'}];
  for(const to of positions){state=transitionAuditState(state,{type:'advance',to});if(phases.at(-1)!==state.phase)phases.push(state.phase);}
  assert.deepEqual(phases,[...AUDIT_PHASES]);state=transitionAuditState(state,{type:'complete'});assert.throws(()=>transitionAuditState(state,{type:'resume'}));assert.throws(()=>transitionAuditState(state,{type:'advance',to:{phase:'blue_rebuttal',substate:'generating'}}));
  assert.throws(()=>validateAuditState({lifecycle:'running',phase:'verifier',substate:'generating'} as never));
  const paused=transitionAuditState(transitionAuditState(initialAuditState(),{type:'start'}),{type:'pause'});assert.equal(requestStageForState(paused),null);
  assert.throws(()=>assertAuditStateChange(paused,{...paused,phase:'red_challenge'} as never));
  assert.equal(requestStageForState({lifecycle:'running',phase:'blue_rebuttal',substate:'rebuttal_verifying'}),'rebuttal_verifier');
});
test('all 10 requests including failures are charged, shared repair slots reject a third request',()=>{
  let ledger=emptyRequestLedger();
  for(const stage of MODEL_STAGES){
    const first=reserveRequest(ledger,input(stage,stage+'1'));ledger=settleRequest(first.ledger,first.call.id,outcome({status:'error',errorCode:'synthetic_failure',usage:{promptTokens:null,completionTokens:null,totalTokens:null}}));
    const repair=reserveRequest(ledger,input(stage,stage+'2','structure'));ledger=settleRequest(repair.ledger,repair.call.id,outcome());
    assert.throws(()=>reserveRequest(ledger,input(stage,stage+'3','citation')));
  }
  assert.equal(ledger.calls.length,10);assert.equal(ledger.usage.calls,10);assert.equal(ledger.usage.knownTotalTokens,75);assert.equal(ledger.usage.missingUsageCalls,5);assert.equal(ledger.usage.availability,'partial');
});
test('input preflight, one in-flight request and duplicate command do not debit twice',()=>{
  const original=emptyRequestLedger();assert.throws(()=>reserveRequest(original,{...input('blue_proposal','a'),estimatedInputTokens:49153}));assert.equal(original.calls.length,0);
  const first=reserveRequest(original,input('blue_proposal','a'));const duplicate=reserveRequest(first.ledger,input('blue_proposal','a'));assert.equal(duplicate.isNew,false);assert.equal(duplicate.ledger.calls.length,1);
  assert.throws(()=>reserveRequest(first.ledger,input('red_challenge','b')));
  assert.throws(()=>reserveRequest(first.ledger,{...input('blue_proposal','a'),configuredModel:'different'}));
});
test('usage is actual-or-unavailable; configured/returned models differ; terminal records cannot be overwritten',()=>{
  const r=reserveRequest(emptyRequestLedger(),input('blue_proposal','a'));
  const ledger=settleRequest(r.ledger,r.call.id,outcome());assert.equal(ledger.calls[0].configuredModel,'configured-model');assert.equal(ledger.calls[0].returnedModel,'actual-model');assert.equal(ledger.usage.knownPromptTokens,10);
  assert.throws(()=>settleRequest(ledger,r.call.id,outcome({returnedModel:'forged'})));
  const missing=settleRequest(r.ledger,r.call.id,outcome({returnedModel:null,usage:{promptTokens:null,completionTokens:null,totalTokens:null}}));assert.equal(missing.usage.availability,'unavailable');assert.equal(missing.calls[0].usage.totalTokens,null);
  assert.throws(()=>settleRequest(r.ledger,r.call.id,outcome({usage:{promptTokens:-1,completionTokens:0,totalTokens:0}})));
  assert.throws(()=>validateRequestLedger({...ledger,usage:{...ledger.usage,knownTotalTokens:999}}));
});
test('repository save/reload keeps previous backup and isolates read clones',async()=>withRepo(async(repo,dir)=>{
  let a=await repo.save(createAuditDraft({businessBrief:'合成方案'},[source()],['s1']),null);assert.equal(a.recordRevision,1);const previous=await readFile(path.join(dir,a.id+'.json'),'utf8');
  const next=structuredClone(a);next.context.projectName='第二版';a=await repo.save(next,a.recordRevision);assert.equal(a.recordRevision,2);assert.equal(await readFile(path.join(dir,a.id+'.json.bak'),'utf8'),previous);
  const loaded=await repo.load(a.id);assert.equal(loaded.recovery,'none');assert.deepEqual(loaded.audit,a);loaded.audit.context.businessBrief='外部修改';assert.equal((await repo.load(a.id)).audit.context.businessBrief,'合成方案');assert.ok((await readdir(dir)).every(n=>!n.endsWith('.tmp')));
}));
test('repository serializes writers, rejects stale revisions and does not retain caller mutation',async()=>withRepo(async(repo,dir)=>{
  const a=await repo.save(createAuditDraft({businessBrief:'原始方案'}),null);const x=structuredClone(a),y=structuredClone(a);x.context.projectName='x';y.context.projectName='y';
  const results=await Promise.allSettled([repo.save(x,a.recordRevision),new AuditRepository(dir).save(y,a.recordRevision)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.ok(results.some(r=>r.status==='rejected'&&r.reason instanceof AuditConflictError));
  const current=(await repo.load(a.id)).audit;const pending=repo.save(current,current.recordRevision);current.context.businessBrief='不得写入';await pending;assert.equal((await repo.load(a.id)).audit.context.businessBrief,'原始方案');
}));
test('failed atomic replacement preserves old primary and readable backup; temporary file is cleaned',async()=>withRepo(async(repo,dir)=>{
  const a=await repo.save(createAuditDraft({businessBrief:'旧版'}),null);const failing=new AuditRepository(dir,{rename:async(from,to)=>{if(String(to).endsWith(a.id+'.json'))throw Object.assign(new Error('synthetic file busy'),{code:'EBUSY'});return rename(from,to);}});
  const changed=structuredClone(a);changed.context.businessBrief='新版';await assert.rejects(failing.save(changed,a.recordRevision));assert.equal((await repo.load(a.id)).audit.context.businessBrief,'旧版');assert.ok((await readdir(dir)).every(n=>!n.endsWith('.tmp')));
}));
test('corrupt primary falls back read-only, refuses overwrite; corrupt backup fails closed preserving both',async()=>withRepo(async(repo,dir)=>{
  let a=await repo.save(createAuditDraft({businessBrief:'前版'}),null);a.context.projectName='新标题';a=await repo.save(a,a.recordRevision);const file=path.join(dir,a.id+'.json');await writeFile(file,'{broken','utf8');
  const recovered=await repo.load(a.id);assert.equal(recovered.recovery,'previous_backup');assert.equal(recovered.audit.recordRevision,1);await assert.rejects(repo.save(recovered.audit,1),AuditRecoveryRequiredError);assert.equal(await readFile(file,'utf8'),'{broken');
  await writeFile(file+'.bak','{also broken','utf8');await assert.rejects(repo.load(a.id),AuditStorageError);assert.equal(await readFile(file+'.bak','utf8'),'{also broken');
}));
test('repository persists reservation before return, guards paused calls and keeps input/ledger immutable',async()=>withRepo(async(repo)=>{
  let a=await repo.save(createAuditDraft({businessBrief:'合成'},[source()],['s1']),null);a.state=transitionAuditState(a.state,{type:'start'});a=await repo.save(a,a.recordRevision);
  const r=await repo.reserve(a.id,a.recordRevision,input('blue_proposal','command'));a=r.audit;assert.equal((await repo.load(a.id)).audit.ledger.calls[0].status,'pending');
  const duplicate=await repo.reserve(a.id,a.recordRevision,input('blue_proposal','command'));assert.equal(duplicate.isNew,false);assert.equal(duplicate.audit.recordRevision,a.recordRevision);
  a=await repo.settle(a.id,a.recordRevision,r.call.id,outcome());const changed=structuredClone(a);changed.ledger.calls=[];changed.ledger.usage=emptyRequestLedger().usage;await assert.rejects(repo.save(changed,a.recordRevision));
  changed.ledger=structuredClone(a.ledger);changed.context.businessBrief='修改运行输入';await assert.rejects(repo.save(changed,a.recordRevision));
  a.state=transitionAuditState(a.state,{type:'pause'});a=await repo.save(a,a.recordRevision);await assert.rejects(repo.reserve(a.id,a.recordRevision,input('blue_proposal','repair','citation')));
}));
test('over-budget sources may be saved as draft but cannot start; selection change allows start',async()=>withRepo(async(repo)=>{
  let a=await repo.save(createAuditDraft({businessBrief:'合成'},[source('中'.repeat(18000),'large'),source('小材料','small')],['large']),null);
  a.state=transitionAuditState(a.state,{type:'start'});await assert.rejects(repo.save(a,a.recordRevision));a.state=initialAuditState();a.selection=assessSourceSelection(a.sources,['small'],a.configSnapshot);a=await repo.save(a,a.recordRevision);a.state=transitionAuditState(a.state,{type:'start'});a=await repo.save(a,a.recordRevision);assert.equal(a.state.lifecycle,'running');
}));
test('repository rejects unsafe IDs, legacy namespace and foreign fields without changing legacy data',async()=>withRepo(async(repo,dir)=>{
  assert.throws(()=>new AuditRepository(path.join(dir,'sessions')));await assert.rejects(repo.load('../outside'));
  const a=createAuditDraft({businessBrief:'合成'});assert.throws(()=>validateAuditRun({...a,apiKey:'synthetic-forbidden'}));
  await writeFile(path.join(dir,a.id+'.json'),JSON.stringify({schemaVersion:1,id:a.id}),'utf8');await assert.rejects(repo.load(a.id),AuditStorageError);assert.deepEqual(JSON.parse(await readFile(path.join(dir,a.id+'.json'),'utf8')),{schemaVersion:1,id:a.id});
}));

test('source input schema rejects metadata overflow, unknown fields and invalid Unicode without silent stripping',()=>{
  assert.throws(()=>createSource({id:'s',title:'t'.repeat(501),sourceType:'txt',accessedAt:t0,rawContent:'材料'}));
  assert.throws(()=>createSource({id:'s',title:'t',sourceType:'txt',accessedAt:t0,rawContent:'材料',apiKey:'forbidden'} as never));
  assert.throws(()=>source('bad\uD800'));assert.throws(()=>source('bad\uDFFF'));
});
test('commercial number semantics cannot be changed by normalization',()=>{
  const s=source('Revenue $1,000.50; margin 5%; loss -10 USD; units 20 kg; Café ①.');
  const c=(quote:string)=>({sourceId:s.id,materialRevision:s.revision,paragraphId:1,quote});
  for(const quote of ['Revenue $1.000,50','Revenue €1,000.50','margin 5;','loss 10 USD','units 20 lb','revenue $1,000.50','Café 1.'])assert.equal(validateEvidenceCitation(c(quote),[s]).ok,false);
  for(const quote of ['Revenue $1,000.50','margin 5%','loss -10 USD','units 20 kg'])assert.equal(validateEvidenceCitation(c(quote),[s]).ok,true);
});
test('derived evidence summary deduplicates only valid checks and never mutates Claim records',()=>{
  const s=source(),candidate={id:'c',text:'观察',kind:'observation' as const,reasoning:'原文',citations:[citation()]};
  const valid=validateEvidenceCitation(citation(),[s]),invalid=validateEvidenceCitation({...citation(),quote:'伪造引用原文'},[s]);
  const claim={candidate,citationChecks:[valid,invalid,valid],semanticReview:null,classification:'insufficient_evidence' as const},before=structuredClone(claim);
  const derived=deriveEvidenceCitations([claim]);assert.equal(derived.length,1);assert.deepEqual(claim,before);derived[0].quote='外部修改';assert.deepEqual(claim,before);
});
test('reloading persisted pending reservation never creates a new dispatch authorization',async()=>withRepo(async(repo,dir)=>{
  let a=await repo.save(createAuditDraft({businessBrief:'合成方案'}),null);a.state=transitionAuditState(a.state,{type:'start'});a=await repo.save(a,a.recordRevision);
  const r=await repo.reserve(a.id,a.recordRevision,input('blue_proposal','once'));const restarted=new AuditRepository(dir),loaded=await restarted.load(a.id);
  assert.equal(loaded.audit.ledger.calls.length,1);assert.equal(loaded.audit.ledger.calls[0].status,'pending');
  const duplicate=await restarted.reserve(a.id,r.audit.recordRevision,input('blue_proposal','once'));assert.equal(duplicate.isNew,false);assert.equal(duplicate.audit.ledger.calls.length,1);
  await assert.rejects(restarted.reserve(a.id,r.audit.recordRevision,input('blue_proposal','another','citation')));
}));
test('ledger outcome whitelist blocks request identity rewriting',()=>{
  const r=reserveRequest(emptyRequestLedger(),input('blue_proposal','once'));assert.throws(()=>settleRequest(r.ledger,r.call.id,{...outcome(),commandId:'forged'} as never));
});
test('file-name audit ID binding prevents cross-audit reads or reservations',async()=>withRepo(async(repo,dir)=>{
  const a=await repo.save(createAuditDraft({businessBrief:'审计A'}),null),b=await repo.save(createAuditDraft({businessBrief:'审计B'}),null);
  const bPath=path.join(dir,b.id+'.json'),bBefore=await readFile(bPath,'utf8');
  await writeFile(path.join(dir,a.id+'.json'),bBefore,'utf8');
  await assert.rejects(repo.load(a.id),AuditStorageError);await assert.rejects(repo.reserve(a.id,1,input('blue_proposal','bad')));
  assert.equal(await readFile(bPath,'utf8'),bBefore);
}));