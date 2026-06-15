import React, {useState} from 'react';
import {ImagePlus, RefreshCw, Search} from 'lucide-react';
import {consultarDniFotos, obtenerMensajeErrorFuncion} from '../../services/functionsClient.js';

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

function readSuccessCount() {
  if (typeof window === 'undefined') return 0;
  const value = Number(window.localStorage.getItem(SUCCESS_COUNT_KEY) || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function DniFotosPage({showToast}) {
  const [tipo, setTipo] = useState('azul');
  const [dni, setDni] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [successCount, setSuccessCount] = useState(readSuccessCount);

  const cleanDni = dni.trim();
  const canSearch = DNI_RE.test(cleanDni) && !loading;
  const selectedType = photoTypes.find(item => item.value === tipo) || photoTypes[0];
  const personName = [result?.apellidos, result?.nombres].filter(Boolean).join(', ');
  const images = result?.images || [];

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
      if (json.success && Array.isArray(data.images) && data.images.length) {
        setResult(data);
        setSuccessCount(prev => {
          const next = prev + 1;
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(SUCCESS_COUNT_KEY, String(next));
          }
          return next;
        });
        return;
      }

      const message = `No se encontraron imagenes de ${selectedType.label}`;
      setError(message);
      showToast?.(message, 'error');
    } catch (e) {
      console.error('DNI photos error:', e);
      const message = obtenerMensajeErrorFuncion(e, `Error al consultar imagenes de ${selectedType.label}`);
      setError(message);
      showToast?.(message, 'error');
    } finally {
      setLoading(false);
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
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          {photoTypes.map(item => (
            <button
              key={item.value}
              type="button"
              onClick={() => handleTypeChange(item.value)}
              data-active={tipo === item.value}
              className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:bg-slate-50 data-[active=true]:border-blue-300 data-[active=true]:bg-blue-50 data-[active=true]:text-blue-700"
            >
              <span className="flex items-center gap-2 text-sm font-bold">
                <ImagePlus size={16} />
                {item.label}
              </span>
              <span className="mt-1 block text-xs font-medium text-slate-500">{item.description}</span>
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
    </div>
  );
}
