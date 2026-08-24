import React from 'react';
import {AlertTriangle, Check, ImagePlus, RotateCcw, ScanBarcode, ShieldCheck, X} from 'lucide-react';
import {scanBoxImage} from '../../services/localBoxScanner.js';
import {luhn} from '../../utils/imei.js';
import {normalizarEscaneo} from '../../utils/scanner.js';

const MAX_LOCAL_IMAGE_BYTES = 12 * 1024 * 1024;
const FIELD_CONFIG = [
  {key: 'imei1', label: 'IMEI 1', mono: true},
  {key: 'imei2', label: 'IMEI 2', mono: true},
  {key: 'sn', label: 'Numero de serie', mono: true},
  {key: 'marca', label: 'Marca'},
  {key: 'modelo', label: 'Modelo'},
  {key: 'nombreComercial', label: 'Nombre comercial'},
  {key: 'ram', label: 'RAM (GB)'},
  {key: 'memoria', label: 'Memoria (GB)'},
  {key: 'color', label: 'Color'},
];

function emptyScan() {
  return normalizarEscaneo({});
}

function confidenceLabel(field, edited) {
  if (edited) return {text: 'Editado', classes: 'border-blue-200 bg-blue-50 text-blue-700'};
  if (field?.confidence === 'high') return {text: 'Alta', classes: 'border-emerald-200 bg-emerald-50 text-emerald-700'};
  if (field?.confidence === 'medium') return {text: 'Media', classes: 'border-amber-200 bg-amber-50 text-amber-700'};
  if (field?.confidence === 'low') return {text: 'Baja', classes: 'border-red-200 bg-red-50 text-red-700'};
  return {text: 'Manual', classes: 'border-slate-200 bg-slate-50 text-slate-600'};
}

function errorMessage(error) {
  if (error?.message === 'OCR_LOCAL_TIMEOUT') return 'El OCR local tardo demasiado. Repite la foto con la etiqueta mas cerca.';
  if (error?.message === 'IMAGEN_LOCAL_INVALIDA') return 'La imagen no se pudo leer. Selecciona otra foto.';
  if (/worker|traineddata|tesseract|fetch/i.test(error?.message || '')) {
    return 'No se pudieron cargar los recursos OCR de la aplicacion. Recarga la pagina e intenta nuevamente.';
  }
  return 'No se pudieron extraer datos. Repite la foto con buena luz y la etiqueta enfocada.';
}

function drawSourceToCanvas(source, canvas) {
  const maxSide = 2400;
  const sourceWidth = source.videoWidth || source.naturalWidth || source.width;
  const sourceHeight = source.videoHeight || source.naturalHeight || source.height;
  if (!sourceWidth || !sourceHeight) throw new Error('IMAGEN_LOCAL_INVALIDA');
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
}

