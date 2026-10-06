import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

// Deliberately requires a local, pinned Netlify packager. No deploy command.
const modulePath = process.argv[2];
if (!modulePath) throw new Error('Supply the local @netlify/zip-it-and-ship-it dist/main.js path; see RELEASE_CHECKLIST.md');
const moduleUrl = pathToFileURL(resolve(modulePath));
const packager = JSON.parse(await readFile(new URL('../package.json', moduleUrl), 'utf8'));
if (packager.name !== '@netlify/zip-it-and-ship-it' || packager.version !== '16.3.0') throw new Error('PINNED_NETLIFY_PACKAGER_REQUIRED');
const {zipFunctions} = await import(moduleUrl.href);
const destination = resolve('.netlify/release-artifacts');
await mkdir(destination, {recursive: true});
const functions = await zipFunctions(resolve('netlify/functions'), destination, {
  config: {'*': {nodeBundler: 'esbuild', nodeVersion: '22'}}, basePath: process.cwd(),
});
const usuarios = functions.find(item => item.name === 'usuarios');
if (!usuarios) throw new Error('USUARIOS_ARTIFACT_MISSING');
const inputs = new Set(['package.json', 'package-lock.json', 'netlify.toml']);
for (const file of usuarios.inputs || []) inputs.add(relative(process.cwd(), file).replaceAll('\\', '/'));
// Include all local function sources even if the packager's input metadata changes.
const {readdir} = await import('node:fs/promises');
for (const file of await readdir('netlify/functions')) if (file.endsWith('.mjs')) inputs.add(`netlify/functions/${file}`);
const hash = data => createHash('sha256').update(data).digest('hex');
const manifest = {packager: '@netlify/zip-it-and-ship-it@16.3.0', nodeVersion: '22', timestamp: new Date().toISOString(),
  functions: functions.map(item => item.name), usuariosSha256: hash(await readFile(usuarios.path)),
  inputs: await Promise.all([...inputs].sort().map(async path => ({path, sha256: hash(await readFile(path))}))) };
await writeFile(`${destination}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({functions: manifest.functions, usuariosSha256: manifest.usuariosSha256, inputCount: manifest.inputs.length}, null, 2));
