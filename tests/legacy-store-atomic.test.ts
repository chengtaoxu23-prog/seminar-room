import test from 'node:test';import assert from 'node:assert/strict';import {promises as fs} from 'node:fs';import path from 'node:path';import {SessionStore} from '../server/store.js';import {setup,mockReply,until} from './fixtures/baseline-mock.js';
test('legacy concurrent reads always see complete JSON and cross-instance flush observes queued writes',async()=>{
 const f=await setup(async m=>mockReply(m));try{const session=structuredClone(await f.engine.get(f.id));session.material.raw='synthetic'.repeat(30000);let reads=0;
 for(let i=0;i<20;i++){session.config.topic='stress '+i;const writing=f.store.save(session);await Promise.all(Array.from({length:4},async()=>{const s=await new SessionStore(f.dir).get(f.id);assert.equal(s.schemaVersion,1);reads++;}));await writing;}
 await new SessionStore(f.dir).flush();assert.equal(reads,80);assert.equal((await f.store.get(f.id)).config.topic,'stress 19');assert.ok((await fs.readdir(f.dir)).every(n=>!n.endsWith('.tmp')));
 }finally{await f.cleanup();}
});
test('legacy failed atomic replacement retains previous valid session and cleans temporary file',async()=>{
 const f=await setup(async m=>mockReply(m)),original=fs.rename;try{const file=path.join(f.dir,f.id+'.json'),before=await fs.readFile(file,'utf8'),session=structuredClone(await f.engine.get(f.id));session.config.topic='must not replace';
 fs.rename=async(from,to)=>{if(String(to)===file)throw Object.assign(Error('synthetic file busy'),{code:'EBUSY'});return original(from,to);};await assert.rejects(f.store.save(session));fs.rename=original;
 assert.equal(await fs.readFile(file,'utf8'),before);assert.equal((await f.store.get(f.id)).config.topic,'课堂方案评估');assert.ok((await fs.readdir(f.dir)).every(n=>!n.endsWith('.tmp')));
 }finally{fs.rename=original;await f.cleanup();}
});
test('legacy waitForIdle drains background summary writes without changing results or adding model requests',async()=>{
 const f=await setup(async m=>mockReply(m));try{await f.engine.start(f.id);const ready=await until(async()=>{const s=await f.engine.get(f.id);return s.summary.status==='ready'&&s;},'ready');const calls=ready.calls.length;await f.engine.waitForIdle();await f.store.flush();const disk=await new SessionStore(f.dir).get(f.id);assert.deepEqual(disk.summary,ready.summary);assert.equal(disk.calls.length,calls);assert.equal((await f.engine.get(f.id)).calls.length,calls);}finally{await f.cleanup();}
});
