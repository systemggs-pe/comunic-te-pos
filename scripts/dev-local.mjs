import {spawn} from 'node:child_process';
import {watch} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const viteCli = resolve(rootDir, 'node_modules/vite/bin/vite.js');
const children = [];
let closing = false;
let apiChild = null;
let apiRestarting = false;
let apiRestartTimer = null;
let functionsWatcher = null;

function startProcess(label, args, {restartable = false} = {}) {
  const child = spawn(process.execPath, args, {
    cwd: rootDir,
    stdio: 'inherit',
    windowsHide: true,
  });

  children.push(child);
  child.on('exit', (code, signal) => {
    if (closing) return;
    if (restartable && apiRestarting && child === apiChild) return;
    if (code === 0 && !signal) return;

    console.error(`${label} finalizo con codigo ${code ?? signal}.`);
    shutdown(code || 1);
  });

  return child;
}

function startApiProcess() {
  apiChild = startProcess('API local', [resolve(rootDir, 'scripts/local-api.mjs')], {restartable: true});
}

function scheduleApiRestart(fileName = '') {
  if (closing || !String(fileName).endsWith('.mjs')) return;
  if (apiRestartTimer) clearTimeout(apiRestartTimer);
  apiRestartTimer = setTimeout(() => {
    if (closing) return;
    const previous = apiChild;
    if (!previous || previous.killed) {
      startApiProcess();
      return;
    }
    apiRestarting = true;
    previous.once('exit', () => {
      if (closing) return;
      apiRestarting = false;
      startApiProcess();
    });
    previous.kill();
  }, 180);
}

function shutdown(code = 0) {
  closing = true;
  if (apiRestartTimer) clearTimeout(apiRestartTimer);
  functionsWatcher?.close();
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exitCode = code;
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('exit', () => shutdown(process.exitCode || 0));

functionsWatcher = watch(resolve(rootDir, 'netlify/functions'), {recursive: true}, (_eventType, fileName) => {
  scheduleApiRestart(fileName);
});

startApiProcess();
startProcess('Vite', [viteCli, ...process.argv.slice(2)]);
