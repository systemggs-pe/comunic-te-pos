import React, {useEffect, useState} from 'react';
import {CheckCircle2, Clock3, Eye, ImagePlus, RefreshCw, Search, Trash2, XCircle} from 'lucide-react';
import {consultarDniFotos, obtenerMensajeErrorFuncion} from '../../services/functionsClient.js';
import {
  deleteDniPhotoHistoryEntry,
  loadDniPhotoHistory,
  saveDniPhotoHistoryEntry,
} from './dniFotosHistory.js';

const DNI_RE = /^\d{8}$/;
const SUCCESS_COUNT_KEY = 'ggs_dni_photo_success_count';
const imageLabels = ['Anverso', 'Reverso'];
const photoTypes = [
  {
    value: 'azul',
    label: 'DNI azul',
    description: 'Formato azul',
  },
  {
    value: 'electronico',
    label: 'DNI electronico',
    description: 'Formato electronico',
  },
];

const historyDateFormatter = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

function readSuccessCount() {
  if (typeof window === 'undefined') return 0;
  const value = Number(window.localStorage.getItem(SUCCESS_COUNT_KEY) || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function writeSuccessCount(value) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SUCCESS_COUNT_KEY, String(value));
}

function countSuccessfulHistory(entries) {
  return entries.filter(item => item.status === 'success').length;
}

function formatHistoryDate(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return historyDateFormatter.format(date);
}

function buildStoredResult(data, fallbackDni, selectedType) {
  const images = Array.isArray(data?.images)
    ? data.images
      .filter(image => image?.dataUri)
      .slice(0, 2)
      .map(image => ({dataUri: image.dataUri}))
    : [];

  return {
    dni: data?.dni || fallbackDni,
    nombres: data?.nombres || '',
    apellidos: data?.apellidos || '',
    genero: data?.genero || '',
    edad: data?.edad || '',
    tipo: data?.tipo || selectedType.value,
    tipoLabel: data?.tipoLabel || selectedType.label,
    images,
  };
}

function statusClasses(status) {
  if (status === 'success') {
    return {
      chip: 'border-emerald-100 bg-emerald-50 text-emerald-700',
      icon: 'border-emerald-100 bg-emerald-50 text-emerald-700',
      label: 'Exitoso',
      Icon: CheckCircle2,
    };
  }

  return {
    chip: 'border-red-100 bg-red-50 text-red-700',
    icon: 'border-red-100 bg-red-50 text-red-700',
    label: 'Fallido',
    Icon: XCircle,
  };
}

