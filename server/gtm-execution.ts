import {isDeepStrictEqual} from 'node:util';
import type {AuditRun,AuditExecution,ModelStage,ModelOutput,VerifiedClaim,VerifiedChallenge,VerifiedRebuttal,ClaimCandidate,SourceSnapshot} from '../src/shared/gtm.js';
import {MODEL_STAGES} from '../src/shared/gtm.js';
import {assembleAuditReport,auditReportMarkdown} from './gtm-report.js';
import {SchemaError} from './validation.js';
import {parseBlueProposal,parseRedChallenges,parseSemanticReviews,parseBlueRebuttals,objectSchema as obj,arraySchema as arr,textSchema as txt,enumSchema as en,assertJsonSchema,type JsonSchema} from './gtm-schema.js';
import {validateEvidenceCitation,deriveEvidenceCitations} from './gtm-sources.js';
export function emptyExecution():AuditExecution{return {checkpoints:{},integrity:[],findings:null,rebuttals:null,report:null,markdown:null,lastError:null,needsManualRecovery:false};}
export function parseStageOutput(stage:ModelStage,value:unknown,audit:AuditRun,expectedIds?:string[]):ModelOutput{
 const c=audit.configSnapshot;
 if(stage==='blue_proposal')return parseBlueProposal(value,c);
 if(stage==='red_challenge')return parseRedChallenges(value,c);
 if(stage==='blue_rebuttal')return parseBlueRebuttals(value,c,expectedIds);
 return parseSemanticReviews(value,c,expectedIds);
}
export function checkClaims(claims:ClaimCandidate[],sources:SourceSnapshot[],audit:AuditRun):VerifiedClaim[]{
 return claims.map(candidate=>({candidate:structuredClone(candidate),citationChecks:candidate.citations.map(c=>validateEvidenceCitation(c,sources,audit.configSnapshot)),semanticReview:null,classification:'insufficient_evidence'}));
}
export function applyReviews(claims:VerifiedClaim[],reviews:import('../src/shared/gtm.js').SemanticReview[]):VerifiedClaim[]{
 return claims.map(claim=>{
  const result=structuredClone(claim);if(!claim.citationChecks.some(c=>c.ok))return result;
  const review=reviews.find(r=>r.claimId===claim.candidate.id);if(!review)throw new SchemaError('语义审查缺少Claim。');result.semanticReview=structuredClone(review);
  result.classification=review.relation==='partially_supported'?'hypothesis':review.relation!=='supported'?'insufficient_evidence':claim.candidate.kind==='observation'&&review.directlyStated?'material_fact':claim.candidate.kind==='inference'&&claim.candidate.reasoning.trim()?'inference':'hypothesis';
  return result;
 });
}
export function semanticInput(claims:VerifiedClaim[],sources:SourceSnapshot[]){
 const citations:({id:number}&import('../src/shared/gtm.js').EvidenceCitation)[]=[],paragraphs:{sourceId:string;materialRevision:string;paragraphId:number;text:string}[]=[],keys=new Map<string,number>(),paragraphKeys=new Set<string>();
 const eligible=claims.filter(c=>c.citationChecks.some(v=>v.ok)).map(c=>{
  const citationIds:number[]=[];
  for(const check of c.citationChecks)if(check.ok){const v=check.citation,key=JSON.stringify([v.sourceId,v.materialRevision,v.paragraphId,v.quote]);let id=keys.get(key);if(id===undefined){id=citations.length;keys.set(key,id);citations.push({id,...v});}if(!citationIds.includes(id))citationIds.push(id);
   const pk=JSON.stringify([v.sourceId,v.materialRevision,v.paragraphId]);if(!paragraphKeys.has(pk)){paragraphKeys.add(pk);paragraphs.push({sourceId:v.sourceId,materialRevision:v.materialRevision,paragraphId:v.paragraphId,text:sources.find(s=>s.id===v.sourceId&&s.revision===v.materialRevision)!.paragraphs.find(p=>p.id===v.paragraphId)!.text});}
  }
  return {claim:{id:c.candidate.id,text:c.candidate.text,kind:c.candidate.kind,reasoning:c.candidate.reasoning},citationIds};
 });
 return {eligible,citations,paragraphs};
}
export function withDerivedRisk(challenge:VerifiedChallenge['challenge'],claims:VerifiedClaim[]):VerifiedChallenge{return {challenge:structuredClone(challenge),claims,evidence_citations:deriveEvidenceCitations(claims)};}
export function withDerivedRebuttal(rebuttal:VerifiedRebuttal['rebuttal'],claims:VerifiedClaim[]):VerifiedRebuttal{return {rebuttal:structuredClone(rebuttal),claims,evidence_citations:deriveEvidenceCitations(claims)};}
export function isVerifiedRisk(f:VerifiedChallenge):boolean{return f.claims.some(c=>c.candidate.kind==='inference'&&c.classification==='inference');}
export function assertExecutionEvolution(old:AuditExecution|undefined,next:AuditExecution|undefined):void{
 if(!old)return;if(!next)throw new SchemaError('执行历史不能删除。');
 for(const stage of MODEL_STAGES){const a=old.checkpoints[stage],b=next.checkpoints[stage];if(!a)continue;if(!b||!isDeepStrictEqual(a.inputSnapshot,b.inputSnapshot)||b.attempts.length<a.attempts.length||!isDeepStrictEqual(a.attempts,b.attempts.slice(0,a.attempts.length))||(a.sealed&&!isDeepStrictEqual(a,b)))throw new SchemaError('已保存阶段/尝试不可覆盖。');}
 if(!isDeepStrictEqual(old.integrity,next.integrity.slice(0,old.integrity.length)))throw new SchemaError('引用失败历史不可覆盖。');
 for(const key of ['findings','rebuttals','report','markdown'] as const)if(old[key]!==null&&!isDeepStrictEqual(old[key],next[key]))throw new SchemaError('已核验记录或报告不可覆盖。');
}
export function validateExecution(audit:AuditRun):void{
 const e=audit.execution;if(!e)return;
 const id=txt(200),code={type:['string','null'],maxLength:200} as JsonSchema,anyJson={};
 const checkpoint=obj({inputSnapshot:anyJson,attempts:arr(obj({callId:id,inputHash:txt(64),inputSnapshot:anyJson,output:anyJson,errorCode:code},['callId','inputHash','output','errorCode']),2),output:anyJson,sealed:{type:'boolean'},skipped:{type:'boolean'}});
 const citation=obj({sourceId:id,materialRevision:id,paragraphId:{type:'integer',minimum:1},quote:txt(220,3)});
 assertJsonSchema(obj({checkpoints:obj(Object.fromEntries(MODEL_STAGES.map(s=>[s,checkpoint])),[]),integrity:arr(obj({stage:en('red_challenge','blue_rebuttal'),callId:id,failures:arr(obj({claimId:id,candidate:citation,reason:txt(2000)}),96)}),4),findings:anyJson,rebuttals:anyJson,report:anyJson,markdown:{type:['string','null']},lastError:{anyOf:[{type:'null'},obj({code:id,stage:{type:['string','null'],enum:[null,...MODEL_STAGES]},at:txt(100),estimatedInputTokens:{type:'integer',minimum:0},budgetLimit:{type:'integer',minimum:1}},['code','stage','at'])]},needsManualRecovery:{type:'boolean'}}),e);
 for(const stage of MODEL_STAGES){const cp=e.checkpoints[stage];if(!cp)continue;JSON.stringify(cp.inputSnapshot);
  if(cp.skipped&&(!cp.sealed||cp.attempts.length||cp.output!==null))throw new SchemaError('跳过阶段不能伪造调用或输出。');
  for(const at of cp.attempts){const call=audit.ledger.calls.find(c=>c.id===at.callId);if(!call||call.stage!==stage||call.status==='pending')throw new SchemaError('检查点调用关联无效。');if(at.output!==null)parseStageOutput(stage,at.output,audit);}
  const settled=audit.ledger.calls.filter(c=>c.stage===stage&&c.status!=='pending');
  if(!isDeepStrictEqual(cp.attempts.map(t=>t.callId),settled.map(c=>c.id)))throw new SchemaError('阶段尝试与调用账本不一致。');
  if(cp.output!==null){parseStageOutput(stage,cp.output,audit);const accepted=cp.attempts.filter(t=>t.output!==null&&t.errorCode===null).at(-1)?.output;if(!isDeepStrictEqual(cp.output,accepted))throw new SchemaError('阶段输出未关联合法尝试。');}
 }
 const selected=audit.sources.filter(s=>audit.selection.selectedSourceIds.includes(s.id));
 for(const finding of [...(e.findings??[]),...(e.rebuttals??[])]){
  const original='challenge'in finding?finding.challenge:finding.rebuttal;
  if('challenge'in finding)parseRedChallenges({challenges:[original]},audit.configSnapshot);else parseBlueRebuttals({rebuttals:[original]},audit.configSnapshot);
  const checked=checkClaims(original.claims,selected,audit);
  for(const claim of finding.claims){const base=checked.find(c=>c.candidate.id===claim.candidate.id);if(!base||!isDeepStrictEqual(base.citationChecks,claim.citationChecks)||!isDeepStrictEqual(base.candidate,claim.candidate))throw new SchemaError('Claim证据记录不匹配。');const expected=applyReviews([base],claim.semanticReview?[claim.semanticReview]:[])[0];if(!isDeepStrictEqual(expected,claim))throw new SchemaError('Claim分类不符合服务端规则。');}
  if(new Set(finding.claims.map(c=>c.candidate.id)).size!==finding.claims.length)throw new SchemaError('核验Claim ID重复。');
  if(finding.claims.length!==checked.length||!isDeepStrictEqual(finding.evidence_citations,deriveEvidenceCitations(finding.claims)))throw new SchemaError('派生证据不一致。');
 }
 if(e.findings!==null){const red=e.checkpoints.red_challenge?.output as {challenges:unknown[]}|null;if(!red||!isDeepStrictEqual(red.challenges,e.findings.map(f=>f.challenge)))throw new SchemaError('原始Red记录被修改。');const reviews=(e.checkpoints.red_verifier?.output as {reviews:import('../src/shared/gtm.js').SemanticReview[]}|null)?.reviews??[];const expected=(red.challenges as import('../src/shared/gtm.js').RedChallenge[]).map(c=>withDerivedRisk(c,applyReviews(checkClaims(c.claims,selected,audit),reviews)));if(!isDeepStrictEqual(expected,e.findings))throw new SchemaError('原始Verifier记录不匹配。');}
 if(e.rebuttals!==null){const cp=e.checkpoints.blue_rebuttal;const raw=cp?.skipped?[]:(cp?.output as {rebuttals:unknown[]}|null)?.rebuttals;if(!isDeepStrictEqual(raw,e.rebuttals.map(f=>f.rebuttal)))throw new SchemaError('原始抗辩记录被修改。');const reviews=(e.checkpoints.rebuttal_verifier?.output as {reviews:import('../src/shared/gtm.js').SemanticReview[]}|null)?.reviews??[];const expected=(raw as import('../src/shared/gtm.js').BlueRebuttal[]).map(c=>withDerivedRebuttal(c,applyReviews(checkClaims(c.claims,selected,audit),reviews)));if(!isDeepStrictEqual(expected,e.rebuttals))throw new SchemaError('抗辩Verifier记录不匹配。');}
 if(e.report!==null&&(!isDeepStrictEqual(e.report,assembleAuditReport(audit))||e.markdown!==auditReportMarkdown(e.report)))throw new SchemaError('报告必须由确定性代码生成。');
 if(e.report===null&&e.markdown!==null)throw new SchemaError('无结构报告不能保存Markdown。');
 if(e.report!==null&&audit.state.phase!=='convergence')throw new SchemaError('未收敛不能保存报告。');
}
