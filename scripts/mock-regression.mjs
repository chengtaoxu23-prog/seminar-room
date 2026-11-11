/** Local test services only. Does not read the user's environment files. */
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = await mkdtemp(path.join(os.tmpdir(), 'seminar-mock-regression-'));
// Service CWD is new and contains no .env files; expose only the built static site.
await symlink(path.join(root, 'dist'), path.join(out, 'dist'), 'junction');
const children = [];
const env = { ...process.env, OPENAI_API_KEY: 'test-only', OPENAI_BASE_URL: 'http://127.0.0.1:4320/v1', OPENAI_MODEL: 'e2e-mock-not-a-real-model', SEMINAR_PORT: '4318', SEMINAR_DATA_DIR: path.join(out, 'sessions'), SEMINAR_TEST_OUTPUT_DIR: path.join(out, 'screenshots') };
function start(args, extra = {}) {
  const p = spawn(process.execPath, args, { cwd: out, env: { ...env, ...extra }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  p.output = ''; p.stdout.on('data', b => p.output += b); p.stderr.on('data', b => p.output += b);
  p.done = new Promise((resolve, reject) => { p.once('error', reject); p.once('exit', resolve); });
  children.push(p); return p;
}
async function ready(port, process) {
  for (let n = 0; n < 100; n++) {
    if (process.exitCode !== null) throw Error(`Test service exited on ${port}`);
    try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw Error(`Test service not ready: ${port}`);
}
try {
  for (const port of [4318, 4319, 4320]) await new Promise((resolve, reject) => {
    const s = net.createServer(); s.once('error', reject); s.listen(port, '127.0.0.1', () => s.close(resolve));
  });
  start([path.join(root, 'scripts/mock-openai.mjs')]);
  const loader = pathToFileURL(path.join(root, 'node_modules/tsx/dist/loader.mjs')).href;
  const app = start(['--import', loader, path.join(root, 'server/index.ts')]);
  await ready(4318, app);
  const e2e = start([path.join(root, 'scripts/e2e-ui.mjs')]);
  const code = await e2e.done; console.log(e2e.output);
  if (code !== 0) throw Error(`E2E exit ${code}`);
  const visualApp = start(['--import', loader, path.join(root, 'server/index.ts')], { OPENAI_API_KEY: '', SEMINAR_PORT: '4319', SEMINAR_DATA_DIR: path.join(out, 'visual-sessions') });
  await ready(4319, visualApp);
  const visual = start([path.join(root, 'scripts/visual-check.mjs')], { SEMINAR_VISUAL_URL: 'http://127.0.0.1:4319' });
  const visualCode = await visual.done; console.log(visual.output);
  if (visualCode !== 0) throw Error(`Visual exit ${visualCode}`);
  console.log('PASS: mock E2E + visual checks');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  for (const p of children) if (p.exitCode === null) p.kill();
  await Promise.allSettled(children.map(p => p.done));
  await Promise.all(children.map((p, i) => writeFile(path.join(out, `process-${i}.log`), p.output)));
  console.log(`Test artifacts: ${out}`);
}
