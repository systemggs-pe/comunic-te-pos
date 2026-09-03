import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {
  APP_LAUNCH_EVENT,
  APP_LAUNCH_DURATION_MS,
  APP_LAUNCH_REDUCED_DURATION_MS,
  getLaunchAnimationDuration,
  requestLaunchAnimation,
} from '../../src/components/branding/launchAnimationState.js';

test('each successful login request emits a fresh launch event', () => {
  const target = new EventTarget();
  let launches = 0;
  target.addEventListener(APP_LAUNCH_EVENT, () => { launches += 1; });

  assert.equal(requestLaunchAnimation(target), true);
  assert.equal(requestLaunchAnimation(target), true);
  assert.equal(launches, 2);
  assert.equal(requestLaunchAnimation(null), false);
});

test('reduced motion uses the short launch duration', () => {
  assert.equal(getLaunchAnimationDuration(false), APP_LAUNCH_DURATION_MS);
  assert.equal(getLaunchAnimationDuration(true), APP_LAUNCH_REDUCED_DURATION_MS);
  assert.ok(APP_LAUNCH_REDUCED_DURATION_MS < APP_LAUNCH_DURATION_MS);
});

test('login and root wire the launch event after authentication', async () => {
  const [login, root, launch] = await Promise.all([
    readFile(new URL('../../src/features/auth/LoginScreen.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/app/RootApplication.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/components/branding/AppLaunchAnimation.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(login, /await registrarConsentimientoLegal/);
  assert.match(login, /requestLaunchAnimation\(window\)/);
  assert.match(root, /addEventListener\(APP_LAUNCH_EVENT/);
  assert.match(root, /useState\(false\)/);
  assert.doesNotMatch(root, /localStorage|sessionStorage/);
  assert.ok(launch.indexOf('app-launch__product') < launch.indexOf('app-launch__credit'));
  assert.ok(launch.indexOf('app-launch__credit') < launch.indexOf('app-launch__version'));
});

test('the launch version applies frosted styling to the glyphs without a container', async () => {
  const css = await readFile(new URL('../../src/index.css', import.meta.url), 'utf8');
  const block = css.match(/\.app-launch__version\s*\{([^}]+)\}/g)?.at(1) || '';

  assert.match(block, /background-clip:\s*text/);
  assert.match(block, /-webkit-text-fill-color:\s*transparent/);
  assert.match(block, /-webkit-text-stroke:/);
  assert.doesNotMatch(block, /(?:^|\s)(?:border|border-radius|padding|box-shadow|backdrop-filter):/m);
});
