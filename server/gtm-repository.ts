import { constants, promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { AuditRun, BusinessContext, SourceSnapshot, GtmConfig, AuditCallRecord } from '../src/shared/gtm.js';
import { createGtmConfig, DEFAULT_GTM_CONFIG, validateGtmConfig } from './gtm-config.js';
import { assertJsonSchema, objectSchema, textSchema, arraySchema, enumSchema, parseBusinessContext, createGtmSchemas, type JsonSchema } from './gtm-schema.js';
import { validateSourceSet } from './gtm-sources.js';
import { assessSourceSelection, emptyRequestLedger, validateRequestLedger, reserveRequest, settleRequest, type ReservationInput, type CallOutcome } from './gtm-budget.js';
import { initialAuditState, validateAuditState, assertAuditStateChange, requestStageForState } from './gtm-state.js';
import {validateExecution,assertExecutionEvolution} from './gtm-execution.js';
import { SchemaError } from './validation.js';
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const chains=new Map<string,Promise<void>>();
const activeTemps=new Set<string>();
export class AuditConflictError extends Error { constructor(){super('审计版本已变化，请重新读取。');this.name='AuditConflictError';} }
export class AuditRecoveryRequiredError extends Error { constructor(){super('主记录不可用，已提供上一版本只读副本；需人工检查恢复，不能继续调用或覆盖原文件。');this.name='AuditRecoveryRequiredError';} }
export class AuditStorageError extends Error { constructor(){super('审计主记录与备份均不可读取或不合法；原文件已保留。');this.name='AuditStorageError';} }
export interface AuditLoadResult { audit:AuditRun; recovery:'none'|'previous_backup' }
export function createAuditDraft(context:BusinessContext,sources:SourceSnapshot[]=[],selectedSourceIds:string[]=[],config:GtmConfig=createGtmConfig()):AuditRun{
  validateGtmConfig(config);parseBusinessContext(context,config);validateSourceSet(sources,config);
  const at=new Date().toISOString();
  return {schemaVersion:'gtm-audit-v1',id:randomUUID(),recordRevision:0,createdAt:at,updatedAt:at,configSnapshot:structuredClone(config),context:structuredClone(context),sources:structuredClone(sources),selection:assessSourceSelection(sources,selectedSourceIds,config),state:initialAuditState(),ledger:emptyRequestLedger()};
}
export function auditRecordSchema(config:GtmConfig=DEFAULT_GTM_CONFIG):JsonSchema{
  const s=createGtmSchemas(config),id=textSchema(config.text.id),str=textSchema(config.text.short);
  const source=objectSchema({...s.source.properties!,revision:id,paragraphSegmentationVersion:enumSchema('paragraph-v1'),paragraphs:arraySchema(objectSchema({id:{type:'integer',minimum:1},text:textSchema(config.capacity.maxSourceChars),chars:{type:'integer',minimum:1}}),config.capacity.maxSourceChars)},[...s.source.required!,'revision','paragraphSegmentationVersion','paragraphs']);
  const number:JsonSchema={type:'integer',minimum:0};
  return objectSchema({schemaVersion:enumSchema('gtm-audit-v1'),id,recordRevision:number,createdAt:str,updatedAt:str,configSnapshot:{type:'object'},context:s.context,sources:arraySchema(source,config.capacity.maxSources),selection:objectSchema({selectedSourceIds:arraySchema(id,config.capacity.maxSources),sources:arraySchema(objectSchema({sourceId:id,title:str,originalChars:number,estimatedTokens:number,selected:{type:'boolean'}}),config.capacity.maxSources),selectedChars:number,estimatedMaterialTokens:number,estimatorVersion:enumSchema(config.estimator.version),estimateOnly:{type:'boolean',enum:[true]},withinBudget:{type:'boolean'},overBudgetSourceIds:arraySchema(id,config.capacity.maxSources)}),state:objectSchema({lifecycle:enumSchema('draft','running','paused','failed','cancelled','completed'),phase:enumSchema('blue_proposal','red_challenge','verifier','blue_rebuttal','convergence'),substate:str}),ledger:{type:'object'},execution:{type:'object'},humanReviews:{type:'array'},providerSnapshot:objectSchema({mode:enumSchema('mock','real'),model:textSchema(200)})},['schemaVersion','id','recordRevision','createdAt','updatedAt','configSnapshot','context','sources','selection','state','ledger']);
}
export function validateAuditRun(value:unknown):asserts value is AuditRun{
  if(!value||typeof value!=='object'||!('configSnapshot'in value))throw new SchemaError('审计记录缺少配置快照。');
  const record=value as AuditRun;validateGtmConfig(record.configSnapshot);assertJsonSchema(auditRecordSchema(record.configSnapshot),record);
  if(record.humanReviews!==undefined){
    assertJsonSchema(arraySchema(objectSchema({challengeId:textSchema(record.configSnapshot.text.id),decision:enumSchema('include','further_research','not_applicable'),note:textSchema(record.configSnapshot.text.note,0),reviewedAt:textSchema(100)}),record.configSnapshot.structure.maxRisks),record.humanReviews);
    if(new Set(record.humanReviews.map(r=>r.challengeId)).size!==record.humanReviews.length||record.humanReviews.some(r=>!Number.isFinite(Date.parse(r.reviewedAt))||!record.execution?.findings?.some(f=>f.challenge.id===r.challengeId)))throw new SchemaError('人工审查目标或日期无效。');
  }
  if(!ID.test(record.id)||!Number.isFinite(Date.parse(record.createdAt))||!Number.isFinite(Date.parse(record.updatedAt))||Date.parse(record.updatedAt)<Date.parse(record.createdAt))throw new SchemaError('审计ID或时间无效。');
  validateExecution(record);
  validateSourceSet(record.sources,record.configSnapshot);validateAuditState(record.state);validateRequestLedger(record.ledger,record.configSnapshot);
  if(!isDeepStrictEqual(record.selection,assessSourceSelection(record.sources,record.selection.selectedSourceIds,record.configSnapshot)))throw new SchemaError('来源预算或范围快照不一致。');
  if(record.state.lifecycle!=='draft'&&!record.selection.withinBudget)throw new SchemaError('选定完整来源超出估算预算，请取消部分来源或重新整理独立材料。');
  if(record.state.lifecycle==='draft'&&record.ledger.calls.length)throw new SchemaError('草稿不能包含已发出调用。');
}
function assertLedgerEvolution(previous:AuditRun,next:AuditRun):void{
  const before=previous.ledger.calls,after=next.ledger.calls;
  if(after.length<before.length||after.length>before.length+1)throw new SchemaError('调用账本只允许逐次追加，不允许删减。');
  const mutable=['status','returnedModel','finishedAt','durationMs','httpStatus','usage','finishReason','schemaValid','errorCode'];
  for(let i=0;i<before.length;i++){
    const a=before[i],b=after[i];
    if(a.status!=='pending'){if(!isDeepStrictEqual(a,b))throw new SchemaError('已完成调用不可修改。');}
    else{
      const base=(call:AuditCallRecord)=>Object.fromEntries(Object.entries(call).filter(([key])=>!mutable.includes(key)));
      if(!isDeepStrictEqual(base(a),base(b)))throw new SchemaError('在途调用身份和预算不可修改。');
    }
  }
  if(after.length>before.length){
    const added=after.at(-1)!;
    if(added.status!=='pending'||requestStageForState(previous.state)!==added.stage||!isDeepStrictEqual(previous.state,next.state))throw new SchemaError('只能在合法运行子状态预登记一次请求。');
  }
  if(before.some(c=>c.status==='pending')&&next.state.lifecycle==='running'&&!isDeepStrictEqual(previous.state,next.state))throw new SchemaError('在途调用未结算，不能推进阶段。');
}
/** Single-process, single-user repository. Does not start an engine on load. */
export class AuditRepository {
  readonly dir:string;
  private readonly renameFile:typeof fs.rename;
  private readonly copyFile:typeof fs.copyFile;
  private readonly writeFile:(handle:import('node:fs/promises').FileHandle,payload:string)=>Promise<void>;
  constructor(dir=path.resolve('data','audits'),options:{rename?:typeof fs.rename;copyFile?:typeof fs.copyFile;writeFile?:(handle:import('node:fs/promises').FileHandle,payload:string)=>Promise<void>}={}){
    this.dir=path.resolve(dir);this.renameFile=options.rename??fs.rename;this.copyFile=options.copyFile??fs.copyFile;this.writeFile=options.writeFile??(async(h,p)=>h.writeFile(p,'utf8'));
    if(path.basename(this.dir).toLowerCase()==='sessions')throw new SchemaError('GTM存储不能使用旧sessions目录。');
  }
  private file(id:string):string{if(!ID.test(id))throw new SchemaError('无效审计ID。');return path.join(this.dir,`${id}.json`);}
  async init():Promise<void>{
    await fs.mkdir(this.dir,{recursive:true});
    for(const name of await fs.readdir(this.dir)){
      if(!/^\.[0-9a-f-]{36}\.json(?:\.bak)?\.[0-9a-f-]{36}\.tmp$/i.test(name))continue;
      const file=path.resolve(this.dir,name);
      if(path.dirname(file)===this.dir&&!activeTemps.has(file)&&(await fs.lstat(file)).isFile())await fs.unlink(file);
    }
  }
  async ids():Promise<string[]>{return (await fs.readdir(this.dir)).filter(name=>name.endsWith('.json')&&ID.test(name.slice(0,-5))).map(name=>name.slice(0,-5));}
  private async loadUnlocked(id:string):Promise<AuditLoadResult>{
    const file=this.file(id);
    try{const audit:unknown=JSON.parse(await fs.readFile(file,'utf8'));validateAuditRun(audit);if(audit.id!==id)throw new SchemaError('审计文件名与内部ID不匹配。');return {audit,recovery:'none'};}
    catch(primary){
      if((primary as NodeJS.ErrnoException).code && (primary as NodeJS.ErrnoException).code!=='ENOENT')throw primary;
      try{const audit:unknown=JSON.parse(await fs.readFile(`${file}.bak`,'utf8'));validateAuditRun(audit);if(audit.id!==id)throw new SchemaError('备份文件名与内部ID不匹配。');return {audit,recovery:'previous_backup'};}
      catch(backup){
        if((primary as NodeJS.ErrnoException).code==='ENOENT'&&(backup as NodeJS.ErrnoException).code==='ENOENT')throw primary;
        throw new AuditStorageError();
      }
    }
  }
  async load(id:string):Promise<AuditLoadResult>{return this.serial(id,()=>this.loadUnlocked(id));}
  private serial<T>(id:string,work:()=>Promise<T>):Promise<T>{
    const key=this.file(id),previous=chains.get(key)??Promise.resolve();
    const operation=previous.catch(()=>undefined).then(work),barrier=operation.then(()=>undefined,()=>undefined);chains.set(key,barrier);
    return operation.finally(()=>{if(chains.get(key)===barrier)chains.delete(key);});
  }
  private temporary(file:string):string{
    const temp=path.join(this.dir,`.${path.basename(file)}.${randomUUID()}.tmp`);activeTemps.add(temp);return temp;
  }
  private async discard(temp:string):Promise<void>{
    activeTemps.delete(temp);await fs.unlink(temp).catch(e=>{if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;});
  }
  private async prepare(file:string,payload:string):Promise<string>{
    const temp=this.temporary(file);
    try{const handle=await fs.open(temp,'wx',0o600);try{await this.writeFile(handle,payload);await handle.sync();}finally{await handle.close();}return temp;}
    catch(error){await this.discard(temp);throw error;}
  }
  private async commitFile(file:string,payload:string,hasPrevious:boolean):Promise<void>{
    // Current primary remains readable through both replacements. Never unlink/move it first.
    const primaryTemp=await this.prepare(file,payload);let backupTemp:string|null=null;
    try{
      if(hasPrevious){
        backupTemp=this.temporary(`${file}.bak`);
        await this.copyFile(file,backupTemp,constants.COPYFILE_EXCL);
        const handle=await fs.open(backupTemp,'r+');try{await handle.sync();}finally{await handle.close();}
        await this.renameFile(backupTemp,`${file}.bak`);
      }
      await this.renameFile(primaryTemp,file);
    }finally{await this.discard(primaryTemp);if(backupTemp)await this.discard(backupTemp);}
  }  private async saveUnlocked(record:AuditRun,expectedRevision:number|null):Promise<AuditRun>{
    validateAuditRun(record);
    let current:AuditLoadResult|null=null;
    try{current=await this.loadUnlocked(record.id);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    if(current?.recovery==='previous_backup')throw new AuditRecoveryRequiredError();
    if(current){
      const old=current.audit;
      if(expectedRevision!==old.recordRevision||record.recordRevision!==old.recordRevision)throw new AuditConflictError();
      if(record.id!==old.id||record.createdAt!==old.createdAt||!isDeepStrictEqual(record.configSnapshot,old.configSnapshot)||!isDeepStrictEqual(record.providerSnapshot,old.providerSnapshot))throw new SchemaError('审计身份、创建时间和配置快照不可覆盖。');
      if(old.state.lifecycle!=='draft'&&(!isDeepStrictEqual(record.context,old.context)||!isDeepStrictEqual(record.sources,old.sources)||!isDeepStrictEqual(record.selection,old.selection)))throw new SchemaError('已开始审计的业务输入和来源版本不可改写。');
      assertAuditStateChange(old.state,record.state);assertLedgerEvolution(old,record);assertExecutionEvolution(old.execution,record.execution);
    }else if(expectedRevision!==null||record.recordRevision!==0||record.state.lifecycle!=='draft'||record.ledger.calls.length)throw new AuditConflictError();
    const saved={...structuredClone(record),recordRevision:(current?.audit.recordRevision??0)+1,updatedAt:new Date().toISOString()};
    validateAuditRun(saved);await this.init();
    await this.commitFile(this.file(record.id),`${JSON.stringify(saved,null,2)}\n`,current!==null);
    return structuredClone(saved);
  }
  save(record:AuditRun,expectedRevision:number|null):Promise<AuditRun>{
    const snapshot=structuredClone(record);return this.serial(record.id,()=>this.saveUnlocked(snapshot,expectedRevision));
  }
  reserve(id:string,expectedRevision:number,input:ReservationInput):Promise<{audit:AuditRun;call:AuditCallRecord;isNew:boolean}>{
    const snapshot=structuredClone(input);
    return this.serial(id,async()=>{
      const loaded=await this.loadUnlocked(id);if(loaded.recovery!=='none')throw new AuditRecoveryRequiredError();
      const audit=loaded.audit;if(audit.recordRevision!==expectedRevision)throw new AuditConflictError();
      if(requestStageForState(audit.state)!==snapshot.stage)throw new SchemaError('当前生命周期/子状态不允许该模型阶段调用。');
      const reserved=reserveRequest(audit.ledger,snapshot,audit.configSnapshot);
      if(!reserved.isNew)return {audit,call:reserved.call,isNew:false};
      audit.ledger=reserved.ledger;
      return {audit:await this.saveUnlocked(audit,expectedRevision),call:reserved.call,isNew:true};
    });
  }
  update(id:string,mutate:(audit:AuditRun)=>void):Promise<AuditRun>{
    return this.serial(id,async()=>{const loaded=await this.loadUnlocked(id);if(loaded.recovery!=='none')throw new AuditRecoveryRequiredError();const revision=loaded.audit.recordRevision;mutate(loaded.audit);return this.saveUnlocked(loaded.audit,revision);});
  }
  settle(id:string,expectedRevision:number,callId:string,outcome:CallOutcome):Promise<AuditRun>{
    const snapshot=structuredClone(outcome);
    return this.serial(id,async()=>{
      const loaded=await this.loadUnlocked(id);if(loaded.recovery!=='none')throw new AuditRecoveryRequiredError();
      if(loaded.audit.recordRevision!==expectedRevision)throw new AuditConflictError();
      loaded.audit.ledger=settleRequest(loaded.audit.ledger,callId,snapshot,loaded.audit.configSnapshot);
      return this.saveUnlocked(loaded.audit,expectedRevision);
    });
  }
}
