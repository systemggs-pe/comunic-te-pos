import React, { useState, useEffect } from 'react';
import { Menu, X, Home, ShoppingCart, ClipboardList, Plus, Search, Edit, Trash2, Printer, Copy, Eye, CheckCircle2, AlertCircle, Users, ScanBarcode, UploadCloud, ChevronDown, ChevronUp, LogOut, FileText, Share2, Settings, ImagePlus } from 'lucide-react';
import { actualizarVenta, consultarReniecDni, crearVenta } from '../../services/functionsClient.js';
import { luhn } from '../../utils/imei.js';
import { EscanerIA } from '../registros/EscanerIA.jsx';
import { generarTicketVentaPDF } from './ventaPdf.js';
export function VentaForm({ clientes, equipos, logoVentas, initialData, onCancel, onSave, onDirty, showToast }) {
  const [loading, setLoading] = useState(false);

  const toLocalDatetimeValue = (isoString) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [formData, setFormData] = useState({ dni: '', nombre: '', celular: '', correo: '', imei1: '', imei2: '', sn: '', nombreComercial: '', ram: '', memoria: '', marca: '', modelo: '', color: '', precio: '', fecha: toLocalDatetimeValue(new Date().toISOString()) });

  useEffect(() => {
    if (initialData) {
      const cliente = clientes.find(c => c.dni === initialData.dniCliente) || {};
      setFormData({ dni: initialData.dniCliente || '', nombre: cliente.nombre || '', celular: cliente.celular || '', correo: cliente.correo || '', imei1: initialData.imeiEquipo || '', imei2: '', sn: '', nombreComercial: initialData.nombreComercial || '', ram: initialData.ram || '', memoria: initialData.memoria || '', marca: initialData.marcaEquipo || '', modelo: initialData.modeloEquipo || '', color: initialData.color || '', precio: initialData.precio || '', fecha: toLocalDatetimeValue(initialData.fecha) });
      const e = equipos.find(eq => eq.idEquipo === initialData.imeiEquipo);
      if (e) setFormData(prev => ({...prev, imei2: e.imei2||'', sn: e.sn||'', nombreComercial: e.nombreComercial||'', ram: e.ram||'', memoria: e.memoria||'', color: e.color||''}));
    }
  }, [initialData, clientes, equipos]);

  const [mostrarEscaner, setMostrarEscaner] = useState(false);
  const [buscandoReniecV, setBuscandoReniecV] = useState(false);
  const [datosAnterioresV, setDatosAnterioresV] = useState(null);

  const buscarReniecV = async (dni) => {
    setBuscandoReniecV(true);
    try {
      const json = await consultarReniecDni(dni);
      if (json.success && json.result) {
        const r = json.result;
        setFormData(prev => ({
          ...prev,
          nombre: r.full_name ? r.full_name : prev.nombre,
          correo: r.email && !r.email.includes('*') ? r.email : prev.correo,
        }));
        showToast('✓ Datos encontrados en RENIEC', 'success');
      } else {
        showToast('DNI no encontrado en RENIEC', 'error');
      }
    } catch (e) {
      console.error('RENIEC error:', e);
      const mensaje = e.message === 'RENIEC_TOKEN_MISSING'
        ? 'Falta configurar token RENIEC'
        : e.message === 'BACKEND_INVALID_RESPONSE'
          ? 'Respuesta invalida de Netlify Functions'
        : e.message === 'BACKEND_NOT_DEPLOYED'
          ? 'Funciones Netlify no desplegadas'
          : 'Error al consultar RENIEC';
      showToast(mensaje, 'error');
    } finally {
      setBuscandoReniecV(false);
    }
  };

  const onEscaneo = (datos) => {
    setMostrarEscaner(false);
    onDirty?.();
    setFormData(prev => ({
      ...prev,
      imei1:           datos.imei1           || prev.imei1,
      imei2:           datos.imei2           || prev.imei2,
      sn:              datos.sn              || prev.sn,
      marca:           datos.marca           || prev.marca,
      modelo:          datos.modelo          || prev.modelo,
      nombreComercial: datos.nombreComercial || prev.nombreComercial,
      ram:             datos.ram             || prev.ram,
      memoria:         datos.memoria         || prev.memoria,
      color:           datos.color           || prev.color,
    }));
    const campos = [datos.imei1, datos.marca, datos.nombreComercial].filter(Boolean).join(' · ');
    showToast(campos ? `✓ ${campos}` : 'Sin datos — rellena manualmente', campos ? 'success' : 'error');
  };

  useEffect(() => {
    if (formData.dni.length >= 8 && !initialData) {
      const c = clientes.find(c => c.dni === formData.dni);
      if (c) {
        setDatosAnterioresV({ celular: c.celular || '', correo: c.correo || '' });
        setFormData(prev => ({ ...prev, nombre: c.nombre, celular: c.celular, correo: c.correo }));
      } else {
        setDatosAnterioresV(null);
        buscarReniecV(formData.dni);
      }
    }
  }, [formData.dni, clientes, initialData]);

  useEffect(() => {
    if (formData.imei1.length >= 14 && !initialData) {
      const e = equipos.find(e => e.idEquipo === formData.imei1);
      if (e) setFormData(prev => ({
        ...prev,
        imei2:           prev.imei2           || e.imei2 || '',
        marca:           prev.marca           || e.marca || '',
        modelo:          prev.modelo          || e.modelo || '',
        nombreComercial: prev.nombreComercial || e.nombreComercial || '',
        sn:              prev.sn              || e.sn || '',
      }));
    }
  }, [formData.imei1, equipos, initialData]);

  const CAMPOS_SOLO_NUMEROS_V = ['dni', 'celular', 'imei1', 'imei2'];
  const CAMPOS_MAYUSCULAS_V   = ['nombre', 'marca', 'modelo', 'nombreComercial', 'sn', 'color'];

  const handleChange = (e) => {
    const { name, value } = e.target;
    let val = value;
    if (CAMPOS_SOLO_NUMEROS_V.includes(name)) val = val.replace(/\D/g, '');
    if (name === 'imei1' || name === 'imei2') val = val.slice(0, 15);
    if (name === 'celular') val = val.slice(0, 9);
    if (CAMPOS_MAYUSCULAS_V.includes(name)) val = val.toUpperCase();
    onDirty?.();
    setFormData(prev => ({ ...prev, [name]: val }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Validar nombre comercial obligatorio
    if (!formData.nombreComercial) {
      showToast('El nombre comercial es obligatorio', 'error'); return;
    }
    if (!luhn(formData.imei1)) {
      showToast('El IMEI 1 no es válido — verifica los dígitos', 'error'); return;
    }
    if (formData.imei2 && !luhn(formData.imei2)) {
      showToast('El IMEI 2 no es válido — verifica los dígitos', 'error'); return;
    }
    // Confirmación final
    const confirmMsg = `¿Los datos son correctos?\n\n👤 Cliente: ${formData.nombre} (DNI: ${formData.dni})\n📱 Equipo: ${formData.marca} ${formData.nombreComercial}\n🔢 IMEI 1: ${formData.imei1}${formData.imei2 ? `\n🔢 IMEI 2: ${formData.imei2}` : ''}${formData.sn ? `\n📟 S/N: ${formData.sn}` : ''}\n💰 Precio: S/. ${parseFloat(formData.precio || 0).toFixed(2)}`;
    if (!window.confirm(confirmMsg)) return;
    setLoading(true);
    try {
      const ventaData = {
        dniCliente: formData.dni, imeiEquipo: formData.imei1,
        imei2Equipo: formData.imei2, sn: formData.sn,
        modeloEquipo: formData.modelo, marcaEquipo: formData.marca,
        nombreComercial: formData.nombreComercial, ram: formData.ram,
        memoria: formData.memoria, color: formData.color, precio: formData.precio,
        fecha: new Date(formData.fecha).toISOString(),
      };
      const clienteData = { dni: formData.dni, nombre: formData.nombre, celular: formData.celular, correo: formData.correo };
      const equipoData = { idEquipo: formData.imei1, idDuenio: formData.dni, imei2: formData.imei2, sn: formData.sn, nombreComercial: formData.nombreComercial, marca: formData.marca, modelo: formData.modelo, ram: formData.ram, memoria: formData.memoria, color: formData.color, isVendido: true };

      if (initialData) {
        await actualizarVenta({
          id: initialData.id,
          cliente: clienteData,
          equipo: equipoData,
          venta: ventaData,
        });
        showToast('Venta actualizada');
      } else {
        const resultado = await crearVenta({
          cliente: clienteData,
          equipo: equipoData,
          venta: ventaData,
        });
        const ventaGuardada = resultado.venta || ventaData;
        showToast('Venta registrada — generando ticket...');
        const tData = { ...ventaGuardada, nombreCliente: formData.nombre, dniCliente: formData.dni, imei2Equipo: formData.imei2, sn: formData.sn };
        setTicketPendienteForm(tData);
        return; // no llamar onSave todavía, se llama desde el modal
      }
      (onSave || onCancel)();
    } catch (error) { console.error(error); showToast('Error al procesar venta', 'error'); } finally { setLoading(false); }
  };

  const [paso, setPaso] = useState(1);
  const [ticketPendienteForm, setTicketPendienteForm] = useState(null);

  const validarPaso1V = () => {
    if (!formData.dni || !formData.nombre) {
      showToast('Completa DNI y nombre', 'error'); return false;
    }
    return true;
  };

  return (
    <div className="saas-form-shell">
      {/* Modal tamaño papel */}
      {ticketPendienteForm && (
        <div className="saas-modal-backdrop fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="saas-detail-modal w-full max-w-xs p-6 text-center">
            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Printer size={22} className="text-purple-600" />
            </div>
            <h3 className="text-base font-bold text-gray-800 mb-1">¿Tamaño de impresora?</h3>
            <p className="text-xs text-gray-400 mb-5">Elige el ancho del papel de tu impresora térmica</p>
            <div className="flex gap-3">
              <button onClick={() => { generarTicketVentaPDF(ticketPendienteForm, 58, logoVentas); setTicketPendienteForm(null); (onSave || onCancel)(); }}
                className="saas-primary flex-1">58 mm</button>
              <button onClick={() => { generarTicketVentaPDF(ticketPendienteForm, 80, logoVentas); setTicketPendienteForm(null); (onSave || onCancel)(); }}
                className="saas-secondary flex-1">80 mm</button>
            </div>
            <button onClick={() => { setTicketPendienteForm(null); (onSave || onCancel)(); }} className="saas-secondary mt-3 w-full">Omitir ticket</button>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="saas-form-header">
        <div>
          <p className="saas-page-kicker">Ventas</p>
          <h3 className="saas-page-title">{initialData ? 'Editar venta' : 'Registrar venta'}</h3>
          <p className="saas-page-desc">Registra cliente, equipo vendido y datos para el ticket.</p>
        </div>
        <button onClick={onCancel} className="saas-form-close"><X size={20}/></button>
      </div>

      {/* Indicador de pasos */}
      <div className="saas-stepper">
        {[1,2].map(n => (
          <React.Fragment key={n}>
            <div className={`flex items-center gap-2 ${paso === n ? 'text-green-600' : paso > n ? 'text-green-600' : 'text-gray-400'}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors
                ${paso === n ? 'border-green-600 bg-green-50 text-green-600' : paso > n ? 'border-green-500 bg-green-50 text-green-600' : 'border-gray-300 text-gray-400'}`}>
                {paso > n ? '✓' : n}
              </div>
              <span className="text-xs font-medium hidden sm:block">{n === 1 ? 'Cliente' : 'Equipo y Precio'}</span>
            </div>
            {n < 2 && <div className={`flex-1 h-0.5 ${paso > n ? 'bg-green-400' : 'bg-gray-200'}`} />}
          </React.Fragment>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="saas-form">

        {/* PASO 1 — DATOS DEL CLIENTE */}
        {paso === 1 && (
          <div className="space-y-4">
            <h4 className="saas-form-section-title">Datos del Cliente</h4>
            {buscandoReniecV && (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
                <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                Consultando RENIEC...
              </div>
            )}
            {datosAnterioresV && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                <p className="font-semibold mb-1">⚠ Cliente existente — datos anteriores registrados:</p>
                {datosAnterioresV.celular && <p>📱 Celular anterior: <span className="font-mono font-bold">{datosAnterioresV.celular}</span></p>}
                {datosAnterioresV.correo  && <p>✉ Correo anterior: <span className="font-mono font-bold">{datosAnterioresV.correo}</span></p>}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="block text-xs text-gray-500 mb-1">DNI *</label><input name="dni" value={formData.dni} onChange={handleChange} className="w-full border rounded p-2 text-sm" inputMode="numeric" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Nombre *</label><input name="nombre" value={formData.nombre} onChange={handleChange} className="w-full border rounded p-2 text-sm" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Celular</label><input name="celular" value={formData.celular} onChange={handleChange} className="w-full border rounded p-2 text-sm" inputMode="numeric" maxLength={9} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Correo</label><input type="email" name="correo" value={formData.correo} onChange={handleChange} className="w-full border rounded p-2 text-sm" /></div>
            </div>
            <div className="flex justify-between pt-4 border-t">
              <button type="button" onClick={onCancel} className="saas-secondary">Cancelar</button>
              <button type="button" onClick={() => validarPaso1V() && setPaso(2)} className="saas-primary">Siguiente</button>
            </div>
          </div>
        )}

        {/* PASO 2 — EQUIPO Y PRECIO */}
        {paso === 2 && (
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h4 className="saas-form-section-title border-b-0 pb-0">Equipo y Precio</h4>
              <button type="button" onClick={() => setMostrarEscaner(true)} className="saas-secondary"><ScanBarcode size={14}/> Escanear</button>
            </div>
            {mostrarEscaner && <EscanerIA onResult={onEscaneo} onClose={() => setMostrarEscaner(false)} />}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">IMEI 1 *</label>
                <input required name="imei1" value={formData.imei1} onChange={handleChange}
                  className={`w-full border rounded p-2 text-sm font-mono ${formData.imei1.length === 15 ? (luhn(formData.imei1) ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50') : ''}`} />
                {formData.imei1.length === 15 && (
                  <p className={`text-xs mt-1 font-medium ${luhn(formData.imei1) ? 'text-green-600' : 'text-red-600'}`}>
                    {luhn(formData.imei1) ? '✓ IMEI válido' : '✗ IMEI inválido — verifica los dígitos'}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">IMEI 2</label>
                <input name="imei2" value={formData.imei2} onChange={handleChange}
                  className={`w-full border rounded p-2 text-sm font-mono ${formData.imei2.length === 15 ? (luhn(formData.imei2) ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50') : ''}`} />
                {formData.imei2.length === 15 && (
                  <p className={`text-xs mt-1 font-medium ${luhn(formData.imei2) ? 'text-green-600' : 'text-red-600'}`}>
                    {luhn(formData.imei2) ? '✓ IMEI válido' : '✗ IMEI inválido — verifica los dígitos'}
                  </p>
                )}
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">N° de Serie</label><input name="sn" value={formData.sn} onChange={handleChange} className="w-full border rounded p-2 text-sm font-mono" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Nombre Comercial *</label><input required name="nombreComercial" value={formData.nombreComercial} onChange={handleChange} className="w-full border rounded p-2 text-sm" placeholder="Ej: GALAXY A56" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Marca</label><input name="marca" value={formData.marca} onChange={handleChange} className="w-full border rounded p-2 text-sm" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Modelo</label><input name="modelo" value={formData.modelo} onChange={handleChange} className="w-full border rounded p-2 text-sm" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">RAM (GB)</label><input name="ram" value={formData.ram} onChange={handleChange} className="w-full border rounded p-2 text-sm" placeholder="ej: 8" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Memoria (GB)</label><input name="memoria" value={formData.memoria} onChange={handleChange} className="w-full border rounded p-2 text-sm" placeholder="ej: 256" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Color</label><input name="color" value={formData.color} onChange={handleChange} className="w-full border rounded p-2 text-sm" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Precio (S/.) *</label><input required type="number" step="0.01" name="precio" value={formData.precio} onChange={handleChange} className="w-full border rounded p-2 text-sm font-bold text-green-700" /></div>
              <div className="sm:col-span-2"><label className="block text-xs text-gray-500 mb-1">Fecha y hora *</label><input required type="datetime-local" name="fecha" value={formData.fecha} onChange={handleChange} className="w-full border rounded p-2 text-sm" /></div>
            </div>

            {/* Resumen completo para confirmar */}
            <div className="saas-summary space-y-2 text-sm">
              <p className="font-semibold text-green-800 mb-1">Verifica que los datos sean correctos:</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
                <span className="font-medium text-gray-700">Cliente:</span><span>{formData.nombre}</span>
                <span className="font-medium text-gray-700">DNI:</span><span>{formData.dni}</span>
                <span className="font-medium text-gray-700">Equipo:</span><span>{formData.marca} {formData.nombreComercial}</span>
                <span className="font-medium text-gray-700">Modelo:</span><span>{formData.modelo}</span>
                <span className="font-medium text-gray-700">IMEI 1:</span><span className="font-mono">{formData.imei1}</span>
                {formData.imei2 && <><span className="font-medium text-gray-700">IMEI 2:</span><span className="font-mono">{formData.imei2}</span></>}
                {formData.sn && <><span className="font-medium text-gray-700">S/N:</span><span className="font-mono">{formData.sn}</span></>}
                {formData.memoria && <><span className="font-medium text-gray-700">Memoria:</span><span>{formData.memoria} GB</span></>}
                {formData.color && <><span className="font-medium text-gray-700">Color:</span><span>{formData.color}</span></>}
                <span className="font-medium text-gray-700">Precio:</span><span className="text-green-700 font-bold">S/. {parseFloat(formData.precio || 0).toFixed(2)}</span>
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t">
              <button type="button" onClick={() => setPaso(1)} className="saas-secondary">Atras</button>
              <button type="submit" disabled={loading} className="saas-primary disabled:opacity-60">
                {loading ? 'Guardando...' : 'Confirmar y guardar'}
              </button>
            </div>
          </div>
        )}

      </form>
    </div>
  );
}


// ============================================================================
// MÓDULO: CLIENTES Y EQUIPOS
// ============================================================================

