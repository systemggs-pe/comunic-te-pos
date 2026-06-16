import React, { useState, useEffect, useRef } from 'react';
import { Menu, X, Home, ShoppingCart, ClipboardList, Plus, Search, Edit, Trash2, Printer, Copy, Eye, CheckCircle2, AlertCircle, Users, ScanBarcode, UploadCloud, ChevronDown, ChevronUp, LogOut, FileText, Share2, Settings, ImagePlus } from 'lucide-react';
import {collection, onSnapshot, orderBy, query} from 'firebase/firestore';
import { consultarReniecDni, guardarBoletaExtranjera } from '../../services/functionsClient.js';
import { luhn } from '../../utils/imei.js';
import { penToClp, formatClp } from '../../utils/currency.js';
import { toLocalDatetimeValueBoleta } from '../../utils/dates.js';
import {getBoletaExtranjeraEmisor} from '../../config/boletaExtranjera.js';
import { EscanerIA } from '../registros/EscanerIA.jsx';
import { generarBoletaExtranjera, generarBoletaExtranjera2, generarBoletaExtranjera3 } from './boletaPdf.js';
import {appId, db} from '../../lib/firebase.js';

const boletasRef = collection(db, 'artifacts', appId, 'users', 'shared', 'boletasExtranjeras');
const limpiarParaFirestore = data => JSON.parse(JSON.stringify(data));
const emptyForm = { nombre: '', rut: '', imei1: '', imei2: '', sn: '', marca: '', modelo: '', nombreComercial: '', memoria: '', color: '', precio: '' };

const normalizarImeiBoleta = value => {
  const imei = String(value || '').replace(/\D/g, '').slice(0, 15);
  return /^\d{15}$/.test(imei) ? imei : '';
};

const obtenerImeisBoletaData = boletaData => {
  const ventas = Array.isArray(boletaData?.ventas) ? boletaData.ventas : [];
  const keysFromVentas = new Set();
  ventas.forEach(venta => {
    const imei1 = normalizarImeiBoleta(venta?.imeiEquipo);
    const imei2 = normalizarImeiBoleta(venta?.imei2Equipo);
    if (imei1) keysFromVentas.add(imei1);
    if (imei2) keysFromVentas.add(imei2);

    const equipo = imei1 ? boletaData?.equiposMap?.[imei1] : null;
    const imei2Equipo = normalizarImeiBoleta(equipo?.imei2);
    if (imei2Equipo) keysFromVentas.add(imei2Equipo);
  });

  if (keysFromVentas.size) return Array.from(keysFromVentas);

  const keysFromMap = new Set();
  if (boletaData?.equiposMap && typeof boletaData.equiposMap === 'object' && !Array.isArray(boletaData.equiposMap)) {
    Object.entries(boletaData.equiposMap).forEach(([key, equipo]) => {
      const imei1 = normalizarImeiBoleta(key);
      const imei2 = normalizarImeiBoleta(equipo?.imei2);
      if (imei1) keysFromMap.add(imei1);
      if (imei2) keysFromMap.add(imei2);
    });
  }
  return Array.from(keysFromMap);
};

const obtenerImeisBoletaGuardada = boleta => {
  const dataKeys = obtenerImeisBoletaData(boleta?.boletaData);
  if (dataKeys.length) return dataKeys;

  const stored = Array.isArray(boleta?.boletaEquipoKeys)
    ? boleta.boletaEquipoKeys.map(normalizarImeiBoleta).filter(Boolean)
    : [];
  return Array.from(new Set([
    ...stored,
    normalizarImeiBoleta(boleta?.boletaEquipoKey),
  ].filter(Boolean)));
};

const resumirImeisBoleta = boleta => {
  const imeis = obtenerImeisBoletaGuardada(boleta);
  if (imeis.length <= 2) return imeis.join(' / ');
  return `${imeis.slice(0, 2).join(' / ')} / +${imeis.length - 2}`;
};

const crearEquiposMapDesdeVentas = (ventasSeleccionadas, equipos) => {
  const equiposPorImei = new Map(equipos.map(equipo => [equipo.idEquipo, equipo]));
  return ventasSeleccionadas.reduce((map, venta) => {
    const imei = normalizarImeiBoleta(venta?.imeiEquipo);
    if (!imei) return map;

    const equipo = equiposPorImei.get(imei) || {};
    map[imei] = {
      ...equipo,
      imei2: equipo.imei2 || venta.imei2Equipo || '',
      sn: equipo.sn || venta.sn || '',
      marca: equipo.marca || venta.marcaEquipo || '',
      modelo: equipo.modelo || venta.modeloEquipo || '',
      nombreComercial: equipo.nombreComercial || venta.nombreComercial || '',
      memoria: equipo.memoria || venta.memoria || '',
      color: equipo.color || venta.color || '',
    };
    return map;
  }, {});
};

