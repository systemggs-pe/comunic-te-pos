import React, {useEffect, useMemo, useState} from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  FileImage,
  LockKeyhole,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
  UserRoundCheck,
} from 'lucide-react';
import {ImageCropModal} from '../../components/ui/ImageCropModal.jsx';
import {PRODUCT_BRAND, SOFTWARE_BRAND, SUPPORT_WHATSAPP_URL} from '../../config/branding.js';
import {
  consultarEstadoAutoRegistro,
  enviarSolicitudAutoRegistro,
  obtenerMensajeErrorFuncion,
  verificarDniAutoRegistro,
} from '../../services/functionsClient.js';
import {comprimirRegistroEvidenciaDataUrl, formatBytes, leerRegistroEvidenciaFile} from '../registros/registroEvidencias.js';
import {luhn} from '../../utils/imei.js';

const DNI_RE = /^\d{8}$/;
const PHONE_RE = /^9\d{8}$/;
const EMAIL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const MONEY_RE = /^\d+(\.\d{1,2})?$/;
const MAX_EVIDENCE_SIZE = 650 * 1024;

const evidenceFields = [
  {key: 'dniFrente', label: 'Foto frontal del DNI', hint: 'Debe verse completo y con buena luz.', required: true},
  {key: 'dniReverso', label: 'Foto posterior del DNI', hint: 'Debe verse completa, enfocada y sin reflejos.', required: true},
  {key: 'imeiLogico', label: 'IMEI lógico', hint: 'Foto de *#06# o Ajustes donde se vea el IMEI.', required: true},
  {key: 'reciboCompra', label: 'Recibo de compra', hint: 'Opcional, solo si cuentas con el recibo.', required: false},
  {key: 'cajaEquipo', label: 'Caja del equipo', hint: 'Opcional, toma una foto de la etiqueta.', required: false},
];

const stateCopy = {
  NO_ENCONTRADA: ['Enlace no válido', 'Revisa que el enlace esté completo o solicita uno nuevo.'],
  COMPLETADA: ['Solicitud ya enviada', 'Este enlace ya fue utilizado correctamente.'],
  BLOQUEADA: ['Enlace bloqueado', 'Se agotaron los dos intentos de verificación del DNI.'],
  REVOCADA: ['Enlace revocado', 'Solicita un nuevo enlace a la tienda.'],
  ELIMINADA: ['Enlace eliminado', 'Este enlace ya no está disponible. Solicita uno nuevo a la tienda.'],
  VENCIDA: ['Enlace vencido', 'La vigencia terminó. Solicita un nuevo enlace a la tienda.'],
};

const registrationStatusCopy = {
  PENDIENTE: {
    title: 'Datos recibidos',
    description: 'La tienda todavía debe verificar la información y las fotografías.',
    step: 1,
  },
  EN_REVISION: {
    title: 'Registro en revisión',
    description: 'La tienda está verificando tus datos y completando el registro.',
    step: 2,
  },
  REGISTRADO: {
    title: 'Dispositivo registrado',
    description: 'El proceso terminó correctamente.',
    step: 3,
  },
};

function initialEvidence() {
  return Object.fromEntries(evidenceFields.map(field => [field.key, null]));
}

function formatPersonName(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('es-PE')
    .split(/\s+/)
    .map(part => `${part.charAt(0).toLocaleUpperCase('es-PE')}${part.slice(1)}`)
    .join(' ');
}

function InputField({label, required = true, children}) {
  return (
    <label className="grid gap-1.5 text-xs font-extrabold text-slate-600">
      <span>{label}{required && <span className="text-red-500"> *</span>}</span>
      {children}
    </label>
  );
}

