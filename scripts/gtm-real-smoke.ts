/** Run ONLY after explicit approval. One synthetic audit, <=8 dispatched requests, including repair. */
import dotenv from 'dotenv';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {configureGtmRuntime} from '../server/gtm-runtime.js';
import {GtmAuditEngine} from '../server/gtm-engine.js';
import {AuditRepository,createAuditDraft} from '../server/gtm-repository.js';
import {createSource} from '../server/gtm-sources.js';
if(process.argv[2]!=='--approve-real-smoke'){
 console.error('Approval required. No configuration loaded and no request sent. After explicit approval: npm run smoke:gtm-real -- --approve-real-smoke');process.exitCode=1;
}else{
 dotenv.config({path:'.env.gtm.local'});
 const {runtime,config}=configureGtmRuntime({...process.env,GTM_MAX_CALLS:'8'});
 if(runtime.mode!=='real')throw Error('real_mode_required_no_mock_fallback');
 const source=createSource({id:'synthetic-smoke-source',title:'Synthetic smoke case — not market research',sourceType:'txt',sourceKind:'other',accessedAt:new Date().toISOString(),rawContent:'Synthetic case: five interviews were conducted. There are no purchase commitments.\n\nCAC, LTV and willingness to pay have not been measured.'});
 const repository=new AuditRepository(),engine=new GtmAuditEngine(repository,runtime.provider);await engine.init();
 const draft=createAuditDraft({projectName:'Synthetic real-provider smoke',businessBrief:'Synthetic test only: evaluate evidence gaps for an overseas subscription launch. Do not invent operating data.',targetMarket:'Hypothetical market'},[source],[source.id],config);draft.providerSnapshot={mode:runtime.mode,model:runtime.model};
 const saved=await repository.save(draft,null),audit=await engine.start(saved.id);
 if(audit.ledger.calls.length>8)throw Error('smoke_cap_exceeded');
 if(audit.execution?.markdown){await mkdir('data',{recursive:true});await writeFile(path.join('data',`smoke-${audit.id}.md`),audit.execution.markdown);}
 console.log(JSON.stringify({auditId:audit.id,state:audit.state,model:runtime.model,requests:audit.ledger.calls.length,usage:audit.ledger.usage,errorCode:audit.execution?.lastError?.code??null,reportGenerated:!!audit.execution?.report},null,2));
 if(audit.state.lifecycle!=='completed')process.exitCode=1;
}
