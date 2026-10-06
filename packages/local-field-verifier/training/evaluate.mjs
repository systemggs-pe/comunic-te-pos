import {readFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sanitizeCorrectionExample, verifyFields} from '../src/index.js';
import {parseArguments, readExamples} from './io.mjs';

const args = parseArguments();
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modelPath = args.model
  ? resolve(process.cwd(), String(args.model))
  : resolve(packageRoot, 'models/model.json');
const inputPath = args.input
  ? resolve(process.cwd(), String(args.input))
  : resolve(packageRoot, 'training/data/corrections.json');
const allowedFields = String(args.fields || 'marca,modelo,nombreComercial,ram,memoria,color')
  .split(',')
  .map(field => field.trim())
  .filter(Boolean);

try {
  const model = JSON.parse(await readFile(modelPath, 'utf8'));
  const examples = (await readExamples(inputPath))
    .map(example => sanitizeCorrectionExample(example, {allowedFields}))
    .filter(Boolean);
  const metrics = Object.fromEntries(allowedFields.map(field => [field, {total: 0, baseline: 0, verified: 0}]));

  for (const example of examples) {
    const result = verifyFields({extracted: example.before, model});
    for (const field of allowedFields) {
      const expected = example.after[field];
      if (!expected) continue;
      metrics[field].total += 1;
      if (example.before[field] === expected) metrics[field].baseline += 1;
      if (result.data[field] === expected) metrics[field].verified += 1;
    }
  }

  const totals = Object.values(metrics).reduce((summary, field) => ({
    total: summary.total + field.total,
    baseline: summary.baseline + field.baseline,
    verified: summary.verified + field.verified,
  }), {total: 0, baseline: 0, verified: 0});
  console.log(JSON.stringify({
    modelVersion: model.version,
    examples: examples.length,
    exactMatch: totals.total ? totals.verified / totals.total : 0,
    baselineExactMatch: totals.total ? totals.baseline / totals.total : 0,
    fields: metrics,
  }, null, 2));
} catch (error) {
  console.error(`No se pudo evaluar el modelo: ${error.message}`);
  process.exitCode = 1;
}
