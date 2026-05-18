import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, FileText, ShieldCheck } from 'lucide-react';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { DIGITAL_SIGNATURE, SUPPORT_EMAIL } from '../../config/branding.js';

function getLegalPageFromHash() {
  if (typeof window === 'undefined') return null;
  if (window.location.hash === '#terminos-y-condiciones') return 'terms';
  if (window.location.hash === '#derechos-de-autor') return 'copyright';
  return null;
}

function LegalPage({ page, onBack, year }) {
  const isTerms = page === 'terms';
  const title = isTerms ? 'Terminos y condiciones' : 'Derechos de autor';
  const summary = isTerms
    ? 'Condiciones de uso para el acceso y operacion de COMUNIC@TE.'
    : 'Informacion sobre propiedad intelectual y uso autorizado del sistema.';

  const terms = [
    ['Uso autorizado', 'COMUNIC@TE es un sistema privado. Solo pueden ingresar usuarios autorizados por la empresa mediante una cuenta de Google permitida.'],
    ['Responsabilidad de acceso', 'Cada usuario es responsable de proteger su cuenta, no compartir credenciales y cerrar sesion en equipos compartidos.'],
    ['Datos operativos', 'La informacion registrada, incluyendo clientes, equipos, ventas, IMEI, precios y documentos, debe usarse solo para fines administrativos y comerciales internos.'],
    ['Exactitud de la informacion', 'Antes de guardar una operacion, el usuario debe verificar DNI, IMEI, estado del equipo, operador, precio y datos de contacto.'],
    ['Uso correcto del sistema', 'No se permite modificar, eliminar o registrar informacion falsa, incompleta o ajena a las operaciones reales de la empresa.'],
    ['Respaldos y disponibilidad', 'El sistema puede incluir herramientas de respaldo, pero la empresa debe conservar controles internos y revisar periodicamente su informacion.'],
    ['Cambios del servicio', 'GGS SYSTEM puede actualizar funciones, flujos, seguridad y estas condiciones para mejorar el servicio o cumplir requisitos operativos.'],
    ['Soporte', `Para consultas relacionadas con el sistema, comunicate con ${SUPPORT_EMAIL}.`],
  ];

  const copyright = [
    ['Titularidad', `La interfaz, estructura, flujos, componentes y configuracion de COMUNIC@TE pertenecen a ${DIGITAL_SIGNATURE}, salvo librerias o servicios de terceros usados bajo sus propias licencias.`],
    ['Uso permitido', 'La empresa usuaria recibe permiso para operar el sistema en sus procesos internos, sin transferir la propiedad intelectual del software.'],
    ['Restricciones', 'No esta permitido copiar, revender, redistribuir, publicar, sublicenciar o entregar el sistema a terceros sin autorizacion escrita.'],
    ['Marca', 'Los nombres COMUNIC@TE y GGS SYSTEM deben mantenerse visibles cuando formen parte de la identidad del sistema desplegado.'],
    ['Copyright', `Copyright ${year} ${DIGITAL_SIGNATURE}. Todos los derechos reservados.`],
  ];

  const sections = isTerms ? terms : copyright;

  return (
    <div className="flex min-h-screen bg-[oklch(0.976_0.006_250)] text-slate-900">
      <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:py-10">
        <button
          type="button"
          onClick={onBack}
          className="mb-5 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
        >
          <ArrowLeft size={16} /> Volver al login
        </button>

        <article className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-200 px-5 py-5 sm:px-7">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-700">
                <FileText size={20} />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">COMUNIC@TE by GGS SYSTEM</p>
                <h1 className="mt-1 text-2xl font-bold text-slate-950">{title}</h1>
                <p className="mt-1 text-sm text-slate-500">{summary}</p>
              </div>
            </div>
          </header>

          <div className="divide-y divide-slate-100 px-5 sm:px-7">
            {sections.map(([heading, body]) => (
              <section key={heading} className="py-5">
                <h2 className="text-base font-semibold text-slate-900">{heading}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{body}</p>
              </section>
            ))}
          </div>
        </article>
      </main>
    </div>
  );
}

