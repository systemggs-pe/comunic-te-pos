import React, {useMemo, useState} from 'react';
import {CalendarClock, ClipboardList, Edit, Eye, Search, ShoppingCart, Smartphone, Trash2, Users, X} from 'lucide-react';
import {actualizarCliente, eliminarCliente, obtenerMensajeErrorFuncion} from '../../services/functionsClient.js';
import {TIPOS_DOCUMENTO, etiquetaDocumento} from '../../utils/documentos.js';
import {ConfirmModal} from '../../components/ui/ConfirmModal.jsx';

const normalizar = value => String(value || '').trim().toLowerCase();
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

export function ClientesList({clientes, equipos, registros, ventas = [], showToast}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchField, setSearchField] = useState('todo');
  const [selectedDni, setSelectedDni] = useState(null);
  const [editando, setEditando] = useState(false);
  const [editForm, setEditForm] = useState({tipoDocumento: 'DNI', nombre: '', celular: '', correo: '', direccion: '', celulares: '', correos: ''});
  const [guardando, setGuardando] = useState(false);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);

  const clientesOperativos = useMemo(() => {
    const mapa = new Map(clientes.map(cliente => [cliente.dni, {...cliente}]));

    ventas.forEach(venta => {
      if (!venta.dniCliente) return;
      if (!mapa.has(venta.dniCliente)) {
        mapa.set(venta.dniCliente, {
          id: venta.dniCliente,
          dni: venta.dniCliente,
          tipoDocumento: venta.tipoDocumentoCliente || 'DNI',
          nombre: venta.nombreCliente || '',
          celular: venta.celularCliente || '',
        });
      }
    });

    registros.forEach(registro => {
      if (!registro.dniCliente) return;
      if (!mapa.has(registro.dniCliente)) {
        mapa.set(registro.dniCliente, {
          id: registro.dniCliente,
          dni: registro.dniCliente,
          tipoDocumento: registro.tipoDocumentoCliente || 'DNI',
          nombre: registro.nombreCliente || '',
          celular: registro.celularCliente || '',
          celularRef: registro.celularRef || '',
        });
      }
    });

    return Array.from(mapa.values()).map(cliente => {
      const ventasCliente = ventas.filter(venta => venta.dniCliente === cliente.dni);
      const registrosCliente = registros.filter(registro => registro.dniCliente === cliente.dni);
      const equiposPorDni = equipos.filter(equipo => equipo.idDuenio === cliente.dni);
      const equiposPorMovimientos = [...ventasCliente, ...registrosCliente]
        .filter(item => item.imeiEquipo)
        .map(item => ({
          idEquipo: item.imeiEquipo,
          imei2: item.imei2Equipo || '',
          sn: item.sn || '',
          marca: item.marcaEquipo || '',
          modelo: item.modeloEquipo || '',
          nombreComercial: item.nombreComercial || item.nombreComercialEquipo || '',
          color: item.color || '',
          memoria: item.memoria || '',
        }));
      const equiposMap = new Map();
      [...equiposPorDni, ...equiposPorMovimientos].forEach(equipo => {
        if (!equipo?.idEquipo) return;
        equiposMap.set(equipo.idEquipo, {...(equiposMap.get(equipo.idEquipo) || {}), ...equipo});
      });

      return {
        ...cliente,
        ventas: ventasCliente,
        registros: registrosCliente,
        equipos: Array.from(equiposMap.values()),
        actividad: ventasCliente.length + registrosCliente.length,
      };
    }).filter(cliente => cliente.actividad > 0);
  }, [clientes, equipos, registros, ventas]);

  const clientesVisibles = useMemo(() => {
    const term = normalizar(searchTerm);
    const coincide = (cliente) => {
      if (!term) return true;
      const campos = {
        dni: [cliente.dni],
        nombre: [cliente.nombre],
        imei: cliente.equipos.flatMap(equipo => [equipo.idEquipo, equipo.imei2]),
        modelo: cliente.equipos.map(equipo => equipo.modelo),
        nombreComercial: cliente.equipos.map(equipo => equipo.nombreComercial),
        sn: cliente.equipos.map(equipo => equipo.sn),
      };
      const valores = searchField === 'todo'
        ? Object.values(campos).flat()
        : campos[searchField] || [];
      return valores.some(value => normalizar(value).includes(term));
    };

    const filtrados = clientesOperativos.filter(coincide);
    const ordenados = [...filtrados].sort((a, b) => {
      if (b.actividad !== a.actividad) return b.actividad - a.actividad;
      return normalizar(a.nombre).localeCompare(normalizar(b.nombre));
    });
    return term ? ordenados : ordenados.slice(0, 10);
  }, [clientesOperativos, searchField, searchTerm]);

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
      await actualizarCliente({
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
      showToast?.('Cliente eliminado');
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
            {searchTerm ? `${clientesVisibles.length} resultado${clientesVisibles.length !== 1 ? 's' : ''}` : 'Top 10 clientes con mas ventas o registros'}
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

      {clientesVisibles.length === 0 ? (
        <div className="saas-empty py-20">
          <Users size={48} strokeWidth={1.4} />
          <p className="text-base font-semibold">No se encontraron clientes</p>
          <p className="text-sm">Prueba con otro DNI, IMEI, modelo, nombre comercial o serie.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="saas-table text-left">
            <thead>
              <tr>
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3">Actividad</th>
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
      )}

      {selectedClient && (
        <div className="saas-modal-backdrop fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="saas-detail-modal max-h-[88vh] w-full max-w-4xl overflow-y-auto p-0">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-5 py-4">
              <div>
                <p className="saas-page-kicker">Ficha del cliente</p>
                <h3 className="text-lg font-semibold text-slate-900">{selectedClient.nombre || 'Cliente sin nombre'}</h3>
                <p className="mt-1 text-sm text-slate-500">{etiquetaDocumento(selectedClient.tipoDocumento)} {selectedClient.dni}{selectedClient.celular ? ` · ${selectedClient.celular}` : ''}</p>
              </div>
              <div className="flex items-center gap-2">
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
                        <p className="mt-1 break-words">{correosSeleccionado.length ? correosSeleccionado.join(', ') : 'Sin correos'}</p>
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
                  <p className="text-sm font-semibold text-slate-900">Historial de ventas y registros</p>
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
                        <p className="mt-0.5 truncate text-sm text-slate-600">{item.equipo || 'Equipo sin detalle'}</p>
                        {item.imei && <p className="mt-0.5 font-mono text-xs text-slate-500">{item.imei}</p>}
                      </div>
                      {item.monto && <p className="text-sm font-semibold text-slate-700">S/. {Number(item.monto).toFixed(2)}</p>}
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
