import React, {useEffect, useLayoutEffect} from 'react';
import {ENGINEERING_DIVISION, PRODUCT_BRAND, SYSTEM_VERSION} from '../../config/branding.js';
import {getLaunchAnimationDuration} from './launchAnimationState.js';

export function AppLaunchAnimation({onComplete}) {
  useLayoutEffect(() => {
    document.documentElement.dataset.launchActive = 'true';
    return () => delete document.documentElement.dataset.launchActive;
  }, []);

  useEffect(() => {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    const timeoutId = window.setTimeout(onComplete, getLaunchAnimationDuration(reducedMotion));
    return () => window.clearTimeout(timeoutId);
  }, [onComplete]);

  return (
    <section
      className="app-launch"
      role="status"
      aria-live="polite"
      aria-label={`${PRODUCT_BRAND}. Powered by ${ENGINEERING_DIVISION}. Versión ${SYSTEM_VERSION}.`}
    >
      <div className="app-launch__sequence" aria-hidden="true">
        <div className="app-launch__product">{PRODUCT_BRAND}</div>
        <div className="app-launch__credit">Powered by <strong>{ENGINEERING_DIVISION}</strong></div>
        <div className="app-launch__version">{SYSTEM_VERSION}</div>
      </div>
    </section>
  );
}
