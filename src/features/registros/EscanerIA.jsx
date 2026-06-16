import React from 'react';
import {ScanBarcode, X} from 'lucide-react';
import {llamarFuncionSegura} from '../../services/functionsClient.js';
import {normalizarEscaneo} from '../../utils/scanner.js';

export function EscanerIA({onResult, onClose, onProcessingStart, onError}) {
  const videoRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const [fase, setFase] = React.useState('camara');
  const [fotoBase64, setFoto] = React.useState(null);
  const [error, setError] = React.useState('');
  const [msg, setMsg] = React.useState('');

  const abrirCamara = React.useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('La camara solo funciona en HTTPS, localhost o navegadores compatibles.');
    }
    return navigator.mediaDevices.getUserMedia({
      video: {facingMode: 'environment', width: {ideal: 3840}, height: {ideal: 2160}},
    });
  }, []);

  React.useEffect(() => {
    let activo = true;
    abrirCamara()
      .then(stream => {
        if (!activo) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      })
      .catch(() => setError('Sin acceso a camara. Verifica permisos.'));

    return () => {
      activo = false;
      streamRef.current?.getTracks().forEach(track => track.stop());
    };
  }, [abrirCamara]);

  const capturar = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

    const base64 = canvas.toDataURL('image/jpeg', 0.82).split(',')[1];
    setFoto(base64);
    setFase('preview');
    streamRef.current?.getTracks().forEach(track => track.stop());
  };

  const analizar = async () => {
    if (!fotoBase64) {
      setError('Primero toma una foto de la caja.');
      return;
    }

    const imageBase64 = fotoBase64;
    setFase('procesando');
    setMsg('Extrayendo datos...');
    setError('');
    onProcessingStart?.();
    onClose?.();

    try {
      const data = await llamarFuncionSegura('analizarCajaGemini', {imageBase64});

      if (data.error) {
        console.error('Gemini API error:', data.error);
        const mensaje = data.error.message || 'No se pudo analizar la imagen.';
        const keyFiltrada = /api key|leaked|key/i.test(mensaje);
        onError?.(keyFiltrada ? 'La API key de Gemini fue bloqueada. Actualiza GEMINI_API_KEY en Netlify.' : `Error API: ${mensaje}`);
        return;
      }

      const texto = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!texto) {
        onError?.('Gemini no devolvio texto. Reintenta.');
        return;
      }

      const extraer = campo => {
        const regexp = new RegExp(`"${campo}"\\s*:\\s*"([^"]*)"`, 'i');
        const match = texto.match(regexp);
        return match ? match[1].trim() : '';
      };

      let parsed = {};
      const matchCompleto = texto.match(/\{[\s\S]*\}/);
      if (matchCompleto) {
        try {
          parsed = JSON.parse(matchCompleto[0]);
        } catch {
          parsed = {};
        }
      }

      if (!Object.values(parsed).some(Boolean)) {
        parsed = {
          imei1: extraer('imei1'),
          imei2: extraer('imei2'),
          sn: extraer('sn'),
          marca: extraer('marca'),
          modelo: extraer('modelo'),
          nombreComercial: extraer('nombreComercial'),
          ram: extraer('ram'),
          memoria: extraer('memoria'),
          color: extraer('color'),
        };
      }

      onResult(normalizarEscaneo(parsed));
    } catch (e) {
      console.error('Error escaner:', e);
      const mensaje = e.message === 'BACKEND_NOT_DEPLOYED'
        ? 'Backend no desplegado: abre la app desde el servidor Node'
        : e.message === 'BACKEND_INVALID_RESPONSE'
          ? 'Respuesta invalida de Netlify Functions'
          : e.message;
      onError?.(`Error: ${mensaje}`);
    }
  };

  const reintentar = () => {
    setFoto(null);
    setError('');
    setMsg('');
    setFase('camara');
    abrirCamara()
      .then(stream => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      })
      .catch(e => setError(e.message || 'Sin acceso a camara. Verifica permisos.'));
  };

  return (
    <div className="fixed inset-0 z-[260] bg-slate-950" role="dialog" aria-modal="true" aria-label="Escanear caja del equipo">
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between border-b border-white/10 bg-slate-950/95 px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-bold">
            <ScanBarcode size={17} />
            Escanear caja del equipo
          </p>
          <p className="mt-0.5 text-xs font-medium text-slate-300">
            {fase === 'camara' && 'Apunta la camara a la etiqueta con IMEI y datos del equipo'}
            {fase === 'preview' && 'Revisa la foto antes de extraer los datos'}
            {fase === 'procesando' && (msg || 'Extrayendo datos...')}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Cerrar escaner"
        >
          <X size={20} />
        </button>
      </div>

      <div className="relative flex h-full w-full items-center justify-center bg-black pb-[5.4rem] pt-[4.6rem]">
        {fase === 'camara' && (
          <video ref={videoRef} muted playsInline className="h-full w-full object-contain" />
        )}
        {(fase === 'preview' || fase === 'procesando') && fotoBase64 && (
          <img src={`data:image/jpeg;base64,${fotoBase64}`} alt="preview" className="h-full w-full object-contain" />
        )}
        {fase === 'procesando' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="flex items-center gap-2 rounded-lg bg-slate-950/80 px-4 py-3 text-sm font-semibold text-white">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Extrayendo datos...
            </div>
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 border-t border-white/10 bg-slate-950/95 px-4 py-3">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-2">
          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-center text-xs font-semibold text-red-100">
              {error}
            </p>
          )}
          {fase === 'camara' && (
            <button type="button" onClick={capturar} className="saas-primary w-full">
              <ScanBarcode size={16} /> Tomar foto
            </button>
          )}
          {(fase === 'preview' || (fase === 'procesando' && error)) && (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={reintentar} className="saas-secondary !border-white/20 !bg-white/10 !text-white hover:!bg-white/15">
                Repetir
              </button>
              <button type="button" onClick={analizar} disabled={fase === 'procesando'} className="saas-primary disabled:opacity-50">
                Escanear
              </button>
            </div>
          )}
          {fase === 'procesando' && !error && (
            <button type="button" disabled className="saas-primary w-full cursor-wait opacity-80">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white" />
              Extrayendo datos...
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
