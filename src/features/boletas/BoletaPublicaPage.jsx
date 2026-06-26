import React, {useMemo, useState} from 'react';
import {AlertCircle, Building2, CheckCircle2, FileText, PackageCheck, RefreshCcw, Search} from 'lucide-react';
import {AppFooter} from '../../components/branding/AppFooter.jsx';
import {PRODUCT_BRAND, SOFTWARE_BRAND} from '../../config/branding.js';
import {getBoletaExtranjeraEmisor} from '../../config/boletaExtranjera.js';
import {consultarBoletaPublica} from '../../services/publicBoletaClient.js';
import {penToClp} from '../../utils/currency.js';

const initialForm = {
  rut: '',
  nBoleta: '',
  fecha: '',
  monto: '',
};

function formatFechaHora(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16).replace('T', ' ');
  return date.toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMoney(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0';
  return number.toLocaleString('es-CL');
}

function getPublicErrorMessage(error) {
  if (error?.status === 429) return 'Demasiados intentos. Espera unos segundos y vuelve a buscar.';
  if (error?.status === 404 || error?.message === 'BOLETA_NO_ENCONTRADA') {
    return 'No encontramos una boleta con esos datos. Revisa RUT, numero, fecha y monto.';
  }
  if (error?.message === 'BACKEND_NOT_DEPLOYED') return 'La consulta publica aun no esta disponible en este despliegue.';
  if (error?.message === 'BACKEND_INVALID_RESPONSE') return 'La respuesta del servidor no se pudo leer.';
  return 'No se pudo consultar la boleta. Intenta nuevamente.';
}

function joinClean(parts) {
  return parts.map(value => String(value || '').trim()).filter(Boolean).join(' ');
}

function getBoletaDetails(boleta) {
  const data = boleta?.boletaData || {};
  const ventas = Array.isArray(data.ventas) ? data.ventas : [];
  const equiposMap = data.equiposMap || {};
  const emisor = {
    ...getBoletaExtranjeraEmisor({}, boleta?.formato || 1),
    ...(data.emisor || {}),
  };
  const total = Number(data.totalClp || boleta?.totalClp || 0);
  const impuesto = Math.round(total - total / 1.19);
  const monto = Math.max(total - impuesto, 0);

  const articulos = ventas.map((venta, index) => {
    const equipo = equiposMap[venta.imeiEquipo] || {};
    const nombre = joinClean([
      equipo.nombreComercial || venta.nombreComercial || venta.modeloEquipo,
      equipo.memoria || venta.memoria ? `${equipo.memoria || venta.memoria}GB` : '',
    ]) || `Articulo ${index + 1}`;
    const caracteristicas = [
      ['Marca', equipo.marca || venta.marcaEquipo],
      ['Modelo', equipo.modelo || venta.modeloEquipo],
      ['Color', equipo.color || venta.color],
      ['Memoria', equipo.memoria || venta.memoria ? `${equipo.memoria || venta.memoria}GB` : ''],
      ['IMEI', venta.imeiEquipo],
      ['IMEI 2', equipo.imei2 || venta.imei2Equipo],
      ['Serie', equipo.sn || venta.sn],
    ].filter(([, value]) => String(value || '').trim());

      return {
      id: `${venta.imeiEquipo || index}-${index}`,
      nombre,
      precioClp: penToClp(Number(venta.precio || 0)),
      caracteristicas,
    };
  });

  return {articulos, emisor, impuesto, monto, total};
}

function DetailRow({label, value}) {
  return (
    <div className="grid gap-0.5 border-b border-slate-100 py-2 last:border-b-0 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-3">
      <dt className="text-[11px] font-extrabold uppercase text-slate-500">{label}</dt>
      <dd className="text-sm font-semibold text-slate-900">{value || 'No registrado'}</dd>
    </div>
  );
}