function Stepper({step}) {
  const steps = ['Identidad', 'Datos', 'Evidencias'];
  return (
    <ol className="grid grid-cols-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-6">
      {steps.map((label, index) => {
        const number = index + 1;
        const complete = step > number;
        const active = step === number;
        return (
          <li key={label} className="flex items-center gap-2">
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${complete ? 'bg-emerald-600 text-white' : active ? 'bg-blue-600 text-white' : 'border border-slate-300 bg-white text-slate-400'}`}>
              {complete ? <Check size={14} /> : number}
            </span>
            <span className={`hidden text-xs font-bold sm:block ${active ? 'text-blue-700' : complete ? 'text-emerald-700' : 'text-slate-400'}`}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function PublicAutoRegistroPage({token}) {
  const [pageState, setPageState] = useState('loading');
  const [linkState, setLinkState] = useState(null);
  const [step, setStep] = useState(1);
  const [dni, setDni] = useState('');
  const [attemptsRemaining, setAttemptsRemaining] = useState(2);
  const [identity, setIdentity] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [processingEvidence, setProcessingEvidence] = useState('');
  const [cropEvidence, setCropEvidence] = useState(null);
  const [evidencias, setEvidencias] = useState(initialEvidence);
  const [form, setForm] = useState({
    nombres: '', celular: '', correo: '', direccion: '', ciudad: '', imei: '', nombreEquipo: '',
    fechaCompra: '', precioCompra: '', color: '', memoria: '', ram: '', declaracionAceptada: false,
  });

  const inputClass = 'min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
  const isUnavailable = pageState === 'unavailable';
  const unavailableCopy = stateCopy[linkState?.state] || stateCopy.NO_ENCONTRADA;
  const expiresLabel = useMemo(() => {
    const date = new Date(linkState?.expiresAt || 0);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('es-PE', {day: '2-digit', month: 'long', year: 'numeric'}).format(date);
  }, [linkState]);

  useEffect(() => {
    let active = true;
    consultarEstadoAutoRegistro(token)
      .then(data => {
        if (!active) return;
        setLinkState(data);
        setAttemptsRemaining(Number(data.attemptsRemaining || 0));
        setPageState(data.state === 'ACTIVA' ? 'ready' : data.state === 'COMPLETADA' ? 'tracking' : 'unavailable');
      })
      .catch(() => {
        if (!active) return;
        setLinkState({state: 'NO_ENCONTRADA'});
        setPageState('unavailable');
      });
    return () => { active = false; };
  }, [token]);

  const updateForm = (key, value) => {
    setForm(current => ({...current, [key]: value}));
    if (error) setError('');
  };

  const verifyDni = async event => {
    event.preventDefault();
    if (!DNI_RE.test(dni)) {
      setError('Ingresa un DNI válido de 8 dígitos.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await verificarDniAutoRegistro(token, dni);
      setAttemptsRemaining(Number(result.attemptsRemaining || 0));
      if (!result.verified) {
        if (result.state === 'BLOQUEADA') {
          setLinkState({state: 'BLOQUEADA'});
          setPageState('unavailable');
          return;
        }
        setError(`El DNI no corresponde a este enlace. Te queda ${result.attemptsRemaining} intento.`);
        return;
      }
      if (!result.fullName) {
        setError('RENIEC no devolvió los nombres y apellidos. Intenta nuevamente.');
        return;
      }
      setIdentity({
        fullName: result.fullName,
        isReturningCustomer: Boolean(result.isReturningCustomer),
      });
      setForm(current => ({...current, nombres: result.fullName}));
      setStep(2);
    } catch (requestError) {
      setError(obtenerMensajeErrorFuncion(requestError, 'No se pudo verificar el DNI'));
    } finally {
      setBusy(false);
    }
  };

  const validateData = () => {
    if (form.nombres.trim().length < 3) return 'Ingresa tus nombres y apellidos.';
    if (!PHONE_RE.test(form.celular)) return 'El celular debe tener 9 dígitos y empezar con 9.';
    if (!EMAIL_RE.test(form.correo)) return 'Ingresa un correo electrónico válido.';
    if (form.direccion.trim().length < 4) return 'Ingresa tu dirección.';
    if (form.ciudad.trim().length < 2) return 'Ingresa tu ciudad.';
    if (!/^\d{15}$/.test(form.imei) || !luhn(form.imei)) return 'El IMEI debe tener 15 dígitos válidos.';
    if (form.nombreEquipo.trim().length < 2) return 'Ingresa el nombre del equipo.';
    if (!form.fechaCompra) return 'Selecciona la fecha de compra.';
    if (new Date(`${form.fechaCompra}T00:00:00`).getTime() > Date.now()) return 'La fecha de compra no puede ser futura.';
    if (!MONEY_RE.test(form.precioCompra) || Number(form.precioCompra) <= 0) return 'Ingresa un precio de compra válido.';
    if (!form.color.trim() || !form.memoria.trim() || !form.ram.trim()) return 'Completa color, memoria y RAM.';
    return '';
  };

  const continueToEvidence = event => {
    event.preventDefault();
    const validationError = validateData();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setStep(3);
    window.scrollTo({top: 0, behavior: 'smooth'});
  };

  const addEvidence = async (key, file) => {
    if (!file) return;
    setProcessingEvidence(key);
    setError('');
    try {
      const image = await leerRegistroEvidenciaFile(file);
      const field = evidenceFields.find(item => item.key === key);
      setCropEvidence({key, label: field?.label || 'Evidencia', ...image});
    } catch (uploadError) {
      setError(uploadError.message === 'FORMATO_IMAGEN_INVALIDO'
        ? 'Usa una imagen JPG, PNG o WEBP.'
        : uploadError.message || 'No se pudo procesar la imagen.');
    } finally {
      setProcessingEvidence('');
    }
  };

  const saveCroppedEvidence = async dataUrl => {
    if (!cropEvidence) return;
    const current = cropEvidence;
    setCropEvidence(null);
    setProcessingEvidence(current.key);
    setError('');
    try {
      const evidence = await comprimirRegistroEvidenciaDataUrl(
        dataUrl || current.dataUrl,
        current.name,
        current.originalSize,
      );
      if (evidence.size > MAX_EVIDENCE_SIZE) {
        throw new Error('La imagen continúa siendo muy pesada. Toma otra foto con menor resolución.');
      }
      setEvidencias(values => ({...values, [current.key]: evidence}));
    } catch (uploadError) {
      setError(uploadError.message === 'FORMATO_IMAGEN_INVALIDO'
        ? 'Usa una imagen JPG, PNG o WEBP.'
        : uploadError.message || 'No se pudo procesar la imagen.');
    } finally {
      setProcessingEvidence('');
    }
  };

  const submit = async event => {
    event.preventDefault();
    if (!evidencias.dniFrente || !evidencias.dniReverso || !evidencias.imeiLogico) {
      setError('Adjunta ambas caras del DNI y la evidencia del IMEI lógico.');
      return;
    }
    if (!form.declaracionAceptada) {
      setError('Confirma que la información corresponde al equipo que deseas registrar.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await enviarSolicitudAutoRegistro({token, dni, ...form, evidencias});
      setLinkState(current => ({...current, state: 'COMPLETADA', registrationStatus: 'PENDIENTE'}));
      setPageState('tracking');
      window.scrollTo({top: 0, behavior: 'smooth'});
    } catch (requestError) {
      setError(obtenerMensajeErrorFuncion(requestError, 'No se pudo enviar la solicitud'));
    } finally {
      setBusy(false);
    }
  };

  if (pageState === 'loading') {
    return <div className="flex min-h-screen items-center justify-center bg-[oklch(0.976_0.006_250)]"><div className="flex items-center gap-3 text-sm font-bold text-slate-600"><span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" /> Validando enlace...</div></div>;
  }

  const tracking = registrationStatusCopy[linkState?.registrationStatus] || registrationStatusCopy.PENDIENTE;

  const refreshTracking = async () => {
    setBusy(true);
    try {
      const data = await consultarEstadoAutoRegistro(token);
      setLinkState(data);
      if (data.state !== 'COMPLETADA') setPageState('unavailable');
    } catch (requestError) {
      setError(obtenerMensajeErrorFuncion(requestError, 'No se pudo actualizar el estado'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[oklch(0.976_0.006_250)] px-3 py-4 text-slate-900 sm:px-6 sm:py-8">
      <ImageCropModal
        dataUrl={cropEvidence?.dataUrl}
        title={cropEvidence ? `Ajustar ${cropEvidence.label}` : 'Ajustar fotografía'}
        onCancel={() => setCropEvidence(null)}
        onUseOriginal={saveCroppedEvidence}
        onConfirm={saveCroppedEvidence}
      />
      <main className="mx-auto w-full max-w-3xl">
        <header className="mb-4 flex items-center justify-between px-1">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-700">{PRODUCT_BRAND}</p>
            <p className="mt-0.5 text-xs font-semibold text-slate-400">{SOFTWARE_BRAND}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-extrabold text-emerald-700"><ShieldCheck size={14} /> Enlace protegido</span>
        </header>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {isUnavailable ? (
            <div className="flex min-h-[32rem] flex-col items-center justify-center px-6 py-12 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full border border-red-100 bg-red-50 text-red-600"><LockKeyhole size={25} /></span>
              <h1 className="mt-5 text-xl font-bold text-slate-900">{unavailableCopy[0]}</h1>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{unavailableCopy[1]}</p>
              <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer" className="saas-secondary mt-6">Solicitar ayuda</a>
            </div>
          ) : pageState === 'tracking' ? (
            <div className="flex min-h-[32rem] flex-col items-center justify-center px-6 py-12 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full border border-emerald-100 bg-emerald-50 text-emerald-700"><Check size={30} /></span>
              <p className="mt-6 text-xs font-black uppercase tracking-[0.14em] text-emerald-700">Estado de tu solicitud</p>
              <h1 className="mt-2 text-2xl font-bold text-slate-900">{tracking.title}</h1>
              <p className="mt-3 max-w-lg text-sm leading-6 text-slate-500">{tracking.description}</p>
              {linkState?.nRegistro && <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 font-mono text-sm font-extrabold text-emerald-800">{linkState.nRegistro}</p>}
              <ol className="mt-7 grid w-full max-w-xl grid-cols-3 gap-2" aria-label="Progreso del registro">
                {['Datos recibidos', 'En revisión', 'Registrado'].map((label, index) => {
                  const complete = tracking.step >= index + 1;
                  return <li key={label} className={`rounded-lg border px-2 py-3 text-xs font-bold ${complete ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-400'}`}><span className="mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-full border bg-white">{complete ? <Check size={13} /> : index + 1}</span>{label}</li>;
                })}
              </ol>
              <button type="button" onClick={refreshTracking} disabled={busy} className="saas-secondary mt-6">{busy ? 'Actualizando...' : 'Actualizar estado'}</button>
            </div>
          ) : (
            <>
              <div className="border-b border-slate-200 px-4 py-5 sm:px-6">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-700"><Smartphone size={20} /></span>
                  <div>
                    <h1 className="text-lg font-bold text-slate-900">Datos para registrar tu equipo</h1>
                    <p className="mt-1 text-sm leading-5 text-slate-500">Completa la información con calma. Los campos marcados con * son obligatorios.</p>
                    {expiresLabel && <p className="mt-2 text-xs font-bold text-slate-400">Enlace vigente hasta el {expiresLabel}</p>}
                  </div>
                </div>
              </div>
              <Stepper step={step} />

              {error && (
                <div role="alert" className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-3 text-sm font-semibold text-red-700 sm:mx-6">
                  <AlertCircle size={17} className="mt-0.5 shrink-0" /> {error}
                </div>
              )}

              {step === 1 && (
                <form onSubmit={verifyDni} className="p-4 sm:p-6">
                  <div className="mx-auto max-w-md">
                    <h2 className="text-base font-bold text-slate-900">Verifica tu identidad</h2>
                    <p className="mt-1 text-sm leading-5 text-slate-500">Ingresa el DNI que la tienda autorizó para este enlace.</p>
                    <div className="mt-5">
                      <InputField label="Número de DNI">
                        <input value={dni} onChange={event => {setDni(event.target.value.replace(/\D/g, '').slice(0, 8)); setError('');}} inputMode="numeric" autoComplete="off" maxLength={8} className={`${inputClass} font-mono text-base tracking-wider`} placeholder="00000000" autoFocus />
                      </InputField>
                    </div>
                    <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-800">
                      <LockKeyhole size={15} className="shrink-0" /> Tienes {attemptsRemaining} intentos de verificación.
                    </div>
                    <button type="submit" disabled={busy || !DNI_RE.test(dni)} className="saas-primary mt-5 w-full disabled:cursor-not-allowed disabled:opacity-60">
                      {busy ? 'Consultando RENIEC...' : 'Verificar y continuar'} <ArrowRight size={16} />
                    </button>
                  </div>
                </form>
              )}

              {step === 2 && (
                <form onSubmit={continueToEvidence} className="space-y-6 p-4 sm:p-6">
                  {identity && (
                    <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${identity.isReturningCustomer ? 'border-emerald-200 bg-emerald-50' : 'border-blue-100 bg-blue-50'}`}>
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-white ${identity.isReturningCustomer ? 'border-emerald-200 text-emerald-700' : 'border-blue-100 text-blue-700'}`}>
                        <UserRoundCheck size={18} />
                      </span>
                      <div>
                        <p className={`text-sm font-extrabold ${identity.isReturningCustomer ? 'text-emerald-900' : 'text-blue-900'}`}>
                          {identity.isReturningCustomer ? 'Bienvenido de nuevo' : 'Bienvenido'}, {formatPersonName(identity.fullName)}
                        </p>
                        <p className={`mt-1 text-xs font-semibold ${identity.isReturningCustomer ? 'text-emerald-700' : 'text-blue-700'}`}>
                          {identity.isReturningCustomer
                            ? 'Encontramos una compra o registro anterior en la tienda.'
                            : 'Tus nombres y apellidos fueron verificados con RENIEC.'}
                        </p>
                      </div>
                    </div>
                  )}
                  <div>
                    <h2 className="saas-form-section-title">Tus datos</h2>
                    <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-900">
                      <AlertCircle size={18} className="mt-0.5 shrink-0" />
                      <p><strong>Revisa cada dato antes de continuar.</strong> La tienda aplica una penalidad de S/10.00 por cada dato incorrecto.</p>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <InputField label="Nombres y apellidos (RENIEC)">
                          <input value={form.nombres} readOnly aria-readonly="true" className={`${inputClass} cursor-not-allowed bg-slate-50 font-semibold text-slate-700`} />
                        </InputField>
                      </div>
                      <InputField label="Número de celular"><input value={form.celular} onChange={event => updateForm('celular', event.target.value.replace(/\D/g, '').slice(0, 9))} inputMode="tel" autoComplete="tel" className={inputClass} placeholder="9XXXXXXXX" /></InputField>
                      <InputField label="Correo electrónico"><input value={form.correo} onChange={event => updateForm('correo', event.target.value)} type="email" autoComplete="email" maxLength={180} className={inputClass} /></InputField>
                      <div className="sm:col-span-2"><InputField label="Dirección"><input value={form.direccion} onChange={event => updateForm('direccion', event.target.value)} autoComplete="street-address" maxLength={300} className={inputClass} /></InputField></div>
                      <InputField label="Ciudad"><input value={form.ciudad} onChange={event => updateForm('ciudad', event.target.value)} autoComplete="address-level2" maxLength={100} className={inputClass} /></InputField>
                    </div>
                  </div>
                  <div>
                    <h2 className="saas-form-section-title">Equipo y compra</h2>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <InputField label="IMEI"><input value={form.imei} onChange={event => updateForm('imei', event.target.value.replace(/\D/g, '').slice(0, 15))} inputMode="numeric" maxLength={15} className={`${inputClass} font-mono`} placeholder="15 dígitos" /></InputField>
                      <InputField label="Nombre del equipo"><input value={form.nombreEquipo} onChange={event => updateForm('nombreEquipo', event.target.value)} maxLength={140} className={inputClass} placeholder="Ej. Samsung Galaxy A55" /></InputField>
                      <InputField label="Fecha de compra"><input value={form.fechaCompra} onChange={event => updateForm('fechaCompra', event.target.value)} type="date" max={new Date().toISOString().slice(0, 10)} className={inputClass} /></InputField>
                      <InputField label="Precio de compra (S/)"><input value={form.precioCompra} onChange={event => updateForm('precioCompra', event.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" className={inputClass} placeholder="0.00" /></InputField>
                      <InputField label="Color"><input value={form.color} onChange={event => updateForm('color', event.target.value)} maxLength={80} className={inputClass} /></InputField>
                      <InputField label="Memoria"><input value={form.memoria} onChange={event => updateForm('memoria', event.target.value)} maxLength={20} className={inputClass} placeholder="Ej. 256 GB" /></InputField>
                      <InputField label="RAM"><input value={form.ram} onChange={event => updateForm('ram', event.target.value)} maxLength={20} className={inputClass} placeholder="Ej. 8 GB" /></InputField>
                    </div>
                  </div>
                  <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-between">
                    <button type="button" onClick={() => {setStep(1); setError('');}} className="saas-secondary"><ArrowLeft size={16} /> Volver</button>
                    <button type="submit" className="saas-primary">Continuar a evidencias <ArrowRight size={16} /></button>
                  </div>
                </form>
              )}

              {step === 3 && (
                <form onSubmit={submit} className="p-4 sm:p-6">
                  <h2 className="text-base font-bold text-slate-900">Fotografías de respaldo</h2>
                  <p className="mt-1 text-sm text-slate-500">Usa imágenes claras. Se comprimen antes de enviarse.</p>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {evidenceFields.map(field => {
                      const evidence = evidencias[field.key];
                      const processing = processingEvidence === field.key;
                      return (
                        <div key={field.key} className={`rounded-lg border p-3 ${evidence ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-slate-50'}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div><p className="text-sm font-bold text-slate-800">{field.label}{field.required && <span className="text-red-500"> *</span>}</p><p className="mt-1 text-xs leading-4 text-slate-500">{field.hint}</p></div>
                            {evidence && <button type="button" onClick={() => setEvidencias(current => ({...current, [field.key]: null}))} className="saas-icon-button h-9 w-9 flex-basis-auto text-red-600" aria-label={`Quitar ${field.label}`}><Trash2 size={15} /></button>}
                          </div>
                          {evidence && <img src={evidence.dataUrl} alt={field.label} className="mt-3 h-36 w-full rounded-md border border-slate-200 bg-white object-contain" />}
                          <label className="saas-secondary mt-3 w-full cursor-pointer bg-white">
                            {processing ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" /> : evidence ? <FileImage size={16} /> : <Upload size={16} />}
                            {processing ? 'Procesando...' : evidence ? `Cambiar (${formatBytes(evidence.size)})` : 'Tomar o subir foto'}
                            <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" disabled={processing} onChange={event => {addEvidence(field.key, event.target.files?.[0]); event.target.value = '';}} />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                  <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm leading-5 text-slate-600">
                    <input type="checkbox" checked={form.declaracionAceptada} onChange={event => updateForm('declaracionAceptada', event.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                    <span>Confirmo que los datos y fotografías corresponden al equipo que deseo registrar, y entiendo la penalidad de S/10.00 por cada dato incorrecto.</span>
                  </label>
                  <div className="mt-5 flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-between">
                    <button type="button" onClick={() => {setStep(2); setError('');}} disabled={busy} className="saas-secondary"><ArrowLeft size={16} /> Revisar datos</button>
                    <button type="submit" disabled={busy || Boolean(processingEvidence)} className="saas-primary disabled:cursor-not-allowed disabled:opacity-60">{busy ? 'Enviando...' : 'Enviar solicitud'} <Check size={16} /></button>
                  </div>
                </form>
              )}
            </>
          )}
        </section>

        <footer className="px-3 py-5 text-center text-xs leading-5 text-slate-400">
          Tus datos se usan para revisar el registro del equipo. No compartas este enlace con otras personas.
        </footer>
      </main>
    </div>
  );
}
