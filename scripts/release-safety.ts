/** Location/type reporting only. Does not read ignored environment or runtime data. */
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const git=(...args:string[])=>execFileSync('git',args,{encoding:'utf8',maxBuffer:32*1024*1024});
const candidates=[...new Set([...git('ls-files').trim().split('\n'),...git('ls-files','--others','--exclude-standard').trim().split('\n')])].filter(Boolean);
const patterns:[string,RegExp][]=[['credential',/sk-[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],['credential_assignment',/(?:api[_-]?key|password|secret|access[_-]?token)\s*[:=]\s*["'][A-Za-z0-9_-]{24,}["']/i],['personal_local_path',/[CD]:[\\/](?:Users|用户)[\\/]/i],['email_address',/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/]];
const risks:{file:string;kind:string;line?:number;blob?:string}[]=[],images:string[]=[],allowlisted:string[]=[];
function scan(file:string,text:string,blob?:string){for(const [index,line] of text.split(/\r?\n/).entries())for(const [kind,pattern] of patterns){if(!pattern.test(line))continue;const fixture=(file==='tests/gtm-bootstrap.test.ts'&&kind==='credential_assignment'&&line.includes('OPENAI_API_KEY')&&line.includes('synthetic-bootstrap-only'))||(file==='tests/gtm-runtime.test.ts'&&((kind==='credential_assignment'&&line.includes('const syntheticEnv=')&&line.includes('synthetic-test-only-secret'))||(kind==='email_address'&&line.includes('host.invalid')&&line.includes('assert.throws'))));if(fixture){allowlisted.push(file+':explicit-synthetic-fixture');continue;}if(file==='tests/gtm-engine.test.ts'&&line.includes("const canary=")&&line.includes('CANARY-synthetic-only')){allowlisted.push(file+':synthetic-canary');continue;}risks.push({file,kind,line:index+1,...(blob?{blob}:{})});}}
for(const file of candidates){
 if(/^(?:\.env(?!\.example$)|data\/|work\/|outputs\/|node_modules\/|dist\/)|\.(?:log|bak|tmp|zip|patch)$/i.test(file)){risks.push({file,kind:'private_or_archive_in_release'});continue;}
 if(/\.(?:png|jpe?g|gif|webp)$/i.test(file)){images.push(file);continue;}
 const data=readFileSync(file);if(!data.includes(0))scan(file,data.toString('utf8'));
}
let historyBlobs=0;
for(const entry of git('rev-list','--objects','--all').trim().split('\n')){
 const space=entry.indexOf(' ');if(space<0)continue;const oid=entry.slice(0,space),file=entry.slice(space+1);
 if(git('cat-file','-t',oid).trim()!=='blob')continue;historyBlobs++;
 const data=execFileSync('git',['cat-file','blob',oid],{maxBuffer:32*1024*1024});if(!data.includes(0))scan(file,data.toString('utf8'),oid);
}
console.log(JSON.stringify({candidateFiles:candidates.length,historyBlobs,risks,allowlisted:[...new Set(allowlisted)],imagesRequiringVisualReview:images,note:'No matched values printed; ignored runtime and credential files excluded. Review images and material provenance separately.'},null,2));
if(risks.length)process.exitCode=1;
