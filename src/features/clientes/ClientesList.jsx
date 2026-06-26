import React, {useEffect, useMemo, useRef, useState} from 'react';
import {CalendarClock, ClipboardList, Edit, Eye, Search, ShoppingCart, Smartphone, Trash2, Users, X} from 'lucide-react';
import {actualizarCliente, consultarClientesOperativos, eliminarCliente, obtenerMensajeErrorFuncion} from '../../services/functionsClient.js';
import {TIPOS_DOCUMENTO, etiquetaDocumento} from '../../utils/documentos.js';
import {ConfirmModal} from '../../components/ui/ConfirmModal.jsx';

const clean = value => String(value || '').trim();
const uniqueClean = values => Array.from(new Set(values.map(clean).filter(Boolean)));
const lineasALista = value => uniqueClean(String(value || '').split(/\r?\n/));
const fechaHora = value => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};
const monto = value => Number(value || 0);
const soles = value => `S/. ${monto(value).toFixed(2)}`;
const CLIENTES_LIMIT = 25;
const TOP_CLIENTES_LIMIT = 10;
const MIN_SEARCH_LENGTH = 3;

export function ClientesList({showToast}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchField, setSearchField] = useState('todo');
  const [selectedDni, setSelectedDni] = useState(null);
  const [editando, setEditando] = useState(false);
  const [editForm, setEditForm] = useState({tipoDocumento: 'DNI', nombre: '', celular: '', correo: '', direccion: '', celulares: '', correos: ''});
  const [guardando, setGuardando] = useState(false);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const [clientesOperativos, setClientesOperativos] = useState([]);
  const [totalResultados, setTotalResultados] = useState(0);
  const [nextCursor, setNextCursor] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [errorCarga, setErrorCarga] = useState('');
  const showToastRef = useRef(showToast);
  const requestIdRef = useRef(0);
  const clientesCacheRef = useRef(new Map());

  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  useEffect(() => {
    const term = searchTerm.trim();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (term && term.length < MIN_SEARCH_LENGTH) {
      const timeoutId = window.setTimeout(() => {
        if (requestId !== requestIdRef.current) return;
        setCargando(false);
        setErrorCarga('');
        setClientesOperativos([]);
        setTotalResultados(0);
        setNextCursor(null);
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }

    let active = true;
    const limit = term ? CLIENTES_LIMIT : TOP_CLIENTES_LIMIT;
    const cacheKey = `${searchField}|${term}|${limit}|inicio`;
    const timeoutId = window.setTimeout(async () => {
      const cached = clientesCacheRef.current.get(cacheKey);
      if (cached) {
        setClientesOperativos(Array.isArray(cached.clientes) ? cached.clientes : []);
        setTotalResultados(Number(cached.total || 0));
        setNextCursor(cached.nextCursor || null);
        setErrorCarga('');
        setCargando(false);
        return;
      }

      setCargando(true);
      setErrorCarga('');
      try {
        const response = await consultarClientesOperativos({
          searchTerm: term,
          searchField,
          limit,
        });
        clientesCacheRef.current.set(cacheKey, response);
        if (!active || requestId !== requestIdRef.current) return;
        setClientesOperativos(Array.isArray(response.clientes) ? response.clientes : []);
        setTotalResultados(Number(response.total || 0));
        setNextCursor(response.nextCursor || null);
      } catch (error) {
        console.error(error);
        if (!active || requestId !== requestIdRef.current) return;
        setErrorCarga(obtenerMensajeErrorFuncion(error, 'No se pudo cargar el directorio'));
        showToastRef.current?.(obtenerMensajeErrorFuncion(error, 'No se pudo cargar el directorio'), 'error');
      } finally {
        if (active && requestId === requestIdRef.current) setCargando(false);
      }
    }, term ? 700 : 0);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [searchField, searchTerm]);

  const cargarMasClientes = async () => {
    if (!nextCursor || cargandoMas) return;
    const term = searchTerm.trim();
    if (term && term.length < MIN_SEARCH_LENGTH) return;
    const cacheKey = `${searchField}|${term}|${CLIENTES_LIMIT}|${nextCursor}`;
    setCargandoMas(true);
    setErrorCarga('');
    try {
      const cached = clientesCacheRef.current.get(cacheKey);
      const response = cached || await consultarClientesOperativos({
        searchTerm: term,
        searchField,
        limit: CLIENTES_LIMIT,
        cursor: nextCursor,
      });
      if (!cached) clientesCacheRef.current.set(cacheKey, response);
      const nuevos = Array.isArray(response.clientes) ? response.clientes : [];
      setClientesOperativos(prev => {
        const mapa = new Map(prev.map(cliente => [cliente.dni, cliente]));
        nuevos.forEach(cliente => mapa.set(cliente.dni, cliente));
        return Array.from(mapa.values());
      });
      setTotalResultados(Number(response.total || 0));
      setNextCursor(response.nextCursor || null);
    } catch (error) {
      console.error(error);
      const message = obtenerMensajeErrorFuncion(error, 'No se pudo cargar mas clientes');
      setErrorCarga(message);
      showToastRef.current?.(message, 'error');
    } finally {
      setCargandoMas(false);
    }
  };

  const clientesVisibles = clientesOperativos;

  const selectedClient = clientesOperativos.find(cliente => cliente.dni === selectedDni);
  const celularesSeleccionado = selectedClient ? uniqueClean([
    selectedClient.celular,
    selectedClient.celularRef,
    ...(Array.isArray(selectedClient.celulares) ? selectedClient.celulares : []),
  ]) : [];
  const correosSeleccionado = selectedClient ? uniqueClean([
    selectedClient.correo,
    ...(Array.isArray(selectedClient.correos) ? selectedClient.correos : []),
  ]) : [];

  const abrirEdicion = () => {
    if (!selectedClient) return;
    setEditForm({
      tipoDocumento: selectedClient.tipoDocumento || 'DNI',
      nombre: selectedClient.nombre || '',
      celular: selectedClient.celular || celularesSeleccionado[0] || '',
      correo: selectedClient.correo || correosSeleccionado[0] || '',
      direccion: selectedClient.direccion || '',
      celulares: celularesSeleccionado.join('\n'),
      correos: correosSeleccionado.join('\n'),
    });
    setEditando(true);
  };

  const guardarCliente = async () => {
    if (!selectedClient) return;
    const celulares = lineasALista(editForm.celulares);
    const correos = lineasALista(editForm.correos).map(correo => correo.toLowerCase());
    setGuardando(true);
    try {
      const response = await actualizarCliente({
        cliente: {
          dni: selectedClient.dni,
          tipoDocumento: editForm.tipoDocumento || selectedClient.tipoDocumento || 'DNI',
          nombre: editForm.nombre,
          celular: editForm.celular || celulares[0] || '',
          celularRef: editForm.celular || celulares[0] || '',
          correo: editForm.correo || correos[0] || '',
          direccion: editForm.direccion,
          celulares,
          correos,
        },
      });
      clientesCacheRef.current.clear();
      if (response?.cliente) {
        setClientesOperativos(prev => prev.map(cliente => (
          cliente.dni === selectedClient.dni ? {...cliente, ...response.cliente} : cliente
        )));
      }
      showToast?.('Cliente actualizado');
      setEditando(false);
    } catch (error) {
      console.error(error);
      showToast?.(obtenerMensajeErrorFuncion(error, 'No se pudo actualizar el cliente'), 'error');
    } finally {
      setGuardando(false);
    }
  };

  const borrarCliente = async () => {
    if (!selectedClient) return;
    setGuardando(true);
    try {
      await eliminarCliente(selectedClient.dni);
      clientesCacheRef.current.clear();
      showToast?.('Cliente eliminado');
      setClientesOperativos(prev => prev.filter(cliente => cliente.dni !== selectedClient.dni));
      setTotalResultados(prev => Math.max(prev - 1, 0));
      setSelectedDni(null);
      setEditando(false);
      setConfirmarEliminar(false);
    } catch (error) {
      console.error(error);
      showToast?.(obtenerMensajeErrorFuncion(error, 'No se pudo eliminar el cliente'), 'error');
    } finally {
      setGuardando(false);
    }
  };

  const historialSeleccionado = useMemo(() => {
    if (!selectedClient) return [];
    return [
      ...selectedClient.ventas.map(venta => ({
        id: `venta-${venta.id || venta.nVenta || venta.imeiEquipo}`,
        tipo: 'Venta',
        fecha: venta.fecha,
        codigo: venta.nVenta || 'Venta',
        equipo: `${venta.marcaEquipo || ''} ${venta.nombreComercial || venta.modeloEquipo || ''}`.trim(),
        imei: venta.imeiEquipo,
        monto: venta.precio,
      })),
      ...selectedClient.registros.map(registro => ({
        id: `registro-${registro.id || registro.nRegistro || registro.imeiRegistrado}`,
        tipo: 'Registro',
        fecha: registro.fecha,
        codigo: registro.nRegistro || 'Registro',
        equipo: `${registro.marcaEquipo || ''} ${registro.nombreComercialEquipo || registro.modeloEquipo || ''}`.trim(),
        imei: registro.imeiRegistrado || registro.imeiEquipo,
        monto: registro.precio,
      })),
    ].sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
  }, [selectedClient]);

  return (
    <div className="saas-list-shell">
      <ConfirmModal
        open={confirmarEliminar}
        title="Eliminar cliente"
        message="Se eliminara la ficha del cliente. No se borraran ventas ni registros existentes."
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        tone="danger"
        loading={guardando}
        onConfirm={borrarCliente}
        onCancel={() => setConfirmarEliminar(false)}
      />
      <div className="saas-list-toolbar">
        <div>
          <p className="saas-page-kicker">Clientes</p>
          <h2 className="saas-page-title">Directorio operativo</h2>
          <p className="saas-page-desc">
            {cargando
              ? 'Cargando clientes...'
              : searchTerm
                ? `${totalResultados} resultado${totalResultados !== 1 ? 's' : ''}`
                : `${clientesVisibles.length} de ${totalResultados} cliente${totalResultados !== 1 ? 's' : ''} con ventas o registros`}
          </p>
        </div>
        <div className="saas-toolbar-actions">
          <select
            value={searchField}
            onChange={e => setSearchField(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="todo">Busqueda avanzada</option>
            <option value="dni">Documento</option>
            <option value="imei">IMEI</option>
            <option value="modelo">Modelo</option>
            <option value="nombreComercial">Nombre comercial</option>
            <option value="sn">Numero de serie</option>
            <option value="nombre">Cliente</option>
          </select>
          <div className="saas-searchbox">
            <input
              type="text"
              placeholder="Buscar cliente, equipo o serie"
              className="saas-search-input"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            <Search size={18} />
          </div>
        </div>
      </div>

      {cargando ? (
        <div className="saas-empty py-20">
          <Users size={48} strokeWidth={1.4} />
          <p className="text-base font-semibold">Cargando directorio operativo...</p>
          <p className="text-sm">Calculando clientes, historial e ingresos completos.</p>
        </div>
      ) : errorCarga ? (
        <div className="saas-empty py-20">
          <Users size={48} strokeWidth={1.4} />
          <p className="text-base font-semibold">No se pudo cargar clientes</p>
          <p className="text-sm">{errorCarga}</p>
        </div>
      ) : clientesVisibles.length === 0 ? (
        <div className="saas-empty py-20">
          <Users size={48} strokeWidth={1.4} />
          <p className="text-base font-semibold">No se encontraron clientes</p>
          <p className="text-sm">Prueba con otro DNI, IMEI, modelo, nombre comercial o serie.</p>
        </div>
      ) : (
        <>
        <div className="md:hidden saas-mobile-list">
          {clientesVisibles.map(cliente => {
            const historial = [
              ...cliente.ventas.map(item => item.fecha),
              ...cliente.registros.map(item => item.fecha),
            ].filter(Boolean).sort((a, b) => new Date(b) - new Date(a));
            return (
              <button key={cliente.dni} type="button" onClick={() => setSelectedDni(cliente.dni)} className="saas-mobile-row w-full text-left">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-slate-900">{cliente.nombre || 'Cliente sin nombre'}</p>
                    <p className="mt-0.5 break-all font-mono text-xs text-slate-500">{etiquetaDocumento(cliente.tipoDocumento)} {cliente.dni}</p>
                    {cliente.celular && <p className="mt-0.5 text-xs text-slate-500">{cliente.celular}</p>}
                  </div>
                  <p className="shrink-0 text-right text-sm font-bold text-emerald-700">{soles(cliente.totalIngreso)}</p>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <span className="rounded-md bg-emerald-50 px-2 py-2 text-xs font-semibold text-emerald-700">{cliente.ventas.length} ventas</span>
                  <span className="rounded-md bg-blue-50 px-2 py-2 text-xs font-semibold text-blue-700">{cliente.registros.length} reg.</span>
                  <span className="rounded-md bg-slate-50 px-2 py-2 text-xs font-semibold text-slate-700">{cliente.equipos.length} equipos</span>
                </div>
                <p className="mt-3 text-xs text-slate-500">Ultimo movimiento: {fechaHora(historial[0])}</p>
              </button>
            );
          })}
        </div>

        <div className="hidden md:block">
          <table className="saas-table text-left">
            <thead>
              <tr>
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3">Actividad</th>
                <th className="px-5 py-3">Ingreso total</th>
                <th className="px-5 py-3">Ultimo movimiento</th>
                <th className="px-5 py-3">Equipos</th>
                <th className="px-5 py-3 text-right">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clientesVisibles.map(cliente => {
                const historial = [
                  ...cliente.ventas.map(item => item.fecha),
                  ...cliente.registros.map(item => item.fecha),
                ].filter(Boolean).sort((a, b) => new Date(b) - new Date(a));
                return (
                  <tr key={cliente.dni} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">{cliente.nombre || 'Cliente sin nombre'}</p>
                      <p className="mt-0.5 text-xs font-mono text-slate-500">{etiquetaDocumento(cliente.tipoDocumento)} {cliente.dni}</p>
                      {cliente.celular && <p className="mt-0.5 text-xs text-slate-500">{cliente.celular}</p>}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-md border border-emerald-100 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">{cliente.ventas.length} venta{cliente.ventas.length !== 1 ? 's' : ''}</span>
                        <span className="rounded-md border border-blue-100 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">{cliente.registros.length} registro{cliente.registros.length !== 1 ? 's' : ''}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-bold text-emerald-700">{soles(cliente.totalIngreso)}</p>
                      <p className="text-xs text-slate-400">Ventas {soles(cliente.totalVentas)} · Reg. {soles(cliente.totalRegistros)}</p>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">{fechaHora(historial[0])}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Smartphone size={16} />
                        {cliente.equipos.length}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button onClick={() => setSelectedDni(cliente.dni)} className="saas-icon-button" title="Ver cliente">
                        <Eye size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {nextCursor && (
          <div className="border-t border-slate-100 p-4 text-center">
            <button type="button" onClick={cargarMasClientes} disabled={cargandoMas} className="saas-secondary disabled:opacity-60">
              {cargandoMas ? 'Cargando...' : 'Cargar mas clientes'}
            </button>
          </div>
        )}
        </>
      )}

      {selectedClient && (
        <div className="saas-modal-backdrop fixed inset-0 z-[200] overflow-y-auto p-0 sm:p-4">
          <div className="saas-detail-modal min-h-screen w-full p-0 sm:mx-auto sm:my-6 sm:min-h-0 sm:max-w-4xl">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-5 py-4">
              <div className="min-w-0">
                <p className="saas-page-kicker">Ficha del cliente</p>
                <h3 className="break-words text-lg font-semibold text-slate-900">{selectedClient.nombre || 'Cliente sin nombre'}</h3>
                <p className="mt-1 text-sm text-slate-500">{etiquetaDocumento(selectedClient.tipoDocumento)} {selectedClient.dni}{selectedClient.celular ? ` · ${selectedClient.celular}` : ''}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button onClick={abrirEdicion} className="saas-icon-button" title="Editar cliente"><Edit size={18}/></button>
                <button onClick={() => setConfirmarEliminar(true)} disabled={guardando} className="saas-icon-button text-red-600" title="Eliminar cliente"><Trash2 size={18}/></button>
                <button onClick={() => { setSelectedDni(null); setEditando(false); }} className="saas-form-close"><X size={20}/></button>
              </div>
            </div>

            <div className="grid gap-5 p-5 lg:grid-cols-[300px_1fr]">
              <aside className="space-y-3">
                {editando ? (
                  <div className="rounded-lg border border-slate-200 p-4">
                    <p className="text-sm font-semibold text-slate-900">Editar cliente</p>
                    <div className="mt-3 space-y-3">
                      <div>
                        <label className="block text-xs text-slate-500">Tipo de documento</label>
                        <select value={editForm.tipoDocumento} onChange={e => setEditForm(prev => ({...prev, tipoDocumento: e.target.value}))} className="mt-1 w-full rounded border border-slate-200 bg-white p-2 text-sm">
                          {TIPOS_DOCUMENTO.map(tipo => <option key={tipo.value} value={tipo.value}>{tipo.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500">Nombre</label>
                        <input value={editForm.nombre} onChange={e => setEditForm(prev => ({...prev, nombre: e.target.value.toUpperCase()}))} className="mt-1 w-full rounded border border-slate-200 p-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500">Celular principal</label>
                        <input value={editForm.celular} onChange={e => setEditForm(prev => ({...prev, celular: e.target.value.replace(/\D/g, '').slice(0, 9)}))} className="mt-1 w-full rounded border border-slate-200 p-2 text-sm" inputMode="numeric" />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500">Celulares (uno por linea)</label>
                        <textarea value={editForm.celulares} onChange={e => setEditForm(prev => ({...prev, celulares: e.target.value.replace(/[^\d\r\n]/g, '')}))} className="mt-1 min-h-24 w-full rounded border border-slate-200 p-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500">Correo principal</label>
                        <input value={editForm.correo} onChange={e => setEditForm(prev => ({...prev, correo: e.target.value.trim().toLowerCase()}))} className="mt-1 w-full rounded border border-slate-200 p-2 text-sm" type="email" />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500">Correos (uno por linea)</label>
                        <textarea value={editForm.correos} onChange={e => setEditForm(prev => ({...prev, correos: e.target.value.toLowerCase()}))} className="mt-1 min-h-24 w-full rounded border border-slate-200 p-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500">Direccion</label>
                        <input value={editForm.direccion} onChange={e => setEditForm(prev => ({...prev, direccion: e.target.value.toUpperCase()}))} className="mt-1 w-full rounded border border-slate-200 p-2 text-sm" />
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button type="button" onClick={() => setEditando(false)} className="saas-secondary">Cancelar</button>
                        <button type="button" onClick={guardarCliente} disabled={guardando} className="saas-primary disabled:opacity-60">{guardando ? 'Guardando...' : 'Guardar'}</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-200 p-4">
                    <p className="text-sm font-semibold text-slate-900">Contacto</p>
                    <div className="mt-3 space-y-3 text-sm text-slate-600">
                      <div>
                        <p className="text-xs font-semibold uppercase text-slate-400">Celulares usados</p>
                        <p className="mt-1">{celularesSeleccionado.length ? celularesSeleccionado.join(', ') : 'Sin celulares'}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase text-slate-400">Correos usados</p>
                        <p className="mt-1 break-all">{correosSeleccionado.length ? correosSeleccionado.join(', ') : 'Sin correos'}</p>
                      </div>
                      {selectedClient.direccion && (
                        <div>
                          <p className="text-xs font-semibold uppercase text-slate-400">Direccion</p>
                          <p className="mt-1">{selectedClient.direccion}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Resumen</p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-white p-3">
                      <p className="text-lg font-semibold text-slate-900">{selectedClient.ventas.length}</p>
                      <p className="text-[10px] uppercase text-slate-400">Ventas</p>
                    </div>
                    <div className="rounded-lg bg-white p-3">
                      <p className="text-lg font-semibold text-slate-900">{selectedClient.registros.length}</p>
                      <p className="text-[10px] uppercase text-slate-400">Registros</p>
                    </div>
                    <div className="rounded-lg bg-white p-3">
                      <p className="text-lg font-semibold text-slate-900">{selectedClient.equipos.length}</p>
                      <p className="text-[10px] uppercase text-slate-400">Equipos</p>
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg bg-white p-3">
                    <p className="text-xs font-semibold uppercase text-slate-400">Ingreso generado</p>
                    <p className="mt-1 text-2xl font-bold text-emerald-700">{soles(selectedClient.totalIngreso)}</p>
                    <p className="mt-1 text-xs text-slate-500">Ventas {soles(selectedClient.totalVentas)} - Registros {soles(selectedClient.totalRegistros)}</p>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-900">Equipos asociados</p>
                  <div className="mt-3 space-y-2">
                    {selectedClient.equipos.length === 0 ? (
                      <p className="text-sm text-slate-500">Sin equipos asociados.</p>
                    ) : selectedClient.equipos.map(equipo => (
                      <div key={equipo.idEquipo} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                        <p className="text-sm font-semibold text-slate-800">{equipo.marca} {equipo.nombreComercial || equipo.modelo}</p>
                        <p className="mt-1 font-mono text-xs text-slate-500">{equipo.idEquipo}</p>
                        {equipo.imei2 && <p className="font-mono text-xs text-slate-500">{equipo.imei2}</p>}
                        {equipo.sn && <p className="mt-1 text-xs text-slate-500">S/N {equipo.sn}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              </aside>

              <section className="rounded-lg border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-900">Historial operativo</p>
                  <CalendarClock size={17} className="text-slate-400" />
                </div>
                <div className="divide-y divide-slate-100">
                  {historialSeleccionado.length === 0 ? (
                    <div className="p-6 text-sm text-slate-500">Sin historial registrado.</div>
                  ) : historialSeleccionado.map(item => (
                    <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                      <span className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg ${item.tipo === 'Venta' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
                        {item.tipo === 'Venta' ? <ShoppingCart size={16}/> : <ClipboardList size={16}/>}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">{item.tipo} · {item.codigo}</p>
                          <span className="text-xs text-slate-400">{fechaHora(item.fecha)}</span>
                        </div>
                        <p className="mt-0.5 break-words text-sm text-slate-600">{item.equipo || 'Equipo sin detalle'}</p>
                        {item.imei && <p className="mt-0.5 break-all font-mono text-xs text-slate-500">{item.imei}</p>}
                      </div>
                      {item.monto && <p className="shrink-0 text-sm font-semibold text-slate-700">{soles(item.monto)}</p>}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
