import React from 'react';
import { ENGINEERING_DIVISION, PRODUCT_BRAND, SOFTWARE_BRAND, SPLASH_VERSION } from '../../config/branding.js';

export function IntroSplash() {
  return (
    <div className="ggs-splash-screen fixed inset-0 z-[9999] flex items-center justify-center bg-[oklch(0.982_0.005_250)] text-slate-950">
      <div className="ggs-splash-logo px-6 text-center">
        <div className="mx-auto mb-5 h-px w-28 bg-blue-200" />
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{SOFTWARE_BRAND}</p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">{PRODUCT_BRAND}</h1>
        <p className="mt-3 text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">{SPLASH_VERSION} engineered by {ENGINEERING_DIVISION}</p>
      </div>
    </div>
  );
}
