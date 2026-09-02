/* eslint-disable no-unused-vars, no-empty */
import React, { useState, useMemo, useEffect, useId, useRef } from 'react';
import {CheckCircle2, ClipboardList, Edit, Eye, Plus, Printer, Share2, Trash2, X} from 'lucide-react';
import { generarTicketRegistroPDF } from './registroPdf.js';
import { actualizarEstadoSolicitudRegistro, desbloquearRegistro, eliminarRegistro, marcarTodosRegistrosRealizados } from '../../services/functionsClient.js';
import {ConfirmModal} from '../../components/ui/ConfirmModal.jsx';
import {etiquetaDocumento} from '../../utils/documentos.js';
import {registroMatchesSearch, registroMatchesStatus} from '../../utils/searchRecords.js';
import {indexClientesByDni, normalizeDni} from '../../utils/clientes.js';
import {Button, IconButton} from '../../components/ui/Button.jsx';
import {Dialog} from '../../components/ui/Dialog.jsx';
import {PageHeader, SearchField} from '../../components/ui/PageHeader.jsx';
import {SkeletonRows, StateView} from '../../components/ui/StateView.jsx';
import {StatusBadge} from '../../components/ui/StatusBadge.jsx';

const etiquetaTieneCaja = value => value === true || value === 'SI' ? 'SI' : 'NO';
const celularDeRegistro = (registro, cliente = {}) => registro?.celularCliente || cliente?.celular || '';
const estadoSolicitudDeRegistro = registro => registro?.estado === 'NO BLOQUEADO'
  ? (registro?.estadoSolicitud || 'PENDIENTE')
  : '';
const REGISTRO_FILTERS = [
  {id: 'TODOS', label: 'Todos', historyTerm: ''},
  {id: 'REGISTRADOS', label: 'Registrados', historyTerm: 'REALIZADO'},
  {id: 'PENDIENTES', label: 'Pendientes', historyTerm: 'PENDIENTE'},
  {id: 'BLOQUEADOS', label: 'Bloqueados', historyTerm: 'BLOQUEADO'},
];
const HISTORY_TERM_BY_FILTER = Object.fromEntries(REGISTRO_FILTERS.map(filter => [filter.id, filter.historyTerm]));

function DetailSection({title, children}) {
  return (
    <section className="ui-detail-section">
      <h4>{title}</h4>
      <dl className="ui-detail-grid">{children}</dl>
    </section>
  );
}

function DetailRow({label, children, mono = false}) {
  return (
    <div className="ui-detail-row">
      <dt>{label}</dt>
      <dd className={mono ? 'font-mono' : ''}>{children || '-'}</dd>
    </div>
  );
}

