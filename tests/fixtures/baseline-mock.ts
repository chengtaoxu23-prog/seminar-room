import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SeminarEngine } from '../../server/seminar.js';
import { SessionStore } from '../../server/store.js';
import type { AppConfig } from '../../server/config.js';
import type { chatCompletion, LlmMessage } from '../../server/llm.js';
export const material = '第一段原文，保留课堂讨论所依据的事实与边界。\n\n第二段原文，尚没有证明任何教学方法的效果。';
export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
export async function until<T>(fn: () => Promise<T | false>, label: string): Promise<T> {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) { const value = await fn(); if (value) return value; await sleep(5); }
  throw Error(`Timed out: ${label}`);
}
export function response(value: unknown): Awaited<ReturnType<typeof chatCompletion>> {
  return { content: JSON.stringify(value), toolCalls: [], finishReason: 'stop', usage: {promptTokens: 1,completionTokens: 1,totalTokens: 2}, httpStatus:200 };
}
export function mockReply(messages: LlmMessage[]) {
  const sys=messages[0].content;
  if (sys.includes('独立总结员')) return response({consensus:['仍需试教验证。'],disagreements:[],evidence:[],unresolved:['没有真实课堂数据。']});
  if (sys.includes('你是 SeminarRoom 的主持人')) {
    const user=messages.find(m=>m.role==='user')!.content;
    const round=Number(user.match(/当前第 (\d+) 轮/)?.[1] ?? 0);
    const section=user.split('[尚未回应的用户消息]')[1]?.split('[最近讨论]')[0] ?? '';
    const pending=[...section.matchAll(/id=([0-9a-f-]{36})/g)].map(m=>m[1]);
    return response({action:'invite',participantId:round%2?'b':'a',publicMessage:'请回应材料和当前问题。',prompt:'请根据材料回应。',focus:'材料依据',addressUserMessageIds:pending,respondToMessageIds:[],reason:'检验当前证据。',endReason:null});
  }
  return response({blocks:[{type:'evidence',text:'这里只能确认材料中的原文确实存在，不能据此确认任何教学效果，也不能把这份测试材料当成真实课堂的观察结果。',citations:[{paragraphId:1,quote:'第一段原文'}]}],addresses:[],stanceUpdate:{changed:false,note:''}});
}
export async function setup(llm: typeof chatCompletion, maxRounds=2) {
  const dir=await mkdtemp(path.join(os.tmpdir(),'seminar-baseline-'));
  const cfg:AppConfig={port:0,host:'127.0.0.1',apiKey:'test-only',baseUrl:'http://127.0.0.1:9/v1',baseUrlHost:'mock.local',model:'mock-only',temperature:0,configured:true,dataDir:dir,publicDir:dir,limits:{maxRounds,maxCalls:30,maxOutputTokens:700,timeoutMs:100}};
  const store=new SessionStore(dir); const engine=new SeminarEngine(store,cfg,llm);await engine.init();
  const session=await engine.create({material,topic:'课堂方案评估'});
  await engine.updateQuestions(session.id,['怎样观察课堂？','哪些证据缺失？','如何调整下次课？']);
  return {dir,cfg,store,engine,id:session.id,async cleanup(){ await engine.waitForIdle(); await store.flush(); if(path.dirname(dir)!==os.tmpdir()||!path.basename(dir).startsWith('seminar-baseline-'))throw Error('Unsafe cleanup path'); await rm(dir,{recursive:true,force:true}); }};
}