const normalizarTextoBoleta = value => String(value || '').trim().replace(/\s+/g, ' ');

const formatearMemoriaBoleta = value => {
  const memoria = normalizarTextoBoleta(value).toUpperCase();
  if (!memoria) return '';
  return /\b(GB|TB|MB)\b/.test(memoria) ? memoria : `${memoria}GB`;
};

const nombreEquipoBoleta = (venta, data) => {
  const imei = normalizarImeiBoleta(venta?.imeiEquipo);
  const equipo = imei ? data?.equiposMap?.[imei] || {} : {};
  const marca = venta?.marcaEquipo || equipo.marca || '';
  const nombre = equipo.nombreComercial || venta?.nombreComercial || venta?.modeloEquipo || equipo.modelo || '';
  const memoria = formatearMemoriaBoleta(venta?.memoria || equipo.memoria);
  return normalizarTextoBoleta([marca, nombre, memoria].filter(Boolean).join(' '));
};

const obtenerResumenEquipoBoleta = boleta => {
  const data = boleta?.boletaData || {};
  const ventas = Array.isArray(data.ventas) ? data.ventas : [];
  const nombres = ventas.map(venta => nombreEquipoBoleta(venta, data)).filter(Boolean);

  if (!nombres.length && data.equiposMap && typeof data.equiposMap === 'object' && !Array.isArray(data.equiposMap)) {
    Object.entries(data.equiposMap).forEach(([imei, equipo]) => {
      const nombre = normalizarTextoBoleta([
        equipo?.marca,
        equipo?.nombreComercial || equipo?.modelo,
        formatearMemoriaBoleta(equipo?.memoria),
      ].filter(Boolean).join(' '));
      if (nombre || normalizarImeiBoleta(imei)) nombres.push(nombre || `IMEI ${normalizarImeiBoleta(imei)}`);
    });
  }

  const unicos = Array.from(new Set(nombres));
  if (unicos.length <= 1) return unicos[0] || '';
  return `${unicos[0]} +${unicos.length - 1} equipos`;
};

const crearBoletaDataDesdeForm = (form, fechaHora, totalClp) => ({
  cliente: { nombre: form.nombre, dni: form.rut },
  ventas: [{
    imeiEquipo: form.imei1,
    imei2Equipo: form.imei2,
    sn: form.sn,
    marcaEquipo: form.marca,
    nombreComercial: form.nombreComercial,
    modeloEquipo: form.modelo,
    precio: form.precio,
    color: form.color,
    memoria: form.memoria,
  }],
  equiposMap: {
    [form.imei1]: {
      imei2: form.imei2,
      sn: form.sn,
      marca: form.marca,
      modelo: form.modelo,
      color: form.color,
      memoria: form.memoria,
      nombreComercial: form.nombreComercial,
    },
  },
  totalClp,
  fechaHora,
});

const formDesdeBoleta = boleta => {
  const data = boleta?.boletaData || {};
  const venta = Array.isArray(data.ventas) ? data.ventas[0] || {} : {};
  const imei1 = normalizarImeiBoleta(venta.imeiEquipo) || obtenerImeisBoletaGuardada(boleta)[0] || '';
  const equipo = data.equiposMap?.[imei1] || {};
  return {
    nombre: data.cliente?.nombre || boleta?.clienteNombre || '',
    rut: data.cliente?.dni || boleta?.clienteDni || '',
    imei1,
    imei2: normalizarImeiBoleta(equipo.imei2 || venta.imei2Equipo),
    sn: equipo.sn || venta.sn || '',
    marca: venta.marcaEquipo || equipo.marca || '',
    modelo: venta.modeloEquipo || equipo.modelo || '',
    nombreComercial: venta.nombreComercial || equipo.nombreComercial || '',
    memoria: venta.memoria || equipo.memoria || '',
    color: venta.color || equipo.color || '',
    precio: String(venta.precio || boleta?.totalPen || ''),
  };
};

