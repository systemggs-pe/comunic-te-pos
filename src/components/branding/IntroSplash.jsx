import React from 'react';
import { DIGITAL_SIGNATURE, SPLASH_VERSION } from '../../config/branding.js';

export function IntroSplash() {
  return (
    <div className="ggs-splash-screen fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950 text-white">
      <div className="ggs-splash-logo text-center px-6">
        <p className="text-xs md:text-sm font-semibold tracking-[0.4em] text-blue-300 mb-4">BIENVENIDO</p>
        <h1 className="text-4xl md:text-7xl font-black tracking-wide">{DIGITAL_SIGNATURE}</h1>
        <p className="mt-3 text-xl md:text-3xl font-bold text-blue-200">{SPLASH_VERSION}</p>
      </div>
    </div>
  );
}
