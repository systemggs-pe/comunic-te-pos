import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const viteCli = resolve(rootDir, 'node_modules/vite/bin/vite.js');
const children = [];
let closing = false;

function startProcess(label, args) {
  const child = spawn(process.execPath, args, {
    cwd: rootDir,
    stdio: 'inherit',
    windowsHide: true,
  });

  children.push(child);
  child.on('exit', (code, signal) => {
    if (closing) return;
    if (code === 0 && !signal) return;

    console.error(`${label} finalizo con codigo ${code ?? signal}.`);
    shutdown(code || 1);
  });

  return child;
}

function shutdown(code = 0) {
  closing = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exitCode = code;
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('exit', () => shutdown(process.exitCode || 0));

startProcess('API local', [resolve(rootDir, 'scripts/local-api.mjs')]);
startProcess('Vite', [viteCli, ...process.argv.slice(2)]);