export function DniFotosPage({showToast}) {
  const [tipo, setTipo] = useState('azul');
  const [dni, setDni] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [history, setHistory] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [successCount, setSuccessCount] = useState(readSuccessCount);

  const cleanDni = dni.trim();
  const canSearch = DNI_RE.test(cleanDni) && !loading;
  const selectedType = photoTypes.find(item => item.value === tipo) || photoTypes[0];
  const personName = [result?.apellidos, result?.nombres].filter(Boolean).join(', ');
  const images = result?.images || [];

  useEffect(() => {
    let active = true;

    loadDniPhotoHistory()
      .then(entries => {
        if (!active) return;
        setHistory(entries);
        setHistoryError('');

        const nextCount = Math.max(readSuccessCount(), countSuccessfulHistory(entries));
        setSuccessCount(nextCount);
        writeSuccessCount(nextCount);
      })
      .catch(err => {
        console.error('DNI photos history load error:', err);
        if (active) setHistoryError('No se pudo cargar el historial local');
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const clearResult = () => {
    if (result || error) {
      setResult(null);
      setError('');
    }
  };

  const handleTypeChange = value => {
    setTipo(value);
    clearResult();
  };

  const handleDniChange = event => {
    const value = event.target.value.replace(/\D/g, '').slice(0, 8);
    setDni(value);
    clearResult();
  };

  const saveHistory = async ({status, message = '', storedResult = null}) => {
    try {
      const saved = await saveDniPhotoHistoryEntry({
        createdAt: new Date().toISOString(),
        status,
        dni: cleanDni,
        tipo,
        tipoLabel: selectedType.label,
        message,
        result: storedResult,
      });

      setHistory(prev => [saved, ...prev.filter(item => item.id !== saved.id)].slice(0, 30));
      setHistoryError('');
    } catch (err) {
      console.error('DNI photos history save error:', err);
      setHistoryError('No se pudo guardar el historial local');
      showToast?.('No se pudo guardar el historial local', 'error');
    }
  };

  const consultar = async event => {
    event?.preventDefault();
    if (!DNI_RE.test(cleanDni)) {
      showToast?.('Ingresa un DNI valido de 8 digitos', 'error');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    try {
      const json = await consultarDniFotos(cleanDni, tipo);
      const data = json.data || {};
      const storedResult = buildStoredResult(data, cleanDni, selectedType);
      if (json.success && storedResult.images.length) {
        setResult(storedResult);
        setSuccessCount(prev => {
          const next = prev + 1;
          writeSuccessCount(next);
          return next;
        });
        await saveHistory({status: 'success', storedResult});
        return;
      }

      const message = `No se encontraron imagenes de ${selectedType.label}`;
      setError(message);
      showToast?.(message, 'error');
      await saveHistory({status: 'failed', message});
    } catch (e) {
      console.error('DNI photos error:', e);
      const message = obtenerMensajeErrorFuncion(e, `Error al consultar imagenes de ${selectedType.label}`);
      setError(message);
      showToast?.(message, 'error');
      await saveHistory({status: 'failed', message});
    } finally {
      setLoading(false);
    }
  };

  const openHistoryItem = item => {
    setTipo(item.tipo || 'azul');
    setDni(item.dni || '');

    if (item.status === 'success' && item.result?.images?.length) {
      setResult(item.result);
      setError('');
      return;
    }

    setResult(null);
    setError(item.message || 'Consulta fallida');
  };

  const deleteHistoryItem = async item => {
    if (item.status === 'success') {
      showToast?.('Las consultas exitosas no se pueden borrar', 'error');
      return;
    }

    try {
      await deleteDniPhotoHistoryEntry(item.id);
      setHistory(prev => prev.filter(entry => entry.id !== item.id));
    } catch (err) {
      console.error('DNI photos history delete error:', err);
      showToast?.('No se pudo eliminar la consulta del historial', 'error');
    }
  };

  return (
    <div className="saas-list-shell">
      <div className="saas-page-header">
        <div>
          <p className="saas-page-kicker">Documento</p>
          <h3 className="saas-page-title">Foto DNI</h3>
          <p className="saas-page-desc">Consulta anverso y reverso por numero de DNI.</p>
        </div>
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600">
          Consulta FOTO DNI: {successCount}
        </p>
      </div>

      <div className="border-b border-slate-200 p-4">
        <div className="mb-4 grid gap-2 md:grid-cols-2">
          {photoTypes.map(item => (
            <button
              key={item.value}
              type="button"
              onClick={() => handleTypeChange(item.value)}
              data-active={tipo === item.value}
              className="flex min-h-14 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:bg-slate-50 data-[active=true]:border-blue-300 data-[active=true]:bg-blue-50 data-[active=true]:text-blue-700"
            >
              <span>
                <span className="flex items-center gap-2 text-sm font-bold">
                  <ImagePlus size={16} />
                  {item.label}
                </span>
                <span className="mt-1 block text-xs font-medium text-slate-500">{item.description}</span>
              </span>
              {tipo === item.value && <CheckCircle2 size={17} className="shrink-0 text-blue-700" />}
            </button>
          ))}
        </div>

        <form onSubmit={consultar} className="flex flex-col gap-3 sm:flex-row">
          <div className="saas-searchbox sm:w-80">
            <Search size={16} />
            <input
              value={dni}
              onChange={handleDniChange}
              className="saas-search-input font-mono"
              inputMode="numeric"
              maxLength={8}
              placeholder="DNI de 8 digitos"
            />
          </div>
          <button type="submit" disabled={!canSearch} className="saas-primary disabled:cursor-not-allowed disabled:opacity-60">
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
                Consultando...
              </>
            ) : (
              <>
                <ImagePlus size={16} />
                Consultar {selectedType.label}
              </>
            )}
          </button>
          {result && (
            <button type="button" onClick={consultar} disabled={loading} className="saas-secondary disabled:opacity-50">
              <RefreshCw size={14} />
              Actualizar
            </button>
          )}
        </form>
      </div>

      <div className="p-4">
        {error && (
          <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        {!error && !loading && !result && (
          <div className="saas-empty">
            <ImagePlus size={34} />
            <p className="text-sm font-semibold">Ingresa un DNI para consultar la foto.</p>
            <p className="text-xs font-medium text-slate-400">{selectedType.label}</p>
          </div>
        )}

        {loading && (
          <div className="flex min-h-56 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 text-sm font-semibold text-blue-700">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-300 border-t-transparent" />
            Consultando imagenes...
          </div>
        )}

        {!loading && result && (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm font-semibold text-slate-800">{personName || 'DNI consultado'}</p>
              <p className="mt-1 font-mono text-xs text-slate-500">{result.tipoLabel || selectedType.label} / DNI {result.dni || cleanDni}</p>
              {(result.genero || result.edad) && (
                <p className="mt-1 text-xs text-slate-500">{[result.genero, result.edad ? `${result.edad} anos` : ''].filter(Boolean).join(' / ')}</p>
              )}
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {imageLabels.map((label, index) => {
                const image = images[index];
                return (
                  <figure key={label} className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    <figcaption className="border-b border-slate-200 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                      {label}
                    </figcaption>
                    {image ? (
                      <img
                        src={image.dataUri}
                        alt={`DNI ${label}`}
                        className="max-h-[72vh] w-full bg-white object-contain lg:max-h-[34rem]"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex min-h-56 items-center justify-center text-sm text-slate-400">
                        Imagen no disponible
                      </div>
                    )}
                  </figure>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-sm font-bold text-slate-900">Historial de consultas</h4>
            <p className="text-xs font-medium text-slate-500">Fotos guardadas en este navegador.</p>
          </div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{history.length} registros</p>
        </div>

        {historyError && (
          <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            {historyError}
          </div>
        )}

        {historyLoading ? (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-500">
            <Clock3 size={16} />
            Cargando historial...
          </div>
        ) : history.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-400">
            Sin consultas guardadas.
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {history.map(item => {
              const styles = statusClasses(item.status);
              const StatusIcon = styles.Icon;
              const subtitle = [item.tipoLabel, formatHistoryDate(item.createdAt), item.message].filter(Boolean).join(' / ');

              return (
                <div key={item.id} className="flex items-stretch border-b border-slate-100 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => openHistoryItem(item)}
                    className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${styles.icon}`}>
                      <StatusIcon size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-slate-900">DNI {item.dni || '--------'}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${styles.chip}`}>
                          {styles.label}
                        </span>
                      </span>
                      <span className="mt-1 block truncate text-xs font-medium text-slate-500">{subtitle}</span>
                    </span>
                    <Eye size={16} className="hidden shrink-0 text-slate-400 sm:block" />
                  </button>
                  {item.status === 'success' ? (
                    <span
                      title="Consulta protegida"
                      className="flex w-11 shrink-0 items-center justify-center border-l border-slate-100 text-emerald-600"
                    >
                      <CheckCircle2 size={16} />
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => deleteHistoryItem(item)}
                      aria-label={`Eliminar consulta DNI ${item.dni || ''}`}
                      title="Eliminar"
                      className="flex w-11 shrink-0 items-center justify-center border-l border-slate-100 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-inset"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
