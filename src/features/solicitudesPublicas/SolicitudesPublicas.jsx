import React, {useEffect, useMemo, useState} from 'react';
import {CheckCircle2, ClipboardCopy, FileCheck2, Link2, RefreshCw, Send, ShieldCheck, Trash2} from 'lucide-react';
import {Button, IconButton} from '../../components/ui/Button.jsx';
import {PageHeader} from '../../components/ui/PageHeader.jsx';
import {StatusBadge} from '../../components/ui/StatusBadge.jsx';
import {
  generarSolicitudPublicaLink,
  eliminarSolicitudPublica,
  listarSolicitudesPublicas,
  obtenerMensajeErrorFuncion,
} from '../../services/functionsClient.js';
import {publicSolicitudToRegistroDraft} from './publicSolicitudRegistroDraft.js';

const INITIAL_OPERACION = {
  tramite: 'REGISTRO',
  tipo: 'TIENDA',
  operador: 'BITEL',
  precio: '0',
  imeiRegistrado: '',
};

const statusTone = {
  CREADA: 'neutral',
  COMPLETADA: 'warning',
  TERMINADA: 'success',
};

function onlyDigits(value, max) {
  return String(value || '').replace(/\D/g, '').slice(0, max);
}

function money(value) {
  return String(value || '').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1').slice(0, 20);
}

function Detail({label, value}) {
  return (
    <span className="public-ops-detail">
      <small>{label}</small>
      <strong>{value || '-'}</strong>
    </span>
  );
}

