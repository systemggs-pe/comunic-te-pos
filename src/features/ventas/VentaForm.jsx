import React, { useState, useEffect } from 'react';
import { Menu, X, Home, ShoppingCart, ClipboardList, Plus, Search, Edit, Trash2, Printer, Copy, Eye, CheckCircle2, AlertCircle, Users, ScanBarcode, UploadCloud, ChevronDown, ChevronUp, LogOut, FileText, Share2, Settings, ImagePlus } from 'lucide-react';
import { actualizarVenta, consultarReniecDni, crearVenta, guardarBoletaExtranjera, obtenerMensajeErrorFuncion } from '../../services/functionsClient.js';
import { luhn } from '../../utils/imei.js';
import {TIPOS_DOCUMENTO, etiquetaDocumento, limpiarDocumento, placeholderDocumento, validarDocumento} from '../../utils/documentos.js';
import { EscanerIA } from '../registros/EscanerIA.jsx';
import { penToClp, formatClp } from '../../utils/currency.js';
import {getBoletaExtranjeraEmisor} from '../../config/boletaExtranjera.js';
import {buscarBoletaPorVenta, crearBoletaDataDesdeVentas, fechaBoletaDesdeVentas, formatearChipBoleta} from '../boletas/boletaHelpers.js';
import { generarBoletaExtranjera, generarBoletaExtranjera2, generarBoletaExtranjera3 } from '../boletas/boletaPdf.js';
import { generarTicketVentaPDF } from './ventaPdf.js';

const MONEY_RE = /^\d+(\.\d{1,2})?$/;
const clean = value => String(value || '').trim();
const SCAN_LOADING_INPUT_CLASS = 'bg-blue-50/70 placeholder:text-blue-700 placeholder:font-semibold';
const uniqueClean = values => Array.from(new Set(values.map(clean).filter(Boolean)));
const opcionesContacto = (cliente, campoPrincipal, campoLista) => uniqueClean([
  cliente?.[campoPrincipal],
  ...(Array.isArray(cliente?.[campoLista]) ? cliente[campoLista] : []),
]);
const createAccessoryItem = () => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  nombre: '',
  cantidad: '1',
  precio: '',
});

