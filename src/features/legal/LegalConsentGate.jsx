import React from 'react';
import {Check, FileText, ShieldCheck} from 'lucide-react';
import {LEGAL_DOCUMENT_VERSION} from '../../config/legal.js';

export function LegalConsentGate({accepted, onAcceptedChange}) {
  return (
    <div className="mt-7 rounded-xl border border-[oklch(0.88_0.018_250)] bg-[oklch(0.988_0.006_250)] p-4 text-left">
      <label className="flex cursor-pointer items-start gap-3">
        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${accepted ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 bg-white text-transparent'}`}>
          <input
            type="checkbox"
            checked={accepted}
            onChange={event => onAcceptedChange(event.target.checked)}
            className="sr-only"
            aria-describedby="legal-consent-help"
          />
          <Check size={14} aria-hidden="true" />
        </span>
        <span>
          <span className="block text-sm font-black text-[oklch(0.26_0.028_255)]">
            He leido y acepto los Terminos y Condiciones y la Politica de Privacidad.
          </span>
          <span id="legal-consent-help" className="mt-1 block text-xs leading-5 text-[oklch(0.52_0.024_255)]">
            Registraremos version {LEGAL_DOCUMENT_VERSION}, fecha, cuenta, navegador e IP disponible para auditoria legal.
          </span>
        </span>
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        <a href="/terms-and-conditions" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <FileText size={14} /> Terminos
        </a>
        <a href="/privacy-policy" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <ShieldCheck size={14} /> Privacidad
        </a>
        <a href="/cookies" className="inline-flex min-h-9 items-center rounded-lg px-3 text-xs font-bold text-slate-500 hover:bg-white hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
          Cookies
        </a>
        <a href="/community-guidelines" className="inline-flex min-h-9 items-center rounded-lg px-3 text-xs font-bold text-slate-500 hover:bg-white hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
          Anti abuso
        </a>
      </div>
    </div>
  );
}