export function SolicitudesPublicas({showToast, onReviewRegistro}) {
  const [dni, setDni] = useState('');
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [operaciones, setOperaciones] = useState({});

  const pendientes = useMemo(
    () => solicitudes.filter(item => item.status === 'COMPLETADA').length,
    [solicitudes],
  );

  const load = async () => {
    setLoading(true);
    try {
      const data = await listarSolicitudesPublicas();
      setSolicitudes(Array.isArray(data.solicitudes) ? data.solicitudes : []);
    } catch (error) {
      showToast(obtenerMensajeErrorFuncion(error, 'No se pudieron cargar las solicitudes'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const crearLink = async event => {
    event.preventDefault();
    if (!/^\d{8}$/.test(dni)) {
      showToast('Ingresa un DNI valido de 8 digitos', 'error');
      return;
    }
    setCreating(true);
    try {
      const data = await generarSolicitudPublicaLink(dni);
      await navigator.clipboard?.writeText?.(data.publicUrl);
      showToast('Link generado y copiado', 'success');
      setDni('');
      await load();
    } catch (error) {
      showToast(obtenerMensajeErrorFuncion(error, 'No se pudo generar el link'), 'error');
    } finally {
      setCreating(false);
    }
  };

  const operacionFor = solicitud => ({
    ...INITIAL_OPERACION,
    imeiRegistrado: solicitud.submission?.imeiRegistrado || solicitud.submission?.imei1 || '',
    ...(operaciones[solicitud.id] || {}),
  });

  const updateOperacion = (id, field, value) => {
    setOperaciones(current => ({
      ...current,
      [id]: {
        ...(current[id] || {}),
        [field]: field === 'precio' ? money(value) : value,
      },
    }));
  };

  const completar = async solicitud => {
    const operacion = operacionFor(solicitud);
    onReviewRegistro?.(publicSolicitudToRegistroDraft(solicitud, operacion));
  };

  const copyLink = async url => {
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copiado', 'success');
    } catch {
      showToast('No se pudo copiar el link', 'error');
    }
  };

  const eliminarLink = async solicitud => {
    const consequence = solicitud.status === 'TERMINADA'
      ? ' Tambien se eliminara el registro asociado si todavia existe.'
      : ' El cliente ya no podra usarlo.';
    const ok = window.confirm(`Eliminar el link de ${solicitud.nombreCliente || `DNI ${solicitud.dni}`}?${consequence}`);
    if (!ok) return;
    setDeletingId(solicitud.id);
    try {
      const data = await eliminarSolicitudPublica(solicitud.id);
      showToast(data.deletedRegistroId ? 'Link y registro asociado eliminados' : 'Link eliminado', 'success');
      await load();
    } catch (error) {
      showToast(obtenerMensajeErrorFuncion(error, 'No se pudo eliminar el link'), 'error');
    } finally {
      setDeletingId('');
    }
  };

  return (
    <section className="public-ops-page">
      <PageHeader
        eyebrow="Portal público"
        title="Solicitudes públicas"
        description="Genera links de un solo uso y termina los registros cuando el cliente envie sus datos."
        icon={Link2}
        meta={pendientes ? `${pendientes} pendientes` : 'Sin pendientes'}
        actions={<Button onClick={load} variant="secondary" size="sm" loading={loading} loadingLabel="Cargando..."><RefreshCw size={15} /> Actualizar</Button>}
      />

      <form className="public-ops-generator" onSubmit={crearLink}>
        <label>
          <span>DNI del cliente</span>
          <input value={dni} onChange={event => setDni(onlyDigits(event.target.value, 8))} inputMode="numeric" placeholder="Ingresa 8 digitos" />
        </label>
        <Button type="submit" loading={creating} loadingLabel="Generando...">
          <Send size={16} /> Generar link
        </Button>
      </form>

      <div className="public-ops-list">
        {loading && <p className="public-ops-empty">Cargando solicitudes...</p>}
        {!loading && solicitudes.length === 0 && (
          <p className="public-ops-empty">Todavia no hay links generados.</p>
        )}
        {!loading && solicitudes.map(solicitud => {
          const data = solicitud.submission || {};
          const operacion = operacionFor(solicitud);
          const isReady = solicitud.status === 'COMPLETADA';
          const isDone = solicitud.status === 'TERMINADA';
          return (
            <article className="public-ops-card" key={solicitud.id}>
              <header className="public-ops-card__header">
                <div>
                  <h2>{solicitud.nombreCliente || data.nombres || `DNI ${solicitud.dni}`}</h2>
                  <p>{solicitud.dni} · {solicitud.createdAt ? new Date(solicitud.createdAt).toLocaleDateString('es-PE') : '-'}</p>
                </div>
                <StatusBadge tone={statusTone[solicitud.status] || 'neutral'}>
                  {solicitud.status}
                </StatusBadge>
              </header>

              <div className="public-ops-link">
                <span>{solicitud.publicUrl}</span>
                <div className="public-ops-link__actions">
                  <IconButton label="Copiar link" size="sm" onClick={() => copyLink(solicitud.publicUrl)}><ClipboardCopy size={15} /></IconButton>
                  <IconButton
                    label={isDone ? 'Eliminar link y registro asociado' : 'Eliminar link'}
                    tone="danger"
                    size="sm"
                    disabled={deletingId === solicitud.id}
                    onClick={() => eliminarLink(solicitud)}
                  >
                    {deletingId === solicitud.id ? <span className="ui-button__spinner" aria-hidden="true" /> : <Trash2 size={15} />}
                  </IconButton>
                </div>
              </div>

              {data && (
                <div className="public-ops-details">
                  <Detail label="Equipo" value={`${data.marca || ''} ${data.nombreEquipo || ''}`} />
                  <Detail label="Modelo" value={data.modelo} />
                  <Detail label="IMEI 1" value={data.imei1} />
                  <Detail label="IMEI 2" value={data.imei2} />
                  <Detail label="IMEI elegido" value={data.imeiRegistrado} />
                  <Detail label="Celular" value={data.celular} />
                  <Detail label="Provincia" value={data.provincia} />
                  <Detail label="Color" value={data.color} />
                  <Detail label="Compra" value={data.precioCompra ? `S/. ${data.precioCompra}` : ''} />
                </div>
              )}

              {isReady && (
                <div className="public-ops-complete">
                  <label>
                    <span>Trámite</span>
                    <select value={operacion.tramite} onChange={event => updateOperacion(solicitud.id, 'tramite', event.target.value)}>
                      <option value="REGISTRO">REGISTRO</option>
                      <option value="DESBLOQUEO">DESBLOQUEO</option>
                    </select>
                  </label>
                  <label>
                    <span>Origen</span>
                    <select value={operacion.tipo} onChange={event => updateOperacion(solicitud.id, 'tipo', event.target.value)}>
                      <option value="TIENDA">TIENDA</option>
                      <option value="EXTERNO">EXTERNO</option>
                      <option value="PASE">PASE</option>
                    </select>
                  </label>
                  <label>
                    <span>Operador</span>
                    <select value={operacion.operador} onChange={event => updateOperacion(solicitud.id, 'operador', event.target.value)}>
                      <option value="BITEL">BITEL</option>
                      <option value="CLARO">CLARO</option>
                      <option value="MOVISTAR">MOVISTAR</option>
                      <option value="ENTEL">ENTEL</option>
                    </select>
                  </label>
                  <label>
                    <span>IMEI a registrar</span>
                    <select value={operacion.imeiRegistrado} onChange={event => updateOperacion(solicitud.id, 'imeiRegistrado', event.target.value)}>
                      <option value={data.imei1}>{data.imei1}</option>
                      {data.imei2 && <option value={data.imei2}>{data.imei2}</option>}
                    </select>
                  </label>
                  <label>
                    <span>Precio registro</span>
                    <input value={operacion.precio} onChange={event => updateOperacion(solicitud.id, 'precio', event.target.value)} inputMode="decimal" />
                  </label>
                  <Button onClick={() => completar(solicitud)}>
                    <FileCheck2 size={16} /> Revisar y adjuntar evidencias
                  </Button>
                </div>
              )}

              {isDone && (
                <p className="public-ops-done">
                  <CheckCircle2 size={16} aria-hidden="true" />
                  Registro creado: {solicitud.completedNRegistro || solicitud.completedRegistroId}
                </p>
              )}

              {!isReady && !isDone && (
                <p className="public-ops-waiting"><ShieldCheck size={15} aria-hidden="true" /> Esperando datos del cliente.</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
