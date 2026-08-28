import React from 'react';
import {AlertTriangle, ImagePlus, RotateCcw, ScanBarcode, X} from 'lucide-react';
import {scanBoxWithGemini} from '../../services/geminiBoxScanner.js';
import {obtenerMensajeErrorFuncion} from '../../services/functionsClient.js';
import {safeBoxAutofill} from '../../utils/boxAutofill.js';

const MAX_LOCAL_IMAGE_BYTES = 12 * 1024 * 1024;

function errorMessage(error) {
  if (error?.message === 'IMAGEN_LOCAL_INVALIDA') return 'La imagen no se pudo leer. Selecciona otra foto.';
  if (/fetch|network/i.test(error?.message || '')) {
    return 'No se pudo conectar con el servidor. Revisa tu conexion e intenta nuevamente.';
  }
  return obtenerMensajeErrorFuncion(error, 'No se pudieron extraer datos. Repite la foto con buena luz y la etiqueta enfocada.');
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
  if (!context) throw new Error('IMAGEN_LOCAL_INVALIDA');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
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

export function EscanerCaja({onResult, onClose, onProcessingStart, onProcessingEnd, onError}) {
  const dialogRef = React.useRef(null);
  const returnFocusRef = React.useRef(null);
  const videoRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const fileRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const cameraRequestRef = React.useRef(0);
  const mountedRef = React.useRef(true);
  const scanRequestRef = React.useRef(null);
  const [fase, setFase] = React.useState('camara');
  const [enSegundoPlano, setEnSegundoPlano] = React.useState(false);
  const [error, setError] = React.useState('');
  const [progress, setProgress] = React.useState({detail: ''});

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
    abrirCamara().catch(() => {
      if (mountedRef.current) setError('Sin acceso a camara. Puedes elegir una foto de la galeria.');
    });
    return () => {
      mountedRef.current = false;
      scanRequestRef.current?.abort();
      stopCamera();
    };
  }, [abrirCamara, stopCamera]);

  React.useEffect(() => {
    if (enSegundoPlano) return;
    const previousFocus = document.activeElement;
    returnFocusRef.current = previousFocus;
    const panel = dialogRef.current;
    const focusable = () => Array.from(panel?.querySelectorAll('button:not(:disabled), input:not([type="file"]):not(:disabled)') || [])
      .filter(element => element.getClientRects().length > 0);
    focusable()[0]?.focus();
    const handleKeyDown = event => {
      if (event.key === 'Tab') {
        const elements = focusable();
        const first = elements[0];
        const last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    panel?.addEventListener('keydown', handleKeyDown);
    return () => {
      panel?.removeEventListener('keydown', handleKeyDown);
      if (returnFocusRef.current?.isConnected && !returnFocusRef.current.disabled) returnFocusRef.current.focus();
      else panel?.previousElementSibling?.querySelector('button')?.focus();
    };
  }, [enSegundoPlano]);

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
      try {
        if (!mountedRef.current) return;
        drawSourceToCanvas(image, canvasRef.current);
      } finally {
        image.close?.();
      }
      stopCamera();
      setError('');
      setFase('preview');
    } catch (fileError) {
      if (!mountedRef.current) return;
      const message = fileError?.message === 'ARCHIVO_IMAGEN_MUY_GRANDE'
        ? 'La imagen supera 12 MB. Elige una foto mas liviana.'
        : 'Solo se permiten imagenes JPG, PNG o WebP.';
      setError(message);
    }
  };

  const reintentar = async () => {
    setProgress({detail: ''});
    setError('');
    setFase('camara');
    try {
      await abrirCamara();
    } catch {
      setError('Sin acceso a camara. Puedes elegir una foto de la galeria.');
    }
  };

  const analizar = async () => {
    if (scanRequestRef.current) return;
    if (!canvasRef.current?.width) {
      setError('Primero toma o selecciona una foto de la caja.');
      return;
    }
    setFase('procesando');
    setEnSegundoPlano(true);
    setError('');
    setProgress({detail: 'Preparando imagen'});
    const controller = new AbortController();
    scanRequestRef.current = controller;
    onProcessingStart?.();
    try {
      // Pausa temporal: no cargar modelos ni leer/escribir correcciones locales.
      const result = await scanBoxWithGemini(canvasRef.current, {
        signal: controller.signal,
        onProgress: next => {
          if (mountedRef.current && !controller.signal.aborted) setProgress(next);
        },
      });
      if (!mountedRef.current || controller.signal.aborted) return;
      onResult(safeBoxAutofill(result.data), {warnings: result.warnings});
    } catch (scanError) {
      if (!mountedRef.current || controller.signal.aborted) return;
      const message = errorMessage(scanError);
      setError(message);
      setFase('preview');
      onError?.(message);
    } finally {
      if (scanRequestRef.current === controller) scanRequestRef.current = null;
      if (mountedRef.current && !controller.signal.aborted) onProcessingEnd?.();
    }
  };

  const cerrar = () => {
    scanRequestRef.current?.abort();
    stopCamera();
    onClose?.();
  };

  return (
    <>
    {enSegundoPlano && (
      <section className="mx-4 my-3 flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between" aria-label="Estado del escaneo">
        <div className="flex min-w-0 items-start gap-2" role="status" aria-live="polite" aria-atomic="true">
          {fase === 'procesando'
            ? <span aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700 motion-reduce:animate-none" />
            : <AlertTriangle size={18} className="shrink-0 text-amber-700" />}
          <div>
            <p className="text-sm font-semibold text-slate-800">
              {fase === 'procesando' ? 'Extrayendo datos en segundo plano' : 'No se pudo completar el escaneo'}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {fase === 'procesando' ? `${progress.detail || 'Consultando Gemini'}. Los datos se rellenaran automaticamente.` : error}
            </p>
            {fase === 'procesando' && <p className="mt-1 text-xs text-slate-500">Salir de este formulario o cerrar la pagina cancela la extraccion.</p>}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {fase !== 'procesando' && (
            <button type="button" onClick={() => setEnSegundoPlano(false)} className="saas-primary min-h-11">
              Volver a la foto
            </button>
          )}
          <button type="button" onClick={cerrar} className="saas-secondary min-h-11">
            {fase === 'procesando' ? 'Cancelar extraccion' : 'Descartar escaneo'}
          </button>
        </div>
      </section>
    )}
    <div ref={dialogRef} className={enSegundoPlano ? 'hidden' : 'fixed inset-0 z-[260] bg-slate-950'} role={enSegundoPlano ? undefined : 'dialog'} aria-modal={enSegundoPlano ? undefined : true} aria-hidden={enSegundoPlano || undefined} aria-label="Escanear caja del equipo" onKeyDown={event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cerrar();
      }
    }}>
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between border-b border-white/10 bg-slate-950/95 px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-bold">
            <ScanBarcode size={17} />
            Escaner de caja con Gemini
          </p>
          <p className="mt-0.5 text-xs font-medium text-slate-300">
            {fase === 'camara' && 'Encuadra la etiqueta con los IMEI y datos del equipo'}
            {fase === 'preview' && 'Revisa que la etiqueta este enfocada y sin reflejos'}
            {fase === 'procesando' && (progress.detail || 'Consultando Gemini')}
          </p>
        </div>
        <button
          type="button"
          onClick={cerrar}
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
            <p className="text-center text-xs leading-relaxed text-slate-300">
              Al analizar, enviaras esta foto (incluidos IMEI y serie) a Google Gemini mediante nuestro servidor. Encuadra solo la etiqueta de la caja.
              {' '}Los datos se rellenaran directamente. Aprendizaje local pausado.
            </p>
          )}

          {fase === 'preview' && (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={reintentar} className="saas-secondary !border-white/20 !bg-white/10 !text-white hover:!bg-white/15">
                <RotateCcw size={15} /> Repetir
              </button>
              <button type="button" onClick={analizar} className="saas-primary">
                <ScanBarcode size={16} /> Analizar en segundo plano
              </button>
            </div>
          )}

          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={seleccionarArchivo} className="hidden" />
        </div>
      </div>
    </div>
    </>
  );
}
