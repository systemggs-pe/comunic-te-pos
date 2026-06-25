import React, { useState, useEffect, useMemo } from 'react';
import { Menu, X, Home, ShoppingCart, ClipboardList, Plus, Search, Edit, Trash2, Printer, Copy, Eye, CheckCircle2, AlertCircle, Users, ScanBarcode, UploadCloud, ChevronDown, ChevronUp, LogOut, FileText, Share2, Settings, ImagePlus } from 'lucide-react';
import { actualizarRegistro, consultarReniecDni, crearRegistro, obtenerMensajeErrorFuncion } from '../../services/functionsClient.js';
import { luhn } from '../../utils/imei.js';
import {TIPOS_DOCUMENTO, etiquetaDocumento, limpiarDocumento, placeholderDocumento, validarDocumento} from '../../utils/documentos.js';
import {PERU_DEPARTAMENTOS, separarDireccionDepartamento, unirDireccionDepartamento} from '../../utils/peruDepartamentos.js';
import { ImageCropModal } from '../../components/ui/ImageCropModal.jsx';
import { EscanerIA } from './EscanerIA.jsx';
import {comprimirRegistroEvidenciaDataUrl, emptyRegistroEvidencias, formatBytes, leerRegistroEvidenciaFile, missingRegistroEvidencias, REGISTRO_EVIDENCIA_FIELDS} from './registroEvidencias.js';
import {generarRegistroEvidenciasPDF} from './registroEvidenciasPdf.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MONEY_RE = /^\d+(\.\d{1,2})?$/;
const PHONE_RE = /^9\d{8}$/;
const clean = value => String(value || '').trim();
const SCAN_LOADING_INPUT_CLASS = 'bg-blue-50/70 placeholder:text-blue-700 placeholder:font-semibold';
const uniqueClean = values => Array.from(new Set(values.map(clean).filter(Boolean)));
const opcionesContacto = (cliente, campoPrincipal, campoLista) => uniqueClean([
  cliente?.[campoPrincipal],
  ...(Array.isArray(cliente?.[campoLista]) ? cliente[campoLista] : []),
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
      // Solo el IMEI específico que se registró, no imeiEquipo (que es siempre IMEI 1)
      if (r.imeiRegistrado) set.add(r.imeiRegistrado);
    });
    return set;
  }, [registros]);

  const imeiYaRegistrado = (imei) => {
    if (!imei) return false;
    // Al editar, ignorar el registro actual para no bloquearse a sí mismo
    if (initialData && (initialData.imeiEquipo === imei || initialData.imeiRegistrado === imei)) return false;
    return imeisRegistrados.has(imei);
  };

  const toLocalDatetimeValue = (isoString) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [formData, setFormData] = useState({
    tipoDocumento: 'DNI', dni: '', nombre: '', celular: '', celularRef: '', correo: '', direccion: '', departamento: '', imei: '', imei2: '', sn: '', marca: '', modelo: '', nombreComercial: '', ram: '', memoria: '', color: '', estado: 'NO BLOQUEADO', operador: 'BITEL', tipo: 'TIENDA', precio: '', fecha: toLocalDatetimeValue(new Date().toISOString())
  });
  const [confirmarGuardado, setConfirmarGuardado] = useState(false);
  const [evidencias, setEvidencias] = useState(() => emptyRegistroEvidencias());
  const [evidenciasProcesando, setEvidenciasProcesando] = useState({});
  const [recorteEvidencia, setRecorteEvidencia] = useState(null);
  const direccionFinalCliente = useMemo(() => unirDireccionDepartamento(formData.direccion, formData.departamento), [formData.direccion, formData.departamento]);

  useEffect(() => {
    if (initialData) {
      const cliente = clientes.find(c => c.dni === initialData.dniCliente) || {};
      const eq = equipos.find(e => e.idEquipo === initialData.imeiEquipo) || {};
      const direccionCliente = separarDireccionDepartamento(cliente.direccion || '');
      setFormData({
        tipoDocumento: initialData.tipoDocumentoCliente || cliente.tipoDocumento || 'DNI', dni: initialData.dniCliente || '', nombre: cliente.nombre || '', celular: cliente.celular || '', celularRef: cliente.celularRef || cliente.celular || '', correo: cliente.correo || '', direccion: direccionCliente.direccion, departamento: direccionCliente.departamento, imei: initialData.imeiEquipo || '', imei2: eq.imei2 || '', sn: eq.sn || '', marca: initialData.marcaEquipo || '', modelo: initialData.modeloEquipo || '', nombreComercial: initialData.nombreComercialEquipo || '', ram: eq.ram || '', memoria: eq.memoria || '', color: eq.color || '', estado: initialData.estado || 'NO BLOQUEADO', operador: initialData.operador || 'BITEL', tipo: initialData.tipo || 'TIENDA', precio: initialData.precio || '', fecha: toLocalDatetimeValue(initialData.fecha)
      });
      setShowManualEqForm(true);
    }
  }, [initialData, clientes, equipos]);







  const [mostrarEscaner, setMostrarEscaner] = useState(false);
  const [escaneoProcesando, setEscaneoProcesando] = useState(false);
  const [buscandoReniec, setBuscandoReniec] = useState(false);
  const [dniStatusReg, setDniStatusReg] = useState(null);
  const [contactosClienteReg, setContactosClienteReg] = useState({celulares: [], correos: []});

  const buscarReniec = async (dni) => {
    setBuscandoReniec(true);
    setDniStatusReg({type: 'loading', text: 'Buscando...'});
    try {
      const json = await consultarReniecDni(dni);
      if (json.success && json.result) {
        const r = json.result;
        setFormData(prev => {
          const direccionReniec = r.address && !r.address.includes('*') ? separarDireccionDepartamento(r.address) : null;
          return {
            ...prev,
            nombre:    r.full_name  ? r.full_name  : prev.nombre,
            direccion: direccionReniec?.direccion || prev.direccion,
            departamento: direccionReniec?.departamento || prev.departamento,
            correo:    r.email   && !r.email.includes('*')   ? r.email   : prev.correo,
          };
        });
        setDniStatusReg({type: 'reniec', text: 'Encontrado RENIEC'});
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
    onDirty?.();
    setFormData(prev => {
      const next = {
        ...prev,
        imei:            datos.imei1           || prev.imei,
        imei2:           datos.imei2           || prev.imei2,
        sn:              datos.sn              || prev.sn,
        marca:           datos.marca           || prev.marca,
        modelo:          datos.modelo          || prev.modelo,
        nombreComercial: datos.nombreComercial || prev.nombreComercial,
        ram:             datos.ram             || prev.ram,
        memoria:         datos.memoria         || prev.memoria,
        color:           datos.color           || prev.color,
      };
      return next;
    });
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
      const clienteExistente = clientes.find(c => c.dni === formData.dni);
      if (clienteExistente) {
        const celulares = opcionesContacto(clienteExistente, 'celular', 'celulares');
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
          marca:           prev.marca           || eq.marca           || '',
          modelo:          prev.modelo          || eq.modelo          || '',
          nombreComercial: prev.nombreComercial || eq.nombreComercial || '',
          sn:              prev.sn              || eq.sn              || '',
          ram:             prev.ram             || eq.ram             || '',
          memoria:         prev.memoria         || eq.memoria         || '',
          color:           prev.color           || eq.color           || '',
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
    setFormData(prev => ({
      ...prev,
      imei: selectedImei,          // el IMEI exacto que eligió registrar
      imei2: selectedImei === eq.idEquipo ? (eq.imei2 || '') : (eq.idEquipo || ''),
      sn: eq.sn || '', marca: eq.marca || '', modelo: eq.modelo || '',
      nombreComercial: eq.nombreComercial || '',
      ram: eq.ram || '',
      memoria: eq.memoria || '',
      color: eq.color || '',
    }));
    setImeiSeleccionado(null);
    setShowManualEqForm(true);
  };

  const CAMPOS_SOLO_NUMEROS = ['dni', 'celular', 'celularRef', 'imei', 'imei2'];
  const CAMPOS_MAYUSCULAS   = ['nombre', 'marca', 'modelo', 'nombreComercial', 'sn', 'color', 'operador', 'estado', 'tipo', 'departamento'];
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
    onDirty?.();
    setFormData(prev => {
      const next = { ...prev, [name]: val };
      if (name === 'celular' && debeSincronizarCelularRef(prev)) next.celularRef = val;
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
    if (!clean(formData.marca) || !clean(formData.modelo)) {
      showToast('Completa marca y modelo', 'error'); return false;
    }
    if (!clean(formData.nombreComercial)) {
      showToast('El nombre comercial es obligatorio', 'error'); return false;
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
    if (!validarEvidencias()) return;

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
    const faltantes = missingRegistroEvidencias(evidencias);
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
      // Calcular IMEIs reales
      const imei1Real = formData.imei2
        ? (formData.imei < formData.imei2 ? formData.imei : formData.imei2)
        : formData.imei;
      const imei2Real = formData.imei2
        ? (formData.imei < formData.imei2 ? formData.imei2 : formData.imei)
        : '';

      // Construir datos del registro
      const eqExistente = equipos.find(e => e.idEquipo === imei1Real) || {};
      const registroData = {
        tipoDocumentoCliente: formData.tipoDocumento,
        dniCliente: formData.dni, celularCliente: formData.celular,
        celularRef: formData.celularRef || formData.celular,
        imeiEquipo: imei1Real, imeiRegistrado: formData.imei, imei2Equipo: imei2Real,
        modeloEquipo: formData.modelo, marcaEquipo: formData.marca,
        nombreComercialEquipo: formData.nombreComercial,
        estado: formData.estado, operador: formData.operador,
        tipo: formData.tipo, precio: formData.precio,
        fecha: new Date(formData.fecha).toISOString(),
      };

      const clienteData = {
        dni: formData.dni,
        tipoDocumento: formData.tipoDocumento,
        nombre: formData.nombre,
        celular: formData.celular,
        celularRef: formData.celularRef || formData.celular,
        correo: formData.correo,
        direccion: direccionFinalCliente,
      };
      const equipoData = {
        idEquipo: imei1Real,
        idDuenio: formData.dni,
        imei2: imei2Real,
        sn: formData.sn,
        marca: formData.marca,
        modelo: formData.modelo,
        nombreComercial: formData.nombreComercial,
        ram: formData.ram,
        memoria: formData.memoria,
        color: formData.color,
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
        await generarRegistroEvidenciasPDF({
          ...registroData,
          ...(saved.registro || {}),
          nombreCliente: clienteData.nombre,
          correoCliente: clienteData.correo,
          celularCliente: clienteData.celular,
          celularRef: clienteData.celularRef,
        }, evidencias);
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
        }, evidencias);
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
  const validarPaso2 = () => {
    if (!luhn(clean(formData.imei))) {
      showToast('El IMEI ingresado no es valido; verifica los digitos', 'error'); return false;
    }
    if (clean(formData.imei2) && !luhn(clean(formData.imei2))) {
      showToast('El IMEI 2 no es valido; verifica los digitos', 'error'); return false;
    }
    if (!clean(formData.marca) || !clean(formData.modelo)) {
      showToast('Completa marca y modelo', 'error'); return false;
    }
    if (!clean(formData.nombreComercial)) {
      showToast('El nombre comercial es obligatorio', 'error'); return false;
    }
    if (imeiYaRegistrado(formData.imei)) {
      showToast(`El IMEI ${formData.imei} ya tiene un registro activo`, 'error'); return false;
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
                {n === 1 ? 'Cliente' : n === 2 ? 'Equipo' : n === 3 ? 'Detalle' : 'Evidencias'}
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
                <label className="block text-xs text-gray-500 mb-1">Celular *</label>
                <input name="celular" value={formData.celular} onChange={handleChange} className="w-full border rounded p-2 text-sm" inputMode="numeric" maxLength={9} />
                {contactosClienteReg.celulares.length > 1 && (
                  <select value={formData.celular} onChange={e => setFormData(prev => ({...prev, celular: e.target.value, celularRef: debeSincronizarCelularRef(prev) ? e.target.value : prev.celularRef}))} className="mt-2 w-full rounded border border-slate-200 bg-slate-50 p-2 text-xs">
                    {contactosClienteReg.celulares.map(celular => <option key={celular} value={celular}>{celular}</option>)}
                  </select>
                )}
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
                          {eq.sn && <div className="text-xs text-gray-500 font-mono">S/N: {eq.sn}</div>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-3 pt-3 border-t border-blue-200 text-right">
                  <button type="button" onClick={() => {setShowManualEqForm(true); setFormData(prev => ({...prev, imei:'', imei2:'', marca:'', modelo:'', nombreComercial:'', ram:'', memoria:'', color:''}))}} className="text-sm text-blue-700 hover:underline">+ Agregar equipo nuevo</button>
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
                <div><label className="block text-xs text-gray-500 mb-1">N° de Serie (S/N)</label><input name="sn" value={formData.sn} onChange={handleChange} className={`w-full border rounded p-2 text-sm font-mono ${claseEscaneo('sn')}`} placeholder={placeholderEscaneo('sn')} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Nombre Comercial *</label><input name="nombreComercial" value={formData.nombreComercial} onChange={handleChange} className={`w-full border rounded p-2 text-sm ${claseEscaneo('nombreComercial')}`} placeholder={placeholderEscaneo('nombreComercial', 'Ej: GALAXY A56')} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Marca *</label><input name="marca" value={formData.marca} onChange={handleChange} className={`w-full border rounded p-2 text-sm ${claseEscaneo('marca')}`} placeholder={placeholderEscaneo('marca')} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Modelo *</label><input name="modelo" value={formData.modelo} onChange={handleChange} className={`w-full border rounded p-2 text-sm ${claseEscaneo('modelo')}`} placeholder={placeholderEscaneo('modelo')} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">RAM (GB)</label><input name="ram" value={formData.ram} onChange={handleChange} className={`w-full border rounded p-2 text-sm ${claseEscaneo('ram')}`} placeholder={placeholderEscaneo('ram', 'ej: 8')} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Memoria (GB)</label><input name="memoria" value={formData.memoria} onChange={handleChange} className={`w-full border rounded p-2 text-sm ${claseEscaneo('memoria')}`} placeholder={placeholderEscaneo('memoria', 'ej: 256')} /></div>
                <div className="sm:col-span-2"><label className="block text-xs text-gray-500 mb-1">Color</label><input name="color" value={formData.color} onChange={handleChange} className={`w-full border rounded p-2 text-sm ${claseEscaneo('color')}`} placeholder={placeholderEscaneo('color')} /></div>
              </div>
            )}

            <div className="flex justify-between pt-4 border-t">
              <button type="button" onClick={() => setPaso(1)} className="saas-secondary">Atras</button>
              <button type="button" onClick={() => validarPaso2() && setPaso(3)} className="saas-primary">Siguiente</button>
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
              <div><label className="block text-xs text-gray-500 mb-1">Estado</label>
                <select name="estado" value={formData.estado} onChange={handleChange} className="w-full border rounded p-2 text-sm">
                  <option>NO BLOQUEADO</option><option>BLOQUEADO</option>
                </select>
              </div>
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
                Sube las fotos obligatorias. La caja del equipo es opcional.
              </p>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              El PDF se descarga en este dispositivo. Las fotos no se guardan en Firebase Storage en esta version.
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {REGISTRO_EVIDENCIA_FIELDS.map(field => {
                const evidencia = evidencias[field.key];
                const procesando = evidenciasProcesando[field.key];
                return (
                  <div key={field.key} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{field.label}{field.required === false ? '' : ' *'}</p>
                        <p className="text-xs text-slate-500">{field.hint}</p>
                      </div>
                      {evidencia && (
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
                        {procesando ? 'Comprimiendo imagen...' : 'Sin foto cargada'}
                      </div>
                    )}

                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100">
                        <ImagePlus size={16} />
                        {evidencia ? 'Tomar otra' : 'Tomar foto'}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          capture="environment"
                          className="sr-only"
                          disabled={procesando}
                          onChange={event => {
                            handleEvidenciaChange(field.key, event.target.files?.[0]);
                            event.target.value = '';
                          }}
                        />
                      </label>
                      <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50">
                        <UploadCloud size={16} />
                        {evidencia ? 'Cambiar de galeria' : 'Subir galeria'}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="sr-only"
                          disabled={procesando}
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

