// Configuration is local-only. Constructing a Provider never dispatches a request.
import express from 'express';
import path from 'node:path';
import dotenv from 'dotenv';
import {createGtmApp} from './gtm-api.js';
import {configureGtmRuntime} from './gtm-runtime.js';
dotenv.config({path:'.env.gtm.local'});
const {runtime,config}=configureGtmRuntime(process.env);
if(runtime.mode!=='real')throw Error('Real Research Workspace requires GTM_PROVIDER=openai-compatible. Use explicit offline commands for historical demos.');
const service=createGtmApp(undefined,config,120,runtime),app=express();let ready=false;
app.use((_req,res,next)=>{if(!ready){res.status(503).json({error:'正在恢复本地研究记录，请稍后重试。'});return;}next();});
app.use(service.app);
app.use(express.static(path.resolve('dist/web')));
app.get('*',(_req,res)=>res.sendFile(path.resolve('dist/web/index.html')));
// Bind before recovery: a second launcher must never mark another live process's runs interrupted.
const server=app.listen(4317,'127.0.0.1');
try{await new Promise<void>((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});await service.init();ready=true;console.log('GTM-RedTeam http://127.0.0.1:4317 — REAL PROVIDER');}
catch{server.close();console.error('GTM server could not start or recover local research records.');process.exitCode=1;}
