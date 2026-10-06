import React, {useEffect, useRef, useState} from 'react';
import {CheckCircle2, ImagePlus, RefreshCw} from 'lucide-react';
import {consultarDniFotos} from '../../services/functionsClient.js';
import {createDniPhotoLookup, dniPhotoErrorMessage} from './dniPhotoLookup.js';
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
      .map(image => ({dataUri: image.dataUri, side: image.side}))
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

export function DniFotosPage({showToast, queryPhotos = consultarDniFotos}) {
  const [tipo, setTipo] = useState('azul');
  const [dni, setDni] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const lookupRef = useRef(null);
  if (lookupRef.current === null) lookupRef.current = createDniPhotoLookup(queryPhotos);
  useEffect(() => () => lookupRef.current.dispose(), []);
  const [imageErrors, setImageErrors] = useState({});
  const [imageLoaded, setImageLoaded] = useState({});

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
    lookupRef.current.invalidate();
    setTipo(value);
    clearResult();
  };

  const handleDniChange = event => {
    lookupRef.current.invalidate();
    const value = event.target.value.replace(/\D/g, '').slice(0, 8);
    setDni(value);
    clearResult();
  };

  const consultar = async (event, options = {}) => {
    event?.preventDefault();
    if (!DNI_RE.test(cleanDni)) {
      setError(dniPhotoErrorMessage(new Error('DNI_INVALIDO')));
      return;
    }
    if (lookupRef.current.busy) return;
    setLoading(true);
    setError('');
    setResult(null);
    setImageErrors({});
    setImageLoaded({});
    try {
      const outcome = await lookupRef.current.lookup(cleanDni, tipo, {refresh: options.refresh === true});
      if (!outcome.current) return;
      if (outcome.error) {
        const message = dniPhotoErrorMessage(outcome.error);
        setError(message);
        showToast?.(message, 'error');
        return;
      }
      const json = outcome.json;
      const queriedResult = buildResult(json.data || {}, cleanDni, selectedType);
      if (json.success) {
        setResult(queriedResult);
        return;
      }

    } finally {
      setLoading(false);
    }
  };

  const actualizar = event => {
    event.preventDefault();
    consultar(event, {refresh: true});
  };

  return (
    <div className="ui-page-surface min-w-0">
      <PageHeader eyebrow="Documento" title="Foto DNI" description="Consulta anverso y reverso por número de DNI. Una consulta puede realizar hasta dos intentos y consumir créditos del proveedor." icon={ImagePlus} />

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
          <Button type="submit" variant="primary" className="min-h-11 whitespace-normal" disabled={!canSearch} loading={loading} loadingLabel="Consultando DNI..."><ImagePlus size={16} /> Consultar {selectedType.label}</Button>
          {(result || error) && (
            <Button onClick={actualizar} className="min-h-11 whitespace-normal" disabled={loading || !DNI_RE.test(cleanDni)} title="Realiza una nueva consulta con costo"><RefreshCw size={14} /> {error ? 'Intentar nuevamente' : 'Actualizar'}</Button>
          )}
        </form>
      </div>

      <div className="p-4">
        {error && (
          <div role="alert" className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        {!error && !loading && !result && (
          <StateView icon={ImagePlus} title="Ingresa un DNI para consultar la foto" description={selectedType.label} />
        )}

        {loading && (
          <div role="status" aria-label="Cargando imágenes del DNI" className="dni-photo-loading">
            <p className="col-span-full text-sm font-semibold" aria-live="polite">Consultando DNI... Las imágenes pueden tardar unos segundos.</p>
            {imageLabels.map(label => (
              <div key={label} className="dni-photo-loading__preview" aria-hidden="true">
                <div className="dni-photo-loading__document">
                  <span className="dni-photo-loading__portrait" />
                  <div className="dni-photo-loading__lines">
                    <span /><span /><span />
                  </div>
                </div>
                <span className="dni-photo-loading__label">{label}</span>
              </div>
            ))}
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
                const image = images.find(item => item.side === (index === 0 ? 'front' : 'back')) || images.filter(item => !item.side)[index];
                return (
                  <figure key={label} className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    <figcaption className="border-b border-slate-200 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                      {label}
                    </figcaption>
                    {imageErrors[index] ? (
                      <p role="alert" className="p-4 text-sm text-red-700">La imagen recibida no se pudo mostrar. No se ha realizado otra consulta ni consumido creditos adicionales.</p>
                    ) : image ? (
                      <div>
                      {!imageLoaded[index] && <p role="status" className="p-3 text-sm text-slate-500">Cargando foto...</p>}
                      <img
                        src={image.dataUri}
                        alt={`DNI ${label}`}
                        className="max-h-[72vh] w-full bg-white object-contain lg:max-h-[34rem]"
                        loading="eager"
                        decoding="async"
                        onLoad={() => setImageLoaded(previous => ({...previous, [index]: true}))}
                        onError={() => setImageErrors(previous => ({...previous, [index]: true}))}
                      />
                      </div>
                    ) : (
                      <div className="flex min-h-40 items-center justify-center px-4 text-center text-sm text-slate-500">
                        Foto no disponible. Puedes utilizar los datos mostrados.
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
