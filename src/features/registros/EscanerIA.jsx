import React from 'react';
import { Menu, X, Home, ShoppingCart, ClipboardList, Plus, Search, Edit, Trash2, Printer, Copy, Eye, CheckCircle2, AlertCircle, Users, ScanBarcode, UploadCloud, ChevronDown, ChevronUp, LogOut, FileText, Share2, Settings, ImagePlus } from 'lucide-react';
import { llamarFuncionSegura } from '../../services/functionsClient.js';
import { normalizarEscaneo } from '../../utils/scanner.js';
export function EscanerIA({ onResult, onClose }) {
  const videoRef  = React.useRef(null);
  const canvasRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const [fase, setFase]         = React.useState('camara'); // 'camara' | 'preview' | 'procesando'
  const [fotoBase64, setFoto]   = React.useState(null);
  const [error, setError]       = React.useState('');
  const [msg, setMsg]           = React.useState('');

  const abrirCamara = React.useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('La camara solo funciona en HTTPS, localhost o navegadores compatibles.');
    }
    return navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 3840 }, height: { ideal: 2160 } }
    });
  }, []);

  React.useEffect(() => {
    let activo = true;
    abrirCamara().then(stream => {
      if (!activo) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
    }).catch(() => setError('Sin acceso a cámara. Verifica permisos.'));
    return () => { activo = false; streamRef.current?.getTracks().forEach(t => t.stop()); };
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
    // Sin preprocesamiento: enviamos la imagen tal cual a Gemini mediante Netlify Functions.
    const base64 = canvas.toDataURL('image/jpeg', 0.82).split(',')[1];
    setFoto(base64);
    setFase('preview');
    streamRef.current?.getTracks().forEach(t => t.stop());
  };

  const analizar = async () => {
    if (!fotoBase64) {
      setError('Primero toma una foto de la caja.');
      return;
    }
    setFase('procesando');
    setMsg('Analizando...');
    setError('');
    try {
      const data = await llamarFuncionSegura('analizarCajaGemini', { imageBase64: fotoBase64 });

      if (data.error) {
        console.error('Gemini API error:', data.error);
        const mensaje = data.error.message || 'No se pudo analizar la imagen.';
        const keyFiltrada = /api key|leaked|key/i.test(mensaje);
        setError(keyFiltrada ? 'La API key de Gemini fue bloqueada. Actualiza GEMINI_API_KEY en Netlify.' : `Error API: ${mensaje}`);
        setFase('preview'); setMsg('');
        return;
      }

      const texto = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!texto) {
        setError('Gemini no devolvió texto. Reintenta.');
        setFase('preview'); setMsg('');
        return;
      }

      const extraer = (campo) => {
        const r = new RegExp(`"${campo}"\\s*:\\s*"([^"]*)"`, 'i');
        const m = texto.match(r);
        return m ? m[1].trim() : '';
      };

      let parsed = {};
      const matchCompleto = texto.match(/\{[\s\S]*\}/);
      if (matchCompleto) {
        try { parsed = JSON.parse(matchCompleto[0]); } catch { parsed = {}; }
      }
      if (!Object.values(parsed).some(v => v)) {
        parsed = {
          imei1:           extraer('imei1'),
          imei2:           extraer('imei2'),
          sn:              extraer('sn'),
          marca:           extraer('marca'),
          modelo:          extraer('modelo'),
          nombreComercial: extraer('nombreComercial'),
          ram:             extraer('ram'),
          memoria:         extraer('memoria'),
          color:           extraer('color'),
        };
      }

      const normalizado = normalizarEscaneo(parsed);
      onResult(normalizado);
    } catch (e) {
      console.error('Error escáner:', e);
      const mensaje = e.message === 'BACKEND_NOT_DEPLOYED'
        ? 'Backend no desplegado: abre la app desde el servidor Node'
          : e.message === 'BACKEND_INVALID_RESPONSE'
            ? 'Respuesta invalida de Netlify Functions'
          : e.message;
      setError(`Error: ${mensaje}`);
      setFase('preview');
      setMsg('');
    }
  };

  const reintentar = () => {
    setFoto(null); setError(''); setMsg(''); setFase('camara');
    abrirCamara()
      .then(stream => { streamRef.current = stream; if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); } })
      .catch((e) => setError(e.message || 'Sin acceso a camara. Verifica permisos.'));
  };

  return (
    // Panel fijo en esquina inferior derecha — NO bloquea el formulario
    <div className="fixed bottom-4 right-4 z-[200] saas-scanner-panel overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex items-center gap-2 text-gray-700 text-xs font-semibold">
          <ScanBarcode size={15} />
          {fase === 'camara'     && 'Apunta a la caja del equipo'}
          {fase === 'preview'    && 'Revisar foto'}
          {fase === 'procesando' && (msg || 'Procesando...')}
        </div>
        <button onClick={onClose} className="saas-form-close !h-7 !w-7"><X size={16} /></button>
      </div>

      {/* Visor compacto */}
      <div className="relative bg-black" style={{aspectRatio:'4/3'}}>
        {fase === 'camara' && (
          <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
        )}
        {(fase === 'preview' || fase === 'procesando') && fotoBase64 && (
          <img src={`data:image/jpeg;base64,${fotoBase64}`} alt="preview" className="w-full h-full object-cover" />
        )}
        {fase === 'procesando' && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <p className="text-white text-xs px-3 text-center">Leyendo datos...</p>
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Acciones */}
      <div className="px-3 py-2.5 flex flex-col gap-2">
        {error && <p className="text-red-500 text-xs text-center">{error}</p>}
        {fase === 'camara' && (
          <button onClick={capturar}
            className="saas-primary w-full">
            <ScanBarcode size={16} /> Tomar foto
          </button>
        )}
        {(fase === 'preview' || (fase === 'procesando' && error)) && (
          <div className="flex gap-2">
            <button onClick={reintentar}
              className="saas-secondary flex-1">
              Repetir
            </button>
            <button onClick={analizar} disabled={fase === 'procesando'}
              className="saas-primary flex-1 disabled:opacity-50">
              Analizar IA
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

