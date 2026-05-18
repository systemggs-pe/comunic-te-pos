import React from 'react';
import { DIGITAL_SIGNATURE, SPLASH_VERSION } from '../../config/branding.js';

export function IntroSplash() {
  return (
    <div className="ggs-splash-screen fixed inset-0 z-[9999] flex items-center justify-center bg-[oklch(0.982_0.005_250)] text-slate-950">
      <div className="ggs-splash-logo px-6 text-center">
        <div className="mx-auto mb-5 h-px w-28 bg-blue-200" />
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Bienvenidos a</p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">COMUNIC@TE</h1>
        <p className="mt-3 text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">{SPLASH_VERSION} by {DIGITAL_SIGNATURE}</p>
      </div>
    </div>
  );
}
