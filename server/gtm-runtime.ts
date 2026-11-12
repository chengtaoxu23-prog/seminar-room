import {createGtmHttpProvider,type GtmProvider} from './gtm-provider.js';
import {createGtmMockProvider} from './gtm-mock.js';
import {createGtmConfig} from './gtm-config.js';
export interface ProviderIdentity {mode:'mock'|'real';model:string}
export interface RuntimeProvider extends ProviderIdentity {provider:GtmProvider}
/** Pure configuration validation: no network, no logging, no fallback. */
export function configureGtmRuntime(env:Record<string,string|undefined>,send:typeof fetch=fetch){
 const mode=env.GTM_PROVIDER??'mock';
 if(mode!=='mock'&&mode!=='openai-compatible')throw Error('invalid_gtm_provider');
 const integer=(name:string,fallback:number,max:number)=>{const raw=env[name];if(raw!==undefined&&!/^\d+$/.test(raw))throw Error('invalid_gtm_limits');const n=raw===undefined?fallback:Number(raw);if(!Number.isSafeInteger(n)||n<1||n>max)throw Error('invalid_gtm_limits');return n;};
 const config=createGtmConfig({requests:{maxCalls:integer('GTM_MAX_CALLS',mode==='mock'?10:5,10),outputTokens:{blue_proposal:4096}}});
 if(mode==='mock')return {config,runtime:{mode:'mock',model:'MOCK-synthetic-only',provider:createGtmMockProvider()} satisfies RuntimeProvider};
 const key=env.GTM_API_KEY,model=env.GTM_MODEL,base=env.GTM_BASE_URL;
 if(!key?.trim()||!model?.trim()||!base?.trim())throw Error('gtm_real_configuration_required');
 if(model.length>200||/[\s\x00-\x1f]/.test(model)||model.includes(key)||/[\r\n]/.test(key))throw Error('invalid_gtm_configuration');
 let url:URL;try{url=new URL(base);}catch{throw Error('invalid_gtm_endpoint');}
 if(url.username||url.password||url.search||url.hash||!(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))))throw Error('invalid_gtm_endpoint');
 const timeoutMs=integer('GTM_TIMEOUT_MS',60000,300000);
 return {config,runtime:{mode:'real',model,provider:createGtmHttpProvider({baseUrl:base,model,apiKey:key,timeoutMs},send)} satisfies RuntimeProvider};
}
