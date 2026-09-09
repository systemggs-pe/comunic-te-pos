import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

test('floating navigation uses a transform-driven matte frosted active indicator', async () => {
  const [component, css] = await Promise.all([
    readFile(new URL('../../src/components/navigation/FloatingNavigation.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/index.css', import.meta.url), 'utf8'),
  ]);

  assert.match(component, /data-active-index=\{activeIndex\}/);
  assert.match(component, /'--app-nav-indicator-x': indicatorOffset/);
  assert.match(component, /moreOpen \|\| moreActive/);
  assert.match(css, /\.app-floating-nav::after/);
  assert.match(css, /--app-nav-item-radius:\s*var\(--ui-radius-dialog\)/);
  assert.match(css, /--app-nav-height:\s*4\.45rem/);
  assert.match(css, /border-radius:\s*var\(--app-nav-item-radius\)/);
  assert.match(css, /transform:\s*translate3d\(var\(--app-nav-indicator-x\), 0, 0\)/);
  assert.match(css, /cubic-bezier\(0\.28, 1\.42, 0\.38, 1\)/);
  assert.match(css, /--ui-nav-glass:\s*oklch\(0\.965 0\.008 255 \/ 0\.58\)/);
  assert.match(css, /backdrop-filter:\s*blur\(20px\) saturate\(1\.03\)/);
  assert.match(css, /\.app-floating-nav::after[\s\S]*background:\s*color-mix\(in oklch, var\(--ui-surface-raised\) 46%, transparent\)/);
  assert.match(css, /\.app-floating-nav__item\[aria-current="page"\]::before[\s\S]*background:\s*color-mix\(in oklch, var\(--ui-surface-raised\) 18%, transparent\)/);
  assert.match(css, /\.app-more-panel[\s\S]*bottom:\s*calc\(max\(0\.65rem, env\(safe-area-inset-bottom\)\) \+ var\(--app-nav-height\) \+ 0\.75rem\)/);
  assert.doesNotMatch(css, /radial-gradient\(62% 72% at 50% 8%/);
  assert.doesNotMatch(css, /radial-gradient\(80% 95% at 50% 0%/);
  assert.doesNotMatch(css, /inset 0 -14px 24px -22px/);
  assert.doesNotMatch(css, /backdrop-filter:\s*blur\(22px\) saturate\(1\.7\) contrast\(1\.04\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
