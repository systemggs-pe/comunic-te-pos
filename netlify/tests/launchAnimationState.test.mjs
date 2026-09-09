import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {
  APP_LAUNCH_EVENT,
  APP_LAUNCH_DURATION_MS,
  APP_LAUNCH_INTERVAL_MS,
  APP_LAUNCH_LAST_ACTIVE_KEY,
  APP_LAUNCH_REDUCED_DURATION_MS,
  APP_LAUNCH_STOP_EVENT,
  getLaunchAnimationDuration,
  markLaunchActivity,
  requestLaunchAnimation,
  shouldLaunchAfterInactivity,
  stopLaunchAnimation,
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

test('launch animation can be stopped and is scheduled every 30 minutes', () => {
  const target = new EventTarget();
  let stops = 0;
  target.addEventListener(APP_LAUNCH_STOP_EVENT, () => { stops += 1; });

  assert.equal(APP_LAUNCH_INTERVAL_MS, 30 * 60 * 1000);
  assert.equal(stopLaunchAnimation(target), true);
  assert.equal(stops, 1);
  assert.equal(stopLaunchAnimation(null), false);
});

test('launch animation is due after 30 minutes outside the app', () => {
  const storage = new Map();
  const target = {
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
    },
  };

  assert.equal(markLaunchActivity(target, 1_700_000_000_000), true);
  assert.equal(storage.get(APP_LAUNCH_LAST_ACTIVE_KEY), '1700000000000');
  assert.equal(shouldLaunchAfterInactivity(target, 1_700_000_000_000 + APP_LAUNCH_INTERVAL_MS - 1), false);
  assert.equal(shouldLaunchAfterInactivity(target, 1_700_000_000_000 + APP_LAUNCH_INTERVAL_MS), true);
});

test('reduced motion uses the short launch duration', () => {
  assert.equal(getLaunchAnimationDuration(false), APP_LAUNCH_DURATION_MS);
  assert.equal(getLaunchAnimationDuration(true), APP_LAUNCH_REDUCED_DURATION_MS);
  assert.ok(APP_LAUNCH_REDUCED_DURATION_MS < APP_LAUNCH_DURATION_MS);
});

test('login and root wire the launch event after authentication', async () => {
  const [login, root, app, launch] = await Promise.all([
    readFile(new URL('../../src/features/auth/LoginScreen.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/app/RootApplication.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/app/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/components/branding/AppLaunchAnimation.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(login, /await registrarConsentimientoLegal/);
  assert.match(login, /requestLaunchAnimation\(window\)/);
  assert.ok(login.indexOf('requestLaunchAnimation(window)') < login.indexOf('await registrarConsentimientoLegal'));
  assert.match(root, /addEventListener\(APP_LAUNCH_EVENT/);
  assert.match(root, /addEventListener\(APP_LAUNCH_STOP_EVENT/);
  assert.match(root, /addEventListener\('pagehide', markInactive\)/);
  assert.match(root, /document\.addEventListener\('visibilitychange', handleVisibilityChange\)/);
  assert.match(root, /window\.setInterval\(runLaunch, APP_LAUNCH_INTERVAL_MS\)/);
  assert.match(root, /window\.clearInterval\(recurringLaunchRef\.current\)/);
  assert.match(root, /data-launch-hidden=\{showLaunch \? 'true' : undefined\}/);
  assert.match(root, /shouldLaunchAfterInactivity\(window\)/);
  assert.match(root, /markLaunchActivity\(window\)/);
  assert.match(app, /stopLaunchAnimation\(window\)/);
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