export function RegistrosList({ data, cargando, clientes, equipos, onNew, onEdit, showToast, onDeleted, onLoadMore, hasMore, loadingMore, total, onSearchAll, searchingAll = false }) {
  const detailTitleId = useId();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('TODOS');
  const [ticketData, setTicketData] = useState(null);
  const [viewingRegistro, setViewingRegistro] = useState(null);
  const [registroAEliminar, setRegistroAEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);
  const ultimaBusquedaHistorialRef = useRef('');
  const onSearchAllRef = useRef(onSearchAll);

  useEffect(() => {
    onSearchAllRef.current = onSearchAll;
  }, [onSearchAll]);

  const clientePorDni = useMemo(() => indexClientesByDni(clientes), [clientes]);
  const getCliente = (dni) => clientePorDni.get(normalizeDni(dni)) || {};
  const getEquipo = (imei) => equipos.find(equipo => equipo.idEquipo === imei) || {};
  const construirTextoRegistro = (registro, encabezado = 'REGISTRO') => {
    const cliente = getCliente(registro.dniCliente);
    const equipo = getEquipo(registro.imeiEquipo || registro.imeiRegistrado);
    const imei = registro.imeiEquipo || registro.imeiRegistrado || '';
    const imei2 = registro.imei2Equipo || equipo.imei2 || '';
    const imeiRegistrar = registro.imeiRegistrado || imei;
    const docLabel = registro.tipoDocumentoCliente || cliente.tipoDocumento || 'DNI';
    const celular = celularDeRegistro(registro, cliente);
    const nombre = registro.nombreCliente || cliente.nombre || '';
    const direccion = registro.direccionCliente || cliente.direccion || '';
    const correo = registro.correoCliente || cliente.correo || '';

    return `${encabezado}

IMEI: ${imei}
IMEI2: ${imei2}
TIENE CAJA: ${etiquetaTieneCaja(registro.tieneCaja)}
${docLabel}: ${registro.dniCliente || ''}
CELULAR: ${celular}
NOMBRE CLIENTE: ${nombre}
DIRECCION: ${direccion}
CORREO ELECTRONICO: ${correo}

IMEI A REGISTRAR: ${imeiRegistrar}`;
  };

  useEffect(() => {
    const term = searchTerm.trim() || HISTORY_TERM_BY_FILTER[statusFilter] || '';
    if (term.length < 3) {
      ultimaBusquedaHistorialRef.current = '';
      return undefined;
    }
    if (!onSearchAllRef.current || (total && data.length >= total) || ultimaBusquedaHistorialRef.current === term) return undefined;
    ultimaBusquedaHistorialRef.current = term;
    const timeoutId = window.setTimeout(() => onSearchAllRef.current?.(term), 900);
    return () => window.clearTimeout(timeoutId);
  }, [data.length, searchTerm, statusFilter, total]);

  const filteredData = useMemo(() => {
    return data.filter(r => {
      const cliente = clientePorDni.get(normalizeDni(r.dniCliente)) || {};
      return registroMatchesStatus(r, statusFilter)
        && registroMatchesSearch(r, searchTerm, cliente);
    });
  }, [data, clientePorDni, searchTerm, statusFilter]);

  const handleCopy = (item) => {
    const text = construirTextoRegistro(item);
    navigator.clipboard.writeText(text).then(() => showToast('Datos copiados')).catch(() => showToast('Error al copiar', 'error'));
  };

  const handleShare = async (row) => {
    const encabezado = String(row.estado || '').toUpperCase() === 'BLOQUEADO'
      ? 'DESBLOQUEO LISTA BLANCA'
      : 'REGISTRO';
    const texto = construirTextoRegistro(row, encabezado);

    // Intentar Web Share API con archivos PDF si están disponibles
    const tieneArchivos = row.pdfDniUrl || row.pdfCajaUrl || row.pdfReciboUrl;

    if (navigator.share && tieneArchivos) {
      try {
        // Descargar los PDFs como blobs y pasarlos a share
        const archivos = [];
        const fetchPdf = async (url, nombre) => {
          if (!url) return;
          try {
            const resp = await fetch(url);
            const blob = await resp.blob();
            archivos.push(new File([blob], nombre, { type: 'application/pdf' }));
          } catch (_) {}
        };
        await fetchPdf(row.pdfDniUrl,    `DOC_${row.dniCliente}.pdf`);
        await fetchPdf(row.pdfCajaUrl,   `CAJA_${row.dniCliente}.pdf`);
        await fetchPdf(row.pdfReciboUrl, `RECIBO_${row.dniCliente}.pdf`);

        if (navigator.canShare && navigator.canShare({ files: archivos })) {
          await navigator.share({ title: `Registro ${row.nRegistro}`, text: texto, files: archivos });
        } else {
          await navigator.share({ title: `Registro ${row.nRegistro}`, text: texto });
        }
        return;
      } catch (e) {
        if (e.name !== 'AbortError') showToast('Error al compartir', 'error');
        return;
      }
    }

    // Fallback: solo texto (+ links si los hay)
    if (navigator.share) {
      let shareText = texto;
      if (row.pdfDniUrl)    shareText += `

PDF Documento: ${row.pdfDniUrl}`;
      if (row.pdfCajaUrl)   shareText += `
PDF Caja: ${row.pdfCajaUrl}`;
      if (row.pdfReciboUrl) shareText += `
PDF Recibo: ${row.pdfReciboUrl}`;
      try {
        await navigator.share({ title: `Registro ${row.nRegistro}`, text: shareText });
      } catch (e) {
        if (e.name !== 'AbortError') showToast('Error al compartir', 'error');
      }
      return;
    }

    // Sin Web Share API: copiar al portapapeles
    let shareText = texto;
    if (row.pdfDniUrl)    shareText += `

PDF Documento: ${row.pdfDniUrl}`;
    if (row.pdfCajaUrl)   shareText += `
PDF Caja: ${row.pdfCajaUrl}`;
    if (row.pdfReciboUrl) shareText += `
PDF Recibo: ${row.pdfReciboUrl}`;
    navigator.clipboard.writeText(shareText)
      .then(() => showToast('Datos copiados para compartir'))
      .catch(() => showToast('Error al copiar', 'error'));
  };

  const handleDelete = async () => {
    if (!registroAEliminar) return;
    setEliminando(true);
    try {
      await eliminarRegistro(registroAEliminar.id);
      onDeleted?.(registroAEliminar.id);
      showToast('Registro eliminado correctamente');
      setRegistroAEliminar(null);
    } catch (e) {
      console.error(e);
      showToast('Error al eliminar', 'error');
    } finally {
      setEliminando(false);
    }
  };

  const [desbloqueando, setDesbloqueando] = useState(null);
  const [actualizandoSolicitud, setActualizandoSolicitud] = useState(null);
  const [confirmarTodosRealizados, setConfirmarTodosRealizados] = useState(false);
  const [marcandoTodos, setMarcandoTodos] = useState(false);

  const handleDesbloquear = async (row) => {
    setDesbloqueando(row.id);
    try {
      await desbloquearRegistro(row.id);
      showToast(`${row.nRegistro} desbloqueado y marcado como realizado`);
    } catch (e) {
      console.error(e);
      showToast('Error al desbloquear', 'error');
    } finally {
      setDesbloqueando(null);
    }
  };

  const handleMarcarRealizado = async (row) => {
    setActualizandoSolicitud(row.id);
    try {
      await actualizarEstadoSolicitudRegistro(row.id, 'REALIZADO');
      showToast(`${row.nRegistro} marcado como realizado`);
    } catch (e) {
      console.error(e);
      showToast('No se pudo actualizar el estado de solicitud', 'error');
    } finally {
      setActualizandoSolicitud(null);
    }
  };

  const handleMarcarTodosRealizados = async () => {
    setMarcandoTodos(true);
    try {
      const result = await marcarTodosRegistrosRealizados();
      const cantidad = Number(result?.updatedCount || 0);
      showToast(cantidad > 0
        ? `${cantidad} solicitud${cantidad === 1 ? '' : 'es'} marcada${cantidad === 1 ? '' : 's'} como realizada${cantidad === 1 ? '' : 's'}`
        : 'No habia solicitudes pendientes');
      setConfirmarTodosRealizados(false);
    } catch (e) {
      console.error(e);
      showToast('No se pudieron actualizar todas las solicitudes', 'error');
    } finally {
      setMarcandoTodos(false);
    }
  };

  return (
    <div className="ui-page-surface relative">
      {ticketData && null}
      <ConfirmModal
        open={Boolean(registroAEliminar)}
        title="Eliminar registro"
        message="Se eliminara el registro seleccionado. Si era el unico movimiento del cliente, tambien se limpiaran sus datos asociados."
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        tone="danger"
        loading={eliminando}
        onConfirm={handleDelete}
        onCancel={() => setRegistroAEliminar(null)}
      />
      <ConfirmModal
        open={confirmarTodosRealizados}
        title="Marcar todas como realizadas"
        message="Se actualizaran todas las solicitudes pendientes de equipos no bloqueados, incluso las que no estan visibles en esta pagina. Esta accion no afecta a los equipos bloqueados."
        confirmLabel="Marcar todas"
        cancelLabel="Cancelar"
        loading={marcandoTodos}
        onConfirm={handleMarcarTodosRealizados}
        onCancel={() => setConfirmarTodosRealizados(false)}
      />
      <Dialog
        open={Boolean(viewingRegistro)}
        onClose={() => setViewingRegistro(null)}
        titleId={detailTitleId}
        className="ui-dialog w-full max-w-5xl p-0"
      >
        {viewingRegistro && (
          <>
            <div className="ui-dialog-header">
              <div>
                <p className="ui-eyebrow">Registro</p>
                <h3 id={detailTitleId}>{viewingRegistro.nRegistro || 'Detalle de registro'}</h3>
                <p>{viewingRegistro.fecha ? new Date(viewingRegistro.fecha).toLocaleString('es-PE') : '-'}</p>
              </div>
              <IconButton label="Cerrar detalle" onClick={() => setViewingRegistro(null)}><X size={19}/></IconButton>
            </div>
            <div className="ui-detail-layout">
              <aside className="ui-detail-actions">
                <Button className="w-full justify-start" onClick={() => { const cl = getCliente(viewingRegistro.dniCliente); generarTicketRegistroPDF({...viewingRegistro, nombreCliente: cl.nombre || viewingRegistro.nombreCliente || viewingRegistro.dniCliente, correoCliente: cl.correo || '', celularCliente: viewingRegistro.celularCliente || cl.celular || '', celularRef: viewingRegistro.celularRef || cl.celularRef || '', direccionCliente: cl.direccion || ''}); }}><Printer size={16}/> Ticket</Button>
                <Button className="w-full justify-start" onClick={() => { onEdit(viewingRegistro); setViewingRegistro(null); }}><Edit size={16}/> Editar</Button>
                <Button className="w-full justify-start" onClick={() => handleShare(viewingRegistro)}><Share2 size={16}/> Compartir</Button>
                <Button variant="ghost" className="w-full justify-start text-[var(--ui-danger)]" onClick={() => { setRegistroAEliminar(viewingRegistro); setViewingRegistro(null); }}><Trash2 size={16}/> Eliminar</Button>
                <div className="ui-detail-summary">
                  <p>Estado del equipo</p>
                  <StatusBadge tone={viewingRegistro.estado === 'BLOQUEADO' ? 'danger' : 'success'}>{viewingRegistro.estado || 'Sin estado'}</StatusBadge>
                  <span>{viewingRegistro.operador || 'Sin operador'}</span>
                  {estadoSolicitudDeRegistro(viewingRegistro) && <StatusBadge tone={estadoSolicitudDeRegistro(viewingRegistro) === 'REALIZADO' ? 'success' : 'warning'}>{estadoSolicitudDeRegistro(viewingRegistro)}</StatusBadge>}
                </div>
              </aside>
              <div className="ui-detail-content">
                <DetailSection title="Equipo">
                  <DetailRow label="IMEI" mono>{viewingRegistro.imeiEquipo || viewingRegistro.imeiRegistrado}</DetailRow>
                  <DetailRow label="IMEI 2" mono>{viewingRegistro.imei2Equipo || getEquipo(viewingRegistro.imeiEquipo).imei2}</DetailRow>
                  <DetailRow label="IMEI a registrar" mono>{viewingRegistro.imeiRegistrado || viewingRegistro.imeiEquipo}</DetailRow>
                  <DetailRow label="Marca">{viewingRegistro.marcaEquipo}</DetailRow>
                  <DetailRow label="Modelo">{viewingRegistro.modeloEquipo}</DetailRow>
                  <DetailRow label="Nombre comercial">{viewingRegistro.nombreComercialEquipo}</DetailRow>
                  <DetailRow label="Tiene caja">{etiquetaTieneCaja(viewingRegistro.tieneCaja)}</DetailRow>
                  <DetailRow label="Estado"><StatusBadge tone={viewingRegistro.estado === 'BLOQUEADO' ? 'danger' : 'success'}>{viewingRegistro.estado || '-'}</StatusBadge></DetailRow>
                  {estadoSolicitudDeRegistro(viewingRegistro) && <DetailRow label="Solicitud"><StatusBadge tone={estadoSolicitudDeRegistro(viewingRegistro) === 'REALIZADO' ? 'success' : 'warning'}>{estadoSolicitudDeRegistro(viewingRegistro)}</StatusBadge></DetailRow>}
                  <DetailRow label="Operador">{viewingRegistro.operador}</DetailRow>
                  <DetailRow label="Tipo">{viewingRegistro.tipo}</DetailRow>
                  <DetailRow label="Precio">S/. {parseFloat(viewingRegistro.precio || 0).toFixed(2)}</DetailRow>
                </DetailSection>
                <DetailSection title="Cliente">
                  <DetailRow label="Nombre">{getCliente(viewingRegistro.dniCliente).nombre || viewingRegistro.nombreCliente}</DetailRow>
                  <DetailRow label={etiquetaDocumento(viewingRegistro.tipoDocumentoCliente || getCliente(viewingRegistro.dniCliente).tipoDocumento)} mono>{viewingRegistro.dniCliente}</DetailRow>
                  <DetailRow label="Celular usado">{viewingRegistro.celularCliente || getCliente(viewingRegistro.dniCliente).celular}</DetailRow>
                  <DetailRow label="N.° de referencia">{viewingRegistro.celularRef}</DetailRow>
                  <DetailRow label="Correo">{getCliente(viewingRegistro.dniCliente).correo}</DetailRow>
                  <DetailRow label="Dirección">{getCliente(viewingRegistro.dniCliente).direccion}</DetailRow>
                </DetailSection>
              </div>
            </div>
          </>
        )}
      </Dialog>
      <PageHeader
        eyebrow="Registros"
        title="Registros de equipos"
        icon={ClipboardList}
        description={<>{filteredData.length} visible{filteredData.length !== 1 ? 's' : ''} de {total || data.length} registro{(total || data.length) !== 1 ? 's' : ''}{searchingAll && <span className="ml-2">Buscando historial completo...</span>}</>}
        actions={<>
          <SearchField placeholder="IMEI, cliente o documento" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
          <Button onClick={() => setConfirmarTodosRealizados(true)} disabled={cargando || marcandoTodos}><CheckCircle2 size={17}/> Marcar realizados</Button>
          <Button variant="primary" onClick={onNew}><Plus size={17}/> Nuevo registro</Button>
        </>}
      />

      <div className="ui-toolbar" aria-label="Filtrar registros por estado del IMEI">
        <span className="text-xs font-semibold text-[var(--ui-text-secondary)]">Estado del IMEI</span>
        <div className="ui-segmented-control">
          {REGISTRO_FILTERS.map(filter => (
            <button key={filter.id} type="button" aria-pressed={statusFilter === filter.id} onClick={() => setStatusFilter(filter.id)}>
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── MÓVIL: tarjetas ── */}
      <div className="ui-mobile-list md:hidden">
        {cargando ? (
          <SkeletonRows rows={4} columns={1} label="Cargando registros" />
        ) : filteredData.length === 0 ? (
          <StateView icon={ClipboardList} title={searchingAll ? 'Buscando en historial completo' : 'No se encontraron registros'} description="Prueba con otro documento, cliente o IMEI." />
        ) : filteredData.map(row => (
          <article key={row.id} className="ui-mobile-row">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--ui-text)]">{getCliente(row.dniCliente).nombre || row.nombreCliente || row.dniCliente}</p>
                <p className="text-xs text-[var(--ui-text-tertiary)]">{row.nRegistro} · {new Date(row.fecha).toLocaleDateString()}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <StatusBadge tone={row.estado === 'BLOQUEADO' ? 'danger' : 'success'}>{row.estado}</StatusBadge>
                {estadoSolicitudDeRegistro(row) && (
                  <>
                    <StatusBadge tone={estadoSolicitudDeRegistro(row) === 'REALIZADO' ? 'success' : 'warning'}>{estadoSolicitudDeRegistro(row)}</StatusBadge>
                    {estadoSolicitudDeRegistro(row) === 'PENDIENTE' && (
                      <Button size="sm"
                        onClick={() => handleMarcarRealizado(row)}
                        loading={actualizandoSolicitud === row.id}
                        loadingLabel="Guardando"
                      >
                        <CheckCircle2 size={14}/> Marcar realizado
                      </Button>
                    )}
                  </>
                )}
                {row.estado === 'BLOQUEADO' && (
                  <Button size="sm" variant="danger"
                    onClick={() => handleDesbloquear(row)}
                    loading={desbloqueando === row.id}
                    loadingLabel="Desbloqueando"
                  >
                    Desbloquear
                  </Button>
                )}
              </div>
            </div>
            <p className="mb-1 text-xs text-[var(--ui-text-secondary)]">{row.marcaEquipo} {row.nombreComercialEquipo || row.modeloEquipo}</p>
            <p className="mb-1 font-mono text-xs text-[var(--ui-accent)]">IMEI registrado: {row.imeiRegistrado || row.imeiEquipo}</p>
            <p className="mb-3 text-xs text-[var(--ui-text-tertiary)]">{row.operador} · {row.tipo}</p>
            <div className="flex gap-2">
              <IconButton className="flex-1" label="Ver registro" onClick={() => setViewingRegistro(row)}><Eye size={17}/></IconButton>
              <IconButton className="flex-1" label="Editar registro" onClick={() => onEdit(row)}><Edit size={17}/></IconButton>
              <IconButton className="flex-1" label="Generar ticket" onClick={() => { const cl = getCliente(row.dniCliente); generarTicketRegistroPDF({...row, nombreCliente: cl.nombre || row.nombreCliente || row.dniCliente, correoCliente: cl.correo || '', celularCliente: row.celularCliente || cl.celular || '', celularRef: row.celularRef || cl.celularRef || '', direccionCliente: cl.direccion || ''}); }}><Printer size={17}/></IconButton>
              <IconButton className="flex-1" label="Compartir registro" onClick={() => handleShare(row)}><Share2 size={17}/></IconButton>
              <IconButton className="flex-1" tone="danger" label="Eliminar registro" onClick={() => setRegistroAEliminar(row)}><Trash2 size={17}/></IconButton>
            </div>
          </article>
        ))}
      </div>

      {/* ── DESKTOP: tabla ── */}
      <div className="hidden overflow-x-auto md:block">
        <table className="ui-data-table">
          <thead>
            <tr><th>Fecha / ID</th><th>Cliente</th><th>Equipo (IMEI)</th><th>Estado / Solicitud</th><th className="text-right">Acciones</th></tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr><td colSpan="5" className="p-0"><SkeletonRows rows={5} columns={5} label="Cargando registros" /></td></tr>
            ) : filteredData.length === 0 ? (<tr><td colSpan="5" className="p-0"><StateView icon={ClipboardList} title={searchingAll ? 'Buscando en historial completo' : 'No se encontraron registros'} description="Prueba con otro documento, cliente o IMEI." /></td></tr>) : (
              filteredData.map(row => (
                <tr key={row.id}>
                  <td><div className="font-medium text-[var(--ui-text)]">{new Date(row.fecha).toLocaleDateString()}</div><div className="text-xs text-[var(--ui-text-tertiary)]">{row.nRegistro}</div></td>
                  <td><div className="font-medium text-[var(--ui-text)]">{getCliente(row.dniCliente).nombre || row.nombreCliente || row.dniCliente}</div><div className="text-xs text-[var(--ui-text-tertiary)]">{row.dniCliente}</div></td>
                  <td><div className="text-[var(--ui-text)]">{row.nombreComercialEquipo || row.modeloEquipo || '-'}</div><div className="font-mono text-xs text-[var(--ui-accent)]">{row.imeiRegistrado || row.imeiEquipo}</div></td>
                  <td>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={row.estado === 'BLOQUEADO' ? 'danger' : 'success'}>{row.estado}</StatusBadge>
                      {estadoSolicitudDeRegistro(row) && (
                        <>
                          <StatusBadge tone={estadoSolicitudDeRegistro(row) === 'REALIZADO' ? 'success' : 'warning'}>{estadoSolicitudDeRegistro(row)}</StatusBadge>
                          {estadoSolicitudDeRegistro(row) === 'PENDIENTE' && (
                            <Button size="sm"
                              onClick={() => handleMarcarRealizado(row)}
                              loading={actualizandoSolicitud === row.id}
                              loadingLabel="Guardando"
                            >
                              <CheckCircle2 size={14}/> Marcar realizado
                            </Button>
                          )}
                        </>
                      )}
                      {row.estado === 'BLOQUEADO' && (
                        <Button size="sm" variant="danger"
                          onClick={() => handleDesbloquear(row)}
                          loading={desbloqueando === row.id}
                          loadingLabel="Desbloqueando"
                        >
                          Desbloquear
                        </Button>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-[var(--ui-text-tertiary)]">{row.operador}</div>
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-0.5">
                      <IconButton size="sm" label="Ver detalle" onClick={() => setViewingRegistro(row)}><Eye size={17} /></IconButton>
                      <IconButton size="sm" label="Editar" onClick={() => onEdit(row)}><Edit size={17} /></IconButton>
                      <IconButton size="sm" label="Descargar ticket PDF" onClick={() => { const cl = getCliente(row.dniCliente); generarTicketRegistroPDF({...row, nombreCliente: cl.nombre || row.nombreCliente || row.dniCliente, correoCliente: cl.correo || '', celularCliente: row.celularCliente || cl.celular || '', celularRef: row.celularRef || cl.celularRef || '', direccionCliente: cl.direccion || ''}); }}><Printer size={17} /></IconButton>
                      <IconButton size="sm" label="Compartir registro" onClick={() => handleShare(row)}><Share2 size={17} /></IconButton>
                      <IconButton size="sm" tone="danger" label="Eliminar" onClick={() => setRegistroAEliminar(row)}><Trash2 size={17} /></IconButton>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {hasMore && !searchTerm && (
        <div className="flex justify-center border-t border-[var(--ui-border)] p-4">
          <Button onClick={onLoadMore} loading={loadingMore} loadingLabel="Cargando registros">Cargar más registros</Button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ESCÁNER IA — panel flotante esquina inferior derecha, no bloquea el formulario
// ============================================================================
