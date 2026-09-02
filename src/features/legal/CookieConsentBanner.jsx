import React, {useState} from 'react';
import {Cookie, Settings2, X} from 'lucide-react';
import {Button, IconButton} from '../../components/ui/Button.jsx';
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
  const [showDetails, setShowDetails] = useState(false);
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
    <aside className="cookie-panel" aria-labelledby="cookie-title">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="cookie-panel__icon" aria-hidden="true">
            <Cookie size={18} />
          </span>
          <div>
            <p id="cookie-title" className="text-sm font-bold text-[var(--ui-text)]">Tu privacidad, bajo tu control</p>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--ui-text-tertiary)] sm:text-sm">
              Usamos cookies esenciales para seguridad y sesión. Analítica y marketing permanecen desactivados hasta que los autorices.
            </p>
          </div>
        </div>
        <IconButton size="sm" label="Cerrar preferencias" onClick={() => setState(prev => ({...prev, open: false}))}><X size={17} /></IconButton>
      </div>

      {showDetails && <div className="cookie-panel__preferences">
        {[
          ['essential', 'Esenciales', 'Necesarias para seguridad y funcionamiento.', true],
          ['analytics', 'Analiticas', 'Medicion agregada de rendimiento y uso.', false],
          ['marketing', 'Marketing', 'Personalizacion comercial y medicion de campanas.', false],
        ].map(([key, label, description, disabled]) => (
          <label key={key} className="cookie-panel__preference">
            <span>
              <span className="block text-sm font-semibold text-[var(--ui-text)]">{label}</span>
              <span className="mt-1 block text-xs leading-5 text-[var(--ui-text-tertiary)]">{description}</span>
            </span>
            <span className="mt-3 flex items-center gap-2 text-xs font-semibold text-[var(--ui-text-secondary)]">
              <input
                type="checkbox"
                checked={Boolean(prefs[key])}
                disabled={disabled}
                onChange={event => setState(prev => ({...prev, prefs: {...prev.prefs, [key]: event.target.checked}}))}
                className="h-4 w-4 rounded border-[var(--ui-border-strong)] accent-[var(--ui-accent)] disabled:opacity-60"
              />
              {disabled ? 'Siempre activa' : 'Permitir'}
            </span>
          </label>
        ))}
      </div>}

      <div className="cookie-panel__actions">
        <button type="button" onClick={() => setShowDetails(value => !value)} className="cookie-panel__manage"><Settings2 size={15} /> {showDetails ? 'Ocultar opciones' : 'Administrar'}</button>
        <a href="/cookies" className="cookie-panel__policy">Política de cookies</a>
        <Button size="sm" onClick={() => save(DEFAULT_COOKIE_PREFS)}>Solo esenciales</Button>
        {showDetails && <Button size="sm" onClick={() => save(prefs)}>Guardar selección</Button>}
        <Button size="sm" variant="primary" onClick={() => save({essential: true, analytics: true, marketing: true})}>Aceptar todo</Button>
      </div>
    </aside>
  );
}
