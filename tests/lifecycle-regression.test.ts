import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { SeminarEngine } from '../server/seminar.js';
import { SessionStore } from '../server/store.js';
import { LlmRequestError } from '../server/llm.js';
import { toJson,toMarkdown } from '../server/export.js';
import { mockReply,response,setup,sleep,until } from './fixtures/baseline-mock.js';

test('round limit, edited summary and schema-v1 disk reload agree with both exports',async()=>{
  const f=await setup(async m=>{await sleep(5);return mockReply(m);});
  try {
    await f.engine.start(f.id);
    const ended=await until(async()=>{const s=await f.engine.get(f.id);if(s.stage==='error'||s.summary.status==='error')throw Error(JSON.stringify({error:s.lastError,summary:s.summary}));return s.summary.status==='ready'&&s;},'summary');
    assert.equal(ended.stopReason,'round_limit');assert.equal(ended.round,2);
    assert.deepEqual(ended.messages.filter(m=>m.role==='participant').map(m=>m.actorId),['a','b']);
    assert.equal(ended.calls.length,5);
    const input={consensus:['人工编辑的共识'],disagreements:['保留的分歧'],unresolved:['尚未回答的问题'],evidence:[{paragraphId:1,quote:'第一段原文',note:'人工编辑说明'}]};
    await f.engine.updateSummary(f.id,input);
    const reloaded=await new SeminarEngine(new SessionStore(f.dir),f.cfg,async()=>{throw Error('reload must not call model');}).get(f.id);
    assert.equal(reloaded.schemaVersion,1);assert.deepEqual(reloaded.summary.consensus,input.consensus);
    assert.deepEqual(toJson(reloaded).session.summary,reloaded.summary);
    for(const text of [...input.consensus,...input.disagreements,...input.unresolved,input.evidence[0].note])assert.ok(toMarkdown(reloaded).includes(text));
    await assert.rejects(f.engine.addUserMessage(f.id,'结束后不能插话'),/不接受插话/);
    await assert.rejects(f.engine.updateSummary(f.id,{...input,evidence:[{paragraphId:99,quote:'伪造',note:'无效'}]}));
    assert.deepEqual((await f.store.get(f.id)).summary,reloaded.summary,'invalid edit must not replace saved summary');
  }finally{await f.cleanup();}
});

test('ending during an in-flight host aborts it and starts only the summary',async()=>{
  let entered=false;const phases:string[]=[];
  const f=await setup(async(m,o)=>{
    if(m[0].content.includes('独立总结员')){phases.push('summary');return mockReply(m);}
    phases.push('host');entered=true;
    return new Promise((_,reject)=>{const abort=()=>reject(new LlmRequestError('aborted','test abort'));if(o?.signal?.aborted)abort();else o?.signal?.addEventListener('abort',abort,{once:true});});
  });
  try{await f.engine.start(f.id);await until(async()=>entered,'host');await f.engine.end(f.id);
    const s=await until(async()=>{const s=await f.engine.get(f.id);return s.summary.status==='ready'&&s;},'summary');
    await sleep(25);assert.deepEqual(phases,['host','summary']);assert.equal(s.stopReason,'user_end');assert.ok(s.calls.some(c=>c.status==='aborted'));assert.equal(s.messages.filter(m=>m.role==='participant').length,0);
  }finally{await f.cleanup();}
});

test('malformed planner output records both attempts without creating questions',async()=>{
  const f=await setup(async()=>({ ...response({}),content:'not JSON' }));
  // Replace this fixture's manually initialized questions using a fresh draft.
  try{const draft=await f.engine.create({material:'这是足够长的独立测试材料，不依赖任何用户或真实会话。',topic:'格式错误测试'});
    await assert.rejects(f.engine.planQuestions(draft.id));const s=await f.engine.get(draft.id);
    assert.equal(s.questions.length,0);assert.equal(s.lastError?.code,'planner_error');assert.equal(s.calls.length,2);assert.equal(s.stage,'draft');
  }finally{await f.cleanup();}
});

