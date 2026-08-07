/* eslint-disable no-unused-vars, no-empty */
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Menu, X, Home, ShoppingCart, ClipboardList, Plus, Search, Edit, Trash2, Printer, Copy, Eye, CheckCircle2, AlertCircle, Users, ScanBarcode, UploadCloud, ChevronDown, ChevronUp, LogOut, FileText, Share2, Settings, ImagePlus } from 'lucide-react';
import { generarTicketRegistroPDF } from './registroPdf.js';
import { actualizarEstadoSolicitudRegistro, desbloquearRegistro, eliminarRegistro, marcarTodosRegistrosRealizados } from '../../services/functionsClient.js';
import {ConfirmModal} from '../../components/ui/ConfirmModal.jsx';
import {etiquetaDocumento} from '../../utils/documentos.js';
import {registroMatchesSearch, registroMatchesStatus} from '../../utils/searchRecords.js';

const etiquetaTieneCaja = value => value === true || value === 'SI' ? 'SI' : 'NO';
const celularDeRegistro = (registro, cliente = {}) => registro?.celularCliente || cliente?.celular || '';
const estadoSolicitudDeRegistro = registro => registro?.estado === 'NO BLOQUEADO'
  ? (registro?.estadoSolicitud || 'PENDIENTE')
  : '';
const REGISTRO_FILTERS = [
  {id: 'TODOS', label: 'Todos', historyTerm: '', activeClass: 'border-blue-300 bg-blue-50 text-blue-700'},
  {id: 'REGISTRADOS', label: 'Registrados', historyTerm: 'REALIZADO', activeClass: 'border-emerald-300 bg-emerald-50 text-emerald-700'},
  {id: 'PENDIENTES', label: 'Pendientes', historyTerm: 'PENDIENTE', activeClass: 'border-amber-300 bg-amber-50 text-amber-700'},
  {id: 'BLOQUEADOS', label: 'Bloqueados', historyTerm: 'BLOQUEADO', activeClass: 'border-red-300 bg-red-50 text-red-700'},
];
const HISTORY_TERM_BY_FILTER = Object.fromEntries(REGISTRO_FILTERS.map(filter => [filter.id, filter.historyTerm]));

