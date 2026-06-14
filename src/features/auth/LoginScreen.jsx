import React, { useState } from 'react';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Database,
  Fingerprint,
  LockKeyhole,
  ScanLine,
  ShieldCheck,
} from 'lucide-react';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import {
  BRAND_COPY,
  CORPORATE_PARENT,
  DIGITAL_SIGNATURE,
  ENGINEERING_DIVISION,
  PRODUCT_BRAND,
  SOFTWARE_BRAND,
} from '../../config/branding.js';
import { LEGAL_DOCUMENT_VERSION, getRequiredLegalSnapshot } from '../../config/legal.js';
import { registrarConsentimientoLegal } from '../../services/functionsClient.js';
import { BrandEcosystemStrip, BrandWordmark, TechnicalBadges } from '../../components/branding/BrandEcosystem.jsx';
import { LegalConsentGate } from '../legal/LegalConsentGate.jsx';
import { getCookiePreferences } from '../legal/cookiePreferences.js';

const OPERATION_ROWS = [
  { Icon: ScanLine, title: 'Registros', detail: 'IMEI, estado y cliente', value: 'Listo', tone: 'text-blue-700 bg-blue-50 border-blue-100' },
  { Icon: Activity, title: 'Ventas', detail: 'Operacion y comprobante', value: 'Activo', tone: 'text-emerald-700 bg-emerald-50 border-emerald-100' },
  { Icon: Database, title: 'Clientes', detail: 'Datos para consulta rapida', value: 'Seguro', tone: 'text-slate-700 bg-slate-50 border-slate-200' },
];

const TRUST_ITEMS = [
  'Cuenta Google autorizada',
  'Sesion protegida',
  'Acceso operativo inmediato',
];

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