test('BUG-R1: restart marks interrupted work without a model call',async()=>{
  const f=await setup(async m=>mockReply(m));
  try{const saved=structuredClone(await f.engine.get(f.id));saved.stage='running';await f.store.save(saved);
    let calls=0;const engine=new SeminarEngine(new SessionStore(f.dir),f.cfg,async()=>{calls++;throw Error('no network');});await engine.init();
    const reload=await engine.get(f.id);
    assert.notEqual(reload.stage,'running','restart must expose interruption/recovery status');
    assert.equal(reload.stage,'paused');assert.equal(reload.stopReason,'interrupted');assert.equal(calls,0);
    assert.deepEqual(reload.questions,saved.questions);assert.deepEqual(reload.messages,saved.messages);
    assert.equal((await f.store.get(f.id)).stopReason,'interrupted');
  }finally{await f.cleanup();}
});

test('failed host can retry, finish and persist a cleared error state',async()=>{
  let fail=true;const f=await setup(async m=>{if(fail)throw new LlmRequestError('timeout','synthetic timeout');await sleep(5);return mockReply(m);});
  try{await f.engine.start(f.id);await until(async()=>{const s=await f.engine.get(f.id);return s.stage==='error'&&s;},'error');
    assert.equal((await f.store.get(f.id)).lastError?.code,'model_timeout');fail=false;await f.engine.retry(f.id);
    const s=await until(async()=>{const s=await f.engine.get(f.id);return s.summary.status==='ready'&&s;},'retry summary');
    assert.equal(s.lastError,null);assert.equal(s.stopReason,'round_limit');assert.equal(s.calls[0].status,'error');assert.ok(s.calls.slice(1).every(c=>c.status==='ok'));
  }finally{await f.cleanup();}
});

test('two concurrent sessions never share task context or messages',async()=>{
  const seen=new Set<string>();const f=await setup(async m=>{
    const text=m.map(x=>x.content).join('\n');const a=text.includes('课堂方案评估');const b=text.includes('独立任务XYZ');
    assert.notEqual(a,b,'every call must contain exactly its own task');seen.add(a?'a':'b');await sleep(5);return mockReply(m);
  });
  try{const second=await f.engine.create({material:'第二个独立会话的测试材料，不包含第一个会话的内容和用户信息。',topic:'独立任务XYZ'});
    await f.engine.updateQuestions(second.id,['第二场的问题甲？','第二场的问题乙？','第二场的问题丙？']);await Promise.all([f.engine.start(f.id),f.engine.start(second.id)]);
    const sessions=await until(async()=>{const a=await f.engine.get(f.id),b=await f.engine.get(second.id);if(a.stage==='error'||b.stage==='error')throw Error('context isolation failed');return a.summary.status==='ready'&&b.summary.status==='ready'&&[a,b];},'both sessions');
    assert.deepEqual([...seen].sort(),['a','b']);const ids=new Set(sessions[0].messages.map(m=>m.id));assert.ok(sessions[1].messages.every(m=>!ids.has(m.id)));
  }finally{await f.cleanup();}
});

test('BUG-R2: unanswered user message remains pending after a failed repair',async()=>{
  let release!:()=>void;let first=true;
  const gate=new Promise<void>(r=>release=r);
  const f=await setup(async m=>{if(first){first=false;await gate;}await sleep(5);return mockReply(m);},2);
  try{await f.engine.start(f.id);await f.engine.pause(f.id);await f.engine.addUserMessage(f.id,'请先回答用户提出的问题');release();await sleep(25);await f.engine.resume(f.id);
    const s=await until(async()=>{const s=await f.engine.get(f.id);return s.stage==='error'&&s;},'response failure');
    const user=s.messages.find(m=>m.role==='user')!;
    assert.ok(s.calls.some(c=>c.purpose==='schema_repair'),'must reach the second participant attempt');
    assert.equal(s.lastError?.code,'user_response_failed');
    assert.equal(s.messages.filter(m=>m.role==='participant').length,0,'invalid drafts must not become duplicate messages');
    assert.ok(s.userResponses?.[user.id].error);
    assert.ok(s.messages.some(m=>m.participant?.directToUser&&m.addresses.includes(user.id))||s.pendingUserMessageIds.includes(user.id),'unacknowledged message must not disappear');
  }finally{release();await f.cleanup();}
});
