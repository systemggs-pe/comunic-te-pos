import {spawn} from 'node:child_process';
import {readdirSync, statSync, watch} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const functionsDir = resolve(rootDir, 'netlify/functions');
const viteCli = resolve(rootDir, 'node_modules/vite/bin/vite.js');
const children = [];
let closing = false;
let apiChild = null;
let apiRestarting = false;
let apiRestartTimer = null;
let functionsWatcher = null;
let functionSnapshots = readFunctionSnapshots();

function readFunctionSnapshots(directory = functionsDir, relativeDirectory = '') {
  const snapshots = new Map();

  let entries = [];
  try {
    entries = readdirSync(directory, {withFileTypes: true});
  } catch {
    return snapshots;
  }

  for (const entry of entries) {
    const absolutePath = resolve(directory, entry.name);
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      for (const [path, signature] of readFunctionSnapshots(absolutePath, relativePath)) {
        snapshots.set(path, signature);
      }
      continue;
    }

    if (!entry.name.endsWith('.mjs')) continue;

    try {
      const {mtimeMs, size} = statSync(absolutePath);
      snapshots.set(relativePath, `${mtimeMs}:${size}`);
    } catch {
      // The file may be in the middle of an atomic save; the next watcher
      // event will refresh its snapshot.
    }
  }

  return snapshots;
}

function getChangedFunctionFiles() {
  const nextSnapshots = readFunctionSnapshots();
  const changedFiles = [];

  for (const [path, signature] of nextSnapshots) {
    if (functionSnapshots.get(path) !== signature) changedFiles.push(path);
  }
  for (const path of functionSnapshots.keys()) {
    if (!nextSnapshots.has(path)) changedFiles.push(path);
  }

  functionSnapshots = nextSnapshots;
  return changedFiles;
}

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
  const changedFiles = getChangedFunctionFiles();
  if (changedFiles.length === 0) return;

  if (apiRestartTimer) clearTimeout(apiRestartTimer);
  apiRestartTimer = setTimeout(() => {
    if (closing) return;
    console.error(`Reiniciando API local por cambio en: ${changedFiles.join(', ')}`);
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

functionsWatcher = watch(functionsDir, {recursive: true}, (_eventType, fileName) => {
  scheduleApiRestart(fileName);
});

startApiProcess();
startProcess('Vite', [viteCli, ...process.argv.slice(2)]);
