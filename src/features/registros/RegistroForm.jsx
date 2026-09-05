import React, { useState, useEffect, useMemo } from 'react';
import { Menu, X, Home, ShoppingCart, ClipboardList, Plus, Search, Edit, Trash2, Printer, Copy, Eye, CheckCircle2, AlertCircle, Users, ScanBarcode, UploadCloud, ChevronDown, ChevronUp, LogOut, Share2, Settings, ImagePlus } from 'lucide-react';
import { actualizarRegistro, consultarComprobanteApplePorImei, crearRegistro, crearRegistroSamsungDual, obtenerMensajeErrorFuncion } from '../../services/functionsClient.js';
import { luhn } from '../../utils/imei.js';
import {TIPOS_DOCUMENTO, etiquetaDocumento, limpiarDocumento, placeholderDocumento, validarDocumento} from '../../utils/documentos.js';
import {PERU_DEPARTAMENTOS, separarDireccionDepartamento, unirDireccionDepartamento} from '../../utils/peruDepartamentos.js';
import { ImageCropModal } from '../../components/ui/ImageCropModal.jsx';
import { EscanerCaja } from './EscanerCaja.jsx';
import {ClienteEquiposSelector} from './ClienteEquiposSelector.jsx';
import {useRegistroCliente} from './useRegistroCliente.js';
import {BOX_FORM_FIELDS, mergeBoxAutofill} from '../../utils/boxAutofill.js';
import {comprimirRegistroEvidenciaDataUrl, emptyRegistroEvidencias, formatBytes, leerRegistroEvidenciaFile, REGISTRO_EVIDENCIA_FIELDS} from './registroEvidencias.js';
import {generarRegistroEvidenciasPDF} from './registroEvidenciasPdf.js';
import {
  APPLE_EVIDENCIA_ORDER,
  clean,
  correosValidos,
  createInitialRegistroForm,
  debeSincronizarCelularRef,
  descomponerMarcaRegistro,
  emptyComprobanteApple,
  EMAIL_RE,
  esRegistroSamsungDual,
  marcaFinalRegistro,
  normalizarMarcaRegistro,
  normalizarTieneCaja,
  opcionesCelulares,
  opcionesContacto,
  PHONE_RE,
  REGISTRO_MARCA_OTROS,
  REGISTRO_MARCAS,
  SCAN_LOADING_INPUT_CLASS,
  toLocalDatetimeValue,
  uniqueClean,
  validateEquipmentStep,
  validateRegistroDraft,
} from './registroFormModel.js';

