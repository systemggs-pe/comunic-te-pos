import assert from 'node:assert/strict';
import test from 'node:test';
import {resolveFirebaseWebConfig} from '../../src/config/firebaseEnvironment.js';

const original = {projectId: 'original', apiKey: 'original-key'};
test('unconfigured environment preserves the current Firebase project', () => {
  assert.deepEqual(resolveFirebaseWebConfig({}, original), original);
  assert.deepEqual(resolveFirebaseWebConfig({VITE_FIREBASE_PROJECT_ID: '  '}, original), original);
});

test('complete environment switches all Firebase web configuration without mixing projects', () => {
  const env = {
    VITE_FIREBASE_API_KEY: 'public-fixture-key',
    VITE_FIREBASE_AUTH_DOMAIN: 'temporary.firebaseapp.com',
    VITE_FIREBASE_PROJECT_ID: ' temporary ',
    VITE_FIREBASE_STORAGE_BUCKET: 'temporary.firebasestorage.app',
    VITE_FIREBASE_MESSAGING_SENDER_ID: '123',
    VITE_FIREBASE_APP_ID: '1:123:web:fixture',
    FIREBASE_SERVICE_ACCOUNT: 'private-fixture-must-not-be-exported',
  };
  const config = resolveFirebaseWebConfig(env, original);
  assert.deepEqual(config, {
    apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: 'temporary', storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: '123', appId: env.VITE_FIREBASE_APP_ID,
  });
  assert.ok(!JSON.stringify(config).includes(env.FIREBASE_SERVICE_ACCOUNT));
});

test('partial override fails before initializing Firebase instead of using original-project defaults', () => {
  assert.throws(() => resolveFirebaseWebConfig({VITE_FIREBASE_PROJECT_ID: 'temporary'}, original),
    /FIREBASE_WEB_CONFIG_INCOMPLETE: VITE_FIREBASE_API_KEY/);
});
