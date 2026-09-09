export const APP_LAUNCH_EVENT = 'comunicate:launch-after-login';
export const APP_LAUNCH_STOP_EVENT = 'comunicate:launch-stop';
export const APP_LAUNCH_DURATION_MS = 3600;
export const APP_LAUNCH_REDUCED_DURATION_MS = 700;
export const APP_LAUNCH_INTERVAL_MS = 30 * 60 * 1000;
export const APP_LAUNCH_LAST_ACTIVE_KEY = 'comunicate:last-app-presence-at';

function storageFor(target) {
  try {
    return target?.localStorage || null;
  } catch {
    return null;
  }
}

function readLastActive(target = globalThis) {
  const value = Number(storageFor(target)?.getItem(APP_LAUNCH_LAST_ACTIVE_KEY) || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function markLaunchActivity(target = globalThis, nowMs = Date.now()) {
  const storage = storageFor(target);
  if (!storage) return false;
  storage.setItem(APP_LAUNCH_LAST_ACTIVE_KEY, String(nowMs));
  return true;
}

export function shouldLaunchAfterInactivity(target = globalThis, nowMs = Date.now()) {
  const lastActive = readLastActive(target);
  return Boolean(lastActive && nowMs - lastActive >= APP_LAUNCH_INTERVAL_MS);
}

export function requestLaunchAnimation(target = globalThis) {
  const EventConstructor = target?.Event || globalThis.Event;
  if (typeof target?.dispatchEvent !== 'function' || typeof EventConstructor !== 'function') return false;
  target.dispatchEvent(new EventConstructor(APP_LAUNCH_EVENT));
  return true;
}

export function stopLaunchAnimation(target = globalThis) {
  const EventConstructor = target?.Event || globalThis.Event;
  if (typeof target?.dispatchEvent !== 'function' || typeof EventConstructor !== 'function') return false;
  target.dispatchEvent(new EventConstructor(APP_LAUNCH_STOP_EVENT));
  return true;
}

export function getLaunchAnimationDuration(reducedMotion) {
  return reducedMotion ? APP_LAUNCH_REDUCED_DURATION_MS : APP_LAUNCH_DURATION_MS;
}
