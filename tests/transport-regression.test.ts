import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../server/config.js';
import { chatCompletion,LlmRequestError } from '../server/llm.js';

test('transport failures, cancellation and missing usage remain distinguishable (fetch stub only)',async t=>{
  const old={...config};const original=globalThis.fetch;
  Object.assign(config,{configured:true,apiKey:'test-only',baseUrl:'http://127.0.0.1:9/v1',model:'mock-only'});
  const call=()=>chatCompletion([{role:'user',content:'synthetic test'}]);
  const kind=(k:string,status?:number)=>(e:unknown)=>e instanceof LlmRequestError&&e.kind===k&&(status===undefined||e.status===status);
  try{
    await t.test('HTTP 401 is nonretryable and credentials in error are redacted',async()=>{
      globalThis.fetch=async()=>new Response(JSON.stringify({error:{message:'Bearer test-credential sk-synthetic_test_only'}}),{status:401});
      await assert.rejects(call(),e=>kind('http',401)(e)&&e instanceof LlmRequestError&&!e.retryable&&!e.message.includes('test-credential')&&!e.message.includes('synthetic_test_only'));
    });
    await t.test('rate limit is retryable',async()=>{
      globalThis.fetch=async()=>new Response('{}',{status:429});await assert.rejects(call(),e=>kind('http',429)(e)&&e instanceof LlmRequestError&&e.retryable);
    });
    await t.test('network failure is recorded without issuing a retry',async()=>{
      let attempts=0;globalThis.fetch=async()=>{attempts++;throw Error('synthetic unavailable');};await assert.rejects(call(),kind('network'));assert.equal(attempts,1);
    });
    await t.test('missing choices is invalid_response',async()=>{
      globalThis.fetch=async()=>new Response('{}');await assert.rejects(call(),kind('invalid_response'));
    });
    await t.test('timeout cancels the in-flight fetch',async()=>{
      globalThis.fetch=async(_url,init)=>new Promise((_,reject)=>init?.signal?.addEventListener('abort',()=>reject(Error('abort')),{once:true}));
      await assert.rejects(chatCompletion([],{timeoutMs:10}),kind('timeout'));
    });
    await t.test('already cancelled request never reaches fetch',async()=>{
      let called=false;globalThis.fetch=async()=>{called=true;throw Error('must not call');};const abort=new AbortController();abort.abort();await assert.rejects(chatCompletion([],{signal:abort.signal}),kind('aborted'));assert.equal(called,false);
    });
    await t.test('missing token usage stays null rather than fabricated zero',async()=>{
      globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:'ok'},finish_reason:'stop'}]}));const r=await call();assert.deepEqual(r.usage,{promptTokens:null,completionTokens:null,totalTokens:null});
    });
  }finally{Object.assign(config,old);globalThis.fetch=original;}
});
