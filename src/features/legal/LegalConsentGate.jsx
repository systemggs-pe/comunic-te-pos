import React from 'react';
import {Check, FileText, ShieldCheck} from 'lucide-react';
import {LEGAL_DOCUMENT_VERSION} from '../../config/legal.js';

export function LegalConsentGate({accepted, onAcceptedChange}) {
  return (
    <div className="legal-consent">
      <label className="flex cursor-pointer items-start gap-3">
        <span className="legal-consent__checkbox" data-checked={accepted}>
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
          <span className="block text-sm font-bold text-[var(--ui-text)]">
            He leído y acepto los Términos y Condiciones y la Política de Privacidad.
          </span>
          <span id="legal-consent-help" className="mt-1 block text-xs leading-5 text-[var(--ui-text-tertiary)]">
            Registraremos versión {LEGAL_DOCUMENT_VERSION}, fecha, cuenta, navegador e IP disponible para auditoría legal.
          </span>
        </span>
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        <a href="/terms-and-conditions" className="legal-consent__link">
          <FileText size={14} /> Términos
        </a>
        <a href="/privacy-policy" className="legal-consent__link">
          <ShieldCheck size={14} /> Privacidad
        </a>
        <a href="/cookies" className="legal-consent__link legal-consent__link--quiet">
          Cookies
        </a>
        <a href="/community-guidelines" className="legal-consent__link legal-consent__link--quiet">
          Uso aceptable
        </a>
      </div>
    </div>
  );
}
