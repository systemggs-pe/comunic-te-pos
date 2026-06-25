/* eslint-disable no-unused-vars */
import React, { useState, useMemo, useEffect } from 'react';
import { Menu, X, Home, ShoppingCart, ClipboardList, Plus, Search, Edit, Trash2, Printer, Copy, Eye, CheckCircle2, AlertCircle, Users, ScanBarcode, UploadCloud, ChevronDown, ChevronUp, LogOut, FileText, Share2, Settings, ImagePlus } from 'lucide-react';
import { generarTicketVentaPDF } from './ventaPdf.js';
import { eliminarVenta } from '../../services/functionsClient.js';
import {ConfirmModal} from '../../components/ui/ConfirmModal.jsx';
import {etiquetaDocumento} from '../../utils/documentos.js';
import {ventaMatchesSearch} from '../../utils/searchRecords.js';
import {buscarBoletaPorVenta, formatearChipBoleta} from '../boletas/boletaHelpers.js';

function BoletaChip({boleta}) {
  return (
    <span className={`inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${boleta ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
      {formatearChipBoleta(boleta)}
    </span>
  );
}

export function VentasList({ data, cargando, clientes, equipos, boletasExtranjeras = [], logoVentas, onNew, onEdit, showToast, onDeleted, onLoadMore, hasMore, loadingMore, total, onSearchAll, searchingAll = false }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [viewingVenta, setViewingVenta] = useState(null);
  const [ticketVentaData, setTicketVentaData] = useState(null);
  const [ventaAEliminar, setVentaAEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);
  const [ticketPendiente, setTicketPendiente] = useState(null); // data pendiente hasta elegir tamaño

  const getCliente = (dni) => clientes.find(c => c.dni === dni) || {};
  const getEquipo  = (imei) => equipos.find(e => e.idEquipo === imei) || {};
  const boletaDeVenta = venta => buscarBoletaPorVenta(boletasExtranjeras, venta, getEquipo(venta?.imeiEquipo));
  const ticketData = (row) => {
    const eq = getEquipo(row.imeiEquipo);
    return {
      ...row,
      nombreCliente: getCliente(row.dniCliente).nombre || row.dniCliente,
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
    if (term.length < 2 || !onSearchAll || (total && data.length >= total)) return undefined;
    const timeoutId = window.setTimeout(() => onSearchAll(term), 350);
    return () => window.clearTimeout(timeoutId);
  }, [data.length, onSearchAll, searchTerm, total]);

  const filteredData = useMemo(() => {
    return data.filter(v => {
      const cliente = clientes.find(c => c.dni === v.dniCliente) || {};
      const equipo = equipos.find(e => e.idEquipo === v.imeiEquipo) || {};
      return ventaMatchesSearch(v, searchTerm, cliente, equipo);
    });
  }, [data, clientes, equipos, searchTerm]);

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
    <div className="saas-list-shell relative">
      {ticketVentaData && null}
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
                  {viewingVenta.precioEquipo && <><p><strong className="text-gray-700">Equipo:</strong></p><p className="text-gray-600">S/. {parseFloat(viewingVenta.precioEquipo).toFixed(2)}</p></>}
                </div>
              </div>
              {/* Cliente */}
              <div>
                <p className="text-xs font-semibold text-green-600 uppercase mb-2 border-b pb-1">Cliente</p>
                <div className="grid grid-cols-1 gap-y-1.5 rounded border border-gray-100 bg-gray-50 p-3 sm:grid-cols-[145px_minmax(0,1fr)] sm:gap-x-4">
                  <p><strong className="text-gray-700">Nombre:</strong></p><p className="text-gray-600">{getCliente(viewingVenta.dniCliente).nombre || '-'}</p>
                  <p><strong className="text-gray-700">{etiquetaDocumento(viewingVenta.tipoDocumentoCliente || getCliente(viewingVenta.dniCliente).tipoDocumento)}:</strong></p><p className="text-gray-600">{viewingVenta.dniCliente}</p>
                  <p><strong className="text-gray-700">Celular:</strong></p><p className="text-gray-600">{getCliente(viewingVenta.dniCliente).celular || '-'}</p>
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
                  <p><strong className="text-gray-700">Boleta extranjera:</strong></p><p><BoletaChip boleta={boletaDeVenta(viewingVenta)} /></p>
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
      <div className="saas-list-toolbar">
        <div>
          <p className="saas-page-kicker">Ventas</p>
          <h2 className="saas-page-title">Ventas de equipos</h2>
          <p className="saas-page-desc">
            {filteredData.length} visible{filteredData.length !== 1 ? 's' : ''} de {total || data.length} venta{(total || data.length) !== 1 ? 's' : ''}
            {searchingAll && <span className="ml-2 text-slate-400">Buscando historial...</span>}
          </p>
        </div>
        <div className="saas-toolbar-actions">
          <div className="saas-searchbox">
            <input type="text" placeholder="Buscar por documento, cliente o IMEI" className="saas-search-input" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            <Search size={18} />
          </div>
          <button onClick={onNew} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2">
            <Plus size={18} /> Nueva Venta
          </button>
        </div>
      </div>

      {/* ── MÓVIL: tarjetas ── */}
      <div className="md:hidden saas-mobile-list">
        {cargando ? (
          <div className="py-12 flex flex-col items-center gap-3 text-gray-400">
            <div className="w-8 h-8 border-4 border-green-200 border-t-green-600 rounded-full animate-spin"></div>
            <span className="text-sm">Cargando ventas...</span>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="saas-empty px-4 py-8">
            <p className="text-sm font-semibold">{searchingAll ? 'Buscando en historial completo...' : 'No se encontraron ventas'}</p>
            <p className="text-xs">Prueba con otro documento, cliente o IMEI.</p>
          </div>
        ) : filteredData.map(row => (
          <div key={row.id} className="saas-mobile-row">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-semibold text-gray-800 text-sm">{getCliente(row.dniCliente).nombre || row.dniCliente}</p>
                <p className="text-xs text-gray-400">{row.nVenta} · {new Date(row.fecha).toLocaleDateString()}</p>
              </div>
              <span className="font-bold text-green-600 text-sm">S/ {parseFloat(row.precio).toFixed(2)}</span>
            </div>
            <p className="text-xs text-gray-600 mb-1">
              {row.marcaEquipo} {row.nombreComercial || getEquipo(row.imeiEquipo).nombreComercial || row.modeloEquipo}
            </p>
            <div className="mb-2">
              <BoletaChip boleta={boletaDeVenta(row)} />
            </div>
            <div className="mb-3 space-y-0.5">
              {(() => {
                const eq = getEquipo(row.imeiEquipo);
                const imei2 = eq.imei2 || row.imei2Equipo || '';
                const reg1 = eq.imei1Registrado;
                const reg2 = eq.imei2Registrado;
                return (
                  <>
                    <p className={`text-xs font-mono ${reg1 ? 'text-green-600 font-semibold' : 'text-gray-400'}`}>
                      {reg1 && '✓ '}{row.imeiEquipo}
                    </p>
                    {imei2 && (
                      <p className={`text-xs font-mono ${reg2 ? 'text-green-600 font-semibold' : 'text-gray-400'}`}>
                        {reg2 && '✓ '}{imei2}
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setViewingVenta(row)} className="saas-ghost-button saas-mobile-icon-button flex-1" aria-label="Ver venta" title="Ver"><Eye size={16}/><span className="sr-only">Ver</span></button>
              <button onClick={() => onEdit(row)} className="saas-ghost-button saas-mobile-icon-button flex-1" aria-label="Editar venta" title="Editar"><Edit size={16}/><span className="sr-only">Editar</span></button>
              <button onClick={() => setTicketPendiente(ticketData(row))} className="saas-ghost-button saas-mobile-icon-button flex-1" aria-label="Generar ticket" title="Ticket"><Printer size={16}/><span className="sr-only">Ticket</span></button>
              <button onClick={() => setVentaAEliminar(row)} className="saas-ghost-button saas-mobile-icon-button flex-1 text-red-600" aria-label="Eliminar venta" title="Eliminar"><Trash2 size={16}/><span className="sr-only">Eliminar</span></button>
            </div>
          </div>
        ))}
      </div>

      {/* ── DESKTOP: tabla ── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="saas-table text-left">
          <thead>
            <tr><th className="px-6 py-3">Fecha / ID</th><th className="px-6 py-3">Cliente</th><th className="px-6 py-3">Equipo Vendido</th><th className="px-6 py-3 text-right">Monto</th><th className="px-6 py-3 text-right">Acciones</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {cargando ? (
              <tr><td colSpan="5" className="px-6 py-12 text-center">
                <div className="flex flex-col items-center gap-3 text-gray-400">
                  <div className="w-8 h-8 border-4 border-green-200 border-t-green-600 rounded-full animate-spin"></div>
                  <span className="text-sm">Cargando ventas...</span>
                </div>
              </td></tr>
            ) : filteredData.length === 0 ? (
              <tr><td colSpan="5"><div className="saas-empty"><p className="text-sm font-semibold">{searchingAll ? 'Buscando en historial completo...' : 'No se encontraron ventas'}</p><p className="text-xs">Prueba con otro documento, cliente o IMEI.</p></div></td></tr>
            ) : filteredData.map(row => (
              <tr key={row.id}>
                <td className="px-6 py-4"><div className="font-medium">{new Date(row.fecha).toLocaleDateString()}</div><div className="text-xs">{row.nVenta}</div></td>
                <td className="px-6 py-4"><div className="font-medium">{getCliente(row.dniCliente).nombre || row.dniCliente}</div><div className="text-xs">{row.dniCliente}</div></td>
                <td className="px-6 py-4">
                  {(() => {
                    const eq = getEquipo(row.imeiEquipo);
                    const imei2 = eq.imei2 || row.imei2Equipo || '';
                    const reg1 = eq.imei1Registrado;
                    const reg2 = eq.imei2Registrado;
                    const nombre = row.nombreComercial || eq.nombreComercial || row.modeloEquipo;
                    return (
                      <>
                        <div className="font-medium text-gray-800">{row.marcaEquipo} {nombre}</div>
                        <div className="mt-1"><BoletaChip boleta={boletaDeVenta(row)} /></div>
                        <div className={`text-xs font-mono mt-0.5 ${reg1 ? 'text-green-600 font-semibold' : 'text-gray-400'}`}>
                          {reg1 && <span className="mr-0.5">✓</span>}{row.imeiEquipo}
                        </div>
                        {imei2 && (
                          <div className={`text-xs font-mono ${reg2 ? 'text-green-600 font-semibold' : 'text-gray-400'}`}>
                            {reg2 && <span className="mr-0.5">✓</span>}{imei2}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </td>
                <td className="px-6 py-4 text-right font-bold text-green-600">S/ {parseFloat(row.precio).toFixed(2)}</td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => setViewingVenta(row)} className="saas-icon-button" title="Ver detalle"><Eye size={18} /></button>
                    <button onClick={() => onEdit(row)} className="saas-icon-button" title="Editar"><Edit size={18} /></button>
                    <button onClick={() => setTicketPendiente(ticketData(row))} className="saas-icon-button" title="Descargar ticket PDF"><Printer size={18} /></button>
                    <button onClick={() => setVentaAEliminar(row)} className="saas-icon-button hover:!text-red-600 hover:!bg-red-50" title="Eliminar"><Trash2 size={18} /></button>
                  </div>
                </td>
              </tr>
            ))}
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
            {loadingMore ? 'Cargando...' : 'Cargar mas ventas'}
          </button>
        </div>
      )}
    </div>
  );
}

