import {readFile} from 'node:fs/promises';

export function parseArguments(argv = process.argv.slice(2)) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) result[key] = true;
    else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

export async function readExamples(filePath) {
  const raw = await readFile(filePath, 'utf8');
  if (filePath.toLowerCase().endsWith('.jsonl')) {
    return raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => JSON.parse(line));
  }
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.examples)) return parsed.examples;
  throw new Error('El dataset debe ser un arreglo JSON, un objeto con examples o un archivo JSONL.');
}
