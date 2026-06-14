import React, {useState} from 'react';
import {Cookie, Settings2, X} from 'lucide-react';
import {LEGAL_DOCUMENT_VERSION} from '../../config/legal.js';
import {COOKIE_PREFS_STORAGE_KEY, DEFAULT_COOKIE_PREFS, readStoredCookiePrefs} from './cookiePreferences.js';

function getInitialState() {
  const current = readStoredCookiePrefs();
  return {
    stored: current,
    open: !current,
    prefs: current?.preferences || DEFAULT_COOKIE_PREFS,
  };
}

export function CookieConsentBanner() {
  const [state, setState] = useState(getInitialState);
  const {open, prefs} = state;

  const save = (nextPrefs) => {
    const payload = {
      version: LEGAL_DOCUMENT_VERSION,
      acceptedAt: new Date().toISOString(),
      preferences: {...DEFAULT_COOKIE_PREFS, ...nextPrefs, essential: true},
    };
    window.localStorage.setItem(COOKIE_PREFS_STORAGE_KEY, JSON.stringify(payload));
    setState({stored: payload, prefs: payload.preferences, open: false});
  };

  if (!open) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[130] mx-auto max-w-4xl rounded-2xl border border-[oklch(0.88_0.018_250)] bg-[oklch(0.998_0.003_250)] p-4 text-[oklch(0.24_0.028_255)] shadow-[0_24px_70px_oklch(0.32_0.035_255_/_0.18)] sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700">
            <Cookie size={20} />
          </span>
          <div>
            <p className="text-sm font-black">Preferencias de cookies</p>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
              Usamos cookies esenciales para seguridad y sesion. Las analiticas y marketing permanecen desactivadas hasta que las autorices.
            </p>
          </div>
        </div>
        <button type="button" onClick={() => setState(prev => ({...prev, open: false}))} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700" aria-label="Cerrar preferencias">
          <X size={18} />
        </button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {[
          ['essential', 'Esenciales', 'Necesarias para seguridad y funcionamiento.', true],
          ['analytics', 'Analiticas', 'Medicion agregada de rendimiento y uso.', false],
          ['marketing', 'Marketing', 'Personalizacion comercial y medicion de campanas.', false],
        ].map(([key, label, description, disabled]) => (
          <label key={key} className="flex min-h-28 cursor-pointer flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-3 transition-colors hover:bg-white">
            <span>
              <span className="block text-sm font-black text-slate-900">{label}</span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>
            </span>
            <span className="mt-3 flex items-center gap-2 text-xs font-bold text-slate-600">
              <input
                type="checkbox"
                checked={Boolean(prefs[key])}
                disabled={disabled}
                onChange={event => setState(prev => ({...prev, prefs: {...prev.prefs, [key]: event.target.checked}}))}
                className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-500 disabled:opacity-60"
              />
              {disabled ? 'Siempre activa' : 'Permitir'}
            </span>
          </label>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <a href="/cookies" className="inline-flex min-h-10 items-center justify-center rounded-lg px-3 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900">
          <Settings2 size={16} className="mr-2" /> Ver politica
        </a>
        <button type="button" onClick={() => save(DEFAULT_COOKIE_PREFS)} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50">
          Rechazar no esenciales
        </button>
        <button type="button" onClick={() => save(prefs)} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-blue-700 bg-blue-700 px-4 text-sm font-black text-white hover:bg-blue-800">
          Guardar preferencias
        </button>
        <button type="button" onClick={() => save({essential: true, analytics: true, marketing: true})} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-900 bg-slate-950 px-4 text-sm font-black text-white hover:bg-slate-800">
          Aceptar todo
        </button>
      </div>
    </div>
  );
}
