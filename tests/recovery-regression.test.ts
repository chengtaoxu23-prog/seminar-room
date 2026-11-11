import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setup, sleep, until, mockReply } from './fixtures/baseline-mock.js';
import { acknowledgingReply } from './fixtures/acknowledging-mock.js';
import type { SeminarSession } from '../src/shared/types.js';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Room } from '../web/components/Room.js';
import { LlmRequestError } from '../server/llm.js';
import { SeminarEngine } from '../server/seminar.js';
import { SessionStore } from '../server/store.js';
import { randomUUID } from 'node:crypto';

function roomHtml(session: SeminarSession) {
  return renderToStaticMarkup(createElement(Room, {session,setSession:()=>{},onExit:()=>{}}));
}

test('A success B failure: retry only B, queue clears only after all acknowledgements', async () => {
  let failB = true; let entered = false; let release!: () => void;
  const gate = new Promise<void>(r => release = r);
  const actors: string[] = [];
  const f = await setup(async messages => {
    if (!entered) { entered = true; await gate; }
    await sleep(5);
    const sys = messages[0].content;
    if (sys.startsWith('你是 SeminarRoom 的参与者')) {
      const actor = sys.startsWith('你是 SeminarRoom 的参与者「周证」') ? 'a' : 'b';
      actors.push(actor);
      if (actor === 'b' && failB) return mockReply(messages);
    }
    return acknowledgingReply(messages);
  });
  try {
    await f.engine.start(f.id); await until(async () => entered, 'first host');
    await f.engine.pause(f.id); await f.engine.addUserMessage(f.id, '请两位分别说明材料的限制');
    release(); await sleep(25); await f.engine.resume(f.id);
    const failed = await until(async () => { const s = await f.engine.get(f.id); return s.stage === 'error' && s; }, 'B failure');
    const user = failed.messages.find(m => m.role === 'user')!;
    assert.deepEqual(failed.userResponses?.[user.id].completed, ['a']);
    assert.equal(failed.userResponses?.[user.id].failedActor, 'b');
    assert.equal(failed.lastError?.code, 'user_response_failed');
    assert.deepEqual(failed.pendingUserMessageIds, [user.id]);
    assert.match(roomHtml(failed), /插话回应失败 · 消息已保留/);
    assert.equal(failed.messages.filter(m => m.role === 'participant').length, 1);
    const aMessageId = failed.messages.find(m => m.actorId === 'a')!.id;
    const beforeRetry = actors.length;
    failB = false; await f.engine.retry(f.id);
    const final = await until(async () => { const s = await f.engine.get(f.id); return s.summary.status === 'ready' && s; }, 'retry');
    assert.deepEqual(actors.slice(beforeRetry), ['b']);
    assert.deepEqual(final.userResponses?.[user.id].completed, ['a', 'b']);
    assert.deepEqual(final.pendingUserMessageIds, []);
    assert.equal(final.userResponses?.[user.id].error, undefined);
    assert.equal(final.messages.filter(m => m.actorId === 'a').length, 1);
    assert.equal(final.messages.find(m => m.actorId === 'a')!.id, aMessageId);
    assert.equal(final.messages.filter(m => m.actorId === 'b').length, 1);
    assert.equal(new Set(final.messages.map(m => m.id)).size, final.messages.length);
    assert.deepEqual((await f.store.get(f.id)).pendingUserMessageIds, []);
  } finally { release(); await f.cleanup(); }
});

test('actual process crash after A: startup makes zero calls; manual resume executes B once', async () => {
  const f = await setup(async messages => acknowledgingReply(messages));
  const children: ReturnType<typeof spawn>[] = [];
  const worker = fileURLToPath(new URL('./fixtures/restart-worker.ts', import.meta.url));
  const loader = new URL('../node_modules/tsx/dist/loader.mjs', import.meta.url).href;
  function launch(mode: string) {
    const p = spawn(process.execPath, ['--import', loader, worker, mode, f.dir, f.id], {
      cwd: f.dir, windowsHide: true,
      env: {...process.env, OPENAI_API_KEY:'test-only', OPENAI_BASE_URL:'http://127.0.0.1:9/v1', OPENAI_MODEL:'restart-mock'},
      stdio:['ignore','pipe','pipe'],
    });
    children.push(p); let output = '';
    p.stdout!.on('data', b => output += b); p.stderr!.on('data', b => output += b);
    const done = new Promise<number | null>((resolve,reject) => {p.on('exit',resolve);p.on('error',reject);});
    return {p, done, output:()=>output};
  }
  async function result(mode: string) {
    const child = launch(mode); const exit = await child.done;
    assert.equal(exit, 0, child.output());
    const line = child.output().split('\n').find(l=>l.startsWith('RESULT:'))!;
    return JSON.parse(line.slice(7)) as {session:SeminarSession;invocations:number};
  }
  try {
    const saved = structuredClone(await f.engine.get(f.id));
    saved.stage = 'paused'; await f.store.save(saved);
    // Use a fresh engine to write a normal user-message task before starting the child.
    const {SeminarEngine} = await import('../server/seminar.js');
    const {SessionStore} = await import('../server/store.js');
    const editor = new SeminarEngine(new SessionStore(f.dir), f.cfg, async m=>acknowledgingReply(m));
    await editor.addUserMessage(f.id, '请两位分别回应并保留进度');
    const crash = launch('crash');
    await until(async () => crash.output().includes('B_ENTERED'), 'child B started');
    crash.p.kill(); await crash.done;
    const before = await f.store.get(f.id);
    assert.equal(before.stage, 'running'); assert.equal(before.round, 1);
    const recovered = await result('inspect');
    assert.equal(recovered.invocations, 0);
    assert.equal(recovered.session.stage, 'paused'); assert.equal(recovered.session.stopReason, 'interrupted');
    assert.match(roomHtml(recovered.session), /服务中断 · 等待继续/);
    assert.match(roomHtml(recovered.session), /未自动调用模型/);
    assert.match(roomHtml(recovered.session), /继续/);
    assert.deepEqual(recovered.session.messages, before.messages);
    assert.deepEqual(recovered.session.userResponses, before.userResponses);
    assert.deepEqual(recovered.session.calls, before.calls);
    const resumed = await result('resume');
    assert.equal(resumed.invocations, 2, 'only B and summary, not A or host');
    assert.equal(resumed.session.stage, 'ended'); assert.equal(resumed.session.round, 2);
    assert.equal(resumed.session.messages.filter(m=>m.actorId==='a').length,1);
    assert.equal(resumed.session.messages.filter(m=>m.actorId==='b').length,1);
    assert.deepEqual(resumed.session.pendingUserMessageIds,[]);
  } finally {
    await Promise.all(children.map(p=>p.exitCode!==null||p.signalCode!==null?Promise.resolve():new Promise<void>(resolve=>{p.once('exit',()=>resolve());p.kill();})));
    await f.cleanup();
  }
});

