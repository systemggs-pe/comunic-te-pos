import React from 'react';

const WHATSAPP_URL = 'https://wa.me/51929138755';
const SUPPORT_EMAIL = 'systemggs.pe@gmail.com';

export function AppFooter() {
  return (
    <footer className="shrink-0 border-t border-gray-200 bg-white/95 px-4 py-2 text-center text-[11px] text-gray-500">
      <span>Creado por <strong className="font-semibold text-gray-700">GGS System v5.0.0</strong></span>
      <span className="mx-2 text-gray-300">|</span>
      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-green-700 hover:text-green-800 hover:underline"
      >
        Soporte +51929138755
      </a>
      <span className="mx-2 text-gray-300">|</span>
      <a
        href={`mailto:${SUPPORT_EMAIL}`}
        className="font-medium text-blue-700 hover:text-blue-800 hover:underline"
      >
        {SUPPORT_EMAIL}
      </a>
    </footer>
  );
}
