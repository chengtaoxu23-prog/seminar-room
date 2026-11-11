import express,{type Request,type Response,type NextFunction} from 'express';
import {randomUUID} from 'node:crypto';
import type {AuditRun,GtmConfig,HumanReview} from '../src/shared/gtm.js';
import {AuditRepository,createAuditDraft} from './gtm-repository.js';
import {GtmAuditEngine} from './gtm-engine.js';
import {createGtmConfig} from './gtm-config.js';
import {createSource,unicodeLength} from './gtm-sources.js';
import {assessSourceSelection,estimateRequestTokens} from './gtm-budget.js';
import {buildGtmRequest} from './gtm-prompts.js';
import type {RuntimeProvider,ProviderIdentity} from './gtm-runtime.js';
import {createGtmMockProvider} from './gtm-mock.js';
import {SchemaError} from './validation.js';
import {assertJsonSchema,objectSchema,textSchema,enumSchema,arraySchema} from './gtm-schema.js';
class ApiFailure extends Error{constructor(readonly status:number,readonly code:string,message:string){super(message);}}
const draft=(a:AuditRun)=>{if(a.state.lifecycle!=='draft')throw new ApiFailure(409,'materials_frozen','材料与来源选择已冻结；请创建新的 Audit。');};
export function createGtmApp(repository=new AuditRepository(),configuration:GtmConfig=createGtmConfig(),delayMs=120,runtime?:RuntimeProvider){
 const identity:ProviderIdentity=runtime?{mode:runtime.mode,model:runtime.model}:{mode:'mock',model:'MOCK-synthetic-only'};
 const identityFor=(a:AuditRun):ProviderIdentity=>a.providerSnapshot??{mode:'mock',model:a.ledger.calls[0]?.configuredModel??'MOCK-synthetic-only'};
 const engine=new GtmAuditEngine(repository,runtime?.provider??createGtmMockProvider(delayMs));
 const app=express();app.disable('x-powered-by');app.use(express.json({limit:'2mb'}));
 app.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');next();});
 const route=(fn:(req:Request,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{fn(req,res).catch(next);};
 const load=async(id:string)=>(await repository.load(id)).audit;
 const estimate=(a:AuditRun)=>estimateRequestTokens(buildGtmRequest('blue_proposal',JSON.parse(JSON.stringify({context:a.context,sources:a.sources.filter(s=>a.selection.selectedSourceIds.includes(s.id)).map(s=>({id:s.id,revision:s.revision,title:s.title,paragraphs:s.paragraphs.map(p=>({id:p.id,text:p.text}))}))})),a),a.configSnapshot);
 const view=async(id:string)=>{const v=await engine.view(id),a=v.audit;const firstRequestEstimate=estimate(a);return {...v,mode:identityFor(a).mode==='mock'?'MOCK DEMO':'REAL PROVIDER',provider:identityFor(a),firstRequestEstimate,storedChars:a.sources.reduce((n,s)=>n+unicodeLength(s.rawContent),0),overLimitReason:v.overLimitReason??(firstRequestEstimate>a.configSnapshot.capacity.requestEstimatedInputTokens?'完整请求估算超过配置预算，原文未截断。':null)};};
 const empty=(req:Request)=>assertJsonSchema(objectSchema({}),req.body??{});
 app.use('/api/gtm',(req,_res,next)=>{try{if(Object.keys(req.query).some(k=>!(req.path.endsWith('/report')&&k==='format')))throw new ApiFailure(400,'invalid_query','不支持此查询参数。');next();}catch(e){next(e);}});
 app.get('/api/gtm/config',route(async(_req,res)=>{res.json({mode:identity.mode==='mock'?'MOCK DEMO':'REAL PROVIDER',provider:identity,config:configuration});}));
 app.get('/api/gtm/audits',route(async(_req,res)=>{const records=await Promise.all((await repository.ids()).map(async id=>{const a=await load(id);return {id,name:a.context.projectName??a.context.businessBrief.slice(0,40),state:a.state,updatedAt:a.updatedAt,hasReport:!!a.execution?.report};}));res.json(records.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));}));
 app.post('/api/gtm/audits',route(async(req,res)=>{const draft=createAuditDraft(req.body,[],[],configuration);draft.providerSnapshot=structuredClone(identity);const a=await repository.save(draft,null);res.status(201).json(await view(a.id));}));
 app.get('/api/gtm/audits/:id',route(async(req,res)=>{res.json(await view(req.params.id));}));
 app.post('/api/gtm/audits/:id/materials',route(async(req,res)=>{
  const a=await repository.update(req.params.id,a=>{draft(a);const source=createSource({...req.body,id:randomUUID(),accessedAt:new Date().toISOString()},a.configSnapshot);a.sources.push(source);a.selection=assessSourceSelection(a.sources,a.selection.selectedSourceIds,a.configSnapshot);});res.status(201).json(await view(a.id));
 }));
 app.delete('/api/gtm/audits/:id/materials/:sourceId',route(async(req,res)=>{
  empty(req);await repository.update(req.params.id,a=>{draft(a);if(!a.sources.some(s=>s.id===req.params.sourceId))throw new ApiFailure(404,'source_not_found','来源不存在。');a.sources=a.sources.filter(s=>s.id!==req.params.sourceId);a.selection=assessSourceSelection(a.sources,a.selection.selectedSourceIds.filter(id=>id!==req.params.sourceId),a.configSnapshot);});res.json(await view(req.params.id));
 }));
 app.put('/api/gtm/audits/:id/selection',route(async(req,res)=>{
  await repository.update(req.params.id,a=>{draft(a);assertJsonSchema(objectSchema({selectedSourceIds:arraySchema(textSchema(a.configSnapshot.text.id),a.configSnapshot.capacity.maxSources)}),req.body);a.selection=assessSourceSelection(a.sources,req.body.selectedSourceIds,a.configSnapshot);});res.json(await view(req.params.id));
 }));
 app.post('/api/gtm/audits/:id/start',route(async(req,res)=>{
  const a=await load(req.params.id);if(identity.mode==='real'){assertJsonSchema(objectSchema({consentToSend:{type:'boolean',enum:[true]}}),req.body);}else empty(req);if(identityFor(a).mode!==identity.mode||identityFor(a).model!==identity.model)throw new ApiFailure(409,'provider_mismatch','审计绑定的 Provider 与当前配置不一致，请创建新的审计。');if(a.state.lifecycle!=='draft')throw new ApiFailure(409,'already_started','该审计已经启动，不能重复启动；请查看现有结果。');const v=await view(a.id);if(v.overLimitReason)throw new ApiFailure(422,'budget_exceeded',v.overLimitReason);
  // Existing repository serializes this transition; engine launch reuses the existing running map.
  await engine.start(a.id,true);res.status(202).json(await view(a.id));
 }));
 app.post('/api/gtm/audits/:id/cancel',route(async(req,res)=>{
  empty(req);await repository.update(req.params.id,a=>{if(a.state.lifecycle!=='running')throw new ApiFailure(409,'not_running','只有运行中的审计可以取消。');});await engine.cancel(req.params.id);res.json(await view(req.params.id));
 }));
 app.put('/api/gtm/audits/:id/reviews/:challengeId',route(async(req,res)=>{
  await repository.update(req.params.id,a=>{assertJsonSchema(objectSchema({decision:enumSchema('include','further_research','not_applicable'),note:textSchema(a.configSnapshot.text.note,0)}),req.body);if(!a.execution?.findings?.some(f=>f.challenge.id===req.params.challengeId))throw new ApiFailure(404,'challenge_not_found','质询尚未生成或不存在。');const review:HumanReview={challengeId:req.params.challengeId,decision:req.body.decision,note:req.body.note,reviewedAt:new Date().toISOString()};a.humanReviews=[...(a.humanReviews??[]).filter(r=>r.challengeId!==review.challengeId),review];});res.json(await view(req.params.id));
 }));
 app.get('/api/gtm/audits/:id/report',route(async(req,res)=>{
  const a=await load(req.params.id);if(!a.execution?.report)throw new ApiFailure(409,'report_not_ready','报告尚未生成。');
  const labels={include:'接受',further_research:'需进一步研究',not_applicable:'不适用'};
  const escape=(s:string)=>s.replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]!)).replace(/[\\`*_[\]{}#!|]/g,'\\$&');
  const info=identityFor(a);const markdown=(info.mode==='mock'?'**MOCK DEMO · 固定合成演示输出，不构成真实商业审计结论。**':'**REAL PROVIDER · AI 生成的审计初稿，需要人工复核。**')+'\n\n模型：'+escape(info.model)+'\n\n'+a.execution.markdown+'\n## 人工审查记录（独立于机器结果）\n\n'+((a.humanReviews??[]).map(r=>`- ${escape(r.challengeId)}：${labels[r.decision]}；备注：${escape(r.note)||'未提供'}；${r.reviewedAt}`).join('\n')||'未提供')+'\n';
  if(req.query.format!==undefined&&req.query.format!=='md')throw new ApiFailure(400,'invalid_format','仅支持 Markdown。');
  if(req.query.format==='md'){res.setHeader('Content-Disposition',`attachment; filename="audit-${a.id}.md"`);res.type('text/markdown').send(markdown);}else res.json({report:a.execution.report,humanReviews:a.humanReviews??[],markdown});
 }));
 app.use('/api/gtm',(_req,res)=>res.status(404).json({code:'not_found',error:'接口不存在。'}));
 app.use((error:unknown,_req:Request,res:Response,_next:NextFunction)=>{
  const e=error as NodeJS.ErrnoException;const status=error instanceof ApiFailure?error.status:error instanceof SchemaError||error instanceof SyntaxError?400:(e as Error).message==='already_started'?409:e.code==='ENOENT'?404:500;
  res.status(status).json({code:error instanceof ApiFailure?error.code:status===400?'invalid_input':status===404?'not_found':'request_failed',error:(e as Error).message==='already_started'?'该审计已经启动，不能重复启动。':error instanceof ApiFailure||error instanceof SchemaError?e.message:status===404?'审计不存在。':'请求失败；请检查审计状态或本地存储。'});
 });
 return {app,engine,repository,view,init:()=>engine.init()};
}