test('insufficient response capacity rejects new messages; stopping preserves unfinished tasks', async () => {
  const f = await setup(async messages => acknowledgingReply(messages));
  try {
    const saved = structuredClone(await f.engine.get(f.id)); saved.stage = 'paused'; saved.round = 1;
    await f.store.save(saved);
    const {SeminarEngine} = await import('../server/seminar.js');
    const {SessionStore} = await import('../server/store.js');
    const reload = new SeminarEngine(new SessionStore(f.dir), f.cfg, async messages=>acknowledgingReply(messages));
    await assert.rejects(reload.addUserMessage(f.id,'不应接收无法完成的插话'), /剩余轮次不足/);
    const paused = await reload.get(f.id); paused.round = 0; paused.limits.maxCalls = 4;
    await f.store.save(paused);
    await assert.rejects(reload.addUserMessage(f.id,'预算同样不足'), /预算不足/);
    paused.limits.maxCalls = 30;
    await reload.addUserMessage(f.id,'结束前还没有得到回应');
    const ids = [...(await reload.get(f.id)).pendingUserMessageIds];
    await reload.end(f.id);
    const ended = await until(async()=>{const s=await reload.get(f.id);return s.summary.status==='ready'&&s;},'stopped summary');
    assert.deepEqual(ended.pendingUserMessageIds,ids);
    assert.match(roomHtml(ended), /未完成回应/);
  } finally { await f.cleanup(); }
});

test('pausing an in-flight failed reply preserves error and pending state until manual resume', async () => {
  let releaseHost!:()=>void; const hostGate=new Promise<void>(r=>releaseHost=r);
  let rejectReply!:(error:Error)=>void; let firstHost=true;let firstReply=true;let replyEntered=false;
  const f=await setup(async messages=>{
    if(firstHost){firstHost=false;await hostGate;}
    if(firstReply&&messages[0].content.startsWith('你是 SeminarRoom 的参与者')){
      firstReply=false;replyEntered=true;return new Promise((_,reject)=>rejectReply=reject);
    }
    return acknowledgingReply(messages);
  });
  try{
    await f.engine.start(f.id);await f.engine.pause(f.id);await f.engine.addUserMessage(f.id,'请两位先回应本条插话');
    releaseHost();await sleep(20);await f.engine.resume(f.id);await until(async()=>replyEntered,'participant in flight');
    await f.engine.pause(f.id);rejectReply(new LlmRequestError('timeout','synthetic timeout while paused'));
    const paused=await until(async()=>{const s=await f.engine.get(f.id);return s.lastError?.code==='model_timeout'&&s;},'paused error');
    assert.equal(paused.stage,'paused');assert.equal(paused.pendingUserMessageIds.length,1);
    assert.equal(paused.userResponses?.[paused.pendingUserMessageIds[0]].failedActor,'a');
    assert.match(roomHtml(paused),/synthetic timeout while paused/);
    await f.engine.resume(f.id);
    const final=await until(async()=>{const s=await f.engine.get(f.id);return s.summary.status==='ready'&&s;},'resumed summary');
    assert.deepEqual(final.pendingUserMessageIds,[]);assert.equal(final.messages.filter(m=>m.role==='participant').length,2);
  }finally{releaseHost();await f.cleanup();}
});

test('restart after persisted host end does not run the host decision again',async()=>{
  const f=await setup(async messages=>acknowledgingReply(messages));let calls=0;
  try{
    const saved=structuredClone(await f.engine.get(f.id));saved.stage='running';saved.round=1;saved.limits.maxRounds=6;
    saved.messages.push({id:randomUUID(),role:'host',actorId:'host',actorName:'主持人',kind:'invite',round:2,text:'已决定结束',blocks:[],addresses:[],createdAt:new Date().toISOString(),hostAction:{action:'end',participantId:null,publicMessage:'已决定结束',prompt:'',focus:'收束',reason:'无需重复',endReason:'需要新证据',addressUserMessageIds:[],respondToMessageIds:[]}});
    await f.store.save(saved);
    const restored=new SeminarEngine(new SessionStore(f.dir),f.cfg,async messages=>{
      calls++;assert.ok(messages[0].content.includes('独立总结员'));return acknowledgingReply(messages);
    });
    await restored.init();assert.equal(calls,0);await restored.resume(f.id);
    const final=await until(async()=>{const s=await restored.get(f.id);return s.summary.status==='ready'&&s;},'host end summary');
    assert.equal(calls,1);assert.equal(final.stopReason,'host_end');assert.deepEqual(final.messages,saved.messages);
  }finally{await f.cleanup();}
});
