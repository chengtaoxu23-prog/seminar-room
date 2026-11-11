/** Reproducible offline demo. This file has no HTTP provider or credential access. */
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {AuditRepository,createAuditDraft} from '../server/gtm-repository.js';import {GtmAuditEngine} from '../server/gtm-engine.js';import {createSource} from '../server/gtm-sources.js';import type {GtmProvider,GtmRequest} from '../server/gtm-provider.js';
const destination=process.argv[2];if(!destination)throw Error('Usage: node --import tsx scripts/gtm-mock-demo.ts <output-directory>');
const dir=await mkdtemp(path.join(os.tmpdir(),'gtm-mock-demo-'));let calls=0;
try{
 const source=createSource({id:'synthetic-source',title:'合成材料，非真实市场研究',sourceType:'pasted_text',accessedAt:'2026-11-10',rawContent:'This synthetic sample covers five interviews. It does not establish willingness to pay.\n\nNo CAC or LTV data is provided.'});
 const proposal={target_market:null,target_customer:null,value_prop:'Mock演示：识别待验证的需求假设',pricing_model:null,gtm_channels:[],key_assumptions:['需验证付费需求'],unknowns:['CAC unknown','LTV unknown']};
 const cite={sourceId:source.id,materialRevision:source.revision,paragraphId:1,quote:'This synthetic sample covers five interviews.'};
 const provider:GtmProvider={configuredModel:'MOCK-synthetic-only',async complete(req:GtmRequest){calls++;const input=JSON.parse(req.messages[1].content).untrustedData;let data:unknown;
  if(req.stage==='blue_proposal')data=proposal;
  else if(req.stage==='red_challenge')data={challenges:[{id:'sample-risk',risk_type:'market',description:'合成示例：付费需求尚未验证',reasoning:'访谈样本不能证明可持续付费',assumptions:[],proposed_validation:['设计独立支付意愿访谈'],severity:'medium',claims:[{id:'sample-red-claim',text:'当前材料不足以证明规模化需求',kind:'inference',reasoning:'合成样本范围有限',citations:[cite]}]}]};
  else if(req.stage==='blue_rebuttal')data={rebuttals:[{challengeId:'sample-risk',response:'unresolved',reasoning:'继续调查；这不构成客观商业结论',claims:[]}]};
  else data={reviews:input.expectedIds.map((claimId:string)=>({claimId,relation:'supported',directlyStated:false,reasoning:'Mock固定回复，用于检验协议而非真实商业判断'}))};
  return {content:JSON.stringify(data),finishReason:'stop',returnedModel:'MOCK-fixed-response',usage:{promptTokens:null,completionTokens:null,totalTokens:null},httpStatus:200};
 }};
 const repo=new AuditRepository(dir),engine=new GtmAuditEngine(repo,provider);await engine.init();const draft=await repo.save(createAuditDraft({projectName:'Mock合成演示',businessBrief:'这是Mock测试材料，不是真实商业研究。探索海外GTM，CAC/LTV未知。'},[source],[source.id]),null);const audit=await engine.start(draft.id);
 if(audit.state.lifecycle!=='completed')throw Error('Mock audit failed: '+audit.execution?.lastError?.code);
 await mkdir(destination,{recursive:true});await writeFile(path.join(destination,'MOCK-audit-report.md'),'**Mock Provider 演示 · 合成材料 · 不能作为真实商业审计结论。**\n\n'+audit.execution!.markdown,{encoding:'utf8',flag:'wx'});await writeFile(path.join(destination,'MOCK-audit-run.json'),JSON.stringify(audit,null,2)+'\n',{encoding:'utf8',flag:'wx'});await writeFile(path.join(destination,'MOCK-run-summary.json'),JSON.stringify({mode:'mock',realApiCalls:0,requests:calls,status:audit.state.lifecycle,usage:audit.ledger.usage},null,2)+'\n',{encoding:'utf8',flag:'wx'});process.stdout.write(JSON.stringify({mode:'mock',requests:calls,status:audit.state.lifecycle,output:path.resolve(destination)})+'\n');
}finally{if(path.dirname(dir)!==os.tmpdir()||!path.basename(dir).startsWith('gtm-mock-demo-'))throw Error('Unsafe temporary directory');await rm(dir,{recursive:true,force:true});}
