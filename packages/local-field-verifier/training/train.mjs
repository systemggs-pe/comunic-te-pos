import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {trainCorrectionModel} from '../src/index.js';
import {parseArguments, readExamples} from './io.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArguments();
const inputPath = args.input
  ? resolve(process.cwd(), String(args.input))
  : resolve(packageRoot, 'training/data/corrections.json');
const outputPath = resolve(process.cwd(), String(args.output || resolve(packageRoot, 'models/model.json')));
const modulePath = resolve(process.cwd(), String(args.module || resolve(packageRoot, 'models/model.generated.js')));
const allowedFields = String(args.fields || 'marca,modelo,nombreComercial,ram,memoria,color')
  .split(',')
  .map(field => field.trim())
  .filter(Boolean);

try {
  const examples = await readExamples(inputPath);
  const model = trainCorrectionModel(examples, {
    allowedFields,
    minCount: Math.max(1, Number(args['min-count']) || 2),
    version: String(args.version || new Date().toISOString().slice(0, 10).replaceAll('-', '.')),
  });
  await mkdir(dirname(outputPath), {recursive: true});
  await mkdir(dirname(modulePath), {recursive: true});
  await writeFile(outputPath, `${JSON.stringify(model, null, 2)}\n`, 'utf8');
  await writeFile(modulePath, `const model = ${JSON.stringify(model, null, 2)};\n\nexport default model;\n`, 'utf8');
  console.log(JSON.stringify({
    status: 'ok',
    input: inputPath,
    examples: model.exampleCount,
    replacements: Object.values(model.replacements).reduce((sum, field) => sum + Object.keys(field).length, 0),
    transfers: model.transfers.length,
    model: outputPath,
    module: modulePath,
  }, null, 2));
} catch (error) {
  console.error(`No se pudo entrenar el modelo: ${error.message}`);
  process.exitCode = 1;
}
