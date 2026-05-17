import {spawn} from 'node:child_process';
import http from 'node:http';

const backendPort = Number(process.env.BACKEND_PORT || 3001);
const backendUrl = `http://127.0.0.1:${backendPort}`;
const children = [];

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    ...options,
  });
  children.push(child);
  child.on('exit', code => {
    if (!shuttingDown && code && code !== 0) {
      console.error(`${command} ${args.join(' ')} salio con codigo ${code}`);
      shutdown(code);
    }
  });
  return child;
}

function runAndWait(command, args, options = {}) {
  return new Promise(resolve => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      ...options,
    });
    child.on('exit', code => resolve(code || 0));
  });
}

function healthCheck() {
  return new Promise(resolve => {
    const req = http.get(`${backendUrl}/health`, res => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForBackend() {
  for (let i = 0; i < 30; i += 1) {
    if (await healthCheck()) return true;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  return false;
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('Compilando frontend para servirlo desde el backend...');
const npmCli = process.env.npm_execpath;
const buildCode = npmCli
  ? await runAndWait(process.execPath, [npmCli, 'run', 'build'])
  : await runAndWait(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build']);
if (buildCode !== 0) {
  console.error('La compilacion del frontend fallo.');
  process.exit(buildCode);
}

if (!(await healthCheck())) {
  console.log(`Levantando backend en ${backendUrl}`);
  run(process.execPath, ['backend/server.js']);
  const ready = await waitForBackend();
  if (!ready) {
    console.error('El backend no inicio correctamente. Revisa RENIEC_TOKEN/GEMINI_API_KEY y el puerto BACKEND_PORT.');
    shutdown(1);
  }
} else {
  console.log(`Backend ya activo en ${backendUrl}`);
}

console.log(`App operativa en ${backendUrl}`);
console.log('Usa Ctrl+C para detener este proceso.');

setInterval(() => {}, 60 * 60 * 1000);
