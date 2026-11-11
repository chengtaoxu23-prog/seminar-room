import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import type {AuditRun,AuditPosition,AuditExecution,ModelStage,ModelOutput,JsonValue,ModelCheckpoint,BlueProposal,RedChallenge,BlueRebuttal,SemanticReview,VerifiedClaim,VerifiedChallenge,VerifiedRebuttal} from '../src/shared/gtm.js';
import {AuditRepository,AuditRecoveryRequiredError} from './gtm-repository.js';
import {settleRequest,estimateRequestTokens} from './gtm-budget.js';
import {transitionAuditState} from './gtm-state.js';
import {buildGtmRequest} from './gtm-prompts.js';
import type {GtmProvider,GtmResponse} from './gtm-provider.js';
import {GtmProviderError} from './gtm-provider.js';
import {emptyExecution,parseStageOutput,checkClaims,applyReviews,semanticInput,withDerivedRisk,withDerivedRebuttal} from './gtm-execution.js';
import {assembleAuditReport,auditReportMarkdown} from './gtm-report.js';
class EngineFailure extends Error{constructor(readonly code:string,readonly stage:ModelStage|null=null,readonly budget?:{estimatedInputTokens:number;budgetLimit:number}){super(code);}}
const json=(value:unknown):JsonValue=>JSON.parse(JSON.stringify(value)) as JsonValue;
const selected=(a:AuditRun)=>a.sources.filter(s=>a.selection.selectedSourceIds.includes(s.id));
const material=(a:AuditRun)=>selected(a).map(s=>({id:s.id,revision:s.revision,title:s.title,paragraphs:s.paragraphs.map(p=>({id:p.id,text:p.text}))}));
function blueReviewInput(a:AuditRun,findings:VerifiedChallenge[]){
 const evidence=semanticInput(findings.flatMap(f=>f.claims),selected(a));
 return {context:a.context,proposal:output(a,'blue_proposal'),sources:material(a),challengeIds:findings.map(f=>f.challenge.id),evidenceRegister:{citations:evidence.citations,paragraphs:evidence.paragraphs},findings:findings.map(f=>({...f.challenge,claims:f.claims.map(c=>({id:c.candidate.id,text:c.candidate.text,kind:c.candidate.kind,reasoning:c.candidate.reasoning,classification:c.classification,semanticReview:c.semanticReview,citationIds:evidence.eligible.find(x=>x.claim.id===c.candidate.id)?.citationIds??[],invalidEvidenceReasons:[...new Set(c.citationChecks.flatMap(v=>v.ok?[]:[v.reason]))]}))}))};
}
const checkpoint=(a:AuditRun,s:ModelStage)=>a.execution?.checkpoints[s];
const output=<T extends ModelOutput>(a:AuditRun,s:ModelStage):T=>{const value=checkpoint(a,s)?.output;if(!value)throw new EngineFailure('missing_phase_output',s);return value as T;};
const stripCitations=(value:unknown):unknown=>Array.isArray(value)?value.map(stripCitations):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([k])=>k!=='citations').map(([k,v])=>[k,stripCitations(v)])):value;
export async function recoverGtmAudits(repo:AuditRepository):Promise<{paused:number;interrupted:number;manual:string[]}>{
 await repo.init();const summary={paused:0,interrupted:0,manual:[] as string[]};
 for(const id of await repo.ids()){
  try{const loaded=await repo.load(id);if(loaded.recovery!=='none'){summary.manual.push(id);continue;}
   if(loaded.audit.state.lifecycle!=='running'&&!loaded.audit.ledger.calls.some(c=>c.status==='pending'))continue;
   await repo.update(id,a=>{
    a.execution??=emptyExecution();
    for(const c of a.ledger.calls.filter(c=>c.status==='pending')){
     const at=new Date().toISOString();a.ledger=settleRequest(a.ledger,c.id,{status:'interrupted',returnedModel:null,finishedAt:at,durationMs:Math.max(0,Date.parse(at)-Date.parse(c.startedAt)),httpStatus:null,usage:{promptTokens:null,completionTokens:null,totalTokens:null},finishReason:null,schemaValid:null,errorCode:'provider_result_unknown'},a.configSnapshot);
     const cp:ModelCheckpoint=a.execution.checkpoints[c.stage]??={inputSnapshot:{},attempts:[],output:null,sealed:false,skipped:false};
     if(!cp.attempts.some(t=>t.callId===c.id))cp.attempts.push({callId:c.id,inputHash:'0'.repeat(64),output:null,errorCode:'provider_result_unknown'});
     a.execution.needsManualRecovery=true;a.execution.lastError={code:'provider_result_unknown',stage:c.stage,at};summary.interrupted++;
    }
    if(a.state.lifecycle==='running'){a.state=transitionAuditState(a.state,{type:'pause'});summary.paused++;}
   });
  }catch{summary.manual.push(id);}
 }
 return summary;
}
export class GtmAuditEngine{
 private readonly running=new Map<string,Promise<AuditRun>>();private readonly controllers=new Map<string,AbortController>();private initialization:Promise<unknown>|null=null;
 constructor(readonly repository:AuditRepository,private readonly provider:GtmProvider){}
 init():Promise<unknown>{return this.initialization??=recoverGtmAudits(this.repository);}
 async view(id:string){const {audit,recovery}=await this.repository.load(id);return {audit,recovery,capacityNotice:'30万字符是存储容量，不代表全部能进入一次审计。',materialBudget:audit.configSnapshot.capacity.materialEstimatedTokens,materialEstimatedTokens:audit.selection.estimatedMaterialTokens,materialBudgetRatio:audit.selection.estimatedMaterialTokens/audit.configSnapshot.capacity.materialEstimatedTokens,requestInputBudget:audit.configSnapshot.capacity.requestEstimatedInputTokens,latestRequestEstimate:audit.execution?.lastError?.estimatedInputTokens??audit.ledger.calls.at(-1)?.estimatedInputTokens??null,overLimitReason:!audit.selection.withinBudget?'选定完整来源超出估算预算，请取消部分来源或自行整理为独立TXT/MD。':audit.execution?.lastError?.code==='context_budget_exceeded'?'完整模型请求超出输入估算预算；原文未被删减。':audit.execution?.lastError?.code==='context_limit'?'供应商拒绝了上下文长度；原文未被删减。':null};}
 async pause(id:string):Promise<AuditRun>{return this.repository.update(id,a=>{a.state=transitionAuditState(a.state,{type:'pause'});});}
 async cancel(id:string):Promise<AuditRun>{const a=await this.repository.update(id,v=>{v.state=transitionAuditState(v.state,{type:'cancel'});});this.controllers.get(id)?.abort();return a;}
 async start(id:string,background=false):Promise<AuditRun>{await this.init();if(this.running.has(id)){if(background)throw new EngineFailure('already_started');return this.running.get(id)!;}const loaded=await this.repository.load(id);if(loaded.recovery!=='none')throw new AuditRecoveryRequiredError();if(loaded.audit.state.lifecycle==='completed'){if(background)throw new EngineFailure('already_started');return loaded.audit;}if(loaded.audit.state.lifecycle!=='draft')throw new EngineFailure('explicit_resume_required');const started=await this.repository.update(id,a=>{if(a.state.lifecycle!=='draft')throw new EngineFailure('already_started');a.execution??=emptyExecution();a.state=transitionAuditState(a.state,{type:'start'});});const task=this.launch(id);if(background){void task.catch(()=>undefined);return started;}return task;}
 async resume(id:string,options:{acknowledgeUnknown?:boolean}={}):Promise<AuditRun>{await this.init();if(this.running.has(id))throw new EngineFailure('in_flight_wait_required');await this.repository.update(id,a=>{a.execution??=emptyExecution();if(a.execution.needsManualRecovery&&!options.acknowledgeUnknown)throw new EngineFailure('unknown_call_acknowledgement_required');a.execution.needsManualRecovery=false;a.execution.lastError=null;a.state=transitionAuditState(a.state,{type:'resume'});});return this.launch(id);}
 private launch(id:string):Promise<AuditRun>{const controller=new AbortController();this.controllers.set(id,controller);const task=this.loop(id,controller.signal).finally(()=>{this.running.delete(id);this.controllers.delete(id);});this.running.set(id,task);return task;}
 private async current(id:string):Promise<AuditRun>{const loaded=await this.repository.load(id);if(loaded.recovery!=='none')throw new AuditRecoveryRequiredError();return loaded.audit;}
 private async move(id:string,to:AuditPosition):Promise<void>{await this.repository.update(id,a=>{if(a.state.lifecycle==='running')a.state=transitionAuditState(a.state,{type:'advance',to});});}
 private async seal(id:string,stage:ModelStage):Promise<void>{await this.repository.update(id,a=>{const c=a.execution!.checkpoints[stage];if(c)c.sealed=true;});}
 private async skip(id:string,stage:ModelStage,data:JsonValue):Promise<void>{await this.repository.update(id,a=>{if(!a.execution!.checkpoints[stage])a.execution!.checkpoints[stage]={inputSnapshot:json(data),attempts:[],output:null,sealed:true,skipped:true};});}
 private async repairState(id:string,stage:ModelStage):Promise<void>{const a=await this.current(id);if(a.state.lifecycle!=='running')return;const target:AuditPosition=stage==='blue_proposal'?{phase:'blue_proposal',substate:'repairing'}:stage==='red_challenge'?(a.state.phase==='verifier'?{phase:'verifier',substate:'red_repair_pending'}:{phase:'red_challenge',substate:'repairing'}):stage==='red_verifier'?{phase:'verifier',substate:'repairing'}:stage==='blue_rebuttal'?{phase:'blue_rebuttal',substate:'blue_repairing'}:{phase:'blue_rebuttal',substate:'verifier_repairing'};if(a.state.phase!==target.phase||a.state.substate!==target.substate)await this.move(id,target);}
 private async generate(id:string,stage:ModelStage,data:JsonValue,signal:AbortSignal,expectedIds?:string[],citationOnly=false):Promise<ModelOutput|null>{
  let a=await this.current(id),cp=checkpoint(a,stage);
  if(cp?.attempts.at(-1)?.errorCode&&a.ledger.calls.filter(c=>c.stage===stage).length>=2)throw new EngineFailure(cp.attempts.at(-1)!.errorCode!,stage);
  if(cp?.output&&!citationOnly)return cp.output;
  if(!cp){await this.repository.update(id,v=>{v.execution!.checkpoints[stage]={inputSnapshot:json(data),attempts:[],output:null,sealed:false,skipped:false};});}
  while(true){
   a=await this.current(id);if(a.state.lifecycle!=='running')return null;cp=checkpoint(a,stage)!;
   const count=a.ledger.calls.filter(c=>c.stage===stage).length;if(count>=2)throw new EngineFailure(cp.attempts.at(-1)?.errorCode??'stage_request_budget',stage);
   if(count)await this.repairState(id,stage);a=await this.current(id);if(a.state.lifecycle!=='running')return null;
   const previous=cp.output??cp.attempts.at(-1)?.output??null,reason=cp.attempts.at(-1)?.errorCode??(citationOnly?'citation_invalid':'provider_result_unknown');
   const baseInput=cp.inputSnapshot&&typeof cp.inputSnapshot==='object'&&!Array.isArray(cp.inputSnapshot)&&Object.keys(cp.inputSnapshot).length===0?data:cp.inputSnapshot;
   const request=buildGtmRequest(stage,baseInput,a,count?{code:reason,previous:json(previous),citationOnly,...(citationOnly?{issues:json(a.execution!.integrity.filter(v=>v.stage===stage).at(-1)?.failures??[])}:{})}:undefined);
   const estimatedInputTokens=estimateRequestTokens(request,a.configSnapshot);if(estimatedInputTokens>a.configSnapshot.capacity.requestEstimatedInputTokens)throw new EngineFailure('context_budget_exceeded',stage,{estimatedInputTokens,budgetLimit:a.configSnapshot.capacity.requestEstimatedInputTokens});
   const reservation=await this.repository.reserve(id,a.recordRevision,{commandId:`${id}:${stage}:${count+1}`,stage,configuredModel:this.provider.configuredModel,estimatedInputTokens,...(count?{repairReason:citationOnly?'citation' as const:reason==='output_truncated'?'truncated' as const:reason==='provider_result_unknown'?'transport' as const:'structure' as const}:{})});
   if(!reservation.isNew)throw new EngineFailure('duplicate_dispatch_blocked',stage);
   const call=reservation.call,started=Date.now();let response:GtmResponse|undefined,parsed:ModelOutput|null=null,code:string|null=null,failedHttpStatus:number|null=null;
   try{
    response=await this.provider.complete(structuredClone(request),signal);
    const safe=this.provider.sanitize?.(response.content)??{text:response.content,blocked:false};const modelSafe=this.provider.sanitize?.(response.returnedModel??'')??{text:response.returnedModel??'',blocked:false};
    if(safe.blocked||modelSafe.blocked||(this.provider.sanitize?.(response.finishReason).blocked??false))throw new EngineFailure('secret_output_blocked',stage);
    if(response.toolCalls?.length)throw new EngineFailure('unauthorized_tool_output',stage);
    if(['length','max_tokens','max_output_tokens'].includes(response.finishReason))throw new EngineFailure('output_truncated',stage);
    if(response.finishReason!=='stop')throw new EngineFailure('unconfirmed_finish_reason',stage);
    parsed=parseStageOutput(stage,JSON.parse(safe.text),a,expectedIds);
    if(citationOnly&&previous!==null&&!isDeepStrictEqual(stripCitations(previous),stripCitations(parsed)))throw new EngineFailure('citation_repair_changed_claims',stage);
   }catch(error){failedHttpStatus=error instanceof GtmProviderError?error.httpStatus:null;code=error instanceof EngineFailure?error.code:error instanceof GtmProviderError?(['context_limit','http_error','network_error','timeout','aborted','invalid_response'].includes(error.code)?error.code:'provider_error'):'invalid_structure';}
   const now=new Date().toISOString();const cancelled=signal.aborted;let saved:AuditRun;
   try{saved=await this.repository.update(id,v=>{
    const c=v.ledger.calls.find(x=>x.id===call.id)!;if(c.status!=='pending')throw new EngineFailure('call_already_settled',stage);
    const blocked=code==='secret_output_blocked';
    v.ledger=settleRequest(v.ledger,call.id,{status:cancelled?'aborted':code?'error':'ok',returnedModel:blocked?null:response?.returnedModel??null,finishedAt:now,durationMs:Date.now()-started,httpStatus:response?.httpStatus??failedHttpStatus,usage:response?.usage??{promptTokens:null,completionTokens:null,totalTokens:null},finishReason:blocked?null:response?.finishReason??null,schemaValid:response?code===null:null,errorCode:cancelled?'aborted':code},v.configSnapshot);
    const cpoint=v.execution!.checkpoints[stage]!;cpoint.attempts.push({callId:call.id,inputHash:createHash('sha256').update(JSON.stringify(request)).digest('hex'),inputSnapshot:json(request),output:cancelled?null:parsed,errorCode:cancelled?'aborted':code});if(parsed&&!cancelled&&!code)cpoint.output=structuredClone(parsed);
    v.execution!.lastError=code?{code,stage,at:now}:null;
   });}catch{throw new EngineFailure('persistence_failed',stage);}
   if(saved.state.lifecycle!=='running')return null;
   if(!code)return parsed;
   if(['context_limit','http_error','network_error','timeout','aborted','invalid_response'].includes(code))throw new EngineFailure(code,stage);
   // Structural errors consume the same one repair slot as citation corrections.
  }
 }
 private async integrity(id:string,stage:'red_challenge'|'blue_rebuttal',claims:VerifiedClaim[]):Promise<void>{
  await this.repository.update(id,a=>{const callId=a.execution!.checkpoints[stage]!.attempts.at(-1)!.callId;if(a.execution!.integrity.some(x=>x.callId===callId))return;a.execution!.integrity.push({stage,callId,failures:claims.flatMap(c=>c.citationChecks.flatMap(v=>v.ok?[]:[{claimId:c.candidate.id,candidate:v.candidate,reason:v.reason}]))});});
 }
 private async loop(id:string,signal:AbortSignal):Promise<AuditRun>{
  try{while(true){const a=await this.current(id);if(a.state.lifecycle!=='running')return a;const e=a.execution!,state=a.state;
   if(state.phase==='blue_proposal'){
    if(state.substate==='validated'){await this.move(id,{phase:'red_challenge',substate:'generating'});continue;}
    if(!await this.generate(id,'blue_proposal',json({context:a.context,sources:material(a)}),signal))continue;await this.seal(id,'blue_proposal');await this.move(id,{phase:'blue_proposal',substate:'validated'});
   }else if(state.phase==='red_challenge'){
    if(state.substate==='validated'){await this.move(id,{phase:'verifier',substate:'citation_check'});continue;}
    if(!await this.generate(id,'red_challenge',json({context:a.context,proposal:output(a,'blue_proposal'),sources:material(a)}),signal))continue;await this.move(id,{phase:'red_challenge',substate:'validated'});
   }else if(state.phase==='verifier'){
    if(state.substate==='verified'){await this.move(id,{phase:'blue_rebuttal',substate:'generating'});continue;}
    const red=output<{challenges:RedChallenge[]}>(a,'red_challenge').challenges;
    const drafts=red.map(r=>withDerivedRisk(r,checkClaims(r.claims,selected(a),a))),claims=drafts.flatMap(f=>f.claims);await this.integrity(id,'red_challenge',claims);
    if(state.substate==='citation_check'||state.substate==='red_repair_pending'){
     const invalid=claims.some(c=>c.citationChecks.some(v=>!v.ok)),count=a.ledger.calls.filter(c=>c.stage==='red_challenge').length;
     if(invalid&&count<2){await this.repairState(id,'red_challenge');if(await this.generate(id,'red_challenge',checkpoint(a,'red_challenge')!.inputSnapshot,signal,undefined,true))await this.move(id,{phase:'verifier',substate:'citation_check'});continue;}
     await this.seal(id,'red_challenge');
     if(!claims.some(c=>c.citationChecks.some(v=>v.ok))){await this.skip(id,'red_verifier',json({expectedIds:[]}));await this.repository.update(id,v=>{v.execution!.findings??=drafts;});await this.move(id,{phase:'verifier',substate:'verified'});continue;}
     await this.move(id,{phase:'verifier',substate:'reviewing'});continue;
    }
    const semantic=semanticInput(claims,selected(a)),ids=semantic.eligible.map(v=>v.claim.id);
    const result=await this.generate(id,'red_verifier',json({...semantic,riskContexts:drafts.map(f=>({riskId:f.challenge.id,description:f.challenge.description,reasoning:f.challenge.reasoning,claimIds:f.claims.map(c=>c.candidate.id)})),expectedIds:ids}),signal,ids) as {reviews:SemanticReview[]}|null;if(!result)continue;
    const verified=drafts.map(f=>withDerivedRisk(f.challenge,applyReviews(f.claims,result.reviews)));await this.seal(id,'red_verifier');await this.repository.update(id,v=>{v.execution!.findings??=verified;});await this.move(id,{phase:'verifier',substate:'verified'});
   }else if(state.phase==='blue_rebuttal'){
    if(state.substate==='verified'){await this.move(id,{phase:'convergence',substate:'assembling'});continue;}
    const findings=e.findings!,expected=findings.map(f=>f.challenge.id);
    if(state.substate==='generating'||state.substate==='blue_repairing'){
     if(!expected.length){await this.skip(id,'blue_rebuttal',json({challengeIds:[]}));await this.move(id,{phase:'blue_rebuttal',substate:'citation_check'});continue;}
     if(!await this.generate(id,'blue_rebuttal',json(blueReviewInput(a,findings)),signal,expected))continue;await this.move(id,{phase:'blue_rebuttal',substate:'citation_check'});continue;
    }
    const raw=checkpoint(a,'blue_rebuttal')?.skipped?[]:output<{rebuttals:BlueRebuttal[]}>(a,'blue_rebuttal').rebuttals;
    const drafts=raw.map(r=>withDerivedRebuttal(r,checkClaims(r.claims,selected(a),a))),claims=drafts.flatMap(r=>r.claims);
    if(raw.length)await this.integrity(id,'blue_rebuttal',claims);
    if(state.substate==='citation_check'){
     if(claims.some(c=>c.citationChecks.some(v=>!v.ok))&&a.ledger.calls.filter(c=>c.stage==='blue_rebuttal').length<2){await this.repairState(id,'blue_rebuttal');if(await this.generate(id,'blue_rebuttal',checkpoint(a,'blue_rebuttal')!.inputSnapshot,signal,expected,true))await this.move(id,{phase:'blue_rebuttal',substate:'citation_check'});continue;}
     await this.seal(id,'blue_rebuttal');
     if(!claims.some(c=>c.citationChecks.some(v=>v.ok))){await this.skip(id,'rebuttal_verifier',json({expectedIds:[]}));await this.repository.update(id,v=>{v.execution!.rebuttals??=drafts;});await this.move(id,{phase:'blue_rebuttal',substate:'verified'});continue;}
     await this.move(id,{phase:'blue_rebuttal',substate:'rebuttal_verifying'});continue;
    }
    const semantic=semanticInput(claims,selected(a)),ids=semantic.eligible.map(v=>v.claim.id);const result=await this.generate(id,'rebuttal_verifier',json({...semantic,expectedIds:ids}),signal,ids) as {reviews:SemanticReview[]}|null;if(!result)continue;
    const verified=drafts.map(v=>withDerivedRebuttal(v.rebuttal,applyReviews(v.claims,result.reviews)));await this.seal(id,'rebuttal_verifier');await this.repository.update(id,v=>{v.execution!.rebuttals??=verified;});await this.move(id,{phase:'blue_rebuttal',substate:'verified'});
   }else{
    if(!e.report){const report=assembleAuditReport(a),markdown=auditReportMarkdown(report);await this.repository.update(id,v=>{if(v.state.lifecycle==='running'){v.execution!.report=report;v.execution!.markdown=markdown;}});}
    if(state.substate==='assembling'){await this.move(id,{phase:'convergence',substate:'assembled'});continue;}
    return await this.repository.update(id,v=>{if(v.state.lifecycle==='running')v.state=transitionAuditState(v.state,{type:'complete'});});
   }
  }}catch(error){
   const code=error instanceof EngineFailure?error.code:'engine_error',stage=error instanceof EngineFailure?error.stage:null;
   try{return await this.repository.update(id,a=>{a.execution??=emptyExecution();a.execution.lastError={code,stage,at:new Date().toISOString(),...(error instanceof EngineFailure?error.budget:{})};if(a.state.lifecycle==='running')a.state=transitionAuditState(a.state,{type:a.ledger.calls.some(c=>c.status==='pending')?'pause':'fail'});if(a.ledger.calls.some(c=>c.status==='pending'))a.execution.needsManualRecovery=true;});}
   catch{throw new EngineFailure('persistence_failed',stage);}
  }
 }
}
