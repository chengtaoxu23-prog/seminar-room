// Configuration is local-only. Constructing a Provider never dispatches a request.
import express from 'express';
import path from 'node:path';
import dotenv from 'dotenv';
import {createGtmApp} from './gtm-api.js';
import {configureGtmRuntime} from './gtm-runtime.js';
dotenv.config({path:'.env.gtm.local'});
const {runtime,config}=configureGtmRuntime(process.env);
const service=createGtmApp(undefined,config,120,runtime);await service.init();
service.app.use(express.static(path.resolve('dist/web')));
service.app.get('*',(_req,res)=>res.sendFile(path.resolve('dist/web/index.html')));
service.app.listen(4317,'127.0.0.1',()=>console.log('GTM-RedTeam http://127.0.0.1:4317 — '+(runtime.mode==='mock'?'MOCK DEMO':'REAL PROVIDER'))).on('error',()=>{console.error('GTM server could not listen on local port 4317.');process.exitCode=1;});