export function BoletaPublicaPage() {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [boleta, setBoleta] = useState(null);

  const canSubmit = useMemo(() => {
    return Object.values(form).every(value => String(value || '').trim());
  }, [form]);

  const details = useMemo(() => getBoletaDetails(boleta), [boleta]);

  const updateField = (field, value) => {
    setForm(current => ({...current, [field]: value}));
  };

  const handleSubmit = async event => {
    event.preventDefault();
    if (!canSubmit || loading) return;

    setLoading(true);
    setError('');
    setBoleta(null);

    try {
      const response = await consultarBoletaPublica(form);
      setBoleta(response.boleta);
    } catch (lookupError) {
      setError(getPublicErrorMessage(lookupError));
    } finally {
      setLoading(false);
    }
  };

  const resetSearch = () => {
    setForm(initialForm);
    setBoleta(null);
    setError('');
  };

  return (
    <div className="min-h-screen bg-[var(--ggs-bg)] text-slate-900">
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="border-b border-slate-200 pb-4">
          <div>
            <p className="text-[11px] font-extrabold uppercase text-slate-500">{SOFTWARE_BRAND}</p>
            <h1 className="mt-1 text-xl font-bold text-slate-950 sm:text-2xl">{PRODUCT_BRAND}</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Verificacion publica de boletas emitidas.
            </p>
          </div>
        </header>

        <section className="grid flex-1 gap-4 py-5 lg:grid-cols-[390px_minmax(0,1fr)]">
          <form
            onSubmit={handleSubmit}
            className="h-fit rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-4 flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                <FileText size={20} aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-base font-bold text-slate-950">Buscar boleta</h2>
                <p className="mt-0.5 text-xs leading-5 text-slate-600">
                  Ingresa los datos exactos que figuran en la boleta.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase text-slate-600">RUT del cliente</span>
                <input
                  value={form.rut}
                  onChange={event => updateField('rut', event.target.value)}
                  className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  inputMode="text"
                  autoComplete="off"
                  placeholder="Ej. 12345678-9"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase text-slate-600">Numero de boleta</span>
                <input
                  value={form.nBoleta}
                  onChange={event => updateField('nBoleta', event.target.value)}
                  className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Ej. 1004"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase text-slate-600">Fecha de boleta</span>
                <input
                  value={form.fecha}
                  onChange={event => updateField('fecha', event.target.value)}
                  className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  type="date"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase text-slate-600">Monto total</span>
                <input
                  value={form.monto}
                  onChange={event => updateField('monto', event.target.value)}
                  className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="Ej. 350000"
                />
              </label>
            </div>

            {error && (
              <div className="mt-4 flex gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit || loading}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-bold text-white transition hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Search size={18} aria-hidden="true" />
              {loading ? 'Verificando...' : 'Verificar boleta'}
            </button>
          </form>

          <div className="min-h-[420px] rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
            {!boleta && (
              <div className="flex h-full min-h-[360px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-5 text-center">
                <PackageCheck className="text-slate-400" size={34} aria-hidden="true" />
                <h2 className="mt-3 text-base font-bold text-slate-900">Verificacion de autenticidad</h2>
                <p className="mt-1 max-w-md text-sm leading-6 text-slate-600">
                  Si los datos coinciden, se mostrara la confirmacion y el resumen de la boleta emitida.
                </p>
              </div>
            )}

            {boleta && (
              <div className="space-y-4">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-700" size={24} aria-hidden="true" />
                      <div>
                        <p className="text-[11px] font-extrabold uppercase text-emerald-700">Boleta valida</p>
                        <p className="mt-1 text-sm text-emerald-800">
                          Boleta Nro. {boleta.nBoleta} emitida el {formatFechaHora(boleta.fechaHora)}.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={resetSearch}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      <RefreshCcw size={17} aria-hidden="true" />
                      Nueva busqueda
                    </button>
                  </div>
                </div>

                <section className="rounded-lg border border-slate-200">
                  <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
                    <Building2 size={18} className="text-slate-500" aria-hidden="true" />
                    <h3 className="text-sm font-bold text-slate-950">Empresa emisora</h3>
                  </div>
                  <dl className="px-4">
                    <DetailRow label="Nombre" value={details.emisor.nombre} />
                    <DetailRow label="RUT empresa" value={details.emisor.rut} />
                    <DetailRow label="Direccion" value={details.emisor.direccion} />
                    <DetailRow label="Fecha y hora" value={formatFechaHora(boleta.fechaHora)} />
                  </dl>
                </section>

                <section className="rounded-lg border border-slate-200">
                  <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
                    <FileText size={18} className="text-slate-500" aria-hidden="true" />
                    <h3 className="text-sm font-bold text-slate-950">Cliente y montos</h3>
                  </div>
                  <dl className="px-4">
                    <DetailRow label="Cliente" value={boleta.clienteNombre || boleta.boletaData?.cliente?.nombre} />
                    <DetailRow label="RUT cliente" value={boleta.boletaData?.cliente?.dni} />
                    <DetailRow label="Monto" value={`$ ${formatMoney(details.monto)}`} />
                    <DetailRow label="Impuesto IVA 19%" value={`$ ${formatMoney(details.impuesto)}`} />
                    <DetailRow label="Monto total" value={`$ ${formatMoney(details.total)}`} />
                  </dl>
                </section>

                <section className="rounded-lg border border-slate-200">
                  <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
                    <PackageCheck size={18} className="text-slate-500" aria-hidden="true" />
                    <h3 className="text-sm font-bold text-slate-950">Articulo adquirido</h3>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {details.articulos.map(articulo => (
                      <article key={articulo.id} className="px-4 py-3">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                          <h4 className="text-sm font-bold text-slate-950">{articulo.nombre}</h4>
                          <p className="text-sm font-bold text-slate-700">$ {formatMoney(articulo.precioClp)} CLP</p>
                        </div>
                        <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                          {articulo.caracteristicas.map(([label, value]) => (
                            <div key={`${articulo.id}-${label}`} className="rounded-lg bg-slate-50 px-3 py-2">
                              <dt className="text-[10px] font-extrabold uppercase text-slate-500">{label}</dt>
                              <dd className="mt-0.5 text-sm font-semibold text-slate-900">{value}</dd>
                            </div>
                          ))}
                        </dl>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            )}
          </div>
        </section>
      </main>
      <AppFooter />
    </div>
  );
}
