import React, {useCallback, useEffect, useState} from 'react';
import App from './App.jsx';
import {AppLaunchAnimation} from '../components/branding/AppLaunchAnimation.jsx';
import {APP_LAUNCH_EVENT} from '../components/branding/launchAnimationState.js';

export function RootApplication() {
  const [showLaunch, setShowLaunch] = useState(false);
  const [launchRun, setLaunchRun] = useState(0);

  useEffect(() => {
    const handleSuccessfulLogin = () => {
      setLaunchRun(current => current + 1);
      setShowLaunch(true);
    };
    window.addEventListener(APP_LAUNCH_EVENT, handleSuccessfulLogin);
    return () => window.removeEventListener(APP_LAUNCH_EVENT, handleSuccessfulLogin);
  }, []);

  const finishLaunch = useCallback(() => setShowLaunch(false), []);

  return (
    <div className="app-root-frame">
      <div className="app-root-content" inert={showLaunch || undefined} aria-hidden={showLaunch ? 'true' : undefined}>
        <App />
      </div>
      {showLaunch && <AppLaunchAnimation key={launchRun} onComplete={finishLaunch} />}
    </div>
  );
}
