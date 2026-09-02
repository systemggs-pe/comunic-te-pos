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
    <footer className="app-footer">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <span className="font-semibold text-[var(--ui-text-secondary)]">{PRODUCT_BRAND}</span>
        <span aria-hidden="true">·</span>
        <span>{SOFTWARE_BRAND}</span>
        <span className="hidden sm:inline" aria-hidden="true">·</span>
        <span className="hidden sm:inline">by {CORPORATE_PARENT} / {ENGINEERING_DIVISION}</span>
        <span aria-hidden="true">·</span>
        <span>{SYSTEM_VERSION}</span>
        <span aria-hidden="true">·</span>
        <a href="/privacy-policy">Privacidad</a>
        <a href="/terms-and-conditions">Términos</a>
        <span className="hidden sm:inline" aria-hidden="true">·</span>
        <span className="hidden sm:inline">© {year}</span>
      </div>
    </footer>
  );
}
