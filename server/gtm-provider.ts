import type {ModelStage} from '../src/shared/gtm.js';
import type {TokenUsage} from '../src/shared/types.js';
import {providerOptions} from './provider.js';
export interface GtmRequest {stage:ModelStage;messages:{role:'system'|'user';content:string}[];maxOutputTokens:number;tools:readonly never[];thinking?:{type:'disabled'}}
export interface GtmResponse {content:string;finishReason:string;returnedModel:string|null;usage:TokenUsage;httpStatus:number;toolCalls?:unknown[]}
export interface GtmProvider {configuredModel:string;complete(request:GtmRequest,signal:AbortSignal):Promise<GtmResponse>;sanitize?:(text:string)=>{text:string;blocked:boolean}}
export class GtmProviderError extends Error{constructor(readonly code:string,readonly httpStatus:number|null=null){super(code);this.name='GtmProviderError';}}
/** Explicit server-only connection; no env lookup, SDK retries, tools, or logging. */
export function createGtmHttpProvider(connection:{baseUrl:string;model:string;apiKey:string;timeoutMs?:number},send:typeof fetch=fetch):GtmProvider{
 const url=new URL(connection.baseUrl);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new GtmProviderError('invalid_connection');
 const endpoint=connection.baseUrl.replace(/\/+$/,'').endsWith('/chat/completions')?connection.baseUrl:connection.baseUrl.replace(/\/+$/,'')+'/chat/completions';
 const sanitize=(text:string)=>{const blocked=connection.apiKey.length>0&&text.includes(connection.apiKey);return {text:blocked?text.split(connection.apiKey).join('[redacted]'):text,blocked};};
 return {configuredModel:connection.model,sanitize,async complete(request,signal){
  const controller=new AbortController(),abort=()=>controller.abort();if(signal.aborted)throw new GtmProviderError('aborted');signal.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,connection.timeoutMs??60000);
  try{
   const response=await send(endpoint,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:`Bearer ${connection.apiKey}`},body:JSON.stringify({model:connection.model,messages:request.messages,max_tokens:request.maxOutputTokens,stream:false,response_format:{type:'json_object'},...providerOptions(connection.baseUrl,connection.model),...(request.thinking?{thinking:request.thinking}:{})}),signal:controller.signal});
   if(!response.ok){const body=await response.text();throw new GtmProviderError(/context.*(length|limit|window)|maximum context|too many tokens/i.test(body)?'context_limit':'http_error',response.status);}
   const data=await response.json().catch(()=>{throw new GtmProviderError('invalid_response',response.status);}) as {model?:unknown;usage?:Record<string,unknown>;choices?:{finish_reason?:string;message?:{content?:unknown;tool_calls?:unknown[]}}[]};const choice=data.choices?.[0];
   if(!choice?.message||typeof choice.message.content!=='string')throw new GtmProviderError('invalid_response',response.status);
   const pick=(key:string)=>{const v=data.usage?.[key];return typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:null;};
   return {content:choice.message.content,finishReason:choice.finish_reason??'unknown',returnedModel:typeof data.model==='string'?data.model:null,usage:{promptTokens:pick('prompt_tokens'),completionTokens:pick('completion_tokens'),totalTokens:pick('total_tokens')},httpStatus:response.status,toolCalls:choice.message.tool_calls};
  }catch(error){if(error instanceof GtmProviderError)throw error;throw new GtmProviderError(signal.aborted?'aborted':controller.signal.aborted?'timeout':'network_error');}
  finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
 }};
}