export function RegistrosList({ data, cargando, clientes, equipos, onNew, onEdit, showToast, onDeleted, onLoadMore, hasMore, loadingMore, total, onSearchAll, searchingAll = false }) {
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

  const getCliente = (dni) => clientes.find(c => c.dni === dni) || {};
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
    if (term.length < 3 || !onSearchAllRef.current || (total && data.length >= total) || ultimaBusquedaHistorialRef.current === term) return undefined;
    ultimaBusquedaHistorialRef.current = term;
    const timeoutId = window.setTimeout(() => onSearchAllRef.current?.(term), 900);
    return () => window.clearTimeout(timeoutId);
  }, [data.length, searchTerm, statusFilter, total]);

  const filteredData = useMemo(() => {
    return data.filter(r => {
      const cliente = clientes.find(c => c.dni === r.dniCliente) || {};
      return registroMatchesStatus(r, statusFilter)
        && registroMatchesSearch(r, searchTerm, cliente);
    });
  }, [data, clientes, searchTerm, statusFilter]);

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
    <div className="saas-list-shell relative">
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
      {viewingRegistro && (
        <div className="saas-modal-backdrop fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="saas-detail-modal max-h-[88vh] w-full max-w-4xl overflow-y-auto p-0">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-5 py-4">
              <div>
                <p className="saas-page-kicker">Registro</p>
                <h3 className="text-lg font-semibold text-slate-900">{viewingRegistro.nRegistro || 'Detalle de registro'}</h3>
                <p className="mt-1 text-sm text-slate-500">{viewingRegistro.fecha ? new Date(viewingRegistro.fecha).toLocaleString('es-PE') : '-'}</p>
              </div>
              <button onClick={() => setViewingRegistro(null)} className="saas-form-close"><X size={20}/></button>
            </div>
            <div className="grid gap-5 p-5 lg:grid-cols-[220px_1fr]">
              <aside className="space-y-2">
                <button type="button" onClick={() => { const cl = getCliente(viewingRegistro.dniCliente); generarTicketRegistroPDF({...viewingRegistro, nombreCliente: cl.nombre || viewingRegistro.dniCliente, correoCliente: cl.correo || '', celularCliente: viewingRegistro.celularCliente || cl.celular || '', celularRef: viewingRegistro.celularRef || cl.celularRef || '', direccionCliente: cl.direccion || ''}); }} className="saas-secondary w-full justify-start"><Printer size={16}/> Ticket</button>
                <button type="button" onClick={() => { onEdit(viewingRegistro); setViewingRegistro(null); }} className="saas-secondary w-full justify-start"><Edit size={16}/> Editar</button>
                <button type="button" onClick={() => { handleShare(viewingRegistro); }} className="saas-secondary w-full justify-start"><Share2 size={16}/> Compartir</button>
                <button type="button" onClick={() => { setRegistroAEliminar(viewingRegistro); setViewingRegistro(null); }} className="saas-secondary w-full justify-start text-red-600"><Trash2 size={16}/> Eliminar</button>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase text-slate-400">Estado del equipo</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{viewingRegistro.estado || '-'}</p>
                  <p className="text-xs text-slate-500">{viewingRegistro.operador || '-'}</p>
                  {estadoSolicitudDeRegistro(viewingRegistro) && (
                    <div className="mt-3 border-t border-slate-200 pt-3">
                      <p className="text-xs font-semibold uppercase text-slate-400">Solicitud</p>
                      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${estadoSolicitudDeRegistro(viewingRegistro) === 'REALIZADO' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {estadoSolicitudDeRegistro(viewingRegistro)}
                      </span>
                    </div>
                  )}
                </div>
              </aside>
              <div className="space-y-4 text-sm">
              {/* Equipo */}
              <div>
                <p className="text-xs font-semibold text-blue-600 uppercase mb-2 border-b pb-1">Equipo</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 bg-gray-50 p-3 rounded border border-gray-100">
                  <p><strong className="text-gray-700">IMEI:</strong></p>
                  <p className="font-mono text-gray-600">{viewingRegistro.imeiEquipo || viewingRegistro.imeiRegistrado || '-'}</p>
                  <p><strong className="text-gray-700">IMEI2:</strong></p>
                  <p className="font-mono text-gray-600">{viewingRegistro.imei2Equipo || getEquipo(viewingRegistro.imeiEquipo).imei2 || '-'}</p>
                  <p><strong className="text-gray-700">IMEI a registrar:</strong></p>
                  <p className="font-mono text-gray-600">{viewingRegistro.imeiRegistrado || viewingRegistro.imeiEquipo || '-'}</p>
                  <p><strong className="text-gray-700">Marca:</strong></p>
                  <p className="text-gray-600">{viewingRegistro.marcaEquipo || '-'}</p>
                  <p><strong className="text-gray-700">Modelo:</strong></p>
                  <p className="text-gray-600">{viewingRegistro.modeloEquipo || '-'}</p>
                  <p><strong className="text-gray-700">Nombre comercial:</strong></p>
                  <p className="text-gray-600">{viewingRegistro.nombreComercialEquipo || '-'}</p>
                  <p><strong className="text-gray-700">Tiene caja:</strong></p>
                  <p className="text-gray-600">{etiquetaTieneCaja(viewingRegistro.tieneCaja)}</p>
                  <p><strong className="text-gray-700">Estado del equipo:</strong></p>
                  <p><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${viewingRegistro.estado === 'BLOQUEADO' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{viewingRegistro.estado || '-'}</span></p>
                  {estadoSolicitudDeRegistro(viewingRegistro) && (<>
                    <p><strong className="text-gray-700">Estado de solicitud:</strong></p>
                    <p className={estadoSolicitudDeRegistro(viewingRegistro) === 'REALIZADO' ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-700'}>{estadoSolicitudDeRegistro(viewingRegistro)}</p>
                  </>)}
                  <p><strong className="text-gray-700">Operador:</strong></p>
                  <p className="text-gray-600">{viewingRegistro.operador || '-'}</p>
                  <p><strong className="text-gray-700">Tipo:</strong></p>
                  <p className="text-gray-600">{viewingRegistro.tipo || '-'}</p>
                  <p><strong className="text-gray-700">Precio:</strong></p>
                  <p className="text-green-700 font-bold">S/. {parseFloat(viewingRegistro.precio || 0).toFixed(2)}</p>
                  <p><strong className="text-gray-700">Fecha:</strong></p>
                  <p className="text-gray-600">{viewingRegistro.fecha ? new Date(viewingRegistro.fecha).toLocaleString('es-PE') : '-'}</p>
                  <p><strong className="text-gray-700">N° Registro:</strong></p>
                  <p className="text-gray-600">{viewingRegistro.nRegistro || '-'}</p>
                </div>
              </div>
              {/* Cliente */}
              <div>
                <p className="text-xs font-semibold text-blue-600 uppercase mb-2 border-b pb-1">Cliente</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 bg-gray-50 p-3 rounded border border-gray-100">
                  <p><strong className="text-gray-700">Nombre:</strong></p>
                  <p className="text-gray-600">{getCliente(viewingRegistro.dniCliente).nombre || '-'}</p>
                  <p><strong className="text-gray-700">{etiquetaDocumento(viewingRegistro.tipoDocumentoCliente || getCliente(viewingRegistro.dniCliente).tipoDocumento)}:</strong></p>
                  <p className="text-gray-600">{viewingRegistro.dniCliente}</p>
                  <p><strong className="text-gray-700">Celular usado:</strong></p>
                  <p className="text-gray-600">{viewingRegistro.celularCliente || getCliente(viewingRegistro.dniCliente).celular || '-'}</p>
                  <p><strong className="text-gray-700">N° Referencia:</strong></p>
                  <p className="text-gray-600">{viewingRegistro.celularRef || '-'}</p>
                  <p><strong className="text-gray-700">Correo:</strong></p>
                  <p className="text-gray-600">{getCliente(viewingRegistro.dniCliente).correo || '-'}</p>
                  <p><strong className="text-gray-700">Dirección:</strong></p>
                  <p className="text-gray-600">{getCliente(viewingRegistro.dniCliente).direccion || '-'}</p>
                </div>
              </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="saas-list-toolbar">
        <div>
          <p className="saas-page-kicker">Registros</p>
          <h2 className="saas-page-title">Registros de equipos</h2>
          <p className="saas-page-desc">
            {filteredData.length} visible{filteredData.length !== 1 ? 's' : ''} de {total || data.length} registro{(total || data.length) !== 1 ? 's' : ''}
            {searchingAll && <span className="ml-2 text-slate-400">Buscando historial...</span>}
          </p>
        </div>
        <div className="saas-toolbar-actions">
          <div className="saas-searchbox">
            <input type="text" placeholder="Buscar por IMEI, cliente o documento" className="saas-search-input" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            <Search size={18} />
          </div>
          <button
            type="button"
            onClick={() => setConfirmarTodosRealizados(true)}
            disabled={cargando || marcandoTodos}
            className="saas-secondary disabled:cursor-wait disabled:opacity-60"
          >
            <CheckCircle2 size={18}/> Marcar todos realizados
          </button>
          <button onClick={onNew} className="saas-primary"><Plus size={18} /> Nuevo Registro</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/70 px-5 py-3" aria-label="Filtrar registros por estado del IMEI">
        <span className="mr-1 text-xs font-semibold text-slate-500">Estado del IMEI:</span>
        {REGISTRO_FILTERS.map(filter => {
          const active = statusFilter === filter.id;
          return (
            <button
              key={filter.id}
              type="button"
              aria-pressed={active}
              onClick={() => setStatusFilter(filter.id)}
              className={`min-h-9 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${active ? filter.activeClass : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'}`}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      {/* ── MÓVIL: tarjetas ── */}
      <div className="md:hidden saas-mobile-list">
        {cargando ? (
          <div className="py-12 flex flex-col items-center gap-3 text-gray-400">
            <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
            <span className="text-sm">Cargando registros...</span>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="saas-empty px-4 py-8">
            <p className="text-sm font-semibold">{searchingAll ? 'Buscando en historial completo...' : 'No se encontraron registros'}</p>
            <p className="text-xs">Prueba con otro documento, cliente o IMEI.</p>
          </div>
        ) : filteredData.map(row => (
          <div key={row.id} className="saas-mobile-row">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-semibold text-gray-800 text-sm">{getCliente(row.dniCliente).nombre || row.dniCliente}</p>
                <p className="text-xs text-gray-400">{row.nRegistro} · {new Date(row.fecha).toLocaleDateString()}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className={`saas-chip ${row.estado === 'BLOQUEADO' ? 'saas-chip-danger' : 'saas-chip-success'}`}>{row.estado}</span>
                {estadoSolicitudDeRegistro(row) && (
                  <>
                    <span className={`saas-chip ${estadoSolicitudDeRegistro(row) === 'REALIZADO' ? 'saas-chip-success' : 'bg-amber-100 text-amber-700'}`}>{estadoSolicitudDeRegistro(row)}</span>
                    {estadoSolicitudDeRegistro(row) === 'PENDIENTE' && (
                      <button
                        type="button"
                        onClick={() => handleMarcarRealizado(row)}
                        disabled={actualizandoSolicitud === row.id}
                        className="inline-flex min-h-8 items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60"
                      >
                        <CheckCircle2 size={14}/> {actualizandoSolicitud === row.id ? 'Guardando...' : 'Marcar realizado'}
                      </button>
                    )}
                  </>
                )}
                {row.estado === 'BLOQUEADO' && (
                  <button
                    onClick={() => handleDesbloquear(row)}
                    disabled={desbloqueando === row.id}
                    title="Cambiar a NO BLOQUEADO y marcar REALIZADO"
                    className={`relative inline-flex items-center h-5 w-9 rounded-full transition-colors focus:outline-none ${desbloqueando === row.id ? 'bg-gray-300 cursor-wait' : 'bg-red-500 hover:bg-red-400'}`}
                  >
                    <span className={`inline-block w-3.5 h-3.5 bg-white rounded-full shadow transition-transform ${desbloqueando === row.id ? 'translate-x-3' : 'translate-x-1'}`}/>
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-600 mb-1">{row.marcaEquipo} {row.nombreComercialEquipo || row.modeloEquipo}</p>
            <p className="text-xs font-mono text-blue-600 mb-1">IMEI registrado: {row.imeiRegistrado || row.imeiEquipo}</p>
            <p className="text-xs text-gray-400 mb-3">{row.operador} · {row.tipo}</p>
            <div className="flex gap-2">
              <button onClick={() => setViewingRegistro(row)} className="saas-ghost-button saas-mobile-icon-button flex-1" aria-label="Ver registro" title="Ver"><Eye size={16}/><span className="sr-only">Ver</span></button>
              <button onClick={() => onEdit(row)} className="saas-ghost-button saas-mobile-icon-button flex-1" aria-label="Editar registro" title="Editar"><Edit size={16}/><span className="sr-only">Editar</span></button>
              <button onClick={() => { const cl = getCliente(row.dniCliente); generarTicketRegistroPDF({...row, nombreCliente: cl.nombre || row.dniCliente, correoCliente: cl.correo || '', celularCliente: row.celularCliente || cl.celular || '', celularRef: row.celularRef || cl.celularRef || '', direccionCliente: cl.direccion || ''}); }} className="saas-ghost-button saas-mobile-icon-button flex-1" aria-label="Generar ticket" title="Ticket"><Printer size={16}/><span className="sr-only">Ticket</span></button>
              <button onClick={() => handleShare(row)} className="saas-ghost-button saas-mobile-icon-button flex-1" aria-label="Compartir registro" title="Compartir"><Share2 size={16}/><span className="sr-only">Compartir</span></button>
              <button onClick={() => setRegistroAEliminar(row)} className="saas-ghost-button saas-mobile-icon-button flex-1 text-red-600" aria-label="Eliminar registro" title="Eliminar"><Trash2 size={16}/><span className="sr-only">Eliminar</span></button>
            </div>
          </div>
        ))}
      </div>

      {/* ── DESKTOP: tabla ── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="saas-table text-left">
          <thead>
            <tr><th className="px-6 py-3">Fecha / ID</th><th className="px-6 py-3">Cliente</th><th className="px-6 py-3">Equipo (IMEI)</th><th className="px-6 py-3">Estado / Solicitud</th><th className="px-6 py-3 text-right">Acciones</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {cargando ? (
              <tr><td colSpan="5" className="px-6 py-12 text-center">
                <div className="flex flex-col items-center gap-3 text-gray-400">
                  <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                  <span className="text-sm">Cargando registros...</span>
                </div>
              </td></tr>
            ) : filteredData.length === 0 ? (<tr><td colSpan="5"><div className="saas-empty"><p className="text-sm font-semibold">{searchingAll ? 'Buscando en historial completo...' : 'No se encontraron registros'}</p><p className="text-xs">Prueba con otro documento, cliente o IMEI.</p></div></td></tr>) : (
              filteredData.map(row => (
                <tr key={row.id}>
                  <td className="px-6 py-4"><div className="font-medium text-gray-800">{new Date(row.fecha).toLocaleDateString()}</div><div className="text-xs text-gray-400">{row.nRegistro}</div></td>
                  <td className="px-6 py-4"><div className="font-medium">{getCliente(row.dniCliente).nombre || row.dniCliente}</div><div className="text-xs">{row.dniCliente}</div></td>
                  <td className="px-6 py-4"><div>{row.nombreComercialEquipo || row.modeloEquipo || '-'}</div><div className="text-xs text-blue-600 font-mono">IMEI registrado: {row.imeiRegistrado || row.imeiEquipo}</div></td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`saas-chip ${row.estado === 'BLOQUEADO' ? 'saas-chip-danger' : 'saas-chip-success'}`}>{row.estado}</span>
                      {estadoSolicitudDeRegistro(row) && (
                        <>
                          <span className={`saas-chip ${estadoSolicitudDeRegistro(row) === 'REALIZADO' ? 'saas-chip-success' : 'bg-amber-100 text-amber-700'}`}>{estadoSolicitudDeRegistro(row)}</span>
                          {estadoSolicitudDeRegistro(row) === 'PENDIENTE' && (
                            <button
                              type="button"
                              onClick={() => handleMarcarRealizado(row)}
                              disabled={actualizandoSolicitud === row.id}
                              className="inline-flex min-h-8 items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60"
                            >
                              <CheckCircle2 size={14}/> {actualizandoSolicitud === row.id ? 'Guardando...' : 'Marcar realizado'}
                            </button>
                          )}
                        </>
                      )}
                      {row.estado === 'BLOQUEADO' && (
                        <button
                          onClick={() => handleDesbloquear(row)}
                          disabled={desbloqueando === row.id}
                          title="Cambiar a NO BLOQUEADO y marcar REALIZADO"
                          className={`relative inline-flex items-center h-5 w-9 rounded-full transition-colors focus:outline-none ${desbloqueando === row.id ? 'bg-gray-300 cursor-wait' : 'bg-red-500 hover:bg-red-400'}`}
                        >
                          <span className={`inline-block w-3.5 h-3.5 bg-white rounded-full shadow transition-transform ${desbloqueando === row.id ? 'translate-x-3' : 'translate-x-1'}`}/>
                        </button>
                      )}
                    </div>
                    <div className="text-xs mt-1">{row.operador}</div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setViewingRegistro(row)} className="saas-icon-button" title="Ver detalle"><Eye size={18} /></button>
                      <button onClick={() => onEdit(row)} className="saas-icon-button" title="Editar"><Edit size={18} /></button>
                      <button onClick={() => { const cl = getCliente(row.dniCliente); generarTicketRegistroPDF({...row, nombreCliente: cl.nombre || row.dniCliente, correoCliente: cl.correo || '', celularCliente: row.celularCliente || cl.celular || '', celularRef: row.celularRef || cl.celularRef || '', direccionCliente: cl.direccion || ''}); }} className="saas-icon-button" title="Descargar ticket PDF"><Printer size={18} /></button>
                      <button onClick={() => handleShare(row)} className="saas-icon-button" title="Compartir registro"><Share2 size={18} /></button>
                      <button onClick={() => setRegistroAEliminar(row)} className="saas-icon-button hover:!text-red-600 hover:!bg-red-50" title="Eliminar"><Trash2 size={18} /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {hasMore && !searchTerm && (
        <div className="border-t border-gray-100 p-4 flex justify-center">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="saas-secondary disabled:opacity-50"
          >
            {loadingMore ? 'Cargando...' : 'Cargar mas registros'}
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ESCÁNER IA — panel flotante esquina inferior derecha, no bloquea el formulario
// ============================================================================
