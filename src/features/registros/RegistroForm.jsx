import React, { useState, useEffect, useMemo } from 'react';
import { Menu, X, Home, ShoppingCart, ClipboardList, Plus, Search, Edit, Trash2, Printer, Copy, Eye, CheckCircle2, AlertCircle, Users, ScanBarcode, UploadCloud, ChevronDown, ChevronUp, LogOut, FileText, Share2, Settings, ImagePlus } from 'lucide-react';
import { actualizarRegistro, consultarComprobanteApplePorImei, consultarReniecDni, crearRegistro, obtenerMensajeErrorFuncion } from '../../services/functionsClient.js';
import { luhn } from '../../utils/imei.js';
import {TIPOS_DOCUMENTO, etiquetaDocumento, limpiarDocumento, placeholderDocumento, validarDocumento} from '../../utils/documentos.js';
import {PERU_DEPARTAMENTOS, separarDireccionDepartamento, unirDireccionDepartamento} from '../../utils/peruDepartamentos.js';
import { ImageCropModal } from '../../components/ui/ImageCropModal.jsx';
import { EscanerIA } from './EscanerIA.jsx';
import {comprimirRegistroEvidenciaDataUrl, emptyRegistroEvidencias, formatBytes, leerRegistroEvidenciaFile, missingRegistroEvidencias, REGISTRO_EVIDENCIA_FIELDS} from './registroEvidencias.js';
import {generarRegistroEvidenciasPDF} from './registroEvidenciasPdf.js';

const EMAIL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const MONEY_RE = /^\d+(\.\d{1,2})?$/;
const PHONE_RE = /^9\d{8}$/;
const clean = value => String(value || '').trim();
const SCAN_LOADING_INPUT_CLASS = 'bg-blue-50/70 placeholder:text-blue-700 placeholder:font-semibold';
const REGISTRO_MARCAS = ['APPLE', 'SAMSUNG', 'HONOR', 'XIAOMI', 'OPPO', 'VIVO', 'TECNO', 'INFINIX', 'ZTE', 'MOTOROLA', 'PIXEL', 'HTC'];
const APPLE_EVIDENCIA_ORDER = ['dniFrente', 'dniReverso', 'imeiLogico', 'cajaEquipo'];
const normalizarMarcaRegistro = value => {
  const marca = clean(value).toUpperCase();
  return REGISTRO_MARCAS.includes(marca) ? marca : '';
};
const normalizarTieneCaja = value => {
  if (value === true || value === 'SI') return 'SI';
  if (value === false || value === 'NO') return 'NO';
  return '';
};
const emptyComprobanteApple = () => ({imei: '', status: 'idle', boleta: null});
const uniqueClean = values => Array.from(new Set(values.map(clean).filter(Boolean)));
const correosValidos = values => uniqueClean(values)
  .map(correo => correo.toLowerCase())
  .filter(correo => EMAIL_RE.test(correo));
const opcionesContacto = (cliente, campoPrincipal, campoLista) => correosValidos([
  cliente?.[campoPrincipal],
  ...(Array.isArray(cliente?.[campoLista]) ? cliente[campoLista] : []),
]);
const opcionesCelulares = cliente => uniqueClean([
  cliente?.celular,
  cliente?.celularRef,
  ...(Array.isArray(cliente?.celulares) ? cliente.celulares : []),
]);
const debeSincronizarCelularRef = form => !form.celularRef || form.celularRef === form.celular;

