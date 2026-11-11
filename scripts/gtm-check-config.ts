import dotenv from 'dotenv';
import {configureGtmRuntime} from '../server/gtm-runtime.js';
dotenv.config({path:'.env.gtm.local'});
try{const {runtime,config}=configureGtmRuntime(process.env);console.log(JSON.stringify({mode:runtime.mode,model:runtime.model,capacity:config.capacity,maxCalls:config.requests.maxCalls,outputTokens:config.requests.outputTokens,networkRequests:0},null,2));}
catch{console.error('Invalid GTM configuration. Check GTM_PROVIDER, endpoint, model, key and limits locally; values are not printed.');process.exitCode=1;}