export function BoletaExtranjera({ clientes, equipos, ventas, boletaEmisoresConfig, showToast, onSearchVentas, searchingVentas = false }) {
  const [modo, setModo] = useState('buscar');
  const [fechaHora, setFechaHora] = useState(toLocalDatetimeValueBoleta(new Date()));
  const [modalBoleta, setModalBoleta] = useState(null);
  const [boletaExistentePrompt, setBoletaExistentePrompt] = useState(null);
  const [boletaEnEdicion, setBoletaEnEdicion] = useState(null);
  const [historialBoletas, setHistorialBoletas] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(true);
  const [imprimiendoBoleta, setImprimiendoBoleta] = useState(false);
  const imprimiendoBoletaRef = useRef(false);

  useEffect(() => {
    const q = query(boletasRef, orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      setHistorialBoletas(snap.docs.map(doc => ({id: doc.id, ...doc.data()})));
      setCargandoHistorial(false);
    }, error => {
      console.error('Error historial boletas:', error);
      setCargandoHistorial(false);
      showToast('No se pudo cargar historial de boletas', 'error');
    });
  }, [showToast]);

  // ── MODO BUSCAR ──
  const [searchDni, setSearchDni] = useState('');
  const [clienteEncontrado, setClienteEncontrado] = useState(null);
  const [ventasCliente, setVentasCliente] = useState([]);
  const [seleccionadas, setSeleccionadas] = useState(new Set());
  const [buscandoVentas, setBuscandoVentas] = useState(false);

  const buscar = async () => {
    const dni = searchDni.trim();
    if (!dni) { showToast('Ingresa el DNI del cliente', 'error'); return; }

    setBuscandoVentas(true);
    try {
      const ventasHistoricas = onSearchVentas ? await onSearchVentas(dni) : [];
      const ventasMap = new Map();
      [...ventas, ...(Array.isArray(ventasHistoricas) ? ventasHistoricas : [])].forEach(venta => {
        if (venta?.id) ventasMap.set(venta.id, venta);
      });
      const vs = Array.from(ventasMap.values())
        .filter(v => v.dniCliente === dni)
        .sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
      const clienteBase = clientes.find(c => c.dni === dni);
      if (!clienteBase && vs.length === 0) { showToast('Cliente no encontrado', 'error'); return; }

      const cliente = clienteBase || {
        dni,
        tipoDocumento: vs[0]?.tipoDocumentoCliente || 'DNI',
        nombre: vs[0]?.nombreCliente || dni,
        celular: vs[0]?.celularCliente || '',
      };

      if (vs.length === 0) showToast('Cliente encontrado, pero no tiene ventas registradas', 'error');

      setClienteEncontrado(cliente);
      setVentasCliente(vs);
      setSeleccionadas(new Set(vs.map(v => v.id)));
    } catch (error) {
      console.error(error);
      showToast('No se pudo buscar ventas antiguas', 'error');
    } finally {
      setBuscandoVentas(false);
    }
  };

  const toggleVenta = (id) => {
    setSeleccionadas(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };

  const ventasSel = ventasCliente.filter(v => seleccionadas.has(v.id));
  const totalPen  = ventasSel.reduce((s, v) => s + parseFloat(v.precio || 0), 0);
  const totalClp  = penToClp(totalPen);

  const fechaDesdeVentas = (ventasSeleccionadas) => {
    const fechas = ventasSeleccionadas
      .map(venta => new Date(venta.fecha || 0))
      .filter(date => !Number.isNaN(date.getTime()))
      .sort((a, b) => b - a);
    if (!fechas.length) return fechaHora;
    const fecha = new Date(fechas[0]);
    fecha.setDate(fecha.getDate() - 1);
    return toLocalDatetimeValueBoleta(fecha);
  };

  const buscarBoletaExistente = (boletaData, excludeId = '') => {
    const imeis = new Set(obtenerImeisBoletaData(boletaData));
    if (!imeis.size) return null;

    return historialBoletas.find(boleta => {
      if (excludeId && boleta.id === excludeId) return false;
      return obtenerImeisBoletaGuardada(boleta).some(imei => imeis.has(imei));
    }) || null;
  };

  const abrirSelectorFormato = (boletaData, opciones = {}) => {
    setModalBoleta({
      ...boletaData,
      historialId: opciones.historialId || null,
      guardarHistorial: opciones.guardarHistorial !== false,
      editando: Boolean(opciones.editando),
    });
  };

  const prepararBoleta = (boletaData, opciones = {}) => {
    const existente = buscarBoletaExistente(boletaData, opciones.historialId || '');
    if (existente) {
      setBoletaExistentePrompt({boleta: existente, draft: boletaData, opciones});
      return;
    }
    abrirSelectorFormato(boletaData, opciones);
  };

  const editarBoletaExistente = boleta => {
    setBoletaExistentePrompt(null);
    setBoletaEnEdicion(boleta);
    setForm(formDesdeBoleta(boleta));
    setFechaHora(toLocalDatetimeValueBoleta(boleta.boletaData?.fechaHora || boleta.fechaHora || new Date()));
    setModo('nueva');
    showToast('Edita los datos y vuelve a imprimir la boleta', 'success');
  };

  const cancelarEdicionBoleta = () => {
    setBoletaEnEdicion(null);
    setForm({...emptyForm});
  };

  const imprimirBoleta = async (data, formato) => {
    if (imprimiendoBoletaRef.current) return;
    imprimiendoBoletaRef.current = true;
    setImprimiendoBoleta(true);

    const boletaData = {
      cliente: data.cliente,
      ventas: data.ventas,
      equiposMap: data.equiposMap,
      totalClp: data.totalClp,
      fechaHora: data.fechaHora,
      nBoleta: data.nBoleta || data.boletaData?.nBoleta || null,
      emisor: data.emisor || data.boletaData?.emisor || getBoletaExtranjeraEmisor(boletaEmisoresConfig, formato),
    };

    try {
      if (data.guardarHistorial) {
        const saved = await guardarBoletaExtranjera({
          action: data.historialId ? 'update' : 'save',
          historialId: data.historialId || '',
          formato,
          boletaData: limpiarParaFirestore(boletaData),
        });
        boletaData.nBoleta = saved.boleta?.nBoleta || boletaData.nBoleta;
        boletaData.emisor = saved.boleta?.boletaData?.emisor || boletaData.emisor;
        if (data.historialId) setBoletaEnEdicion(null);
      } else if (!boletaData.nBoleta && data.nBoleta) {
        boletaData.nBoleta = data.nBoleta;
      }

      setModalBoleta(null);
      if (formato === 1) await generarBoletaExtranjera(boletaData);
      else if (formato === 2) await generarBoletaExtranjera2(boletaData);
      else await generarBoletaExtranjera3(boletaData);
      showToast(data.guardarHistorial ? (data.historialId ? 'Boleta actualizada e impresa' : 'Boleta guardada e impresa') : 'Boleta reimpresa', 'success');
    } catch (error) {
      console.error(error);
      if (error.message === 'BOLETA_EQUIPO_YA_EXISTE') {
        const duplicateId = error.payload?.details?.boletaId || error.payload?.boletaId || '';
        const boleta = historialBoletas.find(item => item.id === duplicateId);
        if (boleta) setBoletaExistentePrompt({boleta, draft: boletaData, opciones: {}});
        showToast('Ese equipo ya tiene una boleta extranjera', 'error');
      } else {
        showToast('No se pudo guardar o imprimir la boleta', 'error');
      }
    } finally {
      imprimiendoBoletaRef.current = false;
      setImprimiendoBoleta(false);
    }
  };

  const emitirDesdeVentas = () => {
    if (!clienteEncontrado || ventasSel.length === 0) { showToast('Selecciona al menos una venta', 'error'); return; }
    const equiposMap = crearEquiposMapDesdeVentas(ventasSel, equipos);
    prepararBoleta({ cliente: clienteEncontrado, ventas: ventasSel, equiposMap, totalClp, fechaHora: fechaDesdeVentas(ventasSel) });
  };

  // ── MODO NUEVA BOLETA MANUAL ──
  const [mostrarEscanerBoleta, setMostrarEscanerBoleta] = useState(false);
  const [escaneoBoletaProcesando, setEscaneoBoletaProcesando] = useState(false);
  const [form, setForm] = useState({...emptyForm});
  const [buscandoReniecBoleta, setBuscandoReniecBoleta] = useState(false);

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    let v = value;
    if (['imei1','imei2'].includes(name)) v = v.replace(/\D/g,'').slice(0,15);
    if (name === 'rut') v = v.replace(/\D/g,'').slice(0,8);
    if (['nombre','marca','modelo','nombreComercial','color'].includes(name)) v = v.toUpperCase();
    setForm(prev => ({ ...prev, [name]: v }));
  };

  useEffect(() => {
    if (form.rut.length !== 8) return;

    const clienteExistente = clientes.find(c => c.dni === form.rut);
    if (clienteExistente) {
      setForm(prev => ({ ...prev, nombre: clienteExistente.nombre || prev.nombre }));
      return;
    }

    let activo = true;
    const buscarNombre = async () => {
      setBuscandoReniecBoleta(true);
      try {
        const json = await consultarReniecDni(form.rut);
        if (!activo) return;
        if (json.success && json.result?.full_name) {
          setForm(prev => ({ ...prev, nombre: json.result.full_name.toUpperCase() }));
          showToast('✓ Nombre encontrado por DNI', 'success');
        } else {
          showToast('DNI no encontrado', 'error');
        }
      } catch (e) {
        console.error('RENIEC boleta error:', e);
        const mensaje = e.message === 'RENIEC_TOKEN_MISSING'
          ? 'Falta configurar token RENIEC'
          : e.message === 'BACKEND_NOT_DEPLOYED'
            ? 'Backend no desplegado: abre la app desde el servidor Node'
          : e.message === 'BACKEND_INVALID_RESPONSE'
            ? 'Respuesta invalida de Netlify Functions'
          : e.message === 'BACKEND_NOT_DEPLOYED'
            ? 'Funciones Netlify no desplegadas'
            : 'Error al consultar DNI';
        if (activo) showToast(mensaje, 'error');
      } finally {
        if (activo) setBuscandoReniecBoleta(false);
      }
    };

    buscarNombre();
    return () => { activo = false; };
  }, [form.rut, clientes]);

  const onEscanerBoleta = (datos) => {
    setMostrarEscanerBoleta(false);
    setEscaneoBoletaProcesando(false);
    setForm(prev => ({
      ...prev,
      imei1:           datos.imei1           || prev.imei1,
      imei2:           datos.imei2           || prev.imei2,
      sn:              datos.sn              || prev.sn,
      marca:           datos.marca           || prev.marca,
      modelo:          datos.modelo          || prev.modelo,
      nombreComercial: datos.nombreComercial || prev.nombreComercial,
      memoria:         datos.memoria         || prev.memoria,
      color:           datos.color           || prev.color,
    }));
    const campos = [datos.marca, datos.nombreComercial, datos.imei1].filter(Boolean).join(' · ');
    showToast(campos ? `✓ ${campos}` : 'Escaneado — revisa campos', campos ? 'success' : 'error');
  };

  const onEscanerBoletaProcesando = () => {
    setMostrarEscanerBoleta(false);
    setEscaneoBoletaProcesando(true);
  };

  const onEscanerBoletaError = mensaje => {
    setEscaneoBoletaProcesando(false);
    showToast(mensaje || 'No se pudo extraer datos de la caja', 'error');
  };

  const emitirNueva = () => {
    if (!form.nombre || !form.rut || !form.imei1 || !form.precio) {
      showToast('Completa nombre, RUT, IMEI y precio', 'error'); return;
    }
    if (!luhn(form.imei1)) {
      showToast('El IMEI 1 no es válido — verifica los dígitos', 'error'); return;
    }
    if (form.imei2 && !luhn(form.imei2)) {
      showToast('El IMEI 2 no es válido — verifica los dígitos', 'error'); return;
    }
    const clpVal = penToClp(form.precio);
    prepararBoleta(crearBoletaDataDesdeForm(form, fechaHora, clpVal), {
      historialId: boletaEnEdicion?.id || '',
      editando: Boolean(boletaEnEdicion),
    });
  };

  const equipoPromptExistente = obtenerResumenEquipoBoleta(boletaExistentePrompt?.boleta);
  const imeisPromptExistente = boletaExistentePrompt ? resumirImeisBoleta(boletaExistentePrompt.boleta) : '';

  return (
    <div className="saas-boleta-page space-y-4">
      {/* Modal selección tipo de boleta */}
      {modalBoleta && (
        <div className="saas-modal-backdrop fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="saas-detail-modal w-full max-w-sm p-6">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <FileText size={22} className="text-blue-600" />
            </div>
            <h3 className="text-base font-bold text-gray-800 text-center mb-1">¿Qué boleta deseas generar?</h3>
            <p className="text-xs text-gray-400 text-center mb-5">Selecciona el formato según tu impresora</p>
            <div className="space-y-3">
              <button
                type="button"
                disabled={imprimiendoBoleta}
                onClick={() => imprimirBoleta(modalBoleta, 1)}
                className="saas-primary w-full flex-col py-3.5 disabled:cursor-not-allowed disabled:opacity-60">
                <span>Boleta 1</span>
                <span className="text-xs font-normal opacity-80">Formato térmico 48mm — Roberto Pizarro</span>
              </button>
              <button
                type="button"
                disabled={imprimiendoBoleta}
                onClick={() => imprimirBoleta(modalBoleta, 2)}
                className="saas-secondary w-full flex-col py-3.5 disabled:cursor-not-allowed disabled:opacity-60">
                <span>Boleta 2</span>
                <span className="text-xs font-normal opacity-80">Formato 80mm — Álvaro Pizarro · PDF417</span>
              </button>
              <button
                type="button"
                disabled={imprimiendoBoleta}
                onClick={() => imprimirBoleta(modalBoleta, 3)}
                className="saas-secondary w-full flex-col py-3.5 disabled:cursor-not-allowed disabled:opacity-60">
                <span>Boleta 3</span>
                <span className="text-xs font-normal opacity-80">BOLETA PIZARRO VILLARROEL #3</span>
              </button>
            </div>
            <button type="button" disabled={imprimiendoBoleta} onClick={() => setModalBoleta(null)} className="saas-secondary mt-4 w-full disabled:cursor-not-allowed disabled:opacity-60">Cancelar</button>
          </div>
        </div>
      )}
      {boletaExistentePrompt && (
        <div className="saas-modal-backdrop fixed inset-0 z-[210] flex items-center justify-center p-4">
          <div className="saas-detail-modal w-full max-w-md p-6">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
              <AlertCircle size={22} className="text-amber-700" />
            </div>
            <h3 className="mb-1 text-center text-base font-bold text-slate-900">Este equipo ya tiene boleta</h3>
            <p className="mb-4 text-center text-xs font-medium text-slate-500">No se puede generar otra boleta para el mismo IMEI. Puedes editar la boleta existente.</p>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <p className="font-semibold text-slate-900">{boletaExistentePrompt.boleta.clienteNombre || 'Cliente sin nombre'}</p>
              <p className="mt-1 text-xs text-slate-500">Nro {boletaExistentePrompt.boleta.nBoleta || '-'} / DNI {boletaExistentePrompt.boleta.clienteDni || '-'}</p>
              {equipoPromptExistente && (
                <p className="mt-1 text-sm font-semibold text-slate-800">Equipo: {equipoPromptExistente}</p>
              )}
              <p className="mt-1 font-mono text-xs text-slate-600">IMEI {imeisPromptExistente || '-'}</p>
              <p className="mt-2 text-xs font-semibold text-emerald-700">${formatClp(Number(boletaExistentePrompt.boleta.totalClp || 0))} CLP / S/. {Number(boletaExistentePrompt.boleta.totalPen || 0).toFixed(2)}</p>
            </div>
            <div className="mt-5 grid gap-2">
              <button type="button" onClick={() => editarBoletaExistente(boletaExistentePrompt.boleta)} className="saas-primary w-full">
                <Edit size={16} /> Editar boleta existente
              </button>
              <button type="button" onClick={() => setBoletaExistentePrompt(null)} className="saas-secondary w-full">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Header + tabs */}
      <div className="saas-boleta-card">
        <div className="saas-boleta-header">
          <div>
            <p className="saas-page-kicker">Boleta extranjera</p>
            <h2 className="saas-page-title flex items-center gap-2"><FileText size={20} className="text-blue-600"/> Boleta Extranjera (Chile)</h2>
            <p className="saas-page-desc">Genera boletas desde ventas existentes o con datos manuales.</p>
          </div>
        </div>
        <div className="p-5">

        {/* Fecha y hora de emisión */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Fecha y hora de emisión</label>
          <input
            type="datetime-local"
            value={fechaHora}
            onChange={e => setFechaHora(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div className="saas-segmented mb-5">
          <button onClick={() => setModo('buscar')} data-active={modo === 'buscar'}>
            Buscar por DNI
          </button>
          <button onClick={() => setModo('nueva')} data-active={modo === 'nueva'}>
            Nueva Boleta
          </button>
          <button onClick={() => setModo('historial')} data-active={modo === 'historial'}>
            Historial
          </button>
        </div>

        {/* ── MODO BUSCAR ── */}
        {modo === 'buscar' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input value={searchDni} onChange={e => setSearchDni(e.target.value.replace(/\D/g,''))}
                onKeyDown={e => e.key === 'Enter' && buscar()}
                placeholder="DNI del cliente..." inputMode="numeric"
                className="flex-1 min-w-0" />
              <button onClick={buscar} disabled={buscandoVentas || searchingVentas} className="saas-primary disabled:cursor-not-allowed disabled:opacity-60">
                <Search size={16}/> {buscandoVentas || searchingVentas ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
            {(buscandoVentas || searchingVentas) && (
              <p className="text-xs text-blue-600">Buscando tambien en ventas antiguas...</p>
            )}

            {clienteEncontrado && (
              <>
                <div className="bg-gray-50 rounded-lg p-3 border text-sm">
                  <p className="font-semibold text-gray-800">{clienteEncontrado.nombre}</p>
                  <p className="text-gray-500 text-xs">DNI: {clienteEncontrado.dni} · {clienteEncontrado.celular || 'Sin celular'}</p>
                </div>

                {ventasCliente.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-4">Este cliente no tiene ventas registradas.</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase">Selecciona equipos a incluir:</p>
                    {ventasCliente.map(v => {
                      const eq = equipos.find(e => e.idEquipo === v.imeiEquipo) || {};
                      const clp = penToClp(v.precio);
                      return (
                        <label key={v.id} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${seleccionadas.has(v.id) ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                          <input type="checkbox" checked={seleccionadas.has(v.id)} onChange={() => toggleVenta(v.id)} className="mt-0.5" />
                          <div className="flex-1 text-sm">
                            <p className="font-medium text-gray-800">{v.marcaEquipo} {eq.nombreComercial || v.nombreComercial || v.modeloEquipo}</p>
                            <p className="text-xs text-gray-500 font-mono">IMEI: {v.imeiEquipo}</p>
                            {eq.memoria && <p className="text-xs text-gray-500">{eq.memoria}GB · {eq.color || ''}</p>}
                            <p className="text-xs text-gray-600 mt-1">S/. {parseFloat(v.precio).toFixed(2)} → <span className="font-semibold text-green-700">${formatClp(clp)} CLP</span></p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}

                {ventasSel.length > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500">Total</p>
                      <p className="font-bold text-green-700">${formatClp(totalClp)} CLP</p>
                      <p className="text-xs text-gray-400">S/. {totalPen.toFixed(2)} PEN</p>
                    </div>
                    <button onClick={emitirDesdeVentas} className="saas-primary">
                      <Printer size={16}/> Emitir Boleta
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── MODO NUEVA BOLETA ── */}
        {modo === 'nueva' && (
          <div className="space-y-4">
            {mostrarEscanerBoleta && (
              <EscanerIA
                onResult={onEscanerBoleta}
                onClose={() => setMostrarEscanerBoleta(false)}
                onProcessingStart={onEscanerBoletaProcesando}
                onError={onEscanerBoletaError}
              />
            )}

            {boletaEnEdicion && (
              <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm">
                <p className="font-semibold text-amber-900">Editando boleta Nro {boletaEnEdicion.nBoleta || '-'}</p>
                <p className="mt-1 text-xs font-medium text-amber-800">Los cambios se guardaran sobre esta boleta y luego se imprimira el nuevo PDF.</p>
              </div>
            )}

            {/* Cliente */}
            <p className="text-xs font-semibold text-gray-500 uppercase border-b pb-1">Datos del Cliente</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-gray-500 mb-1">Nombre *</label><input name="nombre" value={form.nombre} onChange={handleFormChange} className="w-full border rounded p-2 text-sm" placeholder="NOMBRE COMPLETO"/></div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">RUT (DNI) *</label>
                <input name="rut" value={form.rut} onChange={handleFormChange} className="w-full border rounded p-2 text-sm font-mono" placeholder="12345678" inputMode="numeric"/>
                {buscandoReniecBoleta && <p className="text-xs text-blue-600 mt-1">Consultando DNI...</p>}
              </div>
            </div>

            {/* Equipo */}
            <div className="flex justify-between items-center border-b pb-1">
              <p className="text-xs font-semibold text-gray-500 uppercase">Datos del Equipo</p>
              <button type="button" onClick={() => setMostrarEscanerBoleta(true)} className="saas-secondary">
                <ScanBarcode size={13}/> Escanear caja
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {escaneoBoletaProcesando && (
                <div className="col-span-2 flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-300 border-t-blue-700" />
                  Extrayendo datos de la caja del equipo...
                </div>
              )}
              <div>
                <label className="block text-xs text-gray-500 mb-1">IMEI 1 *</label>
                <input name="imei1" value={form.imei1} onChange={handleFormChange}
                  className={`w-full border rounded p-2 text-sm font-mono ${form.imei1.length === 15 ? (luhn(form.imei1) ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50') : ''}`} inputMode="numeric"/>
                {form.imei1.length === 15 && (
                  <p className={`text-xs mt-1 font-medium ${luhn(form.imei1) ? 'text-green-600' : 'text-red-600'}`}>
                    {luhn(form.imei1) ? '✓ IMEI válido' : '✗ IMEI inválido — verifica los dígitos'}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">IMEI 2</label>
                <input name="imei2" value={form.imei2} onChange={handleFormChange}
                  className={`w-full border rounded p-2 text-sm font-mono ${form.imei2.length === 15 ? (luhn(form.imei2) ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50') : ''}`} inputMode="numeric"/>
                {form.imei2.length === 15 && (
                  <p className={`text-xs mt-1 font-medium ${luhn(form.imei2) ? 'text-green-600' : 'text-red-600'}`}>
                    {luhn(form.imei2) ? '✓ IMEI válido' : '✗ IMEI inválido — verifica los dígitos'}
                  </p>
                )}
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">N° Serie (S/N)</label><input name="sn" value={form.sn} onChange={handleFormChange} className="w-full border rounded p-2 text-sm font-mono"/></div>
              <div><label className="block text-xs text-gray-500 mb-1">Marca</label><input name="marca" value={form.marca} onChange={handleFormChange} className="w-full border rounded p-2 text-sm"/></div>
              <div><label className="block text-xs text-gray-500 mb-1">Nombre Comercial</label><input name="nombreComercial" value={form.nombreComercial} onChange={handleFormChange} className="w-full border rounded p-2 text-sm"/></div>
              <div><label className="block text-xs text-gray-500 mb-1">Modelo</label><input name="modelo" value={form.modelo} onChange={handleFormChange} className="w-full border rounded p-2 text-sm"/></div>
              <div><label className="block text-xs text-gray-500 mb-1">Memoria (GB)</label><input name="memoria" value={form.memoria} onChange={handleFormChange} className="w-full border rounded p-2 text-sm" placeholder="256"/></div>
              <div><label className="block text-xs text-gray-500 mb-1">Color</label><input name="color" value={form.color} onChange={handleFormChange} className="w-full border rounded p-2 text-sm"/></div>
            </div>

            {/* Precio */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Precio (S/. PEN) *</label>
              <input name="precio" value={form.precio} onChange={handleFormChange} type="number" step="0.01"
                className="w-full border rounded p-2 text-sm font-bold text-green-700" placeholder="0.00"/>
              {form.precio && <p className="text-xs text-gray-500 mt-1">= <span className="font-semibold text-green-700">${formatClp(penToClp(form.precio))} CLP</span></p>}
            </div>

            <div className="flex justify-between pt-2 border-t gap-3">
              <button onClick={() => boletaEnEdicion ? cancelarEdicionBoleta() : setForm({...emptyForm})} className="saas-secondary">
                {boletaEnEdicion ? 'Cancelar edicion' : 'Limpiar'}
              </button>
              <button onClick={emitirNueva} className="saas-primary flex-1">
                <Printer size={16}/> {boletaEnEdicion ? 'Actualizar e imprimir' : 'Generar Boleta'}
              </button>
            </div>
          </div>
        )}

        {modo === 'historial' && (
          <div className="space-y-3">
            {cargandoHistorial ? (
              <div className="saas-empty py-10">
                <p className="text-sm">Cargando historial...</p>
              </div>
            ) : historialBoletas.length === 0 ? (
              <div className="saas-empty py-10">
                <FileText size={40} strokeWidth={1.4} />
                <p className="text-sm font-semibold">Sin boletas guardadas</p>
                <p className="text-xs">Las boletas apareceran aqui despues de imprimirlas.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                {historialBoletas.map(boleta => {
                  const equipoPreview = obtenerResumenEquipoBoleta(boleta);
                  const imeisPreview = resumirImeisBoleta(boleta);
                  return (
                    <div key={boleta.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{boleta.clienteNombre || 'Cliente sin nombre'}</p>
                        {equipoPreview && (
                          <p className="mt-1 truncate text-sm font-semibold text-slate-800">{equipoPreview}</p>
                        )}
                        <p className="mt-0.5 text-xs text-slate-500">
                          Nro {boleta.nBoleta || '-'} · DNI {boleta.clienteDni || '-'} · {boleta.fechaHora ? new Date(boleta.fechaHora).toLocaleString('es-PE') : 'Sin fecha'}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-emerald-700">
                          ${formatClp(Number(boleta.totalClp || 0))} CLP · S/. {Number(boleta.totalPen || 0).toFixed(2)}
                        </p>
                        <p className="mt-1 truncate font-mono text-xs text-slate-500">
                          IMEI {imeisPreview || '-'}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => editarBoletaExistente(boleta)}
                          className="saas-secondary"
                        >
                          <Edit size={15}/> Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => abrirSelectorFormato({...boleta.boletaData, nBoleta: boleta.nBoleta || boleta.boletaData?.nBoleta}, {historialId: boleta.id, guardarHistorial: false})}
                          className="saas-secondary"
                        >
                          <Printer size={15}/> Reimprimir
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

