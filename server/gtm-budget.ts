/** Local accounting only: this module never dispatches a request. */
import { randomUUID } from 'node:crypto';
import type { AuditCallRecord, AuditUsage, RequestLedger, SourceSelection, SourceSnapshot, GtmConfig, ModelStage, RepairReason } from '../src/shared/gtm.js';
import { MODEL_STAGES } from '../src/shared/gtm.js';
import type { TokenUsage } from '../src/shared/types.js';
import { DEFAULT_GTM_CONFIG, validateGtmConfig } from './gtm-config.js';
import { validateSourceSet, unicodeLength } from './gtm-sources.js';
import { SchemaError } from './validation.js';
import { assertJsonSchema, objectSchema, textSchema, enumSchema, arraySchema, type JsonSchema } from './gtm-schema.js';
export function estimateTokens(text:string,config=DEFAULT_GTM_CONFIG):number{
  validateGtmConfig(config);let weighted=0;
  const e=config.estimator;
  if(e.version==='gtm-conservative-v1'){
    const original=Array.from(text).reduce((n,c)=>n+(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(c)?e.cjkTokensPerCodePoint:e.otherTokensPerCodePoint),0);
    return Math.ceil(original*e.safetyFactor);
  }
  for(const line of text.split(/\r?\n/u)){
    const chars=Array.from(line), dense=chars.length>0&&chars.filter(c=>/[\d\p{S}{}\[\]<>|\\/=_`]/u.test(c)).length/chars.length>=0.2;
    const risky=dense||/https?:\/\/|```|\t|\|.*\||[{}=]/u.test(line);
    for(const char of chars){
      const cjk=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(char);
      const rate=cjk?e.cjkTokensPerCodePoint:(risky||!/^[\p{Script=Latin}\p{M}\s.,'"!?():;-]$/u.test(char))?e.riskTokensPerCodePoint!:e.otherTokensPerCodePoint;
      weighted+=rate;
    }
  }
  weighted+=(text.match(/\n/g)?.length??0)*e.otherTokensPerCodePoint;
  const estimate=Math.ceil(weighted*e.safetyFactor);
  if(!Number.isSafeInteger(estimate))throw new SchemaError('Token估算超出可表示范围。');
  return estimate;
}export function estimateRequestTokens(payload:unknown,config=DEFAULT_GTM_CONFIG):number{
  validateGtmConfig(config);
  if(config.estimator.version==='gtm-conservative-v1'){
    const value=JSON.stringify(payload);if(value===undefined)throw new SchemaError('请求载荷不可序列化。');return estimateTokens(value,config)+config.estimator.requestOverheadTokens;
  }
  const structural=(n:number)=>n*config.estimator.riskTokensPerCodePoint!*config.estimator.safetyFactor;
  const walk=(value:unknown,depth=0):number=>{
    if(depth>100)throw new SchemaError('请求嵌套过深。');
    if(typeof value==='string')return estimateTokens(value,config)+structural(2+(value.match(/["\\\n\r\t]/g)?.length??0));
    if(value===null||typeof value==='boolean'||typeof value==='number')return structural(String(value).length);
    if(Array.isArray(value))return structural(2+Math.max(0,value.length-1))+value.reduce((n,item)=>n+walk(item,depth+1),0);
    if(value&&typeof value==='object'){
      const record=value as Record<string,unknown>,entries=Object.entries(record);let sum=structural(2+Math.max(0,entries.length-1));
      for(const [key,item]of entries){sum+=structural(JSON.stringify(key).length+1);
        // Only unwrap the server's structured user message. Source text is still
        // estimated as text, including its own URL/table/code risk strategy.
        if(record.role==='user'&&key==='content'&&typeof item==='string'){
          try{const decoded:unknown=JSON.parse(item);sum+=walk(decoded,depth+1)+structural(2);continue;}catch{ /* plain user text */ }
        }
        sum+=walk(item,depth+1);
      }return sum;
    }
    throw new SchemaError('请求载荷不可序列化。');
  };
  const total=Math.ceil(walk(payload))+config.estimator.requestOverheadTokens;
  if(!Number.isSafeInteger(total))throw new SchemaError('请求Token估算无效。');return total;
}
export function assessSourceSelection(sources:readonly SourceSnapshot[],ids:readonly string[],config=DEFAULT_GTM_CONFIG):SourceSelection{
  validateSourceSet(sources,config);
  if(new Set(ids).size!==ids.length||ids.some(id=>!sources.some(s=>s.id===id)))throw new SchemaError('来源选择包含重复或不存在的ID。');
  const items=sources.map(s=>({sourceId:s.id,title:s.title,originalChars:unicodeLength(s.rawContent),estimatedTokens:estimateTokens(s.rawContent,config),selected:ids.includes(s.id)}));
  const selected=items.filter(i=>i.selected), selectedChars=selected.reduce((n,s)=>n+s.originalChars,0), estimatedMaterialTokens=selected.reduce((n,s)=>n+s.estimatedTokens,0);
  const withinBudget=estimatedMaterialTokens<=config.capacity.materialEstimatedTokens;
  return {selectedSourceIds:[...ids],sources:items,selectedChars,estimatedMaterialTokens,estimatorVersion:config.estimator.version,estimateOnly:true,withinBudget,overBudgetSourceIds:withinBudget?[]:selected.map(s=>s.sourceId)};
}
export function summarizeUsage(calls:readonly AuditCallRecord[]):AuditUsage{
  const missingUsageCalls=calls.filter(c=>Object.values(c.usage).some(v=>v===null)).length;
  const anyKnown=calls.some(c=>Object.values(c.usage).some(v=>v!==null));
  return {calls:calls.length,knownPromptTokens:calls.reduce((n,c)=>n+(c.usage.promptTokens??0),0),knownCompletionTokens:calls.reduce((n,c)=>n+(c.usage.completionTokens??0),0),knownTotalTokens:calls.reduce((n,c)=>n+(c.usage.totalTokens??0),0),missingUsageCalls,availability:!anyKnown?'unavailable':missingUsageCalls?'partial':'available'};
}
export function emptyRequestLedger():RequestLedger{return {calls:[],usage:summarizeUsage([])};}
const nullableInteger:JsonSchema={type:['integer','null'],minimum:0};
const nullableText:JsonSchema={type:['string','null'],minLength:1,maxLength:500};
export function callRecordSchema(config:GtmConfig):JsonSchema{
  return objectSchema({id:textSchema(config.text.id),commandId:textSchema(config.text.id),stage:enumSchema(...MODEL_STAGES),attempt:{type:'integer',minimum:1,maximum:2},repairReason:{type:['string','null'],enum:[null,'structure','citation','truncated','transport']},configuredModel:textSchema(config.text.short),returnedModel:nullableText,startedAt:textSchema(config.text.short),finishedAt:nullableText,durationMs:nullableInteger,status:enumSchema('pending','ok','error','aborted','interrupted'),httpStatus:nullableInteger,estimatedInputTokens:{type:'integer',minimum:0},estimatorVersion:enumSchema(config.estimator.version),maxOutputTokens:{type:'integer',minimum:1},usage:objectSchema({promptTokens:nullableInteger,completionTokens:nullableInteger,totalTokens:nullableInteger}),finishReason:nullableText,schemaValid:{type:['boolean','null']},errorCode:nullableText});
}
export function validateRequestLedger(ledger:RequestLedger,config=DEFAULT_GTM_CONFIG):void{
  validateGtmConfig(config);
  assertJsonSchema(objectSchema({calls:arraySchema(callRecordSchema(config),config.requests.maxCalls),usage:objectSchema({calls:{type:'integer',minimum:0},knownPromptTokens:{type:'integer',minimum:0},knownCompletionTokens:{type:'integer',minimum:0},knownTotalTokens:{type:'integer',minimum:0},missingUsageCalls:{type:'integer',minimum:0},availability:enumSchema('available','partial','unavailable')})}),ledger);
  const stages=new Map<ModelStage,number>(),ids=new Set<string>(),commands=new Set<string>();
  let pending=0;
  for(const call of ledger.calls){
    const count=(stages.get(call.stage)??0)+1;stages.set(call.stage,count);
    if(count>config.requests.maxPerStage||call.attempt!==count||ids.has(call.id)||commands.has(call.commandId))throw new SchemaError('请求数量、尝试顺序或幂等ID无效。');
    ids.add(call.id);commands.add(call.commandId);
    if((count===1)!==(call.repairReason===null)||call.maxOutputTokens!==config.requests.outputTokens[call.stage]||call.estimatedInputTokens>config.capacity.requestEstimatedInputTokens)throw new SchemaError('修复槽或请求Token配置无效。');
    if(!Number.isFinite(Date.parse(call.startedAt)))throw new SchemaError('无效调用时间。');
    if(call.errorCode!==null&&!/^[a-z0-9_:-]{1,200}$/i.test(call.errorCode))throw new SchemaError('errorCode只能记录受控代码。');
    if(call.status==='pending'){
      pending++;
      if(call.finishedAt!==null||call.durationMs!==null||call.returnedModel!==null||call.finishReason!==null||call.httpStatus!==null||call.schemaValid!==null||call.errorCode!==null||Object.values(call.usage).some(v=>v!==null))throw new SchemaError('pending调用不能伪造完成信息。');
    }else if(call.finishedAt===null||call.durationMs===null||!Number.isFinite(Date.parse(call.finishedAt))||Date.parse(call.finishedAt)<Date.parse(call.startedAt))throw new SchemaError('完成调用必须有有效时间与时长。');
  }
  if(pending>1)throw new SchemaError('单审计不能有多个在途请求。');
  if(JSON.stringify(ledger.usage)!==JSON.stringify(summarizeUsage(ledger.calls)))throw new SchemaError('累计Token账本不一致。');
}
export interface ReservationInput { commandId:string;stage:ModelStage;configuredModel:string;estimatedInputTokens:number;repairReason?:RepairReason;startedAt?:string }
export function reserveRequest(ledger:RequestLedger,input:ReservationInput,config=DEFAULT_GTM_CONFIG):{ledger:RequestLedger;call:AuditCallRecord;isNew:boolean}{
  validateRequestLedger(ledger,config);
  const existing=ledger.calls.find(c=>c.commandId===input.commandId);
  if(existing){
    if(existing.stage!==input.stage||existing.configuredModel!==input.configuredModel||existing.estimatedInputTokens!==input.estimatedInputTokens||existing.repairReason!==(input.repairReason??null))throw new SchemaError('幂等命令不能绑定不同请求。');
    return {ledger:structuredClone(ledger),call:structuredClone(existing),isNew:false};
  }
  if(ledger.calls.some(c=>c.status==='pending'))throw new SchemaError('已有在途请求，不能重复派发。');
  const attempt=ledger.calls.filter(c=>c.stage===input.stage).length+1;
  if(ledger.calls.length>=config.requests.maxCalls||attempt>config.requests.maxPerStage)throw new SchemaError('模型请求额度已耗尽。');
  if((attempt===1)!==(input.repairReason===undefined))throw new SchemaError('初始请求与唯一共享修复槽不匹配。');
  const call:AuditCallRecord={id:randomUUID(),commandId:input.commandId,stage:input.stage,attempt:attempt as 1|2,repairReason:input.repairReason??null,configuredModel:input.configuredModel,returnedModel:null,startedAt:input.startedAt??new Date().toISOString(),finishedAt:null,durationMs:null,status:'pending',httpStatus:null,estimatedInputTokens:input.estimatedInputTokens,estimatorVersion:config.estimator.version,maxOutputTokens:config.requests.outputTokens[input.stage],usage:{promptTokens:null,completionTokens:null,totalTokens:null},finishReason:null,schemaValid:null,errorCode:null};
  const calls=[...structuredClone(ledger.calls),call],next={calls,usage:summarizeUsage(calls)};
  validateRequestLedger(next,config);
  return {ledger:next,call:structuredClone(call),isNew:true};
}
export interface CallOutcome { status:Exclude<AuditCallRecord['status'],'pending'>;returnedModel:string|null;finishedAt:string;durationMs:number;httpStatus:number|null;usage:TokenUsage;finishReason:string|null;schemaValid:boolean|null;errorCode:string|null }
export function settleRequest(ledger:RequestLedger,id:string,outcome:CallOutcome,config=DEFAULT_GTM_CONFIG):RequestLedger{
  validateRequestLedger(ledger,config);
  const properties=callRecordSchema(config).properties!;
  assertJsonSchema(objectSchema(Object.fromEntries(['status','returnedModel','finishedAt','durationMs','httpStatus','usage','finishReason','schemaValid','errorCode'].map(key=>[key,properties[key]]))),outcome);
  if(!['ok','error','aborted','interrupted'].includes(outcome.status))throw new SchemaError('结算必须是终态。');
  const index=ledger.calls.findIndex(c=>c.id===id);
  if(index<0)throw new SchemaError('调用ID不存在。');
  const previous=ledger.calls[index],updated={...previous,...outcome};
  if(previous.status!=='pending'){
    if(JSON.stringify(previous)===JSON.stringify(updated))return structuredClone(ledger);
    throw new SchemaError('终态调用记录不可覆盖。');
  }
  const calls=structuredClone(ledger.calls);calls[index]=updated;
  const result={calls,usage:summarizeUsage(calls)};validateRequestLedger(result,config);return result;
}

/** Uses the existing ledger only; already registered requests are never refunded. */
export function requestBudgetRemaining(a:import('../src/shared/gtm.js').AuditRun):number{return a.configSnapshot.requests.maxCalls-a.ledger.calls.length;}
export function rebuttalReserveRequired(a:import('../src/shared/gtm.js').AuditRun):number{return (a.configSnapshot.requests.maxPerStage-a.ledger.calls.filter(c=>c.stage==='blue_rebuttal').length)+(a.configSnapshot.requests.maxPerStage-a.ledger.calls.filter(c=>c.stage==='rebuttal_verifier').length);}
