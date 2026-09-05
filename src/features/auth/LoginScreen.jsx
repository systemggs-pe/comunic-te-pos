import React, {useState} from 'react';
import {ArrowRight, Fingerprint, LockKeyhole, ShieldCheck} from 'lucide-react';
import {GoogleAuthProvider, signInWithPopup, signOut} from 'firebase/auth';
import {CORPORATE_PARENT, DIGITAL_SIGNATURE, ENGINEERING_DIVISION, PRODUCT_BRAND, SOFTWARE_BRAND} from '../../config/branding.js';
import {LEGAL_DOCUMENT_VERSION, getRequiredLegalSnapshot} from '../../config/legal.js';
import {registrarConsentimientoLegal} from '../../services/functionsClient.js';
import {LegalConsentGate} from '../legal/LegalConsentGate.jsx';
import {getCookiePreferences} from '../legal/cookiePreferences.js';
import {requestLaunchAnimation} from '../../components/branding/launchAnimationState.js';

function GoogleIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

export function LoginScreen({showToast, EMAILS_PERMITIDOS, auth}) {
  const [isLoading, setIsLoading] = useState(false);
  const year = new Date().getFullYear();
  const consentStorageKey = `comunicate_legal_acceptance_${LEGAL_DOCUMENT_VERSION}`;
  const [acceptedAt, setAcceptedAt] = useState(() => typeof window === 'undefined' ? '' : window.localStorage.getItem(consentStorageKey) || '');
  const hasAcceptedLegal = Boolean(acceptedAt);

  const updateLegalAcceptance = (checked) => {
    const nextAcceptedAt = checked ? new Date().toISOString() : '';
    setAcceptedAt(nextAcceptedAt);
    if (checked) window.localStorage.setItem(consentStorageKey, nextAcceptedAt);
    else window.localStorage.removeItem(consentStorageKey);
  };

  const handleGoogleLogin = async () => {
    if (!hasAcceptedLegal) {
      showToast('Debes aceptar los documentos legales antes de ingresar.', 'error');
      return;
    }
    setIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      if (!EMAILS_PERMITIDOS.includes(result.user.email)) {
        await signOut(auth);
        showToast('Acceso denegado. Tu correo no está autorizado.', 'error');
        return;
      }
      requestLaunchAnimation(window);
      await registrarConsentimientoLegal({
        accepted: true,
        acceptedAt,
        documentVersion: LEGAL_DOCUMENT_VERSION,
        documents: getRequiredLegalSnapshot(),
        cookiePreferences: getCookiePreferences(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
        locale: navigator.language || '',
        source: 'pre-login-gate',
      });
      showToast('Sesión iniciada con Google');
    } catch (error) {
      console.error('Error Google Auth:', error);
      if (auth.currentUser && error.code !== 'auth/popup-closed-by-user') await signOut(auth).catch(() => {});
      if (error.code === 'auth/unauthorized-domain') showToast('Firebase no autoriza este dominio. Usa localhost o agrega el dominio en Authentication > Settings.', 'error');
      else if (error.code === 'auth/popup-blocked') showToast('El navegador bloqueó la ventana de Google. Permite ventanas emergentes o usa Chrome.', 'error');
      else if (error.code === 'auth/popup-closed-by-user') showToast('La ventana de Google se cerró antes de completar el acceso.', 'error');
      else if (error.message === 'AUTH_REQUIRED') showToast('La sesión de Google no quedó disponible para registrar el consentimiento.', 'error');
      else showToast('No se pudo registrar el consentimiento legal. Revisa la conexión y vuelve a intentar.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <header className="login-topbar">
        <span className="login-brand-mark" aria-hidden="true">CM</span>
        <div><p>{PRODUCT_BRAND}</p><span>{SOFTWARE_BRAND}</span></div>
        <span className="login-secure-label"><LockKeyhole size={14} /> Acceso protegido</span>
      </header>

      <main className="login-main">
        <section className="login-intro">
          <p className="ui-eyebrow">Operación centralizada</p>
          <h1>Claridad para cada equipo, venta y cliente.</h1>
          <p>Un espacio de trabajo preciso para mantener la operación ordenada, segura y fácil de consultar.</p>
          <div className="login-trust-line"><ShieldCheck size={18} /><span>Acceso restringido a cuentas autorizadas</span></div>
        </section>

        <section className="login-panel" aria-labelledby="login-title">
          <span className="login-panel__icon" aria-hidden="true"><Fingerprint size={24} /></span>
          <p className="ui-eyebrow">Bienvenido</p>
          <h2 id="login-title">Inicia sesión</h2>
          <p className="login-panel__description">Usa tu cuenta Google autorizada para acceder a {PRODUCT_BRAND}.</p>
          <LegalConsentGate accepted={hasAcceptedLegal} onAcceptedChange={updateLegalAcceptance} />
          <button type="button" onClick={handleGoogleLogin} disabled={isLoading || !hasAcceptedLegal} className="login-google-button">
            <span>{isLoading ? <span className="ui-button__spinner" aria-hidden="true" /> : <GoogleIcon />}{isLoading ? 'Validando acceso…' : 'Continuar con Google'}</span>
            <ArrowRight size={17} aria-hidden="true" />
          </button>
          <p className="login-panel__note">La sesión se mantiene protegida y vinculada a tu aceptación legal.</p>
        </section>
      </main>

      <footer className="login-footer">
        <span>© {year} {PRODUCT_BRAND}</span><span>·</span><span>{SOFTWARE_BRAND} by {CORPORATE_PARENT}</span><span>·</span><span>{ENGINEERING_DIVISION} / {DIGITAL_SIGNATURE}</span>
        <nav aria-label="Documentos legales"><a href="/terms-and-conditions">Términos</a><a href="/privacy-policy">Privacidad</a></nav>
      </footer>
    </div>
  );
}
