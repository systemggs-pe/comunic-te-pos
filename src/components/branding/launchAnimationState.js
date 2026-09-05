export const APP_LAUNCH_EVENT = 'comunicate:launch-after-login';
export const APP_LAUNCH_STOP_EVENT = 'comunicate:launch-stop';
export const APP_LAUNCH_DURATION_MS = 3600;
export const APP_LAUNCH_REDUCED_DURATION_MS = 700;
export const APP_LAUNCH_INTERVAL_MS = 30 * 60 * 1000;

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
