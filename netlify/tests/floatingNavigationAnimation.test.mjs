import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

test('floating navigation uses a transform-driven frosted active indicator', async () => {
  const [component, css] = await Promise.all([
    readFile(new URL('../../src/components/navigation/FloatingNavigation.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/index.css', import.meta.url), 'utf8'),
  ]);

  assert.match(component, /data-active-index=\{activeIndex\}/);
  assert.match(component, /'--app-nav-indicator-x': indicatorOffset/);
  assert.match(component, /moreOpen \|\| moreActive/);
  assert.match(css, /\.app-floating-nav::after/);
  assert.match(css, /--app-nav-item-radius:\s*var\(--ui-radius-dialog\)/);
  assert.match(css, /border-radius:\s*var\(--app-nav-item-radius\)/);
  assert.match(css, /transform:\s*translate3d\(var\(--app-nav-indicator-x\), 0, 0\)/);
  assert.match(css, /cubic-bezier\(0\.28, 1\.42, 0\.38, 1\)/);
  assert.match(css, /backdrop-filter:\s*blur\(18px\) saturate\(1\.45\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
