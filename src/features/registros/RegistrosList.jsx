/* eslint-disable no-unused-vars, no-empty */
import React, { useState, useMemo } from 'react';
import { Menu, X, Home, ShoppingCart, ClipboardList, Plus, Search, Edit, Trash2, Printer, Copy, Eye, CheckCircle2, AlertCircle, Users, ScanBarcode, UploadCloud, ChevronDown, ChevronUp, LogOut, FileText, Share2, Settings, ImagePlus } from 'lucide-react';
import { doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { generarTicketRegistroPDF } from './registroPdf.js';
export function RegistrosList({ data, cargando, ventas, clientes, equipos, onNew, onEdit, showToast, db, auth, appId }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [ticketData, setTicketData] = useState(null);
  const [viewingRegistro, setViewingRegistro] = useState(null);

  const getCliente = (dni) => clientes.find(c => c.dni === dni) || {};

  const filteredData = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return data.filter(r => {
      const cliente = clientes.find(c => c.dni === r.dniCliente) || {};
      return (r.imeiEquipo && r.imeiEquipo.includes(searchTerm)) ||
             (r.imei2Equipo && r.imei2Equipo.includes(searchTerm)) ||
             (r.dniCliente && r.dniCliente.includes(searchTerm)) ||
             (cliente.nombre && cliente.nombre.toLowerCase().includes(term));
    });
  }, [data, clientes, searchTerm]);

  const handleCopy = (item) => {
    const cliente = getCliente(item.dniCliente);
    const imeiRegistrado = item.imeiRegistrado || item.imeiEquipo;
    const text = `IMEI: ${imeiRegistrado}\nDNI: ${item.dniCliente}\nCELULAR: ${cliente.celular || ''}\nNOMBRE CLIENTE: ${cliente.nombre || ''}\nDIRECCION: ${cliente.direccion || ''}\nCORREO ELECTRONICO: ${cliente.correo || ''}`;
    navigator.clipboard.writeText(text).then(() => showToast('Datos copiados')).catch(() => showToast('Error al copiar', 'error'));
  };

  const handleShare = async (row) => {
    const cliente = getCliente(row.dniCliente);
    const imeiRegistrado = row.imeiRegistrado || row.imeiEquipo;
    const encabezado = String(row.estado || '').toUpperCase() === 'BLOQUEADO'
      ? 'DESBLOQUEO LISTA BLANCA'
      : 'REGISTRO';
    const texto = `${encabezado}

IMEI: ${imeiRegistrado}
DNI: ${row.dniCliente}
CELULAR: ${cliente.celular || ''}
NOMBRE CLIENTE: ${cliente.nombre || ''}
DIRECCION: ${cliente.direccion || ''}
CORREO ELECTRONICO: ${cliente.correo || ''}`;

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
        await fetchPdf(row.pdfDniUrl,    `DNI_${row.dniCliente}.pdf`);
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

PDF DNI: ${row.pdfDniUrl}`;
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

PDF DNI: ${row.pdfDniUrl}`;
    if (row.pdfCajaUrl)   shareText += `
PDF Caja: ${row.pdfCajaUrl}`;
    if (row.pdfReciboUrl) shareText += `
PDF Recibo: ${row.pdfReciboUrl}`;
    navigator.clipboard.writeText(shareText)
      .then(() => showToast('Datos copiados para compartir'))
      .catch(() => showToast('Error al copiar', 'error'));
  };

  const handleDelete = async (id) => {
    if(window.confirm("¿Estás seguro de eliminar este registro?")) {
      try {
        if(auth.currentUser) {
          const uid = 'shared';
          const registro = data.find(r => r.id === id);

          await deleteDoc(doc(db, 'artifacts', appId, 'users', uid, 'registros', id));

          if (registro?.imeiEquipo) {
            const imei1 = registro.imeiEquipo;
            // ¿Quedan otros registros para este equipo?
            const otrosReg = data.filter(r => r.id !== id && r.imeiEquipo === imei1);
            // ¿Tiene alguna venta activa?
            const tieneVenta = ventas.some(v => v.imeiEquipo === imei1);

            if (otrosReg.length === 0 && !tieneVenta) {
              // Sin registros ni ventas → eliminar el equipo completamente
              await deleteDoc(doc(db, 'artifacts', appId, 'users', uid, 'equipos', imei1));
              // Si el cliente no tiene más equipos, eliminar también el cliente
              const otrosEquipos = equipos.filter(e => e.idDuenio === registro.dniCliente && e.idEquipo !== imei1);
              if (otrosEquipos.length === 0) {
                await deleteDoc(doc(db, 'artifacts', appId, 'users', uid, 'clientes', registro.dniCliente));
              }
            } else {
              // Solo actualizar flags de registro
              const imei2 = registro.imei2Equipo || '';
              const imei1Reg = otrosReg.some(r => r.imeiRegistrado === imei1);
              const imei2Reg = imei2 ? otrosReg.some(r => r.imeiRegistrado === imei2) : false;
              await updateDoc(doc(db, 'artifacts', appId, 'users', uid, 'equipos', imei1), {
                isRegistrado: imei1Reg || imei2Reg,
                imei1Registrado: imei1Reg,
                imei2Registrado: imei2Reg,
              });
            }
          }
          showToast('Registro eliminado correctamente');
        }
      } catch (e) { console.error(e); showToast('Error al eliminar', 'error'); }
    }
  };

  const [desbloqueando, setDesbloqueando] = useState(null);

  const handleDesbloquear = async (row) => {
    setDesbloqueando(row.id);
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'users', 'shared', 'registros', row.id), { estado: 'NO BLOQUEADO' });
      showToast(`${row.nRegistro} desbloqueado ✓`);
    } catch (e) {
      console.error(e);
      showToast('Error al desbloquear', 'error');
    } finally {
      setDesbloqueando(null);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden relative">
      {ticketData && null}
      {viewingRegistro && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 relative">
            <button onClick={() => setViewingRegistro(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X size={20}/></button>
            <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">Detalles del Registro</h3>
            <div className="space-y-4 text-sm">
              {/* Equipo */}
              <div>
                <p className="text-xs font-semibold text-blue-600 uppercase mb-2 border-b pb-1">Equipo</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 bg-gray-50 p-3 rounded border border-gray-100">
                  <p><strong className="text-gray-700">IMEI registrado:</strong></p>
                  <p className="font-mono text-gray-600">{viewingRegistro.imeiRegistrado || viewingRegistro.imeiEquipo}</p>
                  <p><strong className="text-gray-700">Marca:</strong></p>
                  <p className="text-gray-600">{viewingRegistro.marcaEquipo || '-'}</p>
                  <p><strong className="text-gray-700">Modelo:</strong></p>
                  <p className="text-gray-600">{viewingRegistro.modeloEquipo || '-'}</p>
                  <p><strong className="text-gray-700">Nombre comercial:</strong></p>
                  <p className="text-gray-600">{viewingRegistro.nombreComercialEquipo || '-'}</p>
                  <p><strong className="text-gray-700">Estado:</strong></p>
                  <p><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${viewingRegistro.estado === 'BLOQUEADO' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{viewingRegistro.estado || '-'}</span></p>
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
                  <p><strong className="text-gray-700">DNI:</strong></p>
                  <p className="text-gray-600">{viewingRegistro.dniCliente}</p>
                  <p><strong className="text-gray-700">Celular:</strong></p>
                  <p className="text-gray-600">{getCliente(viewingRegistro.dniCliente).celular || viewingRegistro.celularCliente || '-'}</p>
                  <p><strong className="text-gray-700">N° Referencia:</strong></p>
                  <p className="text-gray-600">{viewingRegistro.celularRef || '-'}</p>
                  <p><strong className="text-gray-700">Correo:</strong></p>
                  <p className="text-gray-600">{getCliente(viewingRegistro.dniCliente).correo || '-'}</p>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button onClick={() => setViewingRegistro(null)} className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 w-full justify-center flex">Cerrar</button>
            </div>
          </div>
        </div>
      )}
      <div className="p-4 md:p-6 border-b border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="relative w-full md:w-96">
          <input type="text" placeholder="Buscar por DNI o IMEI..." className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          <Search className="absolute left-3 top-2.5 text-gray-400" size={20} />
        </div>
        <button onClick={onNew} className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center justify-center"><Plus className="mr-2" size={20} /> Nuevo Registro</button>
      </div>

      {/* ── MÓVIL: tarjetas ── */}
      <div className="md:hidden divide-y divide-gray-100">
        {cargando ? (
          <div className="py-12 flex flex-col items-center gap-3 text-gray-400">
            <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
            <span className="text-sm">Cargando registros...</span>
          </div>
        ) : filteredData.length === 0 ? (
          <p className="px-4 py-8 text-center text-gray-400 text-sm">No se encontraron registros</p>
        ) : filteredData.map(row => (
          <div key={row.id} className="p-4 hover:bg-gray-50">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-semibold text-gray-800 text-sm">{getCliente(row.dniCliente).nombre || row.dniCliente}</p>
                <p className="text-xs text-gray-400">{row.nRegistro} · {new Date(row.fecha).toLocaleDateString()}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${row.estado === 'BLOQUEADO' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{row.estado}</span>
                {row.estado === 'BLOQUEADO' && (
                  <button
                    onClick={() => handleDesbloquear(row)}
                    disabled={desbloqueando === row.id}
                    title="Cambiar a NO BLOQUEADO"
                    className={`relative inline-flex items-center h-5 w-9 rounded-full transition-colors focus:outline-none ${desbloqueando === row.id ? 'bg-gray-300 cursor-wait' : 'bg-red-500 hover:bg-red-400'}`}
                  >
                    <span className={`inline-block w-3.5 h-3.5 bg-white rounded-full shadow transition-transform ${desbloqueando === row.id ? 'translate-x-3' : 'translate-x-1'}`}/>
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-600 mb-1">{row.marcaEquipo} {row.nombreComercialEquipo || row.modeloEquipo}</p>
            <p className="text-xs font-mono text-blue-600 mb-1">{row.imeiEquipo}</p>
            <p className="text-xs text-gray-400 mb-3">{row.operador} · {row.tipo}</p>
            <div className="flex gap-2">
              <button onClick={() => setViewingRegistro(row)} className="flex-1 flex items-center justify-center gap-1 py-1.5 border rounded-lg text-xs text-gray-600 hover:bg-gray-100"><Eye size={14}/> Ver</button>
              <button onClick={() => onEdit(row)} className="flex-1 flex items-center justify-center gap-1 py-1.5 border rounded-lg text-xs text-yellow-600 hover:bg-yellow-50"><Edit size={14}/> Editar</button>
              <button onClick={() => { const cl = getCliente(row.dniCliente); generarTicketRegistroPDF({...row, nombreCliente: cl.nombre || row.dniCliente, correoCliente: cl.correo || '', celularCliente: cl.celular || row.celularCliente || '', celularRef: cl.celularRef || row.celularRef || ''}); }} className="flex-1 flex items-center justify-center gap-1 py-1.5 border rounded-lg text-xs text-purple-600 hover:bg-purple-50"><Printer size={14}/> Ticket</button>
              <button onClick={() => handleShare(row)} className="flex-1 flex items-center justify-center gap-1 py-1.5 border rounded-lg text-xs text-blue-600 hover:bg-blue-50"><Share2 size={14}/> Compartir</button>
              <button onClick={() => handleDelete(row.id)} className="px-3 py-1.5 border rounded-lg text-xs text-red-500 hover:bg-red-50"><Trash2 size={14}/></button>
            </div>
          </div>
        ))}
      </div>

      {/* ── DESKTOP: tabla ── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-sm text-gray-600">
          <thead className="bg-gray-50 text-gray-700 uppercase text-xs font-semibold">
            <tr><th className="px-6 py-3">Fecha / ID</th><th className="px-6 py-3">Cliente</th><th className="px-6 py-3">Equipo (IMEI)</th><th className="px-6 py-3">Estado/Operador</th><th className="px-6 py-3 text-right">Acciones</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {cargando ? (
              <tr><td colSpan="5" className="px-6 py-12 text-center">
                <div className="flex flex-col items-center gap-3 text-gray-400">
                  <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                  <span className="text-sm">Cargando registros...</span>
                </div>
              </td></tr>
            ) : filteredData.length === 0 ? (<tr><td colSpan="5" className="px-6 py-8 text-center text-gray-400">No se encontraron registros</td></tr>) : (
              filteredData.map(row => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4"><div className="font-medium text-gray-800">{new Date(row.fecha).toLocaleDateString()}</div><div className="text-xs text-gray-400">{row.nRegistro}</div></td>
                  <td className="px-6 py-4"><div className="font-medium">{getCliente(row.dniCliente).nombre || row.dniCliente}</div><div className="text-xs">{row.dniCliente}</div></td>
                  <td className="px-6 py-4"><div>{row.modeloEquipo}</div><div className="text-xs text-blue-600 font-mono">{row.imeiEquipo}</div></td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs ${row.estado === 'BLOQUEADO' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{row.estado}</span>
                      {row.estado === 'BLOQUEADO' && (
                        <button
                          onClick={() => handleDesbloquear(row)}
                          disabled={desbloqueando === row.id}
                          title="Cambiar a NO BLOQUEADO"
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
                      <button onClick={() => setViewingRegistro(row)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"><Eye size={18} /></button>
                      <button onClick={() => onEdit(row)} className="p-1.5 text-gray-500 hover:text-yellow-600 hover:bg-yellow-50 rounded"><Edit size={18} /></button>
                      <button onClick={() => { const cl = getCliente(row.dniCliente); generarTicketRegistroPDF({...row, nombreCliente: cl.nombre || row.dniCliente, correoCliente: cl.correo || '', celularCliente: cl.celular || row.celularCliente || '', celularRef: cl.celularRef || row.celularRef || ''}); }} className="p-1.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded" title="Descargar ticket PDF"><Printer size={18} /></button>
                      <button onClick={() => handleShare(row)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded" title="Compartir registro"><Share2 size={18} /></button>
                      <button onClick={() => handleDelete(row.id)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={18} /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// ESCÁNER IA — panel flotante esquina inferior derecha, no bloquea el formulario
// ============================================================================

