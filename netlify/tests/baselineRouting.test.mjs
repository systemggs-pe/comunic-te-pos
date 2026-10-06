import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

test('Netlify resolves every API used by the local adapter before the SPA fallback', async () => {
  const config = await readFile(new URL('../../netlify.toml', import.meta.url), 'utf8');
  const adapter = await readFile(new URL('../../scripts/local-api.mjs', import.meta.url), 'utf8');
  const blocks = config.split('[[redirects]]').slice(1);
  const fallback = blocks.findIndex(block => /from\s*=\s*"\/\*"/.test(block));
  assert.ok(fallback >= 0, 'SPA fallback must exist');
  for (const [, route, name] of adapter.matchAll(/'(\/api\/([^']+))':/g)) {
    const index = blocks.findIndex(block => block.includes(`from = "${route}"`));
    assert.ok(index >= 0 && index < fallback, `${route} must resolve before the SPA`);
    assert.ok(blocks[index].includes(`to = "/.netlify/functions/${name}"`));
    assert.match(blocks[index], /status\s*=\s*200/);
  }
});