export function RegistroForm({ clientes, equipos, registros, initialData, onCancel, onSave, onDirty, showToast }) {
  const [loading, setLoading] = useState(false);
  const [showManualEqForm, setShowManualEqForm] = useState(true);
  const [equiposCliente, setEquiposCliente] = useState([]);
  const [imeiSeleccionado, setImeiSeleccionado] = useState(null); // equipo previo pendiente de elegir IMEI

  // Fuente de verdad: IMEIs que ya tienen registro activo
  const imeisRegistrados = useMemo(() => {
    const set = new Set();
    registros.forEach(r => {
      // Cada movimiento bloquea solo el IMEI que se registró; los datos antiguos usan imeiEquipo.
      const imeiRegistrado = r.imeiRegistrado || r.imeiEquipo;
      if (imeiRegistrado) set.add(imeiRegistrado);
    });
    return set;
  }, [registros]);

  const imeiYaRegistrado = (imei) => {
    if (!imei) return false;
    // Al editar, ignorar únicamente el IMEI exacto del registro actual.
    const imeiActual = initialData?.imeiRegistrado || initialData?.imeiEquipo;
    if (imeiActual === imei) return false;
    return imeisRegistrados.has(imei);
  };

  const toLocalDatetimeValue = (isoString) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [formData, setFormData] = useState({
    tipoDocumento: 'DNI', dni: '', nombre: '', celular: '', celularRef: '', correo: '', direccion: '', departamento: '', imei: '', imei2: '', marca: '', modelo: '', nombreComercial: '', estado: 'NO BLOQUEADO', estadoSolicitud: 'PENDIENTE', operador: 'BITEL', tipo: 'TIENDA', tieneCaja: '', precio: '', fecha: toLocalDatetimeValue(new Date().toISOString())
  });
  const [confirmarGuardado, setConfirmarGuardado] = useState(false);
  const [evidencias, setEvidencias] = useState(() => emptyRegistroEvidencias());
  const [evidenciasProcesando, setEvidenciasProcesando] = useState({});
  const [recorteEvidencia, setRecorteEvidencia] = useState(null);
  const [comprobanteApple, setComprobanteApple] = useState(() => emptyComprobanteApple());
  const [contactosClienteReg, setContactosClienteReg] = useState({celulares: [], correos: []});
  const direccionFinalCliente = useMemo(() => unirDireccionDepartamento(formData.direccion, formData.departamento), [formData.direccion, formData.departamento]);
  const esApple = formData.marca === 'APPLE';
  const comprobanteAppleValido = esApple
    && comprobanteApple.status === 'found'
    && comprobanteApple.imei === formData.imei
    && Boolean(comprobanteApple.boleta?.id);
  const camposEvidenciaVisibles = esApple
    ? APPLE_EVIDENCIA_ORDER.map(key => REGISTRO_EVIDENCIA_FIELDS.find(field => field.key === key)).filter(Boolean)
    : REGISTRO_EVIDENCIA_FIELDS;

  useEffect(() => {
    if (initialData) {
      const cliente = clientes.find(c => c.dni === initialData.dniCliente) || {};
      const eq = equipos.find(e => e.idEquipo === initialData.imeiEquipo || e.imei2 === initialData.imeiRegistrado) || {};
      const direccionCliente = separarDireccionDepartamento(cliente.direccion || '');
      const celulares = opcionesCelulares(cliente);
      const correos = opcionesContacto(cliente, 'correo', 'correos');
      const imeiRegistrado = initialData.imeiRegistrado || initialData.imeiEquipo || '';
      const imeiPrincipal = initialData.imeiEquipo || eq.idEquipo || imeiRegistrado;
      const imeiSecundario = initialData.imei2Equipo || eq.imei2 || '';
      const imeiCompanero = imeiRegistrado === imeiSecundario ? imeiPrincipal : imeiSecundario;
      setContactosClienteReg({celulares, correos});
      setFormData({
        tipoDocumento: initialData.tipoDocumentoCliente || cliente.tipoDocumento || 'DNI', dni: initialData.dniCliente || '', nombre: cliente.nombre || '', celular: initialData.celularCliente || cliente.celular || celulares[0] || '', celularRef: initialData.celularRef || cliente.celularRef || initialData.celularCliente || cliente.celular || '', correo: correos[0] || '', direccion: direccionCliente.direccion, departamento: direccionCliente.departamento, imei: imeiRegistrado, imei2: imeiCompanero, marca: normalizarMarcaRegistro(initialData.marcaEquipo), modelo: initialData.modeloEquipo || '', nombreComercial: initialData.nombreComercialEquipo || '', estado: initialData.estado || 'NO BLOQUEADO', estadoSolicitud: initialData.estado === 'BLOQUEADO' ? '' : (initialData.estadoSolicitud || 'PENDIENTE'), operador: initialData.operador || 'BITEL', tipo: initialData.tipo || 'TIENDA', tieneCaja: normalizarTieneCaja(initialData.tieneCaja), precio: initialData.precio || '', fecha: toLocalDatetimeValue(initialData.fecha)
      });
      if (initialData.boletaExtranjeraId) {
        setComprobanteApple({
          imei: imeiRegistrado,
          status: 'found',
          boleta: {id: initialData.boletaExtranjeraId, nBoleta: initialData.boletaExtranjeraNro || ''},
        });
      }
      setShowManualEqForm(true);
    }
  }, [initialData, clientes, equipos]);







  const [mostrarEscaner, setMostrarEscaner] = useState(false);
  const [escaneoProcesando, setEscaneoProcesando] = useState(false);
  const [buscandoReniec, setBuscandoReniec] = useState(false);
  const [dniStatusReg, setDniStatusReg] = useState(null);

  const buscarReniec = async (dni) => {
    setBuscandoReniec(true);
    setDniStatusReg({type: 'loading', text: 'Buscando...'});
    try {
      const json = await consultarReniecDni(dni);
      if (json.success && json.result) {
        const r = json.result;
        setFormData(prev => ({
          ...prev,
          nombre: r.full_name || prev.nombre,
        }));
        setDniStatusReg({type: 'reniec', text: 'Nombre encontrado en RENIEC'});
      } else {
        setDniStatusReg(null);
        showToast('DNI no encontrado en RENIEC', 'error');
      }
    } catch (e) {
      console.error('RENIEC error:', e);
      setDniStatusReg(null);
      showToast(obtenerMensajeErrorFuncion(e, 'Error al consultar RENIEC'), 'error');
    } finally {
      setBuscandoReniec(false);
    }
  };

  const onEscaneo = (datos) => {
    setMostrarEscaner(false);
    setEscaneoProcesando(false);
    setComprobanteApple(emptyComprobanteApple());
    onDirty?.();
    setFormData(prev => {
      const next = {
        ...prev,
        imei:            datos.imei1           || prev.imei,
        imei2:           datos.imei2           || prev.imei2,
        marca:           normalizarMarcaRegistro(datos.marca) || prev.marca,
        modelo:          datos.modelo          || prev.modelo,
        nombreComercial: datos.nombreComercial || prev.nombreComercial,
      };
      return next;
    });
    const campos = [datos.imei1, datos.marca, datos.nombreComercial].filter(Boolean).join(' · ');
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
      const clienteExistente = clientes.find(c => c.dni === formData.dni);
      if (clienteExistente) {
        const celulares = opcionesCelulares(clienteExistente);
        const correos = opcionesContacto(clienteExistente, 'correo', 'correos');
        const direccionCliente = separarDireccionDepartamento(clienteExistente.direccion || '');
        setContactosClienteReg({celulares, correos});
        setDniStatusReg({type: 'db', text: 'Cliente COMUNIC@TE'});
        setFormData(prev => ({
          ...prev,
          nombre: clienteExistente.nombre || '',
          celular: prev.celular || celulares[0] || '',
          celularRef: prev.celularRef || celulares[0] || '',
          correo: prev.correo || correos[0] || '',
          direccion: direccionCliente.direccion,
          departamento: direccionCliente.departamento || prev.departamento,
        }));
      } else {
        setContactosClienteReg({celulares: [], correos: []});
        if (formData.tipoDocumento === 'DNI' && formData.dni.length === 8) buscarReniec(formData.dni);
        else setDniStatusReg(null);
      }
      const eqsRaw = equipos.filter(e => e.idDuenio === formData.dni);
      // Agrupar duplicados (mismo sn o imei2 cruzado) igual que en ClientesList
      const vistos = new Set();
      const eqsAgrupados = [];
      for (const eq of eqsRaw) {
        if (vistos.has(eq.idEquipo)) continue;
        const gemelo = eqsRaw.find(e =>
          e.idEquipo !== eq.idEquipo && !vistos.has(e.idEquipo) &&
          ((eq.imei2 && e.idEquipo === eq.imei2) || (e.imei2 && eq.idEquipo === e.imei2) || (eq.sn && e.sn && eq.sn === e.sn))
        );
        if (gemelo) {
          const principal = eq.imei2 ? eq : gemelo.imei2 ? gemelo : (eq.idEquipo < gemelo.idEquipo ? eq : gemelo);
          const secundario = principal === eq ? gemelo : eq;
          eqsAgrupados.push({ ...principal, imei2: principal.imei2 || secundario.idEquipo, sn: principal.sn || secundario.sn, imei1Registrado: principal.imei1Registrado || principal.isRegistrado || false, imei2Registrado: secundario.imei2Registrado || secundario.imei1Registrado || secundario.isRegistrado || false, isRegistrado: principal.isRegistrado || secundario.isRegistrado, isVendido: principal.isVendido || secundario.isVendido });
          vistos.add(principal.idEquipo); vistos.add(secundario.idEquipo);
        } else {
          eqsAgrupados.push(eq); vistos.add(eq.idEquipo);
        }
      }
      setEquiposCliente(eqsAgrupados);
      if (eqsAgrupados.length > 0 && !formData.imei) setShowManualEqForm(false);
      else setShowManualEqForm(true);
    } else if (!initialData && formData.dni.length < 6) {
      setEquiposCliente([]);
      setShowManualEqForm(true);
      setDniStatusReg(null);
      setContactosClienteReg({celulares: [], correos: []});
    }
  }, [formData.dni, formData.tipoDocumento, clientes, equipos, initialData]);

  // Cuando escriben el IMEI manualmente, autocompletar solo campos vacíos
  useEffect(() => {
    if (formData.imei.length >= 14 && !initialData) {
      const eq = equipos.find(e => e.idEquipo === formData.imei || e.imei2 === formData.imei);
      if (eq) {
        setFormData(prev => ({
          ...prev,
          imei2:           prev.imei2 || (formData.imei === eq.idEquipo ? (eq.imei2 || '') : eq.idEquipo),
          marca:           prev.marca           || normalizarMarcaRegistro(eq.marca),
          modelo:          prev.modelo          || eq.modelo          || '',
          nombreComercial: prev.nombreComercial || eq.nombreComercial || '',
        }));
      }
    }
  }, [formData.imei, equipos, initialData]);

  const handleEqClick = (eq) => {
    if (eq.imei2) {
      setImeiSeleccionado(eq); // mostrar selector de IMEI
    } else {
      handleConfirmEqSelection(eq, eq.idEquipo);
    }
  };
  const handleConfirmEqSelection = (eq, selectedImei) => {
    setComprobanteApple(emptyComprobanteApple());
    setFormData(prev => ({
      ...prev,
      imei: selectedImei,          // el IMEI exacto que eligió registrar
      imei2: selectedImei === eq.idEquipo ? (eq.imei2 || '') : (eq.idEquipo || ''),
      marca: normalizarMarcaRegistro(eq.marca), modelo: eq.modelo || '',
      nombreComercial: eq.nombreComercial || '',
    }));
    setImeiSeleccionado(null);
    setShowManualEqForm(true);
  };

  const CAMPOS_SOLO_NUMEROS = ['dni', 'celular', 'celularRef', 'imei', 'imei2'];
  const CAMPOS_MAYUSCULAS   = ['nombre', 'marca', 'modelo', 'nombreComercial', 'operador', 'estado', 'estadoSolicitud', 'tipo', 'departamento'];
  const CAMPOS_CORREO       = ['correo'];

  const handleChange = (e) => {
    const { name, value } = e.target;
    let val = value;
    if (name === 'tipoDocumento') {
      onDirty?.();
      setDniStatusReg(null);
      setContactosClienteReg({celulares: [], correos: []});
      setFormData(prev => ({ ...prev, tipoDocumento: val, dni: limpiarDocumento(prev.dni, val) }));
      return;
    }
    if (name === 'dni') val = limpiarDocumento(val, formData.tipoDocumento);
    else if (CAMPOS_SOLO_NUMEROS.includes(name)) val = val.replace(/\D/g, '');
    if (name === 'dni') val = val.slice(0, 8);
    if (name === 'imei' || name === 'imei2') val = val.slice(0, 15);
    if (name === 'celular' || name === 'celularRef') val = val.slice(0, 9);
    if (CAMPOS_MAYUSCULAS.includes(name)) val = val.toUpperCase();
    if (CAMPOS_CORREO.includes(name)) val = val.trim().toLowerCase();
    if (name === 'precio') {
      val = val.replace(',', '.');
      if (val && !/^\d*\.?\d{0,2}$/.test(val)) return;
    }
    if (name === 'tieneCaja' && val === 'NO') {
      setEvidencias(prev => ({...prev, cajaEquipo: null}));
      if (recorteEvidencia?.key === 'cajaEquipo') setRecorteEvidencia(null);
    }
    if (name === 'imei' || name === 'marca') {
      setComprobanteApple(emptyComprobanteApple());
    }
    onDirty?.();
    setFormData(prev => {
      const next = { ...prev, [name]: val };
      if (name === 'celular' && debeSincronizarCelularRef(prev)) next.celularRef = val;
      if (name === 'estado') {
        next.estadoSolicitud = val === 'NO BLOQUEADO'
          ? (prev.estado === 'BLOQUEADO' ? 'REALIZADO' : (prev.estadoSolicitud || 'PENDIENTE'))
          : '';
      }
      return next;
    });
  };

  const validarFormularioCompleto = () => {
    if (!validarDocumento(formData.tipoDocumento, clean(formData.dni))) {
      showToast(`${etiquetaDocumento(formData.tipoDocumento)} no valido`, 'error'); return false;
    }
    if (!clean(formData.nombre)) {
      showToast('Completa el nombre del cliente', 'error'); return false;
    }
    if (!PHONE_RE.test(clean(formData.celular))) {
      showToast('El celular debe tener 9 digitos y empezar con 9', 'error'); return false;
    }
    if (clean(formData.celularRef) && !PHONE_RE.test(clean(formData.celularRef))) {
      showToast('El celular de referencia debe tener 9 digitos y empezar con 9', 'error'); return false;
    }
    if (!clean(formData.direccion)) {
      showToast('La direccion es obligatoria', 'error'); return false;
    }
    if (!clean(formData.departamento)) {
      showToast('Selecciona el departamento', 'error'); return false;
    }
    if (direccionFinalCliente.length > 300) {
      showToast('La direccion final no debe superar 300 caracteres', 'error'); return false;
    }
    if (!EMAIL_RE.test(clean(formData.correo))) {
      showToast('Ingresa un correo electronico valido', 'error'); return false;
    }
    if (!luhn(clean(formData.imei))) {
      showToast('El IMEI ingresado no es valido; verifica los digitos', 'error'); return false;
    }
    if (clean(formData.imei2) && !luhn(clean(formData.imei2))) {
      showToast('El IMEI 2 no es valido; verifica los digitos', 'error'); return false;
    }
    if (!REGISTRO_MARCAS.includes(formData.marca)) {
      showToast('Selecciona una marca de la lista', 'error'); return false;
    }
    if (formData.marca === 'APPLE' && !comprobanteAppleValido) {
      showToast('Primero verifica que el IMEI tenga una boleta extranjera', 'error'); return false;
    }
    if (!clean(formData.modelo)) {
      showToast('Completa el modelo', 'error'); return false;
    }
    if (!clean(formData.nombreComercial)) {
      showToast('El nombre comercial es obligatorio', 'error'); return false;
    }
    if (!normalizarTieneCaja(formData.tieneCaja)) {
      showToast('Indica si el cliente tiene la caja del equipo', 'error'); return false;
    }
    if (!initialData && imeiYaRegistrado(formData.imei)) {
      showToast(`El IMEI ${formData.imei} ya tiene un registro activo`, 'error'); return false;
    }
    const precio = clean(formData.precio);
    if (!MONEY_RE.test(precio) || Number(precio) <= 0) {
      showToast('El precio debe ser mayor a 0 y tener maximo 2 decimales', 'error'); return false;
    }
    if (formData.estado === 'BLOQUEADO' && Number(precio) < 50) {
      showToast('El precio minimo para un equipo BLOQUEADO es S/. 50.00', 'error'); return false;
    }
    if (!formData.fecha || Number.isNaN(new Date(formData.fecha).getTime())) {
      showToast('La fecha no es valida', 'error'); return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validarFormularioCompleto()) return;
    if (!initialData && !validarEvidencias()) return;

    // Validar IMEI con algoritmo de Luhn
    if (!luhn(formData.imei)) {
      showToast('El IMEI ingresado no es válido — verifica los dígitos', 'error');
      return;
    }
    // Bloquear si el IMEI elegido ya tiene un registro activo
    if (!initialData && imeiYaRegistrado(formData.imei)) {
      showToast(`El IMEI ${formData.imei} ya tiene un registro activo`, 'error');
      return;
    }

    // Validar precio mínimo si el estado es BLOQUEADO
    if (formData.estado === 'BLOQUEADO' && parseFloat(formData.precio || 0) < 50) {
      showToast('El precio mínimo para un equipo BLOQUEADO es S/. 50.00', 'error');
      return;
    }

    setConfirmarGuardado(true);
  };

  const validarEvidencias = () => {
    const faltantes = missingRegistroEvidencias(evidencias)
      .filter(item => !(esApple && item.key === 'boletaVenta'));
    if (faltantes.length) {
      showToast(`Falta subir: ${faltantes.map(item => item.label).join(', ')}`, 'error');
      return false;
    }
    return true;
  };

  const guardarEvidenciaProcesada = async (key, dataUrl, name, originalSize) => {
    setEvidenciasProcesando(prev => ({...prev, [key]: true}));
    try {
      const evidencia = await comprimirRegistroEvidenciaDataUrl(dataUrl, name, originalSize);
      setEvidencias(prev => ({...prev, [key]: evidencia}));
      onDirty?.();
    } catch (error) {
      console.error(error);
      showToast('Sube una imagen JPG, PNG o WebP valida', 'error');
    } finally {
      setEvidenciasProcesando(prev => ({...prev, [key]: false}));
    }
  };

  const handleEvidenciaChange = async (key, file) => {
    if (!file) return;
    if (key === 'cajaEquipo' && formData.tieneCaja !== 'SI') return;
    setEvidenciasProcesando(prev => ({...prev, [key]: true}));
    try {
      const imagen = await leerRegistroEvidenciaFile(file);
      const field = REGISTRO_EVIDENCIA_FIELDS.find(item => item.key === key);
      setRecorteEvidencia({key, label: field?.label || 'Evidencia', ...imagen});
    } catch (error) {
      console.error(error);
      showToast('Sube una imagen JPG, PNG o WebP valida', 'error');
    } finally {
      setEvidenciasProcesando(prev => ({...prev, [key]: false}));
    }
  };

  const confirmarRecorteEvidencia = async dataUrl => {
    if (!recorteEvidencia) return;
    const actual = recorteEvidencia;
    setRecorteEvidencia(null);
    await guardarEvidenciaProcesada(actual.key, dataUrl, actual.name, actual.originalSize);
  };

  const usarOriginalEvidencia = async dataUrlAjustada => {
    if (!recorteEvidencia) return;
    const actual = recorteEvidencia;
    setRecorteEvidencia(null);
    await guardarEvidenciaProcesada(actual.key, dataUrlAjustada || actual.dataUrl, actual.name, actual.originalSize);
  };

  const quitarEvidencia = key => {
    setEvidencias(prev => ({...prev, [key]: null}));
    onDirty?.();
  };

  const guardarRegistro = async () => {
    setConfirmarGuardado(false);
    setLoading(true);
    try {
      // Conservar la posición IMEI 1 / IMEI 2 del equipo, aunque se registre el segundo IMEI.
      const eqExistente = equipos.find(e => (
        e.idEquipo === formData.imei
        || e.imei2 === formData.imei
        || e.idEquipo === formData.imei2
        || e.imei2 === formData.imei2
      )) || {};
      const imei1Real = eqExistente.idEquipo || formData.imei;
      const imei2Real = eqExistente.idEquipo
        ? (eqExistente.imei2 || (formData.imei !== eqExistente.idEquipo ? formData.imei : '') || formData.imei2)
        : formData.imei2;

      // Construir datos del registro
      const registroData = {
        tipoDocumentoCliente: formData.tipoDocumento,
        dniCliente: formData.dni, celularCliente: formData.celular,
        celularRef: formData.celularRef || formData.celular,
        imeiEquipo: imei1Real, imeiRegistrado: formData.imei, imei2Equipo: imei2Real,
        modeloEquipo: formData.modelo, marcaEquipo: formData.marca,
        nombreComercialEquipo: formData.nombreComercial,
        estado: formData.estado,
        estadoSolicitud: formData.estado === 'NO BLOQUEADO' ? (formData.estadoSolicitud || 'PENDIENTE') : '',
        operador: formData.operador,
        tipo: formData.tipo, tieneCaja: formData.tieneCaja === 'SI', precio: formData.precio,
        boletaExtranjeraId: esApple ? (comprobanteApple.boleta?.id || '') : '',
        boletaExtranjeraNro: esApple ? String(comprobanteApple.boleta?.nBoleta || '') : '',
        fecha: new Date(formData.fecha).toISOString(),
      };
      const evidenciasParaPdf = formData.tieneCaja === 'SI'
        ? evidencias
        : {...evidencias, cajaEquipo: null};
      const opcionesPdf = esApple
        ? {formatoApple: true, boletaExtranjera: comprobanteApple.boleta}
        : {};
      const hayEvidenciasParaPdf = Object.values(evidenciasParaPdf).some(Boolean);

      const clienteData = {
        dni: formData.dni,
        tipoDocumento: formData.tipoDocumento,
        nombre: formData.nombre,
        celular: formData.celular,
        celularRef: formData.celularRef || formData.celular,
        correo: formData.correo,
        direccion: direccionFinalCliente,
        celulares: uniqueClean([...contactosClienteReg.celulares, formData.celular, formData.celularRef]),
        correos: correosValidos([...contactosClienteReg.correos, formData.correo]),
      };
      const equipoData = {
        idEquipo: imei1Real,
        idDuenio: formData.dni,
        imei2: imei2Real,
        marca: formData.marca,
        modelo: formData.modelo,
        nombreComercial: formData.nombreComercial,
        isRegistrado: true,
        imei1Registrado: formData.imei === imei1Real ? true : (eqExistente.imei1Registrado || false),
        imei2Registrado: formData.imei === imei2Real ? true : (eqExistente.imei2Registrado || false),
      };

      if (initialData) {
        const saved = await actualizarRegistro({
          id: initialData.id,
          cliente: clienteData,
          equipo: equipoData,
          registro: registroData,
        });
        if (hayEvidenciasParaPdf) {
          await generarRegistroEvidenciasPDF({
            ...registroData,
            ...(saved.registro || {}),
            nombreCliente: clienteData.nombre,
            correoCliente: clienteData.correo,
            celularCliente: clienteData.celular,
            celularRef: clienteData.celularRef,
          }, evidenciasParaPdf, opcionesPdf);
        }
        showToast('Actualizado exitosamente');
      } else {
        const saved = await crearRegistro({
          cliente: clienteData,
          equipo: equipoData,
          registro: registroData,
        });
        await generarRegistroEvidenciasPDF({
          ...registroData,
          ...(saved.registro || {}),
          nombreCliente: clienteData.nombre,
          correoCliente: clienteData.correo,
          celularCliente: clienteData.celular,
          celularRef: clienteData.celularRef,
        }, evidenciasParaPdf, opcionesPdf);
        showToast('Guardado exitosamente');
      }
      (onSave || onCancel)();
    } catch (error) {
      console.error(error);
      showToast(obtenerMensajeErrorFuncion(error, 'Error al guardar'), 'error');
    } finally { setLoading(false); }
  };

  const [paso, setPaso] = useState(1);

  const placeholderEscaneo = (campo, fallback = '') => (
    escaneoProcesando && !formData[campo] ? 'Extrayendo...' : fallback
  );
  const claseEscaneo = campo => (
    escaneoProcesando && !formData[campo] ? SCAN_LOADING_INPUT_CLASS : ''
  );

  const validarPaso1 = () => {
    if (!validarDocumento(formData.tipoDocumento, clean(formData.dni))) {
      showToast(`${etiquetaDocumento(formData.tipoDocumento)} no valido`, 'error'); return false;
    }
    if (!clean(formData.nombre)) {
      showToast('Completa el nombre del cliente', 'error'); return false;
    }
    if (!PHONE_RE.test(clean(formData.celular))) {
      showToast('El celular debe tener 9 digitos y empezar con 9', 'error'); return false;
    }
    if (clean(formData.celularRef) && !PHONE_RE.test(clean(formData.celularRef))) {
      showToast('El celular de referencia debe tener 9 digitos y empezar con 9', 'error'); return false;
    }
    if (!formData.direccion.trim()) {
      showToast('La dirección es obligatoria', 'error'); return false;
    }
    if (!clean(formData.departamento)) {
      showToast('Selecciona el departamento', 'error'); return false;
    }
    if (direccionFinalCliente.length > 300) {
      showToast('La direccion final no debe superar 300 caracteres', 'error'); return false;
    }
    if (!EMAIL_RE.test(clean(formData.correo))) {
      showToast('Ingresa un correo electronico valido', 'error'); return false;
    }
    if (!formData.correo.trim()) {
      showToast('El correo electrónico es obligatorio', 'error'); return false;
    }
    return true;
  };
  const validarPaso2 = async () => {
    if (!luhn(clean(formData.imei))) {
      showToast('El IMEI ingresado no es valido; verifica los digitos', 'error'); return false;
    }
    if (clean(formData.imei2) && !luhn(clean(formData.imei2))) {
      showToast('El IMEI 2 no es valido; verifica los digitos', 'error'); return false;
    }
    if (!REGISTRO_MARCAS.includes(formData.marca)) {
      showToast('Selecciona una marca de la lista', 'error'); return false;
    }
    if (!clean(formData.modelo)) {
      showToast('Completa el modelo', 'error'); return false;
    }
    if (!clean(formData.nombreComercial)) {
      showToast('El nombre comercial es obligatorio', 'error'); return false;
    }
    if (imeiYaRegistrado(formData.imei)) {
      showToast(`El IMEI ${formData.imei} ya tiene un registro activo`, 'error'); return false;
    }
    if (formData.marca === 'APPLE') {
      if (comprobanteAppleValido) return true;
      setComprobanteApple({imei: formData.imei, status: 'loading', boleta: null});
      try {
        const result = await consultarComprobanteApplePorImei(formData.imei);
        if (!result?.found || !result.boleta?.id) {
          setComprobanteApple({imei: formData.imei, status: 'not_found', boleta: null});
          showToast('No existe una boleta extranjera para este IMEI APPLE', 'error');
          return false;
        }
        setComprobanteApple({imei: formData.imei, status: 'found', boleta: result.boleta});
        showToast(`Boleta extranjera N° ${result.boleta.nBoleta || '-'} encontrada`, 'success');
      } catch (error) {
        setComprobanteApple({imei: formData.imei, status: 'error', boleta: null});
        showToast(obtenerMensajeErrorFuncion(error, 'No se pudo buscar la boleta extranjera'), 'error');
        return false;
      }
    }
    return true;
  };

  return (
    <div className="saas-form-shell">
      <ImageCropModal
        dataUrl={recorteEvidencia?.dataUrl}
        title={recorteEvidencia ? `Recortar ${recorteEvidencia.label}` : 'Recortar foto'}
        onCancel={() => setRecorteEvidencia(null)}
        onUseOriginal={usarOriginalEvidencia}
        onConfirm={confirmarRecorteEvidencia}
      />
      {confirmarGuardado && (
        <div className="saas-modal-backdrop fixed inset-0 z-[210] flex items-center justify-center p-4">
          <div className="saas-detail-modal w-full max-w-sm p-6 text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-700">
              <CheckCircle2 size={22} />
            </div>
            <h3 className="text-base font-semibold text-slate-900">¿Los datos que pusiste son correctos?</h3>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setConfirmarGuardado(false)} className="saas-secondary">Revisar</button>
              <button type="button" onClick={guardarRegistro} disabled={loading} className="saas-primary disabled:opacity-60">
                {loading ? 'Guardando...' : 'Sí, guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="saas-form-header">
        <div>
          <p className="saas-page-kicker">Registros</p>
          <h3 className="saas-page-title">{initialData ? 'Editar registro' : 'Nuevo registro'}</h3>
          <p className="saas-page-desc">Completa cliente, equipo y condiciones del registro.</p>
        </div>
        <button onClick={onCancel} className="saas-form-close"><X size={20}/></button>
      </div>

      {/* Indicador de pasos */}
      <div className="saas-stepper">
        {[1,2,3,4].map(n => (
          <React.Fragment key={n}>
            <div className={`flex items-center gap-2 ${paso === n ? 'text-blue-600' : paso > n ? 'text-green-600' : 'text-gray-400'}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors
                ${paso === n ? 'border-blue-600 bg-blue-50 text-blue-600' : paso > n ? 'border-green-500 bg-green-50 text-green-600' : 'border-gray-300 text-gray-400'}`}>
                {paso > n ? '✓' : n}
              </div>
              <span className="text-xs font-medium hidden sm:block">
                {n === 1 ? 'Cliente' : n === 2 ? 'Equipo' : n === 3 ? 'Detalle' : initialData ? 'Evidencias opcionales' : 'Evidencias'}
              </span>
            </div>
            {n < 4 && <div className={`flex-1 h-0.5 ${paso > n ? 'bg-green-400' : 'bg-gray-200'}`} />}
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
                  {dniStatusReg && (
                    <span className={`absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold ${
                      dniStatusReg.type === 'db' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                    }`}>
                      {buscandoReniec && <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-300 border-t-transparent" />}
                      {dniStatusReg.text}
                    </span>
                  )}
                  </div>
                </div>
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">Nombre Completo *</label><input name="nombre" value={formData.nombre} onChange={handleChange} className="w-full border rounded p-2 text-sm" /></div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Celular de este registro *</label>
                <input name="celular" value={formData.celular} onChange={handleChange} className="w-full border rounded p-2 text-sm" inputMode="numeric" maxLength={9} />
                {contactosClienteReg.celulares.length > 0 && (
                  <select
                    value=""
                    onChange={e => {
                      if (!e.target.value) return;
                      onDirty?.();
                      setFormData(prev => ({
                        ...prev,
                        celular: e.target.value,
                        celularRef: debeSincronizarCelularRef(prev) ? e.target.value : prev.celularRef,
                      }));
                    }}
                    aria-label="Elegir un celular guardado"
                    className="mt-2 w-full rounded border border-slate-200 bg-slate-50 p-2 text-xs"
                  >
                    <option value="">Elegir un número guardado</option>
                    {contactosClienteReg.celulares.map(celular => <option key={celular} value={celular}>{celular}</option>)}
                  </select>
                )}
                {contactosClienteReg.celulares.length > 0 && <p className="mt-1 text-xs text-slate-500">También puedes escribir un número nuevo para esta operación.</p>}
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">N° Referencia</label><input name="celularRef" value={formData.celularRef} onChange={handleChange} placeholder={formData.celular || 'Igual al celular'} className="w-full border rounded p-2 text-sm" inputMode="numeric" maxLength={9} /></div>
              <div className="sm:col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Dirección *</label>
                  <input name="direccion" value={formData.direccion} onChange={handleChange} className="w-full border rounded p-2 text-sm" placeholder="Av. / Jr. / Calle..." maxLength={260} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Departamento *</label>
                  <input
                    name="departamento"
                    value={formData.departamento}
                    onChange={handleChange}
                    list="departamentos-peru"
                    className="w-full border rounded bg-white p-2 text-sm"
                    placeholder="Ej: TACNA"
                    autoComplete="off"
                  />
                  <datalist id="departamentos-peru">
                    {PERU_DEPARTAMENTOS.map(departamento => <option key={departamento} value={departamento} />)}
                  </datalist>
                </div>
              </div>
              {clean(formData.direccion) && clean(formData.departamento) && (
                <div className="sm:col-span-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <span className="font-semibold text-slate-700">Direccion final: </span>{direccionFinalCliente}
                </div>
              )}
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Correo Electronico *</label>
                <input type="email" name="correo" value={formData.correo} onChange={handleChange} className="w-full border rounded p-2 text-sm" />
                {contactosClienteReg.correos.length > 1 && (
                  <select value={formData.correo} onChange={e => setFormData(prev => ({...prev, correo: e.target.value}))} className="mt-2 w-full rounded border border-slate-200 bg-slate-50 p-2 text-xs">
                    {contactosClienteReg.correos.map(correo => <option key={correo} value={correo}>{correo}</option>)}
                  </select>
                )}
              </div>
            </div>
            <div className="flex justify-between pt-4 border-t">
              <button type="button" onClick={onCancel} className="saas-secondary">Cancelar</button>
              <button type="button" onClick={() => validarPaso1() && setPaso(2)} className="saas-primary">Siguiente</button>
            </div>
          </div>
        )}



        {/* PASO 2 — DATOS DEL EQUIPO */}
        {paso === 2 && (
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h4 className="saas-form-section-title border-b-0 pb-0">Datos del Equipo</h4>
              {showManualEqForm && <button type="button" onClick={() => setMostrarEscaner(true)} className="saas-secondary"><ScanBarcode size={14}/> Escanear</button>}
            </div>
            {mostrarEscaner && (
              <EscanerIA
                onResult={onEscaneo}
                onClose={() => setMostrarEscaner(false)}
                onProcessingStart={onEscaneoProcesando}
                onError={onEscaneoError}
              />
            )}

            {/* Equipos previos */}
            {!showManualEqForm && equiposCliente.length > 0 && (
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                <h5 className="font-semibold text-blue-800 mb-3 text-sm">Equipos previos:</h5>
                {imeiSeleccionado ? (
                  <div className="p-3 bg-white rounded border border-blue-200">
                    <p className="text-sm font-medium mb-1">{imeiSeleccionado.marca} {imeiSeleccionado.nombreComercial || imeiSeleccionado.modelo}</p>
                    <p className="text-xs text-gray-500 mb-3">Elige el IMEI a registrar:</p>
                    <div className="flex gap-2 flex-wrap">
                      <button type="button" onClick={() => !imeiYaRegistrado(imeiSeleccionado.idEquipo) && handleConfirmEqSelection(imeiSeleccionado, imeiSeleccionado.idEquipo)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded border text-xs font-mono ${imeiYaRegistrado(imeiSeleccionado.idEquipo) ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100'}`}>
                        IMEI 1: {imeiSeleccionado.idEquipo}
                        {imeisRegistrados.has(imeiSeleccionado.idEquipo) && <span className="bg-blue-200 text-blue-800 px-1 rounded">reg</span>}
                      </button>
                      {imeiSeleccionado.imei2 && (
                        <button type="button" onClick={() => !imeiYaRegistrado(imeiSeleccionado.imei2) && handleConfirmEqSelection(imeiSeleccionado, imeiSeleccionado.imei2)}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded border text-xs font-mono ${imeiYaRegistrado(imeiSeleccionado.imei2) ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100'}`}>
                          IMEI 2: {imeiSeleccionado.imei2}
                          {imeisRegistrados.has(imeiSeleccionado.imei2) && <span className="bg-blue-200 text-blue-800 px-1 rounded">reg</span>}
                        </button>
                      )}
                    </div>
                    <button type="button" onClick={() => setImeiSeleccionado(null)} className="mt-3 text-xs text-gray-400 hover:text-gray-600"><X size={12} className="inline mr-1"/>Cancelar</button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {equiposCliente.map(eq => (
                      <button type="button" key={eq.idEquipo} onClick={() => handleEqClick(eq)} className="p-3 text-left bg-white rounded shadow-sm border border-blue-200 hover:border-blue-400 transition-colors">
                        <div className="font-semibold text-gray-800 text-sm">{eq.marca} {eq.nombreComercial || eq.modelo}</div>
                        {eq.nombreComercial && <div className="text-xs text-gray-400 mb-1">{eq.modelo}</div>}
                        <div className="space-y-0.5 mt-1">
                          <div className="flex items-center gap-1.5 text-xs text-gray-500 font-mono">IMEI 1: {eq.idEquipo}{imeisRegistrados.has(eq.idEquipo) && <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded">reg</span>}</div>
                          {eq.imei2 && <div className="flex items-center gap-1.5 text-xs text-gray-500 font-mono">IMEI 2: {eq.imei2}{imeisRegistrados.has(eq.imei2) && <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded">reg</span>}</div>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-3 pt-3 border-t border-blue-200 text-right">
                  <button type="button" onClick={() => {setShowManualEqForm(true); setComprobanteApple(emptyComprobanteApple()); setFormData(prev => ({...prev, imei:'', imei2:'', marca:'', modelo:'', nombreComercial:''}))}} className="text-sm text-blue-700 hover:underline">+ Agregar equipo nuevo</button>
                </div>
              </div>
            )}

            {showManualEqForm && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {escaneoProcesando && (
                  <div className="sm:col-span-2 flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-300 border-t-blue-700" />
                    Extrayendo datos de la caja del equipo...
                  </div>
                )}
                <div>
                <label className="block text-xs text-gray-500 mb-1">IMEI a registrar *</label>
                <input name="imei" value={formData.imei} onChange={handleChange}
                  className={`w-full border rounded p-2 text-sm font-mono ${claseEscaneo('imei')} ${formData.imei.length === 15 ? (luhn(formData.imei) ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50') : ''}`}
                  placeholder={placeholderEscaneo('imei', '15 digitos')} />
                {formData.imei.length === 15 && (
                  <p className={`text-xs mt-1 font-medium ${luhn(formData.imei) ? 'text-green-600' : 'text-red-600'}`}>
                    {luhn(formData.imei) ? '✓ IMEI válido' : '✗ IMEI inválido — verifica los dígitos'}
                  </p>
                )}
              </div>
                <div><label className="block text-xs text-gray-500 mb-1">Nombre Comercial *</label><input name="nombreComercial" value={formData.nombreComercial} onChange={handleChange} className={`w-full border rounded p-2 text-sm ${claseEscaneo('nombreComercial')}`} placeholder={placeholderEscaneo('nombreComercial', 'Ej: GALAXY A56')} /></div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Marca *</label>
                  <select
                    name="marca"
                    value={formData.marca}
                    onChange={handleChange}
                    className={`w-full border rounded bg-white p-2 text-sm ${claseEscaneo('marca')}`}
                    required
                  >
                    <option value="">{escaneoProcesando ? 'Extrayendo...' : 'Selecciona una marca'}</option>
                    {REGISTRO_MARCAS.map(marca => <option key={marca} value={marca}>{marca}</option>)}
                  </select>
                </div>
                <div><label className="block text-xs text-gray-500 mb-1">Modelo *</label><input name="modelo" value={formData.modelo} onChange={handleChange} className={`w-full border rounded p-2 text-sm ${claseEscaneo('modelo')}`} placeholder={placeholderEscaneo('modelo')} /></div>
                {esApple && (
                  <div
                    aria-live="polite"
                    className={`sm:col-span-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
                      comprobanteApple.status === 'found'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : comprobanteApple.status === 'not_found' || comprobanteApple.status === 'error'
                          ? 'border-red-200 bg-red-50 text-red-700'
                          : 'border-blue-100 bg-blue-50 text-blue-700'
                    }`}
                  >
                    {comprobanteApple.status === 'loading' && <span className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-blue-300 border-t-blue-700" />}
                    <span>
                      {comprobanteApple.status === 'found'
                        ? `Boleta extranjera N° ${comprobanteApple.boleta?.nBoleta || '-'} verificada para este IMEI.`
                        : comprobanteApple.status === 'loading'
                          ? 'Buscando una boleta extranjera para este IMEI...'
                          : comprobanteApple.status === 'not_found'
                            ? 'No existe una boleta extranjera para este IMEI. No se puede continuar.'
                            : comprobanteApple.status === 'error'
                              ? 'No se pudo verificar la boleta. Vuelve a intentar con Siguiente.'
                              : 'Al continuar se verificará que este IMEI tenga una boleta extranjera.'}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between pt-4 border-t">
              <button type="button" onClick={() => setPaso(1)} className="saas-secondary">Atras</button>
              <button
                type="button"
                onClick={async () => { if (await validarPaso2()) setPaso(3); }}
                disabled={comprobanteApple.status === 'loading'}
                className="saas-primary disabled:cursor-wait disabled:opacity-60"
              >
                {comprobanteApple.status === 'loading' ? 'Buscando boleta...' : 'Siguiente'}
              </button>
            </div>
          </div>
        )}

        {/* PASO 3 — OPERADOR, ESTADO, TIPO, PRECIO */}
        {paso === 3 && (
          <div className="space-y-4">
            <h4 className="saas-form-section-title">Detalle del Registro</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="block text-xs text-gray-500 mb-1">Operador</label>
                <select name="operador" value={formData.operador} onChange={handleChange} className="w-full border rounded p-2 text-sm">
                  <option>CLARO</option><option>MOVISTAR</option><option>ENTEL</option><option>BITEL</option>
                </select>
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">Estado del equipo</label>
                <select name="estado" value={formData.estado} onChange={handleChange} className="w-full border rounded p-2 text-sm">
                  <option>NO BLOQUEADO</option><option>BLOQUEADO</option>
                </select>
              </div>
              {formData.estado === 'NO BLOQUEADO' && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Estado de solicitud</label>
                  <select name="estadoSolicitud" value={formData.estadoSolicitud || 'PENDIENTE'} onChange={handleChange} className="w-full border rounded p-2 text-sm">
                    <option>PENDIENTE</option><option>REALIZADO</option>
                  </select>
                  <p className="mt-1 text-xs text-slate-500">Cámbialo a REALIZADO al confirmar el registro en el sistema externo.</p>
                </div>
              )}
              <div><label className="block text-xs text-gray-500 mb-1">Tipo</label>
                <select name="tipo" value={formData.tipo} onChange={handleChange} className="w-full border rounded p-2 text-sm">
                  <option>TIENDA</option><option>EXTERNO</option><option>PASE</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Precio (S/.) *
                  {formData.estado === 'BLOQUEADO' && <span className="ml-1 text-orange-500 font-semibold">(mín. S/. 50.00)</span>}
                </label>
                <input
                  required
                  type="number"
                  step="0.01"
                  min={formData.estado === 'BLOQUEADO' ? 50 : 0}
                  name="precio"
                  value={formData.precio}
                  onChange={handleChange}
                  className={`w-full border rounded p-2 text-sm font-bold ${
                    formData.estado === 'BLOQUEADO' && parseFloat(formData.precio || 0) < 50 && formData.precio !== ''
                      ? 'border-red-400 bg-red-50 text-red-600'
                      : 'text-green-700'
                  }`}
                />
                {formData.estado === 'BLOQUEADO' && parseFloat(formData.precio || 0) < 50 && formData.precio !== '' && (
                  <p className="text-xs text-red-500 mt-1">⚠ El precio mínimo para BLOQUEADO es S/. 50.00</p>
                )}
              </div>
              <fieldset className="sm:col-span-2" aria-describedby="tiene-caja-ayuda">
                <legend className="mb-2 block text-xs text-gray-500">¿Tiene caja? *</legend>
                <div className="grid grid-cols-2 gap-2">
                  {['SI', 'NO'].map(opcion => {
                    const seleccionada = formData.tieneCaja === opcion;
                    return (
                      <label
                        key={opcion}
                        className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold transition-colors focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 ${seleccionada ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                      >
                        <input
                          type="radio"
                          name="tieneCaja"
                          value={opcion}
                          checked={seleccionada}
                          onChange={handleChange}
                          className="sr-only"
                          required
                        />
                        {opcion === 'SI' ? 'Sí' : 'No'}
                      </label>
                    );
                  })}
                </div>
                <p id="tiene-caja-ayuda" className="mt-1.5 text-xs text-slate-500">
                  Si seleccionas No, la foto de la caja se deshabilitará.
                </p>
              </fieldset>
              <div className="sm:col-span-2"><label className="block text-xs text-gray-500 mb-1">Fecha y hora *</label>
                <input required type="datetime-local" name="fecha" value={formData.fecha} onChange={handleChange} className="w-full border rounded p-2 text-sm" />
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t">
              <button type="button" onClick={() => setPaso(2)} className="saas-secondary">Atras</button>
              <button type="button" onClick={() => validarFormularioCompleto() && setPaso(4)} className="saas-primary">
                Siguiente
              </button>
            </div>
          </div>
        )}

        {/* PASO 4 - EVIDENCIAS FOTOGRAFICAS */}
        {paso === 4 && (
          <div className="space-y-4">
            <div>
              <h4 className="saas-form-section-title">Evidencias fotograficas</h4>
              <p className="mt-1 text-xs font-medium text-slate-500">
                {initialData
                  ? 'Al editar, las evidencias son opcionales. Si adjuntas archivos nuevos, se generará un PDF actualizado.'
                  : esApple
                    ? 'Sube DNI frontal, DNI posterior e IMEI lógico. La boleta verificada se agregará automáticamente al PDF.'
                    : 'Sube las fotos obligatorias. La foto de la caja es opcional cuando el cliente sí tiene caja.'}
              </p>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              El PDF se descarga en este dispositivo. Las fotos no se guardan en Firebase Storage en esta version.
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {camposEvidenciaVisibles.map(field => {
                const cajaDeshabilitada = field.key === 'cajaEquipo' && formData.tieneCaja === 'NO';
                const evidencia = cajaDeshabilitada ? null : evidencias[field.key];
                const procesando = !cajaDeshabilitada && evidenciasProcesando[field.key];
                return (
                  <div key={field.key} className={`rounded-lg border p-3 ${cajaDeshabilitada ? 'border-slate-200 bg-slate-100/70' : 'border-slate-200 bg-white'}`}>
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{field.label}{!initialData && field.required !== false ? ' *' : ''}</p>
                        <p className="text-xs text-slate-500">{cajaDeshabilitada ? 'Deshabilitada porque el cliente no tiene caja' : field.hint}</p>
                      </div>
                      {cajaDeshabilitada ? (
                        <span className="rounded-md bg-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600">
                          No aplica
                        </span>
                      ) : evidencia && (
                        <span className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                          Listo
                        </span>
                      )}
                    </div>

                    {evidencia ? (
                      <div className="space-y-2">
                        <div className="flex h-36 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                          <img src={evidencia.dataUrl} alt={field.label} className="h-full w-full object-contain" />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                          <span>{evidencia.width}x{evidencia.height} px - {formatBytes(evidencia.size)}</span>
                          <button type="button" onClick={() => quitarEvidencia(field.key)} className="font-semibold text-red-600 hover:text-red-700">
                            Quitar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-36 flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 text-center text-xs text-slate-500">
                        <ImagePlus size={22} className="mb-2 text-slate-400" />
                        {cajaDeshabilitada ? 'El cliente indicó que no tiene caja' : procesando ? 'Comprimiendo imagen...' : 'Sin foto cargada'}
                      </div>
                    )}

                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <label className={`inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold transition-colors ${cajaDeshabilitada ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'cursor-pointer bg-slate-50 text-slate-700 hover:bg-slate-100'}`}>
                        <ImagePlus size={16} />
                        {evidencia ? 'Tomar otra' : 'Tomar foto'}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          capture="environment"
                          className="sr-only"
                          disabled={procesando || cajaDeshabilitada}
                          onChange={event => {
                            handleEvidenciaChange(field.key, event.target.files?.[0]);
                            event.target.value = '';
                          }}
                        />
                      </label>
                      <label className={`inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold transition-colors ${cajaDeshabilitada ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'cursor-pointer bg-white text-slate-700 hover:bg-slate-50'}`}>
                        <UploadCloud size={16} />
                        {evidencia ? 'Cambiar de galeria' : 'Subir galeria'}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="sr-only"
                          disabled={procesando || cajaDeshabilitada}
                          onChange={event => {
                            handleEvidenciaChange(field.key, event.target.files?.[0]);
                            event.target.value = '';
                          }}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between pt-4 border-t">
              <button type="button" onClick={() => setPaso(3)} className="saas-secondary">Atras</button>
              <button type="submit" disabled={loading || Object.values(evidenciasProcesando).some(Boolean)} className="saas-primary disabled:opacity-60">
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
// MÓDULO: VENTAS
// ============================================================================

