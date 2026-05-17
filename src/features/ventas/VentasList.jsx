/* eslint-disable no-unused-vars */
import React, { useState, useMemo } from 'react';
import { Menu, X, Home, ShoppingCart, ClipboardList, Plus, Search, Edit, Trash2, Printer, Copy, Eye, CheckCircle2, AlertCircle, Users, ScanBarcode, UploadCloud, ChevronDown, ChevronUp, LogOut, FileText, Share2, Settings, ImagePlus } from 'lucide-react';
import { generarTicketVentaPDF } from './ventaPdf.js';
import { eliminarVenta } from '../../services/functionsClient.js';
export function VentasList({ data, cargando, clientes, equipos, logoVentas, onNew, onEdit, showToast, onDeleted, onLoadMore, hasMore, loadingMore, total }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [viewingVenta, setViewingVenta] = useState(null);
  const [ticketVentaData, setTicketVentaData] = useState(null);
  const [ticketPendiente, setTicketPendiente] = useState(null); // data pendiente hasta elegir tamaño

  const getCliente = (dni) => clientes.find(c => c.dni === dni) || {};
  const getEquipo  = (imei) => equipos.find(e => e.idEquipo === imei) || {};

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
    };
  };

  const filteredData = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return data.filter(v => {
      const cliente = clientes.find(c => c.dni === v.dniCliente) || {};
      return (v.imeiEquipo && v.imeiEquipo.includes(searchTerm)) ||
             (v.dniCliente && v.dniCliente.includes(searchTerm)) ||
             (cliente.nombre && cliente.nombre.toLowerCase().includes(term));
    });
  }, [data, clientes, searchTerm]);

  const handleDelete = async (id) => {
    if(window.confirm("¿Estás seguro de eliminar esta venta?")) {
      try {
        await eliminarVenta(id);
        onDeleted?.(id);
        showToast('Venta eliminada');
      } catch (e) { console.error(e); showToast('Error al eliminar', 'error'); }
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden relative">
      {ticketVentaData && null}
      {/* Modal tamaño de papel */}
      {ticketPendiente && (
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 text-center">
            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Printer size={22} className="text-purple-600" />
            </div>
            <h3 className="text-base font-bold text-gray-800 mb-1">¿Tamaño de impresora?</h3>
            <p className="text-xs text-gray-400 mb-5">Elige el ancho del papel de tu impresora térmica</p>
            <div className="flex gap-3">
              <button onClick={() => { generarTicketVentaPDF(ticketPendiente, 58, logoVentas); setTicketPendiente(null); }}
                className="flex-1 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm transition-colors">
                58 mm
              </button>
              <button onClick={() => { generarTicketVentaPDF(ticketPendiente, 80, logoVentas); setTicketPendiente(null); }}
                className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition-colors">
                80 mm
              </button>
            </div>
            <button onClick={() => setTicketPendiente(null)} className="mt-3 text-xs text-gray-400 hover:text-gray-600 w-full py-1">Cancelar</button>
          </div>
        </div>
      )}
      {viewingVenta && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setViewingVenta(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X size={20}/></button>
            <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">Detalles de la Venta</h3>
            <div className="space-y-4 text-sm">
              {/* Venta */}
              <div>
                <p className="text-xs font-semibold text-green-600 uppercase mb-2 border-b pb-1">Venta</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 bg-gray-50 p-3 rounded border border-gray-100">
                  <p><strong className="text-gray-700">Código:</strong></p><p className="text-gray-600">{viewingVenta.nVenta}</p>
                  <p><strong className="text-gray-700">Fecha:</strong></p><p className="text-gray-600">{new Date(viewingVenta.fecha).toLocaleString('es-PE')}</p>
                  <p><strong className="text-gray-700">Precio:</strong></p><p className="text-green-700 font-bold">S/. {parseFloat(viewingVenta.precio).toFixed(2)}</p>
                </div>
              </div>
              {/* Cliente */}
              <div>
                <p className="text-xs font-semibold text-green-600 uppercase mb-2 border-b pb-1">Cliente</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 bg-gray-50 p-3 rounded border border-gray-100">
                  <p><strong className="text-gray-700">Nombre:</strong></p><p className="text-gray-600">{getCliente(viewingVenta.dniCliente).nombre || '-'}</p>
                  <p><strong className="text-gray-700">DNI:</strong></p><p className="text-gray-600">{viewingVenta.dniCliente}</p>
                  <p><strong className="text-gray-700">Celular:</strong></p><p className="text-gray-600">{getCliente(viewingVenta.dniCliente).celular || '-'}</p>
                </div>
              </div>
              {/* Equipo */}
              <div>
                <p className="text-xs font-semibold text-green-600 uppercase mb-2 border-b pb-1">Equipo</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 bg-gray-50 p-3 rounded border border-gray-100">
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
            </div>
          </div>
        </div>
      )}
      <div className="p-4 md:p-6 border-b border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="relative w-full md:w-96"><input type="text" placeholder="Buscar venta..." className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /><Search className="absolute left-3 top-2.5 text-gray-400" size={20} /></div>
        <div className="w-full md:w-auto flex items-center gap-3">
          <span className="hidden md:inline text-xs text-gray-400 whitespace-nowrap">{data.length} de {total || data.length}</span>
          <button onClick={onNew} className="w-full md:w-auto bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center justify-center"><Plus className="mr-2" size={20} /> Nueva Venta</button>
        </div>
      </div>

      {/* ── MÓVIL: tarjetas ── */}
      <div className="md:hidden divide-y divide-gray-100">
        {cargando ? (
          <div className="py-12 flex flex-col items-center gap-3 text-gray-400">
            <div className="w-8 h-8 border-4 border-green-200 border-t-green-600 rounded-full animate-spin"></div>
            <span className="text-sm">Cargando ventas...</span>
          </div>
        ) : filteredData.length === 0 ? (
          <p className="px-4 py-8 text-center text-gray-400 text-sm">No se encontraron ventas</p>
        ) : filteredData.map(row => (
          <div key={row.id} className="p-4 hover:bg-gray-50">
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
              <button onClick={() => setViewingVenta(row)} className="flex-1 flex items-center justify-center gap-1 py-1.5 border rounded-lg text-xs text-gray-600 hover:bg-gray-100"><Eye size={14}/> Ver</button>
              <button onClick={() => onEdit(row)} className="flex-1 flex items-center justify-center gap-1 py-1.5 border rounded-lg text-xs text-yellow-600 hover:bg-yellow-50"><Edit size={14}/> Editar</button>
              <button onClick={() => setTicketPendiente(ticketData(row))} className="flex-1 flex items-center justify-center gap-1 py-1.5 border rounded-lg text-xs text-purple-600 hover:bg-purple-50"><Printer size={14}/> Ticket</button>
              <button onClick={() => handleDelete(row.id)} className="px-3 py-1.5 border rounded-lg text-xs text-red-500 hover:bg-red-50"><Trash2 size={14}/></button>
            </div>
          </div>
        ))}
      </div>

      {/* ── DESKTOP: tabla ── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-sm text-gray-600">
          <thead className="bg-gray-50 text-gray-700 uppercase text-xs font-semibold">
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
              <tr><td colSpan="5" className="px-6 py-8 text-center text-gray-400">No se encontraron ventas</td></tr>
            ) : filteredData.map(row => (
              <tr key={row.id} className="hover:bg-gray-50">
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
                    <button onClick={() => setViewingVenta(row)} className="p-1.5 text-gray-500 hover:text-green-600"><Eye size={18} /></button>
                    <button onClick={() => onEdit(row)} className="p-1.5 text-gray-500 hover:text-yellow-600"><Edit size={18} /></button>
                    <button onClick={() => setTicketPendiente(ticketData(row))} className="p-1.5 text-gray-500 hover:text-purple-600" title="Descargar ticket PDF"><Printer size={18} /></button>
                    <button onClick={() => handleDelete(row.id)} className="p-1.5 text-gray-500 hover:text-red-600"><Trash2 size={18} /></button>
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
            className="px-4 py-2 rounded-lg border text-sm text-green-700 border-green-200 hover:bg-green-50 disabled:opacity-50"
          >
            {loadingMore ? 'Cargando...' : 'Cargar mas ventas'}
          </button>
        </div>
      )}
    </div>
  );
}

