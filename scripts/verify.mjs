import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const root = new URL('../', import.meta.url);
const {scripts} = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Ejecuta este script mediante npm run verify.');

let failed = false;
for (const name of ['typecheck', 'lint', 'test', 'build']) {
  if (!scripts[name]) {
    console.log(`[verify] ${name}: NO APLICA (script no definido)`);
    continue;
  }
  console.log(`[verify] Ejecutando npm run ${name}`);
  const result = spawnSync(process.execPath, [npmCli, 'run', name], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  const passed = !result.error && result.status === 0;
  console.log(`[verify] ${name}: ${passed ? 'VERIFICADO' : 'FALLÓ'}`);
  if (!passed) failed = true;
}
process.exitCode = failed ? 1 : 0;
