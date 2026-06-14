import React from 'react';
import {
  CORPORATE_PARENT,
  ENGINEERING_DIVISION,
  PRODUCT_BRAND,
  SOFTWARE_BRAND,
  SYSTEM_VERSION,
} from '../../config/branding.js';

export function AppFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="shrink-0 border-t border-slate-200 bg-white px-3 py-1.5 text-[10px] text-slate-500 sm:text-[11px]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <span className="font-semibold text-slate-700">{PRODUCT_BRAND}</span>
        <span className="text-slate-300">|</span>
        <span>{SOFTWARE_BRAND}</span>
        <span className="hidden sm:inline text-slate-300">|</span>
        <span className="hidden sm:inline">by {CORPORATE_PARENT} / {ENGINEERING_DIVISION}</span>
        <span className="text-slate-300">|</span>
        <span>{SYSTEM_VERSION}</span>
        <span className="text-slate-300">|</span>
        <a href="/privacy-policy" className="font-medium text-slate-600 hover:text-slate-900 hover:underline">Privacidad</a>
        <a href="/terms-and-conditions" className="font-medium text-slate-600 hover:text-slate-900 hover:underline">Terminos</a>
        <span className="hidden sm:inline text-slate-300">|</span>
        <span className="hidden sm:inline">Copyright {year}</span>
      </div>
    </footer>
  );
}
