import React, { useState, useEffect } from 'react';
import { Menu, X, Home, ShoppingCart, ClipboardList, Plus, Search, Edit, Trash2, Printer, Copy, Eye, CheckCircle2, AlertCircle, Users, ScanBarcode, UploadCloud, ChevronDown, ChevronUp, LogOut, FileText, Share2, Settings, ImagePlus } from 'lucide-react';
import { consultarReniecDni } from '../../services/functionsClient.js';
import { luhn } from '../../utils/imei.js';
import { penToClp, formatClp } from '../../utils/currency.js';
import { toLocalDatetimeValueBoleta } from '../../utils/dates.js';
import { EscanerIA } from '../registros/EscanerIA.jsx';
import { generarBoletaExtranjera, generarBoletaExtranjera2 } from './boletaPdf.js';
export function BoletaExtranjera({ clientes, equipos, ventas, showToast }) {
  const [modo, setModo] = useState('buscar');
  const [fechaHora, setFechaHora] = useState(toLocalDatetimeValueBoleta(new Date()));
  const [modalBoleta, setModalBoleta] = useState(null);

  // ── MODO BUSCAR ──
  const [searchDni, setSearchDni] = useState('');
  const [clienteEncontrado, setClienteEncontrado] = useState(null);
  const [ventasCliente, setVentasCliente] = useState([]);
  const [seleccionadas, setSeleccionadas] = useState(new Set());

  const buscar = () => {
    const dni = searchDni.trim();
    const cliente = clientes.find(c => c.dni === dni);
    if (!cliente) { showToast('Cliente no encontrado', 'error'); return; }
    const vs = ventas.filter(v => v.dniCliente === dni);
    setClienteEncontrado(cliente);
    setVentasCliente(vs);
    setSeleccionadas(new Set(vs.map(v => v.id)));
  };

  const toggleVenta = (id) => {
    setSeleccionadas(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };

  const ventasSel = ventasCliente.filter(v => seleccionadas.has(v.id));
  const totalPen  = ventasSel.reduce((s, v) => s + parseFloat(v.precio || 0), 0);
  const totalClp  = penToClp(totalPen);

  const emitirDesdeVentas = () => {
    if (!clienteEncontrado || ventasSel.length === 0) { showToast('Selecciona al menos una venta', 'error'); return; }
    const equiposMap = {};
    equipos.forEach(e => { equiposMap[e.idEquipo] = e; });
    setModalBoleta({ cliente: clienteEncontrado, ventas: ventasSel, equiposMap, totalClp, fechaHora });
  };

  // ── MODO NUEVA BOLETA MANUAL ──
  const [mostrarEscanerBoleta, setMostrarEscanerBoleta] = useState(false);
  const emptyForm = { nombre: '', rut: '', imei1: '', imei2: '', sn: '', marca: '', modelo: '', nombreComercial: '', memoria: '', color: '', precio: '' };
  const [form, setForm] = useState(emptyForm);
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
    setModalBoleta({
      cliente: { nombre: form.nombre, dni: form.rut },
      ventas: [{
        imeiEquipo: form.imei1, marcaEquipo: form.marca,
        nombreComercial: form.nombreComercial, modeloEquipo: form.modelo,
        precio: form.precio, color: form.color, memoria: form.memoria,
      }],
      equiposMap: { [form.imei1]: { imei2: form.imei2, sn: form.sn, color: form.color, memoria: form.memoria, nombreComercial: form.nombreComercial } },
      totalClp: clpVal,
      fechaHora,
    });
  };

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
                onClick={async () => { setModalBoleta(null); await generarBoletaExtranjera(modalBoleta); }}
                className="saas-primary w-full flex-col py-3.5">
                <span>Boleta 1</span>
                <span className="text-xs font-normal opacity-80">Formato térmico 48mm — Roberto Pizarro</span>
              </button>
              <button
                onClick={async () => { setModalBoleta(null); await generarBoletaExtranjera2(modalBoleta); }}
                className="saas-secondary w-full flex-col py-3.5">
                <span>Boleta 2</span>
                <span className="text-xs font-normal opacity-80">Formato 80mm — Álvaro Pizarro · PDF417</span>
              </button>
            </div>
            <button onClick={() => setModalBoleta(null)} className="saas-secondary mt-4 w-full">Cancelar</button>
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
        </div>

        {/* ── MODO BUSCAR ── */}
        {modo === 'buscar' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input value={searchDni} onChange={e => setSearchDni(e.target.value.replace(/\D/g,''))}
                onKeyDown={e => e.key === 'Enter' && buscar()}
                placeholder="DNI del cliente..." inputMode="numeric"
                className="flex-1 min-w-0" />
              <button onClick={buscar} className="saas-primary">
                <Search size={16}/> Buscar
              </button>
            </div>

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
            {mostrarEscanerBoleta && <EscanerIA onResult={onEscanerBoleta} onClose={() => setMostrarEscanerBoleta(false)} />}

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
              <button onClick={() => setForm(emptyForm)} className="saas-secondary">Limpiar</button>
              <button onClick={emitirNueva} className="saas-primary flex-1">
                <Printer size={16}/> Generar Boleta
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

