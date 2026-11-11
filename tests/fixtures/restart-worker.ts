/** Child-process fixture. CWD and all data are synthetic, never the user's deployment. */
import { SeminarEngine } from '../../server/seminar.js';
import { SessionStore } from '../../server/store.js';
import type { AppConfig } from '../../server/config.js';
import { acknowledgingReply } from './acknowledging-mock.js';
import { until, sleep } from './baseline-mock.js';

const [mode, dir, id] = process.argv.slice(2);
const cfg: AppConfig = {port:0,host:'127.0.0.1',apiKey:'test-only',baseUrl:'http://127.0.0.1:9/v1',baseUrlHost:'mock.local',model:'restart-mock',temperature:0,configured:true,dataDir:dir,publicDir:dir,limits:{maxRounds:2,maxCalls:30,maxOutputTokens:700,timeoutMs:100}};
let invocations = 0;
const engine = new SeminarEngine(new SessionStore(dir), cfg, async messages => {
  invocations++;
  if (mode === 'crash' && messages[0].content.startsWith('你是 SeminarRoom 的参与者「陈疑」')) {
    console.log('B_ENTERED');
    await sleep(60_000); // Parent kills this actual process before the response completes.
  }
  return acknowledgingReply(messages);
});
await engine.init();
if (mode !== 'inspect') {
  await engine.resume(id);
  await until(async () => { const s = await engine.get(id); return s.summary.status === 'ready' && s; }, 'child completion');
}
const session = await engine.get(id);
console.log('RESULT:' + JSON.stringify({session, invocations}));
