import React, {useCallback, useEffect, useRef, useState} from 'react';
import App from './App.jsx';
import {AppLaunchAnimation} from '../components/branding/AppLaunchAnimation.jsx';
import {
  APP_LAUNCH_EVENT,
  APP_LAUNCH_INTERVAL_MS,
  APP_LAUNCH_STOP_EVENT,
  markLaunchActivity,
  shouldLaunchAfterInactivity,
} from '../components/branding/launchAnimationState.js';

export function RootApplication() {
  const [showLaunch, setShowLaunch] = useState(() => (
    typeof window !== 'undefined' ? shouldLaunchAfterInactivity(window) : false
  ));
  const [launchRun, setLaunchRun] = useState(0);
  const recurringLaunchRef = useRef(null);
  const initialLaunchRef = useRef(showLaunch);

  const runLaunch = useCallback(() => {
    markLaunchActivity(window);
    setLaunchRun(current => current + 1);
    setShowLaunch(true);
  }, []);

  useEffect(() => {
    const clearRecurringLaunch = () => {
      if (!recurringLaunchRef.current) return;
      window.clearInterval(recurringLaunchRef.current);
      recurringLaunchRef.current = null;
    };
    const startRecurringLaunch = () => {
      clearRecurringLaunch();
      recurringLaunchRef.current = window.setInterval(runLaunch, APP_LAUNCH_INTERVAL_MS);
    };
    const markInactive = () => {
      markLaunchActivity(window);
      clearRecurringLaunch();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        markInactive();
        return;
      }
      if (shouldLaunchAfterInactivity(window)) runLaunch();
      startRecurringLaunch();
    };
    const handleLaunchRequest = () => {
      runLaunch();
      startRecurringLaunch();
    };
    const handleLaunchStop = () => {
      clearRecurringLaunch();
      markLaunchActivity(window);
      setShowLaunch(false);
    };
    if (initialLaunchRef.current) markLaunchActivity(window);
    if (document.visibilityState !== 'hidden') startRecurringLaunch();
    window.addEventListener(APP_LAUNCH_EVENT, handleLaunchRequest);
    window.addEventListener(APP_LAUNCH_STOP_EVENT, handleLaunchStop);
    window.addEventListener('pagehide', markInactive);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener(APP_LAUNCH_EVENT, handleLaunchRequest);
      window.removeEventListener(APP_LAUNCH_STOP_EVENT, handleLaunchStop);
      window.removeEventListener('pagehide', markInactive);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearRecurringLaunch();
    };
  }, [runLaunch]);

  const finishLaunch = useCallback(() => {
    markLaunchActivity(window);
    setShowLaunch(false);
  }, []);

  return (
    <div className="app-root-frame">
      <div
        className="app-root-content"
        data-launch-hidden={showLaunch ? 'true' : undefined}
        inert={showLaunch || undefined}
        aria-hidden={showLaunch ? 'true' : undefined}
      >
        <App />
      </div>
      {showLaunch && <AppLaunchAnimation key={launchRun} onComplete={finishLaunch} />}
    </div>
  );
}