export function RegistroForm({ clientes, equipos, registros, initialData, onCancel, onSave, onDirty, showToast }) {
  const isEditing = Boolean(initialData?.id);
  const [loading, setLoading] = useState(false);
  const [showManualEqForm, setShowManualEqForm] = useState(true);


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
    const imeiActual = isEditing ? (initialData?.imeiRegistrado || initialData?.imeiEquipo) : '';
    if (imeiActual === imei) return false;
    return imeisRegistrados.has(imei) || clienteLookup.activeImeis.includes(imei);
  };

  const [formData, setFormData] = useState(createInitialRegistroForm);
  const [confirmarGuardado, setConfirmarGuardado] = useState(false);
  const [evidencias, setEvidencias] = useState(() => ({
    ...emptyRegistroEvidencias(),
  }));
  const [evidenciasProcesando, setEvidenciasProcesando] = useState({});
  const [recorteEvidencia, setRecorteEvidencia] = useState(null);
  const [comprobanteApple, setComprobanteApple] = useState(() => emptyComprobanteApple());
  const [contactosClienteReg, setContactosClienteReg] = useState({celulares: [], correos: []});
  const direccionFinalCliente = useMemo(() => unirDireccionDepartamento(formData.direccion, formData.departamento), [formData.direccion, formData.departamento]);
  const marcaFinal = marcaFinalRegistro(formData);
  const esApple = marcaFinal === 'APPLE';
  const esSamsung = marcaFinal === 'SAMSUNG';
  const registroSamsungDual = !isEditing && esRegistroSamsungDual(formData);
  const permitePrecioCero = formData.estado === 'NO BLOQUEADO' && ['TIENDA', 'PASE'].includes(formData.tipo);
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
      const direccionCliente = separarDireccionDepartamento(initialData.direccionCliente || cliente.direccion || '');
      const departamentoSolicitado = String(initialData.departamentoCliente || '').trim().toUpperCase();
      const departamentoCliente = PERU_DEPARTAMENTOS.includes(departamentoSolicitado)
        ? departamentoSolicitado
        : direccionCliente.departamento;
      const celulares = opcionesCelulares(cliente);
      const correos = opcionesContacto(cliente, 'correo', 'correos');
      const imeiRegistrado = initialData.imeiRegistrado || initialData.imeiEquipo || '';
      const imeiPrincipal = initialData.imeiEquipo || eq.idEquipo || imeiRegistrado;
      const imeiSecundario = initialData.imei2Equipo || eq.imei2 || '';
      const seleccionMarca = descomponerMarcaRegistro(initialData.marcaEquipo || eq.marca);
      const tipoRegistro = seleccionMarca.marca === 'SAMSUNG' && !['TIENDA', 'EXTERNO'].includes(initialData.tipo)
        ? ''
        : (initialData.tipo || 'TIENDA');
      setContactosClienteReg({celulares, correos});
      setFormData({
        tipoDocumento: initialData.tipoDocumentoCliente || cliente.tipoDocumento || 'DNI', dni: initialData.dniCliente || '', nombre: initialData.nombreCliente || cliente.nombre || '', celular: initialData.celularCliente || cliente.celular || celulares[0] || '', celular2: '', celularRef: initialData.celularRef || cliente.celularRef || initialData.celularCliente || cliente.celular || '', correo: initialData.correoCliente || correos[0] || '', direccion: direccionCliente.direccion, departamento: departamentoCliente, imei1: imeiPrincipal, imei: imeiRegistrado, imei2: imeiSecundario, sn: initialData.sn || eq.sn || '', ...seleccionMarca, modelo: initialData.modeloEquipo || '', nombreComercial: initialData.nombreComercialEquipo || '', color: initialData.colorEquipo || eq.color || '', memoria: initialData.memoriaEquipo || eq.memoria || '', ram: initialData.ramEquipo || eq.ram || '', registrarAmbosImeis: false, estado: initialData.estado || 'NO BLOQUEADO', estadoSolicitud: initialData.estado === 'BLOQUEADO' ? '' : (initialData.estadoSolicitud || 'PENDIENTE'), operador: initialData.operador || 'BITEL', tipo: tipoRegistro, tieneCaja: normalizarTieneCaja(initialData.tieneCaja) || 'NO', precio: initialData.precio || '0', fecha: toLocalDatetimeValue(initialData.fecha)
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
  const [dniStatusReg, setDniStatusReg] = useState(null);
  const [scanNotice, setScanNotice] = useState('');
  const scanBaseline = React.useRef(null);
  const clienteLookup = useRegistroCliente({
    dni: formData.dni, tipoDocumento: formData.tipoDocumento, enabled: !isEditing,
    onCliente: (cliente, source) => {
      if (cliente.dni !== formData.dni) return;
      const celulares = opcionesCelulares(cliente);
      const correos = opcionesContacto(cliente, 'correo', 'correos');
      const direccion = separarDireccionDepartamento(cliente.direccion || '');
      setContactosClienteReg({celulares, correos});
      setDniStatusReg({type: source, text: source === 'db' ? 'Cliente COMUNIC@TE' : 'Nombre encontrado en RENIEC'});
      setFormData(prev => prev.dni !== cliente.dni ? prev : ({
        ...prev, nombre: prev.nombre || cliente.nombre || '',
        celular: prev.celular || celulares[0] || '', celularRef: prev.celularRef || celulares[0] || '',
        correo: prev.correo || correos[0] || '', direccion: prev.direccion || direccion.direccion,
        departamento: prev.departamento || direccion.departamento,
      }));
    },
  });
  const equiposCliente = clienteLookup.equipos;
  const buscandoReniec = clienteLookup.loading;

  const onEscaneo = (datos, {warnings = []} = {}) => {
    setMostrarEscaner(false);
    setEscaneoProcesando(false);
    setComprobanteApple(emptyComprobanteApple());
    onDirty?.();
    const baseline = scanBaseline.current;
    setFormData(prev => {
      if (!baseline || prev.dni !== baseline.dni || prev.tipoDocumento !== baseline.tipoDocumento) return prev;
      const next = mergeBoxAutofill(prev, datos, baseline);
      next.marca = normalizarMarcaRegistro(next.marca);
      next.marcaOtra = '';
      if (next.marca === 'SAMSUNG' && prev.marca !== 'SAMSUNG') next.tipo = '';
      if (next.marca !== 'SAMSUNG') {
        if (!next.tipo) next.tipo = 'TIENDA';
        next.registrarAmbosImeis = false;
        next.celular2 = '';
      }
      if (prev.imei === baseline.imei && next.imei1 !== prev.imei1) next.imei = next.imei1;
      return next;
    });
    setScanNotice(warnings.length ? 'Se rellenaron los datos legibles. Algunos datos no se pudieron validar; completa los campos faltantes antes de guardar.' : '');
    showToast('Escaneo finalizado. Los datos se aplican sin sobrescribir tus cambios durante la extracción.', 'success');
  };

  const onEscaneoProcesando = () => {
    scanBaseline.current = {...formData};
    setScanNotice('');
    setEscaneoProcesando(true);
    onDirty?.();
  };

  const onEscaneoError = mensaje => {
    setEscaneoProcesando(false);
    showToast(mensaje || 'No se pudo extraer datos de la caja', 'error');
  };

  // Autocompletar únicamente a partir de equipos vinculados al documento actual.
  useEffect(() => {
    if (formData.imei1.length === 15 && !initialData) {
      const eq = equiposCliente.find(e => e.idEquipo === formData.imei1 || e.imei2 === formData.imei1);
      if (eq) setFormData(prev => {
        const marca = prev.marca || normalizarMarcaRegistro(eq.marca);
        return {
          ...prev, imei1: eq.idEquipo, imei: prev.imei || formData.imei1,
          imei2: prev.imei2 || eq.imei2 || '', marca, marcaOtra: '',
          tipo: marca === 'SAMSUNG' && prev.marca !== 'SAMSUNG' ? '' : (prev.tipo || 'TIENDA'),
          modelo: prev.modelo || eq.modelo || '',
          nombreComercial: prev.nombreComercial || eq.nombreComercial || '',
          sn: prev.sn || eq.sn || '', color: prev.color || eq.color || '',
          ram: prev.ram || eq.ram || '', memoria: prev.memoria || eq.memoria || '',
        };
      });
    }
  }, [formData.imei1, equiposCliente, initialData]);

  const handleConfirmEqSelection = (eq, selectedImei) => {
    if (imeiYaRegistrado(selectedImei) || clienteLookup.loading || clienteLookup.error || !clienteLookup.registrationStatusComplete) return;
    setMostrarEscaner(false);
    setEscaneoProcesando(false);
    setScanNotice('');
    setComprobanteApple(emptyComprobanteApple());
    onDirty?.();
    const marca = normalizarMarcaRegistro(eq.marca);
    setFormData(prev => ({
      ...prev, imei1: eq.idEquipo, imei: selectedImei, imei2: eq.imei2 || '', registrarAmbosImeis: false, celular2: '',
      marca, marcaOtra: '', tipo: marca === 'SAMSUNG' ? '' : (prev.tipo || 'TIENDA'), modelo: eq.modelo || '',
      nombreComercial: eq.nombreComercial || eq.modelo || '', sn: eq.sn || '',
      ram: eq.ram || '', memoria: eq.memoria || '', color: eq.color || '',
    }));
    setShowManualEqForm(true);
  };

  const selectorEquipos = !isEditing && validarDocumento(formData.tipoDocumento, formData.dni) && (
    <ClienteEquiposSelector lookup={clienteLookup} selectedImei={formData.imei}
      isRegistered={imeiYaRegistrado} onSelect={handleConfirmEqSelection} />
  );

  const CAMPOS_SOLO_NUMEROS = ['dni', 'celular', 'celular2', 'celularRef', 'imei1', 'imei', 'imei2'];
  const CAMPOS_MAYUSCULAS   = ['nombre', 'marca', 'marcaOtra', 'modelo', 'nombreComercial', 'color', 'operador', 'estado', 'estadoSolicitud', 'tipo', 'departamento'];
  const CAMPOS_CORREO       = ['correo'];

  const handleChange = (e) => {
    const { name, value } = e.target;
    let val = value;
    if (name === 'tipoDocumento' || name === 'dni') {
      onDirty?.();
      setDniStatusReg(null);
      setContactosClienteReg({celulares: [], correos: []});
      setMostrarEscaner(false);
      setEscaneoProcesando(false);
      setScanNotice('');
      setComprobanteApple(emptyComprobanteApple());
      setShowManualEqForm(true);
      setFormData(prev => {
        const tipoDocumento = name === 'tipoDocumento' ? value : prev.tipoDocumento;
        const dni = limpiarDocumento(name === 'dni' ? value : prev.dni, tipoDocumento);
        if (isEditing) return {...prev, tipoDocumento, dni};
        const device = Object.fromEntries(BOX_FORM_FIELDS.map(key => [key, '']));
        return {...prev, ...device, imei: '', tipoDocumento, dni, nombre: '', celular: '', celular2: '', celularRef: '', correo: '', direccion: '', departamento: '', registrarAmbosImeis: false};
      });
      return;
    }
    if (CAMPOS_SOLO_NUMEROS.includes(name)) val = val.replace(/\D/g, '');
    if (name === 'imei1' || name === 'imei' || name === 'imei2') val = val.slice(0, 15);
    if (name === 'celular' || name === 'celular2' || name === 'celularRef') val = val.slice(0, 9);
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
    if (name === 'imei1' || name === 'imei2' || name === 'imei' || name === 'marca' || name === 'marcaOtra') {
      setComprobanteApple(emptyComprobanteApple());
    }
    onDirty?.();
    setFormData(prev => {
      const next = { ...prev, [name]: val };
      if (name === 'imei1' && (!prev.imei || prev.imei === prev.imei1)) next.imei = val;
      if (name === 'imei2') {
        if (prev.imei === prev.imei2) next.imei = val;
        if (!val) {
          next.registrarAmbosImeis = false;
          next.celular2 = '';
        }
      }
      if (name === 'marca') {
        if (val !== REGISTRO_MARCA_OTROS) next.marcaOtra = '';
        if (val === 'SAMSUNG' && prev.marca !== 'SAMSUNG') next.tipo = '';
        if (val !== 'SAMSUNG') {
          if (!prev.tipo) next.tipo = 'TIENDA';
          next.registrarAmbosImeis = false;
          next.celular2 = '';
        }
      }
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
    const message = validateRegistroDraft(formData, {
      direccionFinalCliente,
      imeiYaRegistrado,
      esApple,
      comprobanteAppleValido,
      permitePrecioCero,
    });
    if (message) showToast(message, 'error');
    return !message;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (mostrarEscaner) {
      showToast('Espera a que termine el escaneo o cancélalo antes de guardar el registro.', 'error');
      return;
    }

    if (!validarFormularioCompleto()) return;
    const imeisSolicitados = registroSamsungDual ? [formData.imei1, formData.imei2] : [formData.imei];
    if (imeisSolicitados.some(imei => !luhn(imei))) {
      showToast('Uno de los IMEI ingresados no es válido; verifica los dígitos', 'error');
      return;
    }
    const imeiDuplicado = !isEditing && imeisSolicitados.find(imeiYaRegistrado);
    if (imeiDuplicado) {
      showToast(`El IMEI ${imeiDuplicado} ya tiene un registro activo`, 'error');
      return;
    }

    // Validar precio mínimo si el estado es BLOQUEADO
    if (formData.estado === 'BLOQUEADO' && parseFloat(formData.precio || 0) < 50) {
      showToast('El precio mínimo para un equipo BLOQUEADO es S/. 50.00', 'error');
      return;
    }

    setConfirmarGuardado(true);
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
    if (mostrarEscaner) {
      showToast('Espera a que termine el escaneo o cancélalo antes de guardar el registro.', 'error');
      return;
    }
    setConfirmarGuardado(false);
    setLoading(true);
    try {
      // Conservar la posición IMEI 1 / IMEI 2 del equipo, aunque se registre el segundo IMEI.
      const formImeis = new Set([formData.imei1, formData.imei2, formData.imei].filter(Boolean));
      const eqExistente = [...equiposCliente, ...equipos].find(e => formImeis.has(e.idEquipo) || formImeis.has(e.imei2)) || {};
      const imei1Real = isEditing ? formData.imei1 : (eqExistente.idEquipo || formData.imei1 || formData.imei);
      const imei2Real = isEditing
        ? formData.imei2
        : eqExistente.idEquipo
          ? (eqExistente.imei2 || (formData.imei !== eqExistente.idEquipo ? formData.imei : '') || formData.imei2)
          : formData.imei2;

      // Construir datos del registro
      const registroData = {
        tipoDocumentoCliente: formData.tipoDocumento,
        dniCliente: formData.dni, celularCliente: formData.celular,
        celularRef: formData.celularRef || formData.celular,
        correoCliente: formData.correo,
        direccionCliente: direccionFinalCliente,
        imeiEquipo: imei1Real, imeiRegistrado: registroSamsungDual ? imei1Real : formData.imei, imei2Equipo: imei2Real,
        modeloEquipo: formData.modelo, marcaEquipo: marcaFinal,
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
        celulares: uniqueClean([...contactosClienteReg.celulares, formData.celular, registroSamsungDual ? formData.celular2 : '', formData.celularRef]),
        correos: correosValidos([...contactosClienteReg.correos, formData.correo]),
      };
      const equipoData = {
        idEquipo: imei1Real,
        idDuenio: formData.dni,
        imei2: imei2Real,
        sn: formData.sn,
        marca: marcaFinal,
        modelo: formData.modelo,
        nombreComercial: formData.nombreComercial,
        color: formData.color,
        memoria: formData.memoria,
        ram: formData.ram,
        isRegistrado: true,
        imei1Registrado: registroSamsungDual || formData.imei === imei1Real ? true : (eqExistente.imei1Registrado || false),
        imei2Registrado: registroSamsungDual || formData.imei === imei2Real ? true : (eqExistente.imei2Registrado || false),
      };

      if (isEditing) {
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
        const saved = registroSamsungDual
          ? await crearRegistroSamsungDual({
            cliente: clienteData,
            equipo: equipoData,
            registro: registroData,
            celular2: formData.celular2,
          })
          : await crearRegistro({
            cliente: clienteData,
            equipo: equipoData,
            registro: registroData,
          });
        if (hayEvidenciasParaPdf) {
          await generarRegistroEvidenciasPDF({
            ...registroData,
            ...(saved.registro || saved.registros?.[0] || {}),
            nombreCliente: clienteData.nombre,
            correoCliente: clienteData.correo,
            celularCliente: clienteData.celular,
            celularRef: clienteData.celularRef,
          }, evidenciasParaPdf, opcionesPdf);
        }
        showToast(registroSamsungDual ? 'Se crearon las dos solicitudes Samsung' : 'Guardado exitosamente');
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
    if (!luhn(clean(formData.imei1))) {
      showToast('El IMEI 1 no es valido; verifica los digitos', 'error'); return false;
    }
    if (clean(formData.imei2) && !luhn(clean(formData.imei2))) {
      showToast('El IMEI 2 no es valido; verifica los digitos', 'error'); return false;
    }
    if (clean(formData.imei1) && clean(formData.imei1) === clean(formData.imei2)) {
      showToast('El IMEI 1 y el IMEI 2 deben ser diferentes', 'error'); return false;
    }
    if (![clean(formData.imei1), clean(formData.imei2)].includes(clean(formData.imei))) {
      showToast('Selecciona el IMEI que se va a registrar', 'error'); return false;
    }
    const equipmentError = validateEquipmentStep(formData, {imeiYaRegistrado});
    if (equipmentError) {
      showToast(equipmentError, 'error'); return false;
    }
    if (!clean(formData.nombreComercial)) {
      showToast('El nombre comercial es obligatorio', 'error'); return false;
    }
    if (imeiYaRegistrado(formData.imei)) {
      showToast(`El IMEI ${formData.imei} ya tiene un registro activo`, 'error'); return false;
    }
    if (esApple) {
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
            <h3 className="text-base font-semibold text-slate-900">
              {registroSamsungDual ? '¿Crear las dos solicitudes Samsung?' : '¿Los datos que pusiste son correctos?'}
            </h3>
            {registroSamsungDual && (
              <p className="mt-2 text-sm text-slate-600">IMEI 1 con {formData.celular} e IMEI 2 con {formData.celular2}.</p>
            )}
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
          <h3 id="registro-form-title" className="saas-page-title">{isEditing ? 'Editar registro' : 'Nuevo registro'}</h3>
          <p className="saas-page-desc">Completa los datos del cliente, equipo, precio y evidencias.</p>
        </div>
        <button type="button" onClick={onCancel} aria-label="Cerrar formulario de registro" className="saas-form-close"><X size={20}/></button>
      </div>

      {/* Indicador de pasos */}
      {scanNotice && <p role="status" className="mb-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{scanNotice}</p>}
      {mostrarEscaner && (
        <EscanerCaja
          key={initialData?.id || 'new'}
          onResult={onEscaneo}
          onClose={() => { setMostrarEscaner(false); setEscaneoProcesando(false); }}
          onProcessingStart={onEscaneoProcesando}
          onProcessingEnd={() => setEscaneoProcesando(false)}
          onError={onEscaneoError}
        />
      )}
      <div className="saas-stepper">
        {[1, 2, 3, 4].map(n => (
          <React.Fragment key={n}>
            <div className={`flex items-center gap-2 ${paso === n ? 'text-blue-600' : paso > n ? 'text-green-600' : 'text-gray-400'}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors
                ${paso === n ? 'border-blue-600 bg-blue-50 text-blue-600' : paso > n ? 'border-green-500 bg-green-50 text-green-600' : 'border-gray-300 text-gray-400'}`}>
                {paso > n ? <CheckCircle2 size={15} aria-label="Completado" /> : n}
              </div>
              <span className="text-xs font-medium hidden sm:block">
                {n === 1 ? 'Datos del cliente' : n === 2 ? 'Datos del equipo' : n === 3 ? 'Precio' : 'Evidencias'}
              </span>
            </div>
            {n < 4 && <div className={`flex-1 h-0.5 ${paso > n ? 'bg-green-400' : 'bg-gray-200'}`} />}
          </React.Fragment>
        ))}
      </div>

      <form onSubmit={handleSubmit} aria-labelledby="registro-form-title" noValidate className="saas-form">
        {/*

            <div><p className="font-bold">Solicitud de autoservicio precargada</p><p className="mt-1 text-xs leading-5 text-blue-700">Contrasta cada campo con las fotografías. Puedes corregir datos y agregar evidencias antes de guardar.</p></div>
          </div> */}

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
            {selectorEquipos}
            {clienteLookup.contactError && <p role="status" className="text-xs text-amber-800">{clienteLookup.contactError}</p>}
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
              {showManualEqForm && <button type="button" onClick={() => setMostrarEscaner(true)} disabled={mostrarEscaner} className="saas-secondary disabled:opacity-50"><ScanBarcode size={14}/> {mostrarEscaner ? 'Escaneo activo' : 'Escanear'}</button>}
            </div>

            {selectorEquipos}

            {showManualEqForm && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">IMEI 1 *</label>
                  <input name="imei1" value={formData.imei1} onChange={handleChange} inputMode="numeric" maxLength={15} className={`w-full border rounded p-2 text-sm font-mono ${claseEscaneo('imei1')} ${formData.imei1.length === 15 ? (luhn(formData.imei1) ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50') : ''}`} placeholder={placeholderEscaneo('imei1', '15 dígitos')} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">IMEI 2 <span className="font-normal text-[var(--ui-text-tertiary)]">(opcional)</span></label>
                  <input name="imei2" value={formData.imei2} onChange={handleChange} inputMode="numeric" maxLength={15} className={`w-full border rounded p-2 text-sm font-mono ${claseEscaneo('imei2')} ${formData.imei2.length === 15 ? (luhn(formData.imei2) ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50') : ''}`} placeholder={placeholderEscaneo('imei2', '15 dígitos si corresponde')} />
                </div>
                <fieldset className="sm:col-span-2 rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                  <legend className="px-1 text-xs font-extrabold text-slate-600">IMEI que se va a registrar *</legend>
                  {esSamsung && !isEditing && (
                    <div className="mb-3 border-b border-blue-100 pb-3">
                      <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={formData.registrarAmbosImeis === true}
                          disabled={!formData.imei2 || !luhn(formData.imei2) || imeiYaRegistrado(formData.imei1) || imeiYaRegistrado(formData.imei2)}
                          onChange={event => {
                            onDirty?.();
                            const checked = event.target.checked;
                            setFormData(prev => ({
                              ...prev,
                              registrarAmbosImeis: checked,
                              imei: checked ? prev.imei1 : prev.imei,
                              celular2: checked ? prev.celular2 : '',
                            }));
                          }}
                          className="mt-0.5 h-4 w-4 accent-blue-600"
                        />
                        <span>
                          <span className="font-semibold">Registrar los dos IMEI</span>
                          <span className="mt-0.5 block text-xs text-slate-500">Crea dos solicitudes separadas. Cada IMEI debe usar un número celular distinto.</span>
                        </span>
                      </label>
                      {registroSamsungDual && (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-slate-600">Celular 1, para IMEI 1</label>
                            <input value={formData.celular} readOnly className="w-full rounded border border-slate-200 bg-slate-100 p-2 text-sm" />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-slate-600">Celular 2, para IMEI 2 *</label>
                            <input name="celular2" value={formData.celular2} onChange={handleChange} inputMode="numeric" maxLength={9} className="w-full rounded border border-slate-200 bg-white p-2 text-sm" placeholder="9 dígitos, distinto al celular 1" />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {[['imei1', formData.imei1, 'IMEI 1'], ['imei2', formData.imei2, 'IMEI 2']].map(([key, value, label]) => (
                      <label key={key} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 font-mono text-xs ${!registroSamsungDual && formData.imei === value && value ? 'border-blue-500 bg-white text-blue-700' : 'border-slate-200 bg-white text-slate-600'} ${registroSamsungDual || !value || !luhn(value) || imeiYaRegistrado(value) ? 'cursor-not-allowed opacity-50' : 'hover:border-blue-300'}`}>
                        <input type="radio" name="imeiRegistrado" value={value} checked={!registroSamsungDual && Boolean(value) && formData.imei === value} onChange={() => { onDirty?.(); setComprobanteApple(emptyComprobanteApple()); setFormData(prev => ({...prev, imei: value, registrarAmbosImeis: false, celular2: ''})); }} disabled={registroSamsungDual || !value || !luhn(value) || imeiYaRegistrado(value)} className="accent-blue-600" />
                        <span><span className="font-sans font-bold">{label}</span><br />{value || 'Ingresa el IMEI'}{imeiYaRegistrado(value) && <span className="block font-sans text-amber-800">Ya tiene registro activo</span>}</span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-blue-700">{registroSamsungDual ? 'Se bloquearán ambos IMEI y se crearán dos solicitudes consecutivas.' : 'Puedes editar ambos IMEI. El seleccionado será el único que se bloqueará como registrado.'}</p>
                </fieldset>
                <div className="sm:col-span-2"><label className="block text-xs text-gray-500 mb-1">Nombre del equipo *</label><input name="nombreComercial" value={formData.nombreComercial} onChange={handleChange} className={`w-full border rounded p-2 text-sm ${claseEscaneo('nombreComercial')}`} placeholder={placeholderEscaneo('nombreComercial', 'Ej: GALAXY A56')} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Número de serie</label><input name="sn" value={formData.sn} onChange={handleChange} className="w-full border rounded p-2 text-sm font-mono" placeholder="S/N" maxLength={80} /></div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Marca *</label>
                  <select
                    name="marca"
                    value={formData.marca}
                    onChange={handleChange}
                    required
                    className={`w-full border rounded bg-white p-2 text-sm ${claseEscaneo('marca')}`}
                  >
                    <option value="">{escaneoProcesando ? 'Extrayendo...' : 'Selecciona una marca'}</option>
                    {REGISTRO_MARCAS.map(marca => <option key={marca} value={marca}>{marca}</option>)}
                    <option value={REGISTRO_MARCA_OTROS}>OTROS</option>
                  </select>
                </div>
                {formData.marca === REGISTRO_MARCA_OTROS && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Escribe la marca *</label>
                    <input name="marcaOtra" value={formData.marcaOtra} onChange={handleChange} required maxLength={80} autoComplete="off" className="w-full border rounded p-2 text-sm" placeholder="Ej: FAIRPHONE" />
                  </div>
                )}
                <div><label className="block text-xs text-gray-500 mb-1">Modelo</label><input name="modelo" value={formData.modelo} onChange={handleChange} className={`w-full border rounded p-2 text-sm ${claseEscaneo('modelo')}`} placeholder={placeholderEscaneo('modelo')} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Color</label><input name="color" value={formData.color} onChange={handleChange} className="w-full border rounded p-2 text-sm" placeholder="Ej: NEGRO" /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Memoria</label><input name="memoria" value={formData.memoria} onChange={handleChange} className="w-full border rounded p-2 text-sm" placeholder="Ej: 256 GB" maxLength={12} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">RAM</label><input name="ram" value={formData.ram} onChange={handleChange} className="w-full border rounded p-2 text-sm" placeholder="Ej: 8 GB" maxLength={12} /></div>
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
                onClick={async () => {
                  if (!(await validarPaso2())) return;
                  setPaso(3);
                }}
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
            <h4 className="saas-form-section-title">Precio y condiciones del registro</h4>
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
              <div><label className="block text-xs text-gray-500 mb-1">{esSamsung ? 'Origen del equipo Samsung *' : 'Tipo'}</label>
                <select name="tipo" value={formData.tipo} onChange={handleChange} required={esSamsung} className="w-full border rounded p-2 text-sm">
                  {esSamsung && <option value="">Selecciona TIENDA o EXTERNO</option>}
                  <option>TIENDA</option><option>EXTERNO</option>
                  {!esSamsung && <option>PASE</option>}
                </select>
                {esSamsung && <p className="mt-1 text-xs text-slate-500">Este dato se incluirá al compartir el registro.</p>}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Precio (S/.) *
                  {formData.estado === 'BLOQUEADO' && <span className="ml-1 text-orange-500 font-semibold">(mín. S/. 50.00)</span>}
                  {permitePrecioCero && <span className="ml-1 font-semibold text-emerald-600">(mín. S/. 0.00)</span>}
                </label>
                <input
                  required
                  type="number"
                  step="0.01"
                  min={formData.estado === 'BLOQUEADO' ? 50 : permitePrecioCero ? 0 : 0.01}
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
                  <p className="mt-1 inline-flex items-center gap-1 text-xs text-red-500"><AlertCircle size={14} /> El precio mínimo para BLOQUEADO es S/. 50.00</p>
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
              {/*
                {removedBranch
                  ? 'Ambas caras del DNI y el IMEI lógico son obligatorios. Al guardar se descargará el PDF de evidencias.'
                  : 'Las evidencias son opcionales tanto en registros nuevos como al editar. Si adjuntas fotos, se generará el PDF de evidencias.'}
              </p> */}
              <p className="mt-1 text-xs font-medium text-slate-500">Las evidencias son opcionales tanto en registros nuevos como al editar. Si adjuntas fotos, se generará el PDF de evidencias.</p>
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
                        <p className="text-sm font-semibold text-slate-900">{field.label}</p>
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
