import React, {useState} from 'react';
import {CheckCircle2, ImagePlus, RefreshCw} from 'lucide-react';
import {consultarDniFotos, obtenerMensajeErrorFuncion} from '../../services/functionsClient.js';
import {Button} from '../../components/ui/Button.jsx';
import {PageHeader, SearchField} from '../../components/ui/PageHeader.jsx';
import {StateView} from '../../components/ui/StateView.jsx';

const DNI_RE = /^\d{8}$/;
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

function buildResult(data, fallbackDni, selectedType) {
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

export function DniFotosPage({showToast}) {
  const [tipo, setTipo] = useState('azul');
  const [dni, setDni] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

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
      const queriedResult = buildResult(json.data || {}, cleanDni, selectedType);
      if (json.success && queriedResult.images.length) {
        setResult(queriedResult);
        return;
      }

      const message = `No se encontraron imagenes de ${selectedType.label}`;
      setError(message);
      showToast?.(message, 'error');
    } catch (queryError) {
      console.error('DNI photos error:', queryError);
      const message = obtenerMensajeErrorFuncion(queryError, `Error al consultar imagenes de ${selectedType.label}`);
      setError(message);
      showToast?.(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ui-page-surface">
      <PageHeader eyebrow="Documento" title="Foto DNI" description="Consulta anverso y reverso por número de DNI. Cada consulta consume créditos del proveedor y no se guarda en el historial." icon={ImagePlus} />

      <div className="border-b border-slate-200 p-4">
        <div className="mb-4 grid gap-2 md:grid-cols-2">
          {photoTypes.map(item => (
            <button
              key={item.value}
              type="button"
              onClick={() => handleTypeChange(item.value)}
              data-active={tipo === item.value}
              className="ui-choice-row"
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
          <SearchField
              label="DNI"
              value={dni}
              onChange={handleDniChange}
              inputClassName="font-mono"
              inputMode="numeric"
              maxLength={8}
              placeholder="DNI de 8 dígitos"
              className="sm:w-80"
            />
          <Button type="submit" variant="primary" disabled={!canSearch} loading={loading} loadingLabel="Consultando…"><ImagePlus size={16} /> Consultar {selectedType.label}</Button>
          {result && (
            <Button onClick={consultar} disabled={loading} title="Realiza una nueva consulta con costo"><RefreshCw size={14} /> Actualizar</Button>
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
          <StateView icon={ImagePlus} title="Ingresa un DNI para consultar la foto" description={selectedType.label} />
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
