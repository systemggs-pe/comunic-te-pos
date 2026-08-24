import {copyFile, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const targetRoot = resolve(rootDir, 'public/ocr');
const assets = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'lang/eng.traineddata.gz'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'core/tesseract-core-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'core/tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'core/tesseract-core-relaxedsimd-lstm.wasm.js'],
];

for (const [source, target] of assets) {
  const sourcePath = resolve(rootDir, source);
  const targetPath = resolve(targetRoot, target);
  await mkdir(dirname(targetPath), {recursive: true});
  await copyFile(sourcePath, targetPath);
}

console.log(`Recursos OCR locales preparados: ${assets.length} archivos.`);
