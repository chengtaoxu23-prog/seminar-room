import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { SessionStore,SessionNotFoundError } from '../server/store.js';
import { segmentMaterial,normalizeMaterial,searchSegments } from '../src/shared/material.js';
import { setup,mockReply } from './fixtures/baseline-mock.js';

test('long Chinese material retains wording and deterministic IDs after newline normalization',()=>{
  const raw='\uFEFF 第一段中文。\r\n\r\n'+('长句材料，用于核对完整性。'.repeat(180))+'\n\n末段原文。';
  const segments=segmentMaterial(raw);
  assert.equal(segments.map(s=>s.text).join('').replace(/\s/g,''),normalizeMaterial(raw).replace(/\s/g,''));
  assert.deepEqual(segments.map(s=>s.id),segments.map((_,i)=>i+1));
  assert.deepEqual(segmentMaterial(raw),segments);assert.equal(searchSegments(segments,'末段原文',1)[0].text,'末段原文。');assert.deepEqual(segmentMaterial(' \r\n '),[]);
});

test('sequential saves keep latest snapshot, reject traversal and surface corrupt data',async()=>{
  const f=await setup(async m=>mockReply(m));
  try{
    const s=await f.engine.get(f.id);const first=structuredClone(s);const second=structuredClone(s);first.config.topic='旧标题';second.config.topic='新标题';
    await Promise.all([f.store.save(first),f.store.save(second)]);assert.equal((await new SessionStore(f.dir).get(f.id)).config.topic,'新标题');
    await assert.rejects(f.store.get('../outside'),SessionNotFoundError);
    await assert.rejects(f.store.get(randomUUID()),SessionNotFoundError);
    const before=await readFile(path.join(f.dir,f.id+'.json'),'utf8');assert.ok(JSON.parse(before));
    await writeFile(path.join(f.dir,f.id+'.json'),'{truncated','utf8');await assert.rejects(f.store.get(f.id),SyntaxError);
    assert.equal(await readFile(path.join(f.dir,f.id+'.json'),'utf8'),'{truncated','read failure must not overwrite disk');
  }finally{await f.cleanup();}
});