export function LoginScreen({ showToast, EMAILS_PERMITIDOS, auth }) {
  const [isLoading, setIsLoading] = useState(false);
  const year = new Date().getFullYear();
  const consentStorageKey = `comunicate_legal_acceptance_${LEGAL_DOCUMENT_VERSION}`;
  const [acceptedAt, setAcceptedAt] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(consentStorageKey) || '';
  });
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
        showToast('Acceso denegado. Tu correo no esta autorizado.', 'error');
        return;
      }

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

      window.sessionStorage.setItem('ggs_intro_after_login_uid', result.user.uid);

      showToast('Sesion iniciada con Google');
    } catch (error) {
      console.error('Error Google Auth:', error);
      if (auth.currentUser && error.code !== 'auth/popup-closed-by-user') {
        await signOut(auth).catch(() => {});
      }
      if (error.code !== 'auth/popup-closed-by-user') {
        showToast('No se pudo registrar el consentimiento legal.', 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[oklch(0.982_0.006_250)] text-[oklch(0.24_0.028_255)]">
      <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(to_right,oklch(0.9_0.018_250_/_0.55)_1px,transparent_1px),linear-gradient(to_bottom,oklch(0.9_0.018_250_/_0.55)_1px,transparent_1px)] [background-size:48px_48px]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[linear-gradient(to_bottom,oklch(0.995_0.004_250),transparent)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-[linear-gradient(to_top,oklch(0.995_0.004_250),transparent)]" />

      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-6 sm:px-6 lg:px-8">
        <section className="grid w-full items-stretch gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,430px)]">
          <div className="hidden min-h-[34rem] flex-col justify-between px-2 py-4 lg:flex">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700">
                    <ShieldCheck size={22} />
                  </span>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[oklch(0.56_0.025_255)]">{PRODUCT_BRAND}</p>
                    <p className="mt-0.5 text-sm font-semibold text-[oklch(0.3_0.028_255)]">{SOFTWARE_BRAND} Operations Cloud</p>
                  </div>
                </div>
                <span className="rounded-full border border-[oklch(0.9_0.018_250)] bg-[oklch(0.995_0.004_250)] px-3 py-1 text-xs font-bold text-[oklch(0.47_0.026_255)]">
                  {CORPORATE_PARENT} ecosystem
                </span>
              </div>

              <div className="mt-12 max-w-xl">
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue-700">Enterprise SaaS access</p>
                <h2 className="mt-3 max-w-lg text-4xl font-black leading-[1.05] tracking-tight text-[oklch(0.2_0.03_255)]">
                  Una entrada limpia para una operacion precisa.
                </h2>
                <p className="mt-4 max-w-md text-sm leading-6 text-[oklch(0.48_0.024_255)]">
                  {BRAND_COPY.productLine}
                </p>
              </div>
            </div>

            <section className="mt-8 rounded-2xl border border-[oklch(0.88_0.018_250)] bg-[oklch(0.995_0.004_250)] p-4">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">About the ecosystem</p>
              <p className="mt-2 max-w-lg text-sm leading-6 text-slate-600">
                {SOFTWARE_BRAND} centralizes operational software under {CORPORATE_PARENT}. {ENGINEERING_DIVISION} provides the engineering, security and product delivery layer behind the platform.
              </p>
              <div className="mt-4">
                <BrandEcosystemStrip dense />
              </div>
            </section>

            <div className="mt-10 rounded-2xl border border-[oklch(0.88_0.018_250)] bg-[oklch(0.997_0.003_250)] p-4 shadow-[0_18px_50px_oklch(0.32_0.035_255_/_0.1)]">
              <div className="flex items-center justify-between border-b border-[oklch(0.91_0.016_250)] pb-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[oklch(0.95_0.03_255)] text-blue-700">
                    <Clock3 size={16} />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-[oklch(0.25_0.028_255)]">Panel listo</p>
                    <p className="text-xs text-[oklch(0.58_0.024_255)]">Flujo seguro antes de entrar</p>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Verificado</span>
              </div>

              <div className="mt-4 grid gap-2.5">
                {OPERATION_ROWS.map(({ Icon, title, detail, value, tone }) => (
                  <div key={title} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border border-[oklch(0.91_0.016_250)] bg-[oklch(0.99_0.004_250)] px-3 py-3">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-lg border ${tone}`}>
                      {React.createElement(Icon, { size: 17 })}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[oklch(0.25_0.028_255)]">{title}</p>
                      <p className="truncate text-xs text-[oklch(0.58_0.024_255)]">{detail}</p>
                    </div>
                    <span className="text-xs font-black uppercase tracking-[0.08em] text-[oklch(0.5_0.026_255)]">{value}</span>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-12 gap-1.5" aria-hidden="true">
                {Array.from({ length: 36 }).map((_, index) => (
                  <span
                    key={index}
                    className={`h-2 rounded-full ${index % 7 === 0 ? 'bg-blue-500/70' : index % 5 === 0 ? 'bg-emerald-400/70' : 'bg-slate-200'}`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="flex min-h-[34rem] flex-col justify-between rounded-2xl border border-[oklch(0.88_0.018_250)] bg-[oklch(0.998_0.003_250)] p-5 shadow-[0_24px_70px_oklch(0.32_0.035_255_/_0.13)] sm:p-7">
            <div>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700">
                    <Fingerprint size={25} />
                  </span>
                  <BrandWordmark compact />
                </div>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[oklch(0.9_0.018_250)] bg-[oklch(0.985_0.006_250)] text-[oklch(0.52_0.028_255)]">
                  <LockKeyhole size={17} />
                </span>
              </div>

              <div className="mt-14">
                <h1 className="text-4xl font-black leading-none tracking-tight text-[oklch(0.2_0.03_255)] sm:text-5xl">
                  {PRODUCT_BRAND}
                </h1>
                <p className="mt-4 max-w-sm text-sm leading-6 text-[oklch(0.5_0.024_255)]">
                  Inicia sesion en {SOFTWARE_BRAND}. Software empresarial creado por {ENGINEERING_DIVISION} para operaciones claras, seguras y auditables.
                </p>
              </div>

              <div className="mt-5">
                <TechnicalBadges />
              </div>

              <div className="mt-8 space-y-2">
                {TRUST_ITEMS.map((item) => (
                  <div key={item} className="flex items-center gap-2 text-sm font-semibold text-[oklch(0.38_0.026_255)]">
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <LegalConsentGate accepted={hasAcceptedLegal} onAcceptedChange={updateLegalAcceptance} />

              <button
                onClick={handleGoogleLogin}
                disabled={isLoading || !hasAcceptedLegal}
                className="group mt-9 flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-[oklch(0.84_0.025_250)] bg-[oklch(0.995_0.004_250)] px-4 py-3 text-sm font-black text-[oklch(0.28_0.028_255)] shadow-sm transition-[background,border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:ring-offset-2 focus:ring-offset-[oklch(0.998_0.003_250)] disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-65 disabled:hover:bg-[oklch(0.995_0.004_250)]"
              >
                <span className="flex items-center gap-3">
                  {isLoading ? (
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-[oklch(0.72_0.03_255)] border-t-blue-600" aria-hidden="true" />
                  ) : (
                    <GoogleIcon />
                  )}
                  {isLoading ? 'Registrando consentimiento...' : 'Ingresar con Google'}
                </span>
                <ArrowRight size={17} className="text-[oklch(0.54_0.16_255)] transition-transform duration-200 group-hover:translate-x-0.5" />
              </button>
            </div>

            <footer className="mt-10 border-t border-[oklch(0.91_0.016_250)] pt-5 text-xs text-[oklch(0.55_0.024_255)]">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <a href="/copyright" className="font-bold transition-colors hover:text-[oklch(0.25_0.028_255)] hover:underline">Derechos de autor</a>
                <a href="/terms-and-conditions" className="font-bold transition-colors hover:text-[oklch(0.25_0.028_255)] hover:underline">Terminos y condiciones</a>
                <a href="/privacy-policy" className="font-bold transition-colors hover:text-[oklch(0.25_0.028_255)] hover:underline">Privacidad</a>
              </div>
              <p className="mt-3 leading-5">Copyright {year} {PRODUCT_BRAND}. {SOFTWARE_BRAND} by {CORPORATE_PARENT}. Engineered by {DIGITAL_SIGNATURE}. Todos los derechos reservados.</p>
            </footer>
          </div>
        </section>
      </main>
    </div>
  );
}
