import type {GtmProvider} from './gtm-provider.js';
/** Offline synthetic protocol demonstration. Never infers commercial facts from user material. */
export function createGtmMockProvider(delayMs=120):GtmProvider {
 return {configuredModel:'MOCK-synthetic-only',async complete(request,signal){
  await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(Error('aborted'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},delayMs);if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});});
  const input=JSON.parse(request.messages[1].content).untrustedData;
  let data:unknown;
  if(request.stage==='blue_proposal')data={target_market:null,target_customer:null,value_prop:'合成 Mock：展示证据链与证据不足，不构成市场建议',pricing_model:null,gtm_channels:[],key_assumptions:[],unknowns:['CAC 未提供','LTV 未提供']};
  else if(request.stage==='red_challenge'){
   const s=input.sources[0],p=s?.paragraphs[0];
   data={challenges:[{id:'synthetic-risk',risk_type:'market',description:'合成演示：现有材料是否足以支持进入决策仍待研究',reasoning:'固定 Mock 质询，不代表对输入商业方案的真实分析。',assumptions:[],proposed_validation:['独立研究付费需求'],severity:'medium',claims:[{id:'synthetic-claim',kind:'inference',text:'合成演示：进入决策的证据充分性未知',reasoning:'Mock 不判断实际语义。',citations:p?[{sourceId:s.id,materialRevision:s.revision,paragraphId:p.id,quote:p.text.slice(0,200)}]:[]}]}]};
  }else if(request.stage==='blue_rebuttal')data={rebuttals:input.challengeIds.map((challengeId:string)=>({challengeId,response:'unresolved',reasoning:'合成演示：没有独立支持的反驳证据，保持未解决。',claims:[]}))};
  else data={reviews:input.expectedIds.map((claimId:string)=>({claimId,relation:'insufficient_evidence',directlyStated:false,reasoning:'固定 Mock 不评估真实语义，证据不足。'}))};
  return {content:JSON.stringify(data),finishReason:'stop',returnedModel:'MOCK-synthetic-only',usage:{promptTokens:null,completionTokens:null,totalTokens:null},httpStatus:200};
 }};
}
