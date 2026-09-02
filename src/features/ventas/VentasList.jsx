import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, ShoppingCart, Plus, Edit, Trash2, Printer, Eye, CheckCircle2 } from 'lucide-react';
import { generarTicketVentaPDF } from './ventaPdf.js';
import { eliminarVenta } from '../../services/functionsClient.js';
import {ConfirmModal} from '../../components/ui/ConfirmModal.jsx';
import {etiquetaDocumento} from '../../utils/documentos.js';
import {ventaMatchesSearch} from '../../utils/searchRecords.js';
import {indexClientesByDni, normalizeDni} from '../../utils/clientes.js';
import {Button, IconButton} from '../../components/ui/Button.jsx';
import {PageHeader, SearchField} from '../../components/ui/PageHeader.jsx';
import {SkeletonRows, StateView} from '../../components/ui/StateView.jsx';

export function VentasList({ data, cargando, clientes, equipos, registeredImeis = null, logoVentas, onNew, onEdit, showToast, onDeleted, onLoadMore, hasMore, loadingMore, total, onSearchAll, searchingAll = false }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [viewingVenta, setViewingVenta] = useState(null);
  const [ventaAEliminar, setVentaAEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);
  const ultimaBusquedaHistorialRef = useRef('');
  const onSearchAllRef = useRef(onSearchAll);

  useEffect(() => {
    onSearchAllRef.current = onSearchAll;
  }, [onSearchAll]);
  const [ticketPendiente, setTicketPendiente] = useState(null); // data pendiente hasta elegir tamaño

  const clientePorDni = useMemo(() => indexClientesByDni(clientes), [clientes]);
  const getCliente = (dni) => clientePorDni.get(normalizeDni(dni)) || {};
  const getEquipo  = (imei) => equipos.find(e => e.idEquipo === imei) || {};
  const imeiEstaRegistrado = imei => Boolean(
    imei && (
      registeredImeis?.has?.(imei)
      || (Array.isArray(registeredImeis) && registeredImeis.includes(imei))
    )
  );
  const ticketData = (row) => {
    const eq = getEquipo(row.imeiEquipo);
    return {
      ...row,
      nombreCliente: getCliente(row.dniCliente).nombre || row.nombreCliente || row.dniCliente,
      celularCliente: row.celularCliente || getCliente(row.dniCliente).celular || '',
      sn:            eq.sn    || row.sn    || '',
      imei2Equipo:   eq.imei2 || row.imei2Equipo || '',
      color:         eq.color || row.color || '',
      ram:           eq.ram   || row.ram   || '',
      memoria:       eq.memoria || row.memoria || '',
      nombreComercial: eq.nombreComercial || row.nombreComercial || '',
      precioEquipo:  row.precioEquipo || row.precio || '',
      itemsAdicionales: Array.isArray(row.itemsAdicionales) ? row.itemsAdicionales : [],
    };
  };

  useEffect(() => {
    const term = searchTerm.trim();
    if (term.length < 3) {
      ultimaBusquedaHistorialRef.current = '';
      return undefined;
    }
    if (!onSearchAllRef.current || (total && data.length >= total) || ultimaBusquedaHistorialRef.current === term) return undefined;
    ultimaBusquedaHistorialRef.current = term;
    const timeoutId = window.setTimeout(() => onSearchAllRef.current?.(term), 900);
    return () => window.clearTimeout(timeoutId);
  }, [data.length, searchTerm, total]);

  const filteredData = useMemo(() => {
    return data.filter(v => {
      const cliente = clientePorDni.get(normalizeDni(v.dniCliente)) || {};
      const equipo = equipos.find(e => e.idEquipo === v.imeiEquipo) || {};
      return ventaMatchesSearch(v, searchTerm, cliente, equipo);
    });
  }, [data, clientePorDni, equipos, searchTerm]);

  const handleDelete = async () => {
    if (!ventaAEliminar) return;
    setEliminando(true);
    try {
      await eliminarVenta(ventaAEliminar.id);
      onDeleted?.(ventaAEliminar.id);
      showToast('Venta eliminada');
      setVentaAEliminar(null);
    } catch (e) {
      console.error(e);
      showToast('Error al eliminar', 'error');
    } finally {
      setEliminando(false);
    }
  };

  return (
    <div className="ui-page-surface relative">
      <ConfirmModal
        open={Boolean(ventaAEliminar)}
        title="Eliminar venta"
        message="Se eliminara la venta seleccionada. Si era el unico movimiento del cliente, tambien se limpiaran sus datos asociados."
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        tone="danger"
        loading={eliminando}
        onConfirm={handleDelete}
        onCancel={() => setVentaAEliminar(null)}
      />
      {/* Modal tamaño de papel */}
      {ticketPendiente && (
        <div className="saas-modal-backdrop fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="saas-detail-modal w-full max-w-xs p-6 text-center">
            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Printer size={22} className="text-purple-600" />
            </div>
            <h3 className="text-base font-bold text-gray-800 mb-1">¿Tamaño de impresora?</h3>
            <p className="text-xs text-gray-400 mb-5">Elige el ancho del papel de tu impresora térmica</p>
            <div className="flex gap-3">
              <button onClick={() => { generarTicketVentaPDF(ticketPendiente, 58, logoVentas); setTicketPendiente(null); }}
                className="saas-primary flex-1">
                58 mm
              </button>
              <button onClick={() => { generarTicketVentaPDF(ticketPendiente, 80, logoVentas); setTicketPendiente(null); }}
                className="saas-secondary flex-1">
                80 mm
              </button>
            </div>
            <button onClick={() => setTicketPendiente(null)} className="saas-secondary mt-3 w-full">Cancelar</button>
          </div>
        </div>
      )}
      {viewingVenta && (
        <div className="saas-modal-backdrop fixed inset-0 z-[100] overflow-y-auto p-0 sm:p-4">
          <div className="saas-detail-modal min-h-screen w-full p-0 sm:mx-auto sm:my-6 sm:min-h-0 sm:max-w-4xl">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-5 py-4">
              <div>
                <p className="saas-page-kicker">Venta</p>
                <h3 className="text-lg font-semibold text-slate-900">{viewingVenta.nVenta || 'Detalle de venta'}</h3>
                <p className="mt-1 text-sm text-slate-500">{new Date(viewingVenta.fecha).toLocaleString('es-PE')}</p>
              </div>
              <button onClick={() => setViewingVenta(null)} className="saas-form-close"><X size={20}/></button>
            </div>
            <div className="grid gap-5 p-5 lg:grid-cols-[240px_1fr]">
              <aside className="grid grid-cols-2 gap-2 lg:block lg:space-y-2">
                <button type="button" onClick={() => setTicketPendiente(ticketData(viewingVenta))} className="saas-secondary min-h-11 w-full justify-center lg:justify-start"><Printer size={16}/> Ticket</button>
                <button type="button" onClick={() => { onEdit(viewingVenta); setViewingVenta(null); }} className="saas-secondary min-h-11 w-full justify-center lg:justify-start"><Edit size={16}/> Editar</button>
                <button type="button" onClick={() => { setVentaAEliminar(viewingVenta); setViewingVenta(null); }} className="saas-secondary col-span-2 min-h-11 w-full justify-center text-red-600 lg:col-span-1 lg:justify-start"><Trash2 size={16}/> Eliminar</button>
                <div className="col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3 lg:col-span-1">
                  <p className="text-xs font-semibold uppercase text-slate-400">Total</p>
                  <p className="mt-1 text-lg font-bold text-emerald-700">S/. {parseFloat(viewingVenta.precio || 0).toFixed(2)}</p>
                  <p className="text-xs text-slate-500">{viewingVenta.medioPago || 'EFECTIVO'}</p>
                </div>
              </aside>
              <div className="space-y-4 text-sm">
              {/* Venta */}
              <div>
                <p className="text-xs font-semibold text-green-600 uppercase mb-2 border-b pb-1">Venta</p>
                <div className="grid grid-cols-1 gap-y-1.5 rounded border border-gray-100 bg-gray-50 p-3 sm:grid-cols-[145px_minmax(0,1fr)] sm:gap-x-4">
                  <p><strong className="text-gray-700">Código:</strong></p><p className="text-gray-600">{viewingVenta.nVenta}</p>
                  <p><strong className="text-gray-700">Fecha:</strong></p><p className="text-gray-600">{new Date(viewingVenta.fecha).toLocaleString('es-PE')}</p>
                  <p><strong className="text-gray-700">Total:</strong></p><p className="text-green-700 font-bold">S/. {parseFloat(viewingVenta.precio).toFixed(2)}</p>
                  <p><strong className="text-gray-700">Medio de pago:</strong></p><p className="text-gray-600">{viewingVenta.medioPago || 'EFECTIVO'}</p>
                  <p><strong className="text-gray-700">Origen del equipo:</strong></p><p className="text-gray-600">{viewingVenta.origenEquipo || 'TIENDA'}</p>
                  {viewingVenta.origenEquipo === 'PASE' && <><p><strong className="text-gray-700">Recibido de:</strong></p><p className="text-gray-600">{viewingVenta.proveedorPase || '-'}</p></>}
                  {viewingVenta.precioEquipo && <><p><strong className="text-gray-700">Equipo:</strong></p><p className="text-gray-600">S/. {parseFloat(viewingVenta.precioEquipo).toFixed(2)}</p></>}
                </div>
              </div>
              {/* Cliente */}
              <div>
                <p className="text-xs font-semibold text-green-600 uppercase mb-2 border-b pb-1">Cliente</p>
                <div className="grid grid-cols-1 gap-y-1.5 rounded border border-gray-100 bg-gray-50 p-3 sm:grid-cols-[145px_minmax(0,1fr)] sm:gap-x-4">
                  <p><strong className="text-gray-700">Nombre:</strong></p><p className="text-gray-600">{getCliente(viewingVenta.dniCliente).nombre || viewingVenta.nombreCliente || '-'}</p>
                  <p><strong className="text-gray-700">{etiquetaDocumento(viewingVenta.tipoDocumentoCliente || getCliente(viewingVenta.dniCliente).tipoDocumento)}:</strong></p><p className="text-gray-600">{viewingVenta.dniCliente}</p>
                  <p><strong className="text-gray-700">Celular usado:</strong></p><p className="text-gray-600">{viewingVenta.celularCliente || getCliente(viewingVenta.dniCliente).celular || '-'}</p>
                </div>
              </div>
              {/* Equipo */}
              <div>
                <p className="text-xs font-semibold text-green-600 uppercase mb-2 border-b pb-1">Equipo</p>
                <div className="grid grid-cols-1 gap-y-1.5 rounded border border-gray-100 bg-gray-50 p-3 sm:grid-cols-[145px_minmax(0,1fr)] sm:gap-x-4">
                  <p><strong className="text-gray-700">Marca:</strong></p><p className="text-gray-600">{viewingVenta.marcaEquipo || '-'}</p>
                  <p><strong className="text-gray-700">Modelo:</strong></p><p className="text-gray-600">{viewingVenta.modeloEquipo || '-'}</p>
                  <p><strong className="text-gray-700">Nombre comercial:</strong></p><p className="text-gray-600">{viewingVenta.nombreComercial || getEquipo(viewingVenta.imeiEquipo).nombreComercial || '-'}</p>
                  <p><strong className="text-gray-700">Color:</strong></p><p className="text-gray-600">{viewingVenta.color || getEquipo(viewingVenta.imeiEquipo).color || '-'}</p>
                  <p><strong className="text-gray-700">RAM:</strong></p><p className="text-gray-600">{viewingVenta.ram ? viewingVenta.ram + ' GB' : getEquipo(viewingVenta.imeiEquipo).ram ? getEquipo(viewingVenta.imeiEquipo).ram + ' GB' : '-'}</p>
                  <p><strong className="text-gray-700">Memoria:</strong></p><p className="text-gray-600">{viewingVenta.memoria ? viewingVenta.memoria + ' GB' : getEquipo(viewingVenta.imeiEquipo).memoria ? getEquipo(viewingVenta.imeiEquipo).memoria + ' GB' : '-'}</p>
                  <p><strong className="text-gray-700">IMEI 1:</strong></p><p className="font-mono text-gray-600">{viewingVenta.imeiEquipo}</p>
                  {(viewingVenta.imei2Equipo || getEquipo(viewingVenta.imeiEquipo).imei2) && <><p><strong className="text-gray-700">IMEI 2:</strong></p><p className="font-mono text-gray-600">{viewingVenta.imei2Equipo || getEquipo(viewingVenta.imeiEquipo).imei2}</p></>}
                  {(viewingVenta.sn || getEquipo(viewingVenta.imeiEquipo).sn) && <><p><strong className="text-gray-700">S/N:</strong></p><p className="font-mono text-gray-600">{viewingVenta.sn || getEquipo(viewingVenta.imeiEquipo).sn}</p></>}
                </div>
              </div>
              {Array.isArray(viewingVenta.itemsAdicionales) && viewingVenta.itemsAdicionales.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-green-600 uppercase mb-2 border-b pb-1">Accesorios</p>
                  <div className="space-y-1.5 bg-gray-50 p-3 rounded border border-gray-100">
                    {viewingVenta.itemsAdicionales.map((item, index) => (
                      <div key={`${item.nombre}-${index}`} className="flex items-center justify-between gap-3 text-gray-600">
                        <span>{item.cantidad} x {item.nombre}</span>
                        <span className="font-semibold">S/. {(Number(item.cantidad || 1) * Number(item.precio || 0)).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              </div>
            </div>
          </div>
        </div>
      )}
      <PageHeader
        eyebrow="Operación comercial"
        title="Ventas"
        description="Consulta comprobantes, equipos vendidos e información del cliente."
        meta={`${filteredData.length} de ${total || data.length}`}
        icon={ShoppingCart}
        actions={(
          <>
            <SearchField label="Buscar ventas" placeholder="Documento, cliente o IMEI" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} />
            <Button variant="primary" onClick={onNew}><Plus size={17} /> Nueva venta</Button>
          </>
        )}
      />
      {searchingAll && <p className="ui-history-status" role="status">Buscando también en el historial…</p>}

      {/* ── MÓVIL: tarjetas ── */}
      <div className="ui-mobile-list md:hidden">
        {cargando ? (
          <SkeletonRows rows={4} columns={1} label="Cargando ventas" />
        ) : filteredData.length === 0 ? (
          <StateView icon={ShoppingCart} title={searchingAll ? 'Buscando en el historial completo' : 'No se encontraron ventas'} description="Prueba con otro documento, cliente o IMEI." />
        ) : filteredData.map(row => (
          <article key={row.id} className="ui-mobile-row">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-semibold text-gray-800 text-sm">{getCliente(row.dniCliente).nombre || row.nombreCliente || row.dniCliente}</p>
                <p className="text-xs text-gray-400">{row.nVenta} · {new Date(row.fecha).toLocaleDateString()}</p>
              </div>
              <span className="font-bold text-green-600 text-sm">S/ {parseFloat(row.precio).toFixed(2)}</span>
            </div>
            <p className="text-xs text-gray-600 mb-1">
              {row.marcaEquipo} {row.nombreComercial || getEquipo(row.imeiEquipo).nombreComercial || row.modeloEquipo}
            </p>
            <div className="mb-3 space-y-0.5">
              {(() => {
                const eq = getEquipo(row.imeiEquipo);
                const imei2 = eq.imei2 || row.imei2Equipo || '';
                const reg1 = imeiEstaRegistrado(row.imeiEquipo);
                const reg2 = imeiEstaRegistrado(imei2);
                return (
                  <>
                    <p className={`text-xs font-mono ${reg1 ? 'text-green-600 font-semibold' : 'text-gray-400'}`}>
                      {reg1 && <CheckCircle2 size={12} className="mr-1 inline" aria-label="Registrado" />}{row.imeiEquipo}
                    </p>
                    {imei2 && (
                      <p className={`text-xs font-mono ${reg2 ? 'text-green-600 font-semibold' : 'text-gray-400'}`}>
                        {reg2 && <CheckCircle2 size={12} className="mr-1 inline" aria-label="Registrado" />}{imei2}
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
            <div className="flex gap-2">
              <IconButton onClick={() => setViewingVenta(row)} className="flex-1" label="Ver venta"><Eye size={16}/></IconButton>
              <IconButton onClick={() => onEdit(row)} className="flex-1" label="Editar venta"><Edit size={16}/></IconButton>
              <IconButton onClick={() => setTicketPendiente(ticketData(row))} className="flex-1" label="Generar ticket"><Printer size={16}/></IconButton>
              <IconButton onClick={() => setVentaAEliminar(row)} className="flex-1" tone="danger" label="Eliminar venta"><Trash2 size={16}/></IconButton>
            </div>
          </article>
        ))}
      </div>

      {/* ── DESKTOP: tabla ── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="ui-data-table text-left">
          <thead>
            <tr><th className="px-6 py-3">Fecha / ID</th><th className="px-6 py-3">Cliente</th><th className="px-6 py-3">Equipo Vendido</th><th className="px-6 py-3 text-right">Monto</th><th className="px-6 py-3 text-right">Acciones</th></tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr><td colSpan="5" className="p-0"><SkeletonRows rows={5} columns={5} label="Cargando ventas" /></td></tr>
            ) : filteredData.length === 0 ? (
              <tr><td colSpan="5" className="p-0"><StateView icon={ShoppingCart} title={searchingAll ? 'Buscando en el historial completo' : 'No se encontraron ventas'} description="Prueba con otro documento, cliente o IMEI." /></td></tr>
            ) : filteredData.map(row => (
              <tr key={row.id}>
                <td className="px-6 py-4"><div className="font-medium">{new Date(row.fecha).toLocaleDateString()}</div><div className="text-xs">{row.nVenta}</div></td>
                <td className="px-6 py-4"><div className="font-medium">{getCliente(row.dniCliente).nombre || row.nombreCliente || row.dniCliente}</div><div className="text-xs">{row.dniCliente}</div></td>
                <td className="px-6 py-4">
                  {(() => {
                    const eq = getEquipo(row.imeiEquipo);
                    const imei2 = eq.imei2 || row.imei2Equipo || '';
                    const reg1 = imeiEstaRegistrado(row.imeiEquipo);
                    const reg2 = imeiEstaRegistrado(imei2);
                    const nombre = row.nombreComercial || eq.nombreComercial || row.modeloEquipo;
                    return (
                      <>
                        <div className="font-medium text-gray-800">{row.marcaEquipo} {nombre}</div>
                        <div className={`text-xs font-mono mt-0.5 ${reg1 ? 'text-green-600 font-semibold' : 'text-gray-400'}`}>
                          {reg1 && <CheckCircle2 size={12} className="mr-1 inline" aria-label="Registrado" />}{row.imeiEquipo}
                        </div>
                        {imei2 && (
                          <div className={`text-xs font-mono ${reg2 ? 'text-green-600 font-semibold' : 'text-gray-400'}`}>
                            {reg2 && <CheckCircle2 size={12} className="mr-1 inline" aria-label="Registrado" />}{imei2}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </td>
                <td className="px-6 py-4 text-right font-bold text-green-600">S/ {parseFloat(row.precio).toFixed(2)}</td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-1">
                    <IconButton size="sm" onClick={() => setViewingVenta(row)} label="Ver detalle"><Eye size={17} /></IconButton>
                    <IconButton size="sm" onClick={() => onEdit(row)} label="Editar"><Edit size={17} /></IconButton>
                    <IconButton size="sm" onClick={() => setTicketPendiente(ticketData(row))} label="Descargar ticket PDF"><Printer size={17} /></IconButton>
                    <IconButton size="sm" onClick={() => setVentaAEliminar(row)} tone="danger" label="Eliminar"><Trash2 size={17} /></IconButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasMore && !searchTerm && (
        <div className="flex justify-center border-t border-[var(--ui-border)] p-4">
          <Button
            onClick={onLoadMore}
            loading={loadingMore}
            loadingLabel="Cargando…"
          >
            Cargar más ventas
          </Button>
        </div>
      )}
    </div>
  );
}