export function LoginScreen({ showToast, EMAILS_PERMITIDOS, auth }) {
  const [isLoading, setIsLoading] = useState(false);
  const [legalPage, setLegalPage] = useState(getLegalPageFromHash);
  const year = new Date().getFullYear();

  useEffect(() => {
    const syncLegalPage = () => setLegalPage(getLegalPageFromHash());
    window.addEventListener('hashchange', syncLegalPage);
    return () => window.removeEventListener('hashchange', syncLegalPage);
  }, []);

  const openLegalPage = (page) => {
    const hash = page === 'terms' ? '#terminos-y-condiciones' : '#derechos-de-autor';
    setLegalPage(page);
    window.history.pushState(null, '', hash);
  };

  const closeLegalPage = () => {
    setLegalPage(null);
    window.history.pushState(null, '', `${window.location.pathname}${window.location.search}`);
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      if (!EMAILS_PERMITIDOS.includes(result.user.email)) {
        await signOut(auth);
        showToast('Acceso denegado. Tu correo no esta autorizado.', 'error');
        return;
      }
      window.sessionStorage.setItem('ggs_intro_after_login_uid', result.user.uid);

      showToast('Sesion iniciada con Google');
    } catch (error) {
      console.error('Error Google Auth:', error);
      if (error.code !== 'auth/popup-closed-by-user') {
        showToast('Error al iniciar sesion', 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (legalPage) {
    return <LegalPage page={legalPage} onBack={closeLegalPage} year={year} />;
  }

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-[oklch(0.982_0.005_250)] text-slate-900">
      <div className="pointer-events-none absolute -left-20 top-12 h-52 w-52 rotate-12 rounded-[1.75rem] border border-blue-100 bg-blue-50/70" />
      <div className="pointer-events-none absolute right-8 top-10 hidden h-28 w-28 rotate-45 rounded-2xl border border-slate-200 bg-white/80 md:block" />
      <div className="pointer-events-none absolute bottom-8 left-1/2 hidden h-20 w-64 -translate-x-1/2 -rotate-3 rounded-2xl border border-blue-100 bg-blue-50/60 lg:block" />

      <main className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-center px-4 py-8">
        <section className="grid w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/70 lg:grid-cols-[1fr_420px]">
          <div className="hidden bg-blue-50/80 p-8 lg:block">
            <div className="flex h-full flex-col justify-between">
              <div>
                <div className="inline-flex rounded-xl border border-blue-100 bg-white p-3 text-blue-700 shadow-sm">
                  <ShieldCheck size={24} />
                </div>
                <h2 className="mt-6 max-w-sm text-3xl font-bold leading-tight text-slate-950">Gestion diaria de tienda en un solo lugar</h2>
                <p className="mt-3 max-w-sm text-sm leading-6 text-slate-600">Accede rapido a registros, ventas y clientes desde una pantalla simple.</p>

                <div className="mt-8 grid gap-3">
                  {[
                    ['Registros', 'Control de IMEI y estado del equipo.'],
                    ['Ventas', 'Historial de operaciones de tienda.'],
                    ['Clientes', 'Datos disponibles para busqueda rapida.'],
                  ].map(([title, text]) => (
                    <div key={title} className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-md bg-blue-50 text-blue-700">
                          <CheckCircle2 size={15} />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{title}</p>
                          <p className="mt-1 text-sm leading-5 text-slate-500">{text}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-10 grid grid-cols-6 gap-2 opacity-80">
                {Array.from({ length: 24 }).map((_, index) => (
                  <span key={index} className={`h-8 rounded-md border ${index % 5 === 0 ? 'border-blue-200 bg-blue-100' : 'border-slate-200 bg-white'}`} />
                ))}
              </div>
            </div>
          </div>

          <div className="relative px-6 py-8 text-center sm:px-9">
            <div className="pointer-events-none absolute right-6 top-6 h-14 w-14 rotate-12 rounded-xl border border-blue-100 bg-blue-50" />
            <div className="pointer-events-none absolute bottom-8 left-7 h-10 w-10 -rotate-12 rounded-lg border border-slate-200 bg-slate-50" />

            <div className="relative mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700">
              <ShieldCheck size={26} />
            </div>
            <h1 className="relative tracking-tight text-slate-950">
              <span className="block text-2xl font-extrabold sm:text-3xl">COMUNIC@TE</span>
              <span className="mt-1 block text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">by GGS SYSTEM</span>
            </h1>
            <p className="relative mx-auto mt-3 max-w-xs text-sm leading-6 text-slate-500">Ingresa para gestionar registros, ventas y clientes.</p>

            <button 
              onClick={handleGoogleLogin} 
              disabled={isLoading}
              className="relative mt-7 flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              {isLoading ? 'Verificando acceso...' : 'Ingresar con Google'}
            </button>

            <footer className="relative mt-7 px-2 text-center text-xs text-slate-500">
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
                <button type="button" onClick={() => openLegalPage('copyright')} className="font-medium hover:text-slate-800 hover:underline">Derechos de autor</button>
                <span className="text-slate-300">|</span>
                <button type="button" onClick={() => openLegalPage('terms')} className="font-medium hover:text-slate-800 hover:underline">Terminos y condiciones</button>
                <span className="text-slate-300">|</span>
                <span>Copyright {year} {DIGITAL_SIGNATURE}</span>
              </div>
              <p className="mt-2">Todos los derechos reservados.</p>
            </footer>
          </div>
        </section>
      </main>
    </div>
  );
}