async function loadFileImage(file) {
  if (!file || !/^image\/(?:jpeg|png|webp)$/i.test(file.type)) throw new Error('ARCHIVO_IMAGEN_INVALIDO');
  if (file.size > MAX_LOCAL_IMAGE_BYTES) throw new Error('ARCHIVO_IMAGEN_MUY_GRANDE');
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file, {imageOrientation: 'from-image'});
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function EscanerCaja({onResult, onClose, onProcessingStart, onError}) {
  const videoRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const fileRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const cameraRequestRef = React.useRef(0);
  const mountedRef = React.useRef(true);
  const [fase, setFase] = React.useState('camara');
  const [error, setError] = React.useState('');
  const [progress, setProgress] = React.useState({progress: 0, detail: ''});
  const [scanResult, setScanResult] = React.useState(null);
  const [draft, setDraft] = React.useState(emptyScan);

  const stopCamera = React.useCallback(() => {
    cameraRequestRef.current += 1;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const abrirCamara = React.useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('La camara solo funciona en HTTPS, localhost o navegadores compatibles.');
    }
    stopCamera();
    const requestId = cameraRequestRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: {ideal: 'environment'},
        width: {ideal: 2560},
        height: {ideal: 1440},
      },
      audio: false,
    });
    if (!mountedRef.current || requestId !== cameraRequestRef.current) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
  }, [stopCamera]);

  React.useEffect(() => {
    mountedRef.current = true;
    abrirCamara().catch(() => setError('Sin acceso a camara. Puedes elegir una foto de la galeria.'));
    return () => {
      mountedRef.current = false;
      stopCamera();
    };
  }, [abrirCamara, stopCamera]);

  const capturar = () => {
    try {
      drawSourceToCanvas(videoRef.current, canvasRef.current);
      stopCamera();
      setError('');
      setFase('preview');
    } catch (captureError) {
      setError(errorMessage(captureError));
    }
  };

  const seleccionarArchivo = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const image = await loadFileImage(file);
      drawSourceToCanvas(image, canvasRef.current);
      image.close?.();
      stopCamera();
      setError('');
      setFase('preview');
    } catch (fileError) {
      const message = fileError?.message === 'ARCHIVO_IMAGEN_MUY_GRANDE'
        ? 'La imagen supera 12 MB. Elige una foto mas liviana.'
        : 'Solo se permiten imagenes JPG, PNG o WebP.';
      setError(message);
    }
  };

  const reintentar = async () => {
    setScanResult(null);
    setDraft(emptyScan());
    setProgress({progress: 0, detail: ''});
    setError('');
    setFase('camara');
    try {
      await abrirCamara();
    } catch {
      setError('Sin acceso a camara. Puedes elegir una foto de la galeria.');
    }
  };

  const analizar = async () => {
    if (!canvasRef.current?.width) {
      setError('Primero toma o selecciona una foto de la caja.');
      return;
    }
    setFase('procesando');
    setError('');
    setProgress({progress: 0.02, detail: 'Preparando imagen'});
    onProcessingStart?.();
    try {
      const result = await scanBoxImage(canvasRef.current, {
        onProgress: next => {
          if (mountedRef.current) setProgress(next);
        },
      });
      if (!mountedRef.current) return;
      setScanResult(result);
      setDraft(result.data);
      setFase('revision');
    } catch (scanError) {
      if (!mountedRef.current) return;
      const message = errorMessage(scanError);
      setError(message);
      setFase('preview');
      onError?.(message);
    }
  };

  const aplicar = () => {
    const normalized = normalizarEscaneo(draft);
    if (normalized.imei1 && !luhn(normalized.imei1)) {
      setError('El IMEI 1 no pasa la validacion. Corrigelo antes de continuar.');
      return;
    }
    if (normalized.imei2 && !luhn(normalized.imei2)) {
      setError('El IMEI 2 no pasa la validacion. Corrigelo antes de continuar.');
      return;
    }
    if (normalized.imei1 && normalized.imei1 === normalized.imei2) {
      setError('El IMEI 1 y el IMEI 2 deben ser diferentes.');
      return;
    }
    onResult(normalized);
  };

  const cerrar = () => {
    if (fase === 'procesando') return;
    stopCamera();
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-[260] bg-slate-950" role="dialog" aria-modal="true" aria-label="Escanear caja del equipo">
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between border-b border-white/10 bg-slate-950/95 px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-bold">
            <ScanBarcode size={17} />
            Escaner local de caja
          </p>
          <p className="mt-0.5 text-xs font-medium text-slate-300">
            {fase === 'camara' && 'Encuadra la etiqueta con los IMEI y datos del equipo'}
            {fase === 'preview' && 'Revisa que la etiqueta este enfocada y sin reflejos'}
            {fase === 'procesando' && (progress.detail || 'Procesando dentro de tu dispositivo')}
            {fase === 'revision' && 'Confirma o corrige los datos antes de aplicarlos'}
          </p>
        </div>
        <button
          type="button"
          onClick={cerrar}
          disabled={fase === 'procesando'}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-wait disabled:opacity-40"
          aria-label="Cerrar escaner"
        >
          <X size={20} />
        </button>
      </div>

      <div className="relative flex h-full w-full items-center justify-center overflow-y-auto bg-black pb-[7rem] pt-[4.8rem]">
        {fase === 'camara' && (
          <>
            <video ref={videoRef} muted playsInline className="h-full w-full object-contain" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-[46%] w-[88%] max-w-3xl -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-dashed border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.28)]">
              <p className="absolute -top-8 left-0 right-0 text-center text-xs font-semibold text-white">Coloca la etiqueta dentro del marco</p>
            </div>
          </>
        )}

        <canvas
          ref={canvasRef}
          className={fase === 'preview' || fase === 'procesando' ? 'max-h-full max-w-full object-contain' : 'hidden'}
        />

        {fase === 'procesando' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 px-6">
            <div className="w-full max-w-sm rounded-xl border border-white/10 bg-slate-950/95 p-5 text-white shadow-2xl">
              <div className="flex items-center gap-3">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                <div>
                  <p className="text-sm font-bold">OCR local</p>
                  <p className="text-xs text-slate-300">{progress.detail || 'Procesando etiqueta'}</p>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-blue-500 transition-[width] duration-300" style={{width: `${Math.round(progress.progress * 100)}%`}} />
              </div>
              <p className="mt-2 text-right text-xs font-semibold text-slate-300">{Math.round(progress.progress * 100)}%</p>
            </div>
          </div>
        )}

        {fase === 'revision' && (
          <div className="my-auto w-full max-w-3xl px-4 py-5">
            <div className="rounded-xl bg-slate-50 p-4 shadow-2xl sm:p-5">
              <div className="mb-4 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-emerald-800">
                <ShieldCheck size={18} className="mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-bold">La foto se proceso en este dispositivo</p>
                  <p className="text-xs">La imagen no se envio fuera de la aplicacion.</p>
                </div>
              </div>

              {scanResult?.warnings?.length > 0 && (
                <div className="mb-4 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-800">
                  {scanResult.warnings.map((warning, index) => (
                    <p key={`${warning}-${index}`} className="flex items-start gap-2 text-xs font-semibold">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {warning}
                    </p>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {FIELD_CONFIG.map(field => {
                  const edited = draft[field.key] !== scanResult?.data?.[field.key];
                  const confidence = confidenceLabel(scanResult?.fields?.[field.key], edited);
                  const invalidImei = field.key.startsWith('imei') && draft[field.key] && !luhn(draft[field.key]);
                  return (
                    <label key={field.key} className={field.key === 'nombreComercial' ? 'sm:col-span-2' : ''}>
                      <span className="mb-1 flex items-center justify-between gap-2 text-xs font-semibold text-slate-600">
                        {field.label}
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${confidence.classes}`}>
                          {confidence.text}
                        </span>
                      </span>
                      <input
                        value={draft[field.key] || ''}
                        onChange={event => setDraft(previous => ({...previous, [field.key]: event.target.value}))}
                        inputMode={field.key.startsWith('imei') || ['ram', 'memoria'].includes(field.key) ? 'numeric' : undefined}
                        maxLength={field.key.startsWith('imei') ? 15 : ['ram', 'memoria'].includes(field.key) ? 4 : 80}
                        className={`w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 ${field.mono ? 'font-mono' : ''} ${invalidImei ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                      />
                      {invalidImei && <span className="mt-1 block text-xs font-semibold text-red-600">IMEI invalido</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20 border-t border-white/10 bg-slate-950/95 px-4 py-3">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-center text-xs font-semibold text-red-100" aria-live="assertive">
              {error}
            </p>
          )}

          {fase === 'camara' && (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} className="saas-secondary !border-white/20 !bg-white/10 !text-white hover:!bg-white/15">
                <ImagePlus size={16} /> Galeria
              </button>
              <button type="button" onClick={capturar} className="saas-primary">
                <ScanBarcode size={16} /> Tomar foto
              </button>
            </div>
          )}

          {fase === 'preview' && (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={reintentar} className="saas-secondary !border-white/20 !bg-white/10 !text-white hover:!bg-white/15">
                <RotateCcw size={15} /> Repetir
              </button>
              <button type="button" onClick={analizar} className="saas-primary">
                <ScanBarcode size={16} /> Extraer localmente
              </button>
            </div>
          )}

          {fase === 'revision' && (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={reintentar} className="saas-secondary !border-white/20 !bg-white/10 !text-white hover:!bg-white/15">
                <RotateCcw size={15} /> Otra foto
              </button>
              <button type="button" onClick={aplicar} className="saas-primary">
                <Check size={16} /> Usar estos datos
              </button>
            </div>
          )}

          {fase === 'procesando' && (
            <button type="button" disabled className="saas-primary w-full cursor-wait opacity-70">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white" />
              Procesando sin enviar la imagen
            </button>
          )}

          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={seleccionarArchivo} className="hidden" />
        </div>
      </div>
    </div>
  );
}