export function VentaForm({ clientes, equipos, boletasExtranjeras = [], boletaEmisoresConfig, logoVentas, initialData, onCancel, onSave, onDirty, showToast }) {
  const [loading, setLoading] = useState(false);

  const toLocalDatetimeValue = (isoString) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [formData, setFormData] = useState({ tipoDocumento: 'DNI', dni: '', nombre: '', celular: '', correo: '', imei1: '', imei2: '', sn: '', nombreComercial: '', ram: '', memoria: '', marca: '', modelo: '', color: '', precio: '', medioPago: 'EFECTIVO', fecha: toLocalDatetimeValue(new Date().toISOString()) });
  const [itemsAdicionales, setItemsAdicionales] = useState([]);
  const [confirmarGuardado, setConfirmarGuardado] = useState(false);
  const [cierreVenta, setCierreVenta] = useState(null);
  const [modalBoletaVenta, setModalBoletaVenta] = useState(null);
  const [imprimiendoBoletaVenta, setImprimiendoBoletaVenta] = useState(false);

  useEffect(() => {
    if (initialData) {
      const cliente = clientes.find(c => c.dni === initialData.dniCliente) || {};
      setFormData({ tipoDocumento: initialData.tipoDocumentoCliente || cliente.tipoDocumento || 'DNI', dni: initialData.dniCliente || '', nombre: cliente.nombre || '', celular: cliente.celular || '', correo: cliente.correo || '', imei1: initialData.imeiEquipo || '', imei2: '', sn: '', nombreComercial: initialData.nombreComercial || '', ram: initialData.ram || '', memoria: initialData.memoria || '', marca: initialData.marcaEquipo || '', modelo: initialData.modeloEquipo || '', color: initialData.color || '', precio: initialData.precioEquipo || initialData.precio || '', medioPago: initialData.medioPago || 'EFECTIVO', fecha: toLocalDatetimeValue(initialData.fecha) });
      setItemsAdicionales(Array.isArray(initialData.itemsAdicionales)
        ? initialData.itemsAdicionales.map(item => ({...createAccessoryItem(), ...item}))
        : []);
      const e = equipos.find(eq => eq.idEquipo === initialData.imeiEquipo);
      if (e) setFormData(prev => ({...prev, imei2: e.imei2||'', sn: e.sn||'', nombreComercial: e.nombreComercial||'', ram: e.ram||'', memoria: e.memoria||'', color: e.color||''}));
    }
  }, [initialData, clientes, equipos]);

  const [mostrarEscaner, setMostrarEscaner] = useState(false);
  const [escaneoProcesando, setEscaneoProcesando] = useState(false);
  const [buscandoReniecV, setBuscandoReniecV] = useState(false);
  const [dniStatusV, setDniStatusV] = useState(null);
  const [contactosClienteV, setContactosClienteV] = useState({celulares: [], correos: []});

  const buscarReniecV = async (dni) => {
    setBuscandoReniecV(true);
    setDniStatusV({type: 'loading', text: 'Buscando...'});
    try {
      const json = await consultarReniecDni(dni);
      if (json.success && json.result) {
        const r = json.result;
        setFormData(prev => ({
          ...prev,
          nombre: r.full_name ? r.full_name : prev.nombre,
          correo: r.email && !r.email.includes('*') ? r.email : prev.correo,
        }));
        setDniStatusV({type: 'reniec', text: 'Encontrado RENIEC'});
      } else {
        setDniStatusV(null);
        showToast('DNI no encontrado en RENIEC', 'error');
      }
    } catch (e) {
      console.error('RENIEC error:', e);
      setDniStatusV(null);
      showToast(obtenerMensajeErrorFuncion(e, 'Error al consultar RENIEC'), 'error');
    } finally {
      setBuscandoReniecV(false);
    }
  };

  const onEscaneo = (datos) => {
    setMostrarEscaner(false);
    setEscaneoProcesando(false);
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
    const campos = [datos.imei1, datos.marca, datos.nombreComercial, datos.ram, datos.memoria, datos.color].filter(Boolean).join(' · ');
    showToast(campos ? `✓ ${campos}` : 'Sin datos — rellena manualmente', campos ? 'success' : 'error');
  };

  const onEscaneoProcesando = () => {
    setMostrarEscaner(false);
    setEscaneoProcesando(true);
  };

  const onEscaneoError = mensaje => {
    setEscaneoProcesando(false);
    showToast(mensaje || 'No se pudo extraer datos de la caja', 'error');
  };

  useEffect(() => {
    if (formData.dni.length >= 6 && !initialData) {
      const c = clientes.find(c => c.dni === formData.dni);
      if (c) {
        const celulares = opcionesContacto(c, 'celular', 'celulares');
        const correos = opcionesContacto(c, 'correo', 'correos');
        setContactosClienteV({celulares, correos});
        setDniStatusV({type: 'db', text: 'Cliente COMUNIC@TE'});
        setFormData(prev => ({
          ...prev,
          nombre: c.nombre || prev.nombre,
          celular: prev.celular || celulares[0] || '',
          correo: prev.correo || correos[0] || '',
        }));
      } else {
        setContactosClienteV({celulares: [], correos: []});
        if (formData.tipoDocumento === 'DNI' && formData.dni.length === 8) buscarReniecV(formData.dni);
        else setDniStatusV(null);
      }
    } else if (!initialData && formData.dni.length < 6) {
      setDniStatusV(null);
      setContactosClienteV({celulares: [], correos: []});
    }
  }, [formData.dni, formData.tipoDocumento, clientes, initialData]);

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
        ram:             prev.ram             || e.ram || '',
        memoria:         prev.memoria         || e.memoria || '',
        color:           prev.color           || e.color || '',
      }));
    }
  }, [formData.imei1, equipos, initialData]);

  const CAMPOS_SOLO_NUMEROS_V = ['dni', 'celular', 'imei1', 'imei2'];
  const CAMPOS_MAYUSCULAS_V   = ['nombre', 'marca', 'modelo', 'nombreComercial', 'sn', 'color'];

  const handleChange = (e) => {
    const { name, value } = e.target;
    let val = value;
    if (name === 'tipoDocumento') {
      onDirty?.();
      setDniStatusV(null);
      setContactosClienteV({celulares: [], correos: []});
      setFormData(prev => ({ ...prev, tipoDocumento: val, dni: limpiarDocumento(prev.dni, val) }));
      return;
    }
    if (name === 'dni') val = limpiarDocumento(val, formData.tipoDocumento);
    else if (CAMPOS_SOLO_NUMEROS_V.includes(name)) val = val.replace(/\D/g, '');
    if (name === 'imei1' || name === 'imei2') val = val.slice(0, 15);
    if (name === 'celular') val = val.slice(0, 9);
    if (CAMPOS_MAYUSCULAS_V.includes(name)) val = val.toUpperCase();
    onDirty?.();
    setFormData(prev => ({ ...prev, [name]: val }));
  };

  const handleAccessoryChange = (id, field, value) => {
    let val = value;
    if (field === 'nombre') val = val.toUpperCase();
    if (field === 'cantidad') val = val.replace(/\D/g, '').slice(0, 3);
    if (field === 'precio') {
      val = val.replace(',', '.');
      if (val && !/^\d*\.?\d{0,2}$/.test(val)) return;
    }
    onDirty?.();
    setItemsAdicionales(prev => prev.map(item => item.id === id ? {...item, [field]: val} : item));
  };

  const agregarAccesorio = () => {
    onDirty?.();
    setItemsAdicionales(prev => [...prev, createAccessoryItem()]);
  };

  const quitarAccesorio = (id) => {
    onDirty?.();
    setItemsAdicionales(prev => prev.filter(item => item.id !== id));
  };

  const obtenerItemsVenta = () => {
    const items = itemsAdicionales
      .map(item => ({
        nombre: clean(item.nombre).toUpperCase(),
        cantidad: clean(item.cantidad || '1'),
        precio: clean(item.precio),
      }))
      .filter(item => item.nombre || item.precio || item.cantidad !== '1');

    for (const item of items) {
      if (!item.nombre) {
        showToast('Completa el nombre del accesorio', 'error');
        return null;
      }
      if (!/^\d+$/.test(item.cantidad) || Number(item.cantidad) <= 0) {
        showToast('La cantidad del accesorio debe ser mayor a 0', 'error');
        return null;
      }
      if (!MONEY_RE.test(item.precio) || Number(item.precio) <= 0) {
        showToast('El precio del accesorio debe ser mayor a 0', 'error');
        return null;
      }
    }

    return items;
  };

  const calcularTotalItems = (items) => items.reduce((total, item) => (
    total + (Number(item.cantidad || 1) * Number(item.precio || 0))
  ), 0);

  const validarVentaCompleta = () => {
    if (!formData.nombreComercial) {
      showToast('El nombre comercial es obligatorio', 'error'); return false;
    }
    if (!validarDocumento(formData.tipoDocumento, formData.dni)) {
      showToast(`${etiquetaDocumento(formData.tipoDocumento)} no valido`, 'error'); return false;
    }
    if (!luhn(formData.imei1)) {
      showToast('El IMEI 1 no es válido — verifica los dígitos', 'error'); return false;
    }
    if (formData.imei2 && !luhn(formData.imei2)) {
      showToast('El IMEI 2 no es válido — verifica los dígitos', 'error'); return false;
    }
    if (!MONEY_RE.test(clean(formData.precio)) || Number(formData.precio) <= 0) {
      showToast('El precio del equipo debe ser mayor a 0', 'error'); return false;
    }
    return Boolean(obtenerItemsVenta());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validarVentaCompleta()) return;
    setConfirmarGuardado(true);
  };

  const guardarVenta = async () => {
    const itemsVenta = obtenerItemsVenta();
    if (!itemsVenta) return;
    setConfirmarGuardado(false);
    setLoading(true);
    try {
      const precioEquipo = Number(formData.precio || 0);
      const totalItems = calcularTotalItems(itemsVenta);
      const totalVenta = (precioEquipo + totalItems).toFixed(2);
      const ventaData = {
        tipoDocumentoCliente: formData.tipoDocumento,
        dniCliente: formData.dni, imeiEquipo: formData.imei1,
        imei2Equipo: formData.imei2, sn: formData.sn,
        modeloEquipo: formData.modelo, marcaEquipo: formData.marca,
        nombreComercial: formData.nombreComercial, ram: formData.ram,
        memoria: formData.memoria, color: formData.color, precio: formData.precio,
        precioEquipo: precioEquipo.toFixed(2), itemsAdicionales: itemsVenta, medioPago: formData.medioPago,
        fecha: new Date(formData.fecha).toISOString(),
      };
      ventaData.precio = totalVenta;
      const clienteData = { tipoDocumento: formData.tipoDocumento, dni: formData.dni, nombre: formData.nombre, celular: formData.celular, correo: formData.correo };
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
        showToast('Venta registrada');
        const tData = { ...ventaGuardada, tipoDocumentoCliente: formData.tipoDocumento, nombreCliente: formData.nombre, dniCliente: formData.dni, imei2Equipo: formData.imei2, sn: formData.sn, marcaEquipo: formData.marca, modeloEquipo: formData.modelo, nombreComercial: formData.nombreComercial, ram: formData.ram, memoria: formData.memoria, color: formData.color, precioEquipo: precioEquipo.toFixed(2), precio: totalVenta, itemsAdicionales: itemsVenta, medioPago: formData.medioPago, fecha: ventaGuardada.fecha || ventaData.fecha };
        setCierreVenta({venta: tData, cliente: clienteData, equipo: equipoData});
        return; // el cierre operativo decide ticket, boleta o finalizar
      }
      (onSave || onCancel)();
    } catch (error) { console.error(error); showToast(obtenerMensajeErrorFuncion(error, 'Error al procesar venta'), 'error'); } finally { setLoading(false); }
  };
  const finalizarCierreVenta = () => {
    setCierreVenta(null);
    setModalBoletaVenta(null);
    (onSave || onCancel)();
  };

  const imprimirTicketCierre = (ancho) => {
    if (!cierreVenta?.venta) return;
    generarTicketVentaPDF(cierreVenta.venta, ancho, logoVentas);
    showToast(`Ticket ${ancho} mm generado`, 'success');
  };

  const abrirBoletaDesdeVenta = () => {
    if (!cierreVenta?.venta) return;
    const existente = buscarBoletaPorVenta(boletasExtranjeras, cierreVenta.venta, cierreVenta.equipo);
    if (existente) {
      showToast(`${formatearChipBoleta(existente)} ya fue generada para este equipo`, 'error');
      return;
    }

    const totalClp = penToClp(cierreVenta.venta.precio || 0);
    const boletaData = crearBoletaDataDesdeVentas({
      cliente: cierreVenta.cliente,
      ventasSeleccionadas: [cierreVenta.venta],
      equipos: [cierreVenta.equipo],
      totalClp,
      fechaHora: fechaBoletaDesdeVentas([cierreVenta.venta], cierreVenta.venta.fecha || new Date()),
    });
    setModalBoletaVenta(boletaData);
  };

  const imprimirBoletaDesdeVenta = async formato => {
    if (!modalBoletaVenta || imprimiendoBoletaVenta) return;
    setImprimiendoBoletaVenta(true);
    const boletaData = {
      cliente: modalBoletaVenta.cliente,
      ventas: modalBoletaVenta.ventas,
      equiposMap: modalBoletaVenta.equiposMap,
      totalClp: modalBoletaVenta.totalClp,
      fechaHora: modalBoletaVenta.fechaHora,
      emisor: getBoletaExtranjeraEmisor(boletaEmisoresConfig, formato),
    };

    try {
      const saved = await guardarBoletaExtranjera({
        action: 'save',
        formato,
        boletaData: JSON.parse(JSON.stringify(boletaData)),
      });
      boletaData.nBoleta = saved.boleta?.nBoleta || boletaData.nBoleta;
      boletaData.emisor = saved.boleta?.boletaData?.emisor || boletaData.emisor;

      if (formato === 1) await generarBoletaExtranjera(boletaData);
      else if (formato === 2) await generarBoletaExtranjera2(boletaData);
      else await generarBoletaExtranjera3(boletaData);

      showToast(`Boleta extranjera F${formato} N°${boletaData.nBoleta || '-'} generada`, 'success');
      finalizarCierreVenta();
    } catch (error) {
      console.error(error);
      showToast(obtenerMensajeErrorFuncion(error, 'No se pudo generar la boleta extranjera'), 'error');
    } finally {
      setImprimiendoBoletaVenta(false);
    }
  };

  const [paso, setPaso] = useState(1);

  const placeholderEscaneo = (campo, fallback = '') => (
    escaneoProcesando && !formData[campo] ? 'Extrayendo...' : fallback
  );
  const claseEscaneo = campo => (
    escaneoProcesando && !formData[campo] ? SCAN_LOADING_INPUT_CLASS : ''
  );

  const validarPaso1V = () => {
    if (!validarDocumento(formData.tipoDocumento, formData.dni) || !formData.nombre) {
      showToast(`Completa ${etiquetaDocumento(formData.tipoDocumento)} y nombre`, 'error'); return false;
    }
    return true;
  };

  const totalAccesoriosPreview = calcularTotalItems(itemsAdicionales);
  const totalVentaPreview = (Number(formData.precio || 0) + totalAccesoriosPreview).toFixed(2);

  return (
    <div className="saas-form-shell">
      {/* Cierre operativo de venta */}
      {cierreVenta && (
        <div className="saas-modal-backdrop fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="saas-detail-modal w-full max-w-md p-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50 text-emerald-700">
              <CheckCircle2 size={22} />
            </div>
            <h3 className="text-base font-bold text-gray-800 mb-1">Venta registrada</h3>
            <p className="text-xs text-gray-500 mb-5">Elige el comprobante que quieres generar para esta venta.</p>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => imprimirTicketCierre(58)} className="saas-secondary justify-center"><Printer size={16}/> Ticket 58 mm</button>
              <button type="button" onClick={() => imprimirTicketCierre(80)} className="saas-secondary justify-center"><Printer size={16}/> Ticket 80 mm</button>
            </div>
            <button type="button" onClick={abrirBoletaDesdeVenta} className="saas-primary mt-3 w-full justify-center"><FileText size={16}/> Generar boleta extranjera</button>
            <button type="button" onClick={finalizarCierreVenta} className="saas-secondary mt-3 w-full justify-center">Finalizar sin boleta</button>
          </div>
        </div>
      )}
      {modalBoletaVenta && (
        <div className="saas-modal-backdrop fixed inset-0 z-[220] flex items-center justify-center p-4">
          <div className="saas-detail-modal w-full max-w-sm p-6">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-700">
              <FileText size={22} />
            </div>
            <h3 className="text-center text-base font-bold text-gray-800 mb-1">Boleta extranjera</h3>
            <p className="text-center text-xs text-gray-500 mb-2">Fecha: {new Date(modalBoletaVenta.fechaHora).toLocaleDateString('es-PE')}</p>
            <p className="text-center text-xs text-gray-500 mb-5">Total CLP aprox. ${formatClp(Number(modalBoletaVenta.totalClp || 0))}</p>
            <div className="space-y-3">
              <button type="button" disabled={imprimiendoBoletaVenta} onClick={() => imprimirBoletaDesdeVenta(1)} className="saas-primary w-full justify-center disabled:opacity-60">Formato 1</button>
              <button type="button" disabled={imprimiendoBoletaVenta} onClick={() => imprimirBoletaDesdeVenta(2)} className="saas-secondary w-full justify-center disabled:opacity-60">Formato 2</button>
              <button type="button" disabled={imprimiendoBoletaVenta} onClick={() => imprimirBoletaDesdeVenta(3)} className="saas-secondary w-full justify-center disabled:opacity-60">Formato 3</button>
            </div>
            <button type="button" disabled={imprimiendoBoletaVenta} onClick={() => setModalBoletaVenta(null)} className="saas-secondary mt-4 w-full justify-center disabled:opacity-60">Cancelar</button>
          </div>
        </div>
      )}
      {confirmarGuardado && (
        <div className="saas-modal-backdrop fixed inset-0 z-[210] flex items-center justify-center p-4">
          <div className="saas-detail-modal w-full max-w-sm p-6 text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50 text-emerald-700">
              <CheckCircle2 size={22} />
            </div>
            <h3 className="text-base font-semibold text-slate-900">¿Los datos que pusiste son correctos?</h3>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setConfirmarGuardado(false)} className="saas-secondary">Revisar</button>
              <button type="button" onClick={guardarVenta} disabled={loading} className="saas-primary disabled:opacity-60">
                {loading ? 'Guardando...' : 'Sí, guardar'}
              </button>
            </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Documento *</label>
                <div className="grid grid-cols-[112px_1fr] gap-2">
                  <select name="tipoDocumento" value={formData.tipoDocumento} onChange={handleChange} className="rounded border border-slate-200 bg-white p-2 text-sm">
                    {TIPOS_DOCUMENTO.map(tipo => <option key={tipo.value} value={tipo.value}>{tipo.label}</option>)}
                  </select>
                  <div className="relative min-w-0">
                    <input name="dni" value={formData.dni} onChange={handleChange} className="w-full border rounded p-2 pr-36 text-sm" inputMode={formData.tipoDocumento === 'DNI' || formData.tipoDocumento === 'RUC' ? 'numeric' : 'text'} placeholder={placeholderDocumento(formData.tipoDocumento)} />
                  {dniStatusV && (
                    <span className={`absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold ${
                      dniStatusV.type === 'db' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                    }`}>
                      {buscandoReniecV && <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-300 border-t-transparent" />}
                      {dniStatusV.text}
                    </span>
                  )}
                  </div>
                </div>
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">Nombre *</label><input name="nombre" value={formData.nombre} onChange={handleChange} className="w-full border rounded p-2 text-sm" /></div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Celular</label>
                <input name="celular" value={formData.celular} onChange={handleChange} className="w-full border rounded p-2 text-sm" inputMode="numeric" maxLength={9} />
                {contactosClienteV.celulares.length > 1 && (
                  <select value={formData.celular} onChange={e => setFormData(prev => ({...prev, celular: e.target.value}))} className="mt-2 w-full rounded border border-slate-200 bg-slate-50 p-2 text-xs">
                    {contactosClienteV.celulares.map(celular => <option key={celular} value={celular}>{celular}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Correo</label>
                <input type="email" name="correo" value={formData.correo} onChange={handleChange} className="w-full border rounded p-2 text-sm" />
                {contactosClienteV.correos.length > 1 && (
                  <select value={formData.correo} onChange={e => setFormData(prev => ({...prev, correo: e.target.value}))} className="mt-2 w-full rounded border border-slate-200 bg-slate-50 p-2 text-xs">
                    {contactosClienteV.correos.map(correo => <option key={correo} value={correo}>{correo}</option>)}
                  </select>
                )}
              </div>
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
            {mostrarEscaner && (
              <EscanerIA
                onResult={onEscaneo}
                onClose={() => setMostrarEscaner(false)}
                onProcessingStart={onEscaneoProcesando}
                onError={onEscaneoError}
              />
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {escaneoProcesando && (
                <div className="sm:col-span-2 flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-300 border-t-blue-700" />
                  Extrayendo datos de la caja del equipo...
                </div>
              )}
              <div>
                <label className="block text-xs text-gray-500 mb-1">IMEI 1 *</label>
                <input required name="imei1" value={formData.imei1} onChange={handleChange}
                  className={`w-full border rounded p-2 text-sm font-mono ${claseEscaneo('imei1')} ${formData.imei1.length === 15 ? (luhn(formData.imei1) ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50') : ''}`}
                  placeholder={placeholderEscaneo('imei1', '15 digitos')} />
                {formData.imei1.length === 15 && (
                  <p className={`text-xs mt-1 font-medium ${luhn(formData.imei1) ? 'text-green-600' : 'text-red-600'}`}>
                    {luhn(formData.imei1) ? '✓ IMEI válido' : '✗ IMEI inválido — verifica los dígitos'}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">IMEI 2</label>
                <input name="imei2" value={formData.imei2} onChange={handleChange}
                  className={`w-full border rounded p-2 text-sm font-mono ${claseEscaneo('imei2')} ${formData.imei2.length === 15 ? (luhn(formData.imei2) ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50') : ''}`}
                  placeholder={placeholderEscaneo('imei2')} />
                {formData.imei2.length === 15 && (
                  <p className={`text-xs mt-1 font-medium ${luhn(formData.imei2) ? 'text-green-600' : 'text-red-600'}`}>
                    {luhn(formData.imei2) ? '✓ IMEI válido' : '✗ IMEI inválido — verifica los dígitos'}
                  </p>
                )}
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">N° de Serie</label><input name="sn" value={formData.sn} onChange={handleChange} className={`w-full border rounded p-2 text-sm font-mono ${claseEscaneo('sn')}`} placeholder={placeholderEscaneo('sn')} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Nombre Comercial *</label><input required name="nombreComercial" value={formData.nombreComercial} onChange={handleChange} className={`w-full border rounded p-2 text-sm ${claseEscaneo('nombreComercial')}`} placeholder={placeholderEscaneo('nombreComercial', 'Ej: GALAXY A56')} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Marca</label><input name="marca" value={formData.marca} onChange={handleChange} className={`w-full border rounded p-2 text-sm ${claseEscaneo('marca')}`} placeholder={placeholderEscaneo('marca')} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Modelo</label><input name="modelo" value={formData.modelo} onChange={handleChange} className={`w-full border rounded p-2 text-sm ${claseEscaneo('modelo')}`} placeholder={placeholderEscaneo('modelo')} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">RAM (GB)</label><input name="ram" value={formData.ram} onChange={handleChange} className={`w-full border rounded p-2 text-sm ${claseEscaneo('ram')}`} placeholder={placeholderEscaneo('ram', 'ej: 8')} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Memoria (GB)</label><input name="memoria" value={formData.memoria} onChange={handleChange} className={`w-full border rounded p-2 text-sm ${claseEscaneo('memoria')}`} placeholder={placeholderEscaneo('memoria', 'ej: 256')} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Color</label><input name="color" value={formData.color} onChange={handleChange} className={`w-full border rounded p-2 text-sm ${claseEscaneo('color')}`} placeholder={placeholderEscaneo('color')} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Precio (S/.) *</label><input required type="number" step="0.01" name="precio" value={formData.precio} onChange={handleChange} className="w-full border rounded p-2 text-sm font-bold text-green-700" /></div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Medio de pago *</label>
                <select required name="medioPago" value={formData.medioPago} onChange={handleChange} className="w-full border rounded p-2 text-sm">
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                  <option value="TARJETA">Tarjeta</option>
                </select>
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">Fecha y hora *</label><input required type="datetime-local" name="fecha" value={formData.fecha} onChange={handleChange} className="w-full border rounded p-2 text-sm" /></div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Accesorios</p>
                  <p className="text-xs text-slate-500">Agrega cargador, mica, funda u otro item de la venta.</p>
                </div>
                <button type="button" onClick={agregarAccesorio} className="saas-secondary shrink-0"><Plus size={14}/> Item</button>
              </div>
              {itemsAdicionales.length > 0 && (
                <div className="mt-3 space-y-2">
                  {itemsAdicionales.map(item => (
                    <div key={item.id} className="grid grid-cols-[1fr_72px_96px_36px] gap-2 max-sm:grid-cols-2">
                      <input
                        value={item.nombre}
                        onChange={e => handleAccessoryChange(item.id, 'nombre', e.target.value)}
                        className="rounded border border-slate-200 bg-white p-2 text-sm max-sm:col-span-2"
                        placeholder="Accesorio"
                      />
                      <input
                        value={item.cantidad}
                        onChange={e => handleAccessoryChange(item.id, 'cantidad', e.target.value)}
                        className="rounded border border-slate-200 bg-white p-2 text-sm"
                        inputMode="numeric"
                        placeholder="Cant."
                      />
                      <input
                        value={item.precio}
                        onChange={e => handleAccessoryChange(item.id, 'precio', e.target.value)}
                        className="rounded border border-slate-200 bg-white p-2 text-sm"
                        inputMode="decimal"
                        placeholder="Precio"
                      />
                      <button type="button" onClick={() => quitarAccesorio(item.id)} className="saas-icon-button max-sm:justify-self-end" aria-label="Quitar accesorio">
                        <Trash2 size={16}/>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 text-sm">
                <span className="font-medium text-slate-600">Total venta</span>
                <span className="font-bold text-emerald-700">S/. {totalVentaPreview}</span>
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

