import React, {useEffect, useMemo, useRef, useState} from 'react';
import {addDoc, collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc} from 'firebase/firestore';
import {AlertTriangle, Bug, CheckCircle2, Clock3, Edit, FileCode2, Megaphone, Plus, RotateCcw, Save, Search, Share2, Wrench} from 'lucide-react';
import {appId, db} from '../../lib/firebase.js';

const severidades = [
  {value: 'critico', label: 'Critico', badge: 'border-red-200 bg-red-50 text-red-700'},
  {value: 'alto', label: 'Alto', badge: 'border-orange-200 bg-orange-50 text-orange-700'},
  {value: 'medio', label: 'Medio', badge: 'border-amber-200 bg-amber-50 text-amber-700'},
  {value: 'bajo', label: 'Bajo', badge: 'border-slate-200 bg-slate-50 text-slate-700'},
];

const emptyForm = {
  titulo: '',
  descripcion: '',
  archivos: '',
  severidad: 'medio',
  solucion: '',
  resuelto: false,
};

const getSeveridad = value => severidades.find(item => item.value === value) || severidades[2];

const fechaCorta = value => {
  if (!value) return '-';
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const normalize = value => String(value || '').trim().toLowerCase();

const rutasArchivos = value => {
  const lines = Array.isArray(value) ? value : String(value || '').split(/\r?\n/);
  return Array.from(new Set(lines.map(item => String(item || '').trim()).filter(Boolean))).slice(0, 20);
};

const archivosToText = value => rutasArchivos(value).join('\n');

const copiarAlPortapapeles = async text => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
};

const textoCompartirProblema = problema => {
  const archivos = rutasArchivos(problema.archivos);
  return [
    `PROBLEMA:\n${problema.titulo || '-'}`,
    `DETALLE:\n${problema.descripcion || '-'}`,
    `RUTA${archivos.length === 1 ? '' : 'S'}:\n${archivos.length ? archivos.map(archivo => `- ${archivo}`).join('\n') : '-'}`,
    `SOLUCION:\n${problema.solucion || 'Pendiente'}`,
  ].join('\n\n');
};

export function ProblemasApp({user, showToast}) {
  const [problemas, setProblemas] = useState([]);
  const [changelog, setChangelog] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('abiertos');
  const [filtroSeveridad, setFiltroSeveridad] = useState('todas');
  const showToastRef = useRef(showToast);

  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  useEffect(() => {
    const problemasQuery = query(
      collection(db, 'artifacts', appId, 'users', 'shared', 'problemasApp'),
      orderBy('updatedAt', 'desc'),
    );
    const changelogQuery = query(
      collection(db, 'artifacts', appId, 'users', 'shared', 'changelogProblemas'),
      orderBy('createdAt', 'desc'),
      limit(20),
    );

    const unsubProblemas = onSnapshot(
      problemasQuery,
      (snap) => {
        const data = snap.docs.map(item => ({id: item.id, ...item.data()}));
        setProblemas(data);
      },
      (error) => {
        console.error(error);
        showToastRef.current?.('No se pudo cargar problemas', 'error');
      },
    );

    const unsubChangelog = onSnapshot(
      changelogQuery,
      (snap) => {
        const data = snap.docs.map(item => ({id: item.id, ...item.data()}));
        setChangelog(data);
      },
      (error) => {
        console.error(error);
        showToastRef.current?.('No se pudo cargar changelog', 'error');
      },
    );

    return () => {
      unsubProblemas();
      unsubChangelog();
    };
  }, []);

  const stats = useMemo(() => {
    const abiertos = problemas.filter(item => !item.resuelto);
    return {
      abiertos: abiertos.length,
      resueltos: problemas.length - abiertos.length,
      criticos: abiertos.filter(item => item.severidad === 'critico').length,
      total: problemas.length,
    };
  }, [problemas]);

  const problemasFiltrados = useMemo(() => {
    const needle = normalize(busqueda);
    return problemas.filter(item => {
      const coincideTexto = !needle
        || normalize(item.titulo).includes(needle)
        || normalize(item.descripcion).includes(needle)
        || normalize(item.solucion).includes(needle)
        || rutasArchivos(item.archivos).some(archivo => normalize(archivo).includes(needle));
      const coincideEstado = filtroEstado === 'todos'
        || (filtroEstado === 'abiertos' && !item.resuelto)
        || (filtroEstado === 'resueltos' && item.resuelto);
      const coincideSeveridad = filtroSeveridad === 'todas' || item.severidad === filtroSeveridad;
      return coincideTexto && coincideEstado && coincideSeveridad;
    });
  }, [busqueda, filtroEstado, filtroSeveridad, problemas]);

  const cancelarEdicion = () => {
    setEditingId(null);
    setForm(emptyForm);
    setMostrarFormulario(false);
  };

  const abrirNuevoProblema = () => {
    setEditingId(null);
    setForm(emptyForm);
    setMostrarFormulario(true);
  };

  const registrarChangelog = async (problemaId, payload) => {
    await addDoc(collection(db, 'artifacts', appId, 'users', 'shared', 'changelogProblemas'), {
      problemaId,
      titulo: payload.titulo,
      severidad: payload.severidad,
      solucion: payload.solucion,
      archivos: rutasArchivos(payload.archivos),
      resumen: `Resuelto: ${payload.titulo}`,
      createdAt: serverTimestamp(),
      createdBy: user?.email || '',
    });
  };

  const guardarProblema = async (event) => {
    event.preventDefault();
    const payload = {
      titulo: form.titulo.trim(),
      descripcion: form.descripcion.trim(),
      archivos: rutasArchivos(form.archivos),
      severidad: form.severidad,
      solucion: form.solucion.trim(),
      resuelto: Boolean(form.resuelto),
    };

    if (!payload.titulo) {
      showToast?.('Escribe el problema', 'error');
      return;
    }

    if (payload.resuelto && !payload.solucion) {
      showToast?.('Agrega la solucion antes de resolver', 'error');
      return;
    }

    setGuardando(true);
    try {
      if (editingId) {
        const original = problemas.find(item => item.id === editingId);
        const pasaAResuelto = original && !original.resuelto && payload.resuelto;
        await updateDoc(doc(db, 'artifacts', appId, 'users', 'shared', 'problemasApp', editingId), {
          ...payload,
          updatedAt: serverTimestamp(),
          resolvedAt: payload.resuelto ? (original?.resolvedAt || serverTimestamp()) : null,
          resolvedBy: payload.resuelto ? (original?.resolvedBy || user?.email || '') : '',
        });
        if (pasaAResuelto) await registrarChangelog(editingId, payload);
        showToast?.(pasaAResuelto ? 'Changelog publicado: problema resuelto' : 'Problema actualizado');
      } else {
        const docRef = await addDoc(collection(db, 'artifacts', appId, 'users', 'shared', 'problemasApp'), {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          resolvedAt: payload.resuelto ? serverTimestamp() : null,
          resolvedBy: payload.resuelto ? user?.email || '' : '',
        });
        if (payload.resuelto) await registrarChangelog(docRef.id, payload);
        showToast?.(payload.resuelto ? 'Problema guardado y changelog publicado' : 'Problema guardado');
      }
      cancelarEdicion();
    } catch (error) {
      console.error(error);
      showToast?.('No se pudo guardar el problema', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const editarProblema = problema => {
    setEditingId(problema.id);
    setMostrarFormulario(true);
    setForm({
      titulo: problema.titulo || '',
      descripcion: problema.descripcion || '',
      archivos: archivosToText(problema.archivos),
      severidad: problema.severidad || 'medio',
      solucion: problema.solucion || '',
      resuelto: Boolean(problema.resuelto),
    });
  };

  const resolverProblema = async problema => {
    if (!String(problema.solucion || '').trim()) {
      showToast?.('Agrega una solucion antes de marcar resuelto', 'error');
      editarProblema(problema);
      return;
    }

    try {
      await updateDoc(doc(db, 'artifacts', appId, 'users', 'shared', 'problemasApp', problema.id), {
        resuelto: true,
        updatedAt: serverTimestamp(),
        resolvedAt: serverTimestamp(),
        resolvedBy: user?.email || '',
      });
      await registrarChangelog(problema.id, problema);
      showToast?.('Changelog publicado: problema resuelto');
    } catch (error) {
      console.error(error);
      showToast?.('No se pudo resolver el problema', 'error');
    }
  };

  const reabrirProblema = async problema => {
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'users', 'shared', 'problemasApp', problema.id), {
        resuelto: false,
        updatedAt: serverTimestamp(),
        resolvedAt: null,
        resolvedBy: '',
      });
      showToast?.('Problema reabierto');
    } catch (error) {
      console.error(error);
      showToast?.('No se pudo reabrir el problema', 'error');
    }
  };

  const compartirProblema = async problema => {
    const text = textoCompartirProblema(problema);
    try {
      await copiarAlPortapapeles(text);
      showToast?.('Copiado: problema, detalle, ruta y solucion');
    } catch (error) {
      console.error(error);
      showToast?.('No se pudo copiar el problema', 'error');
    }
  };

  return (
    <div className="mx-auto grid min-h-full w-full max-w-7xl gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="space-y-5">
        <div className="saas-list-shell">
          <div className="saas-list-toolbar">
            <div>
              <p className="saas-page-kicker">Control interno</p>
              <h2 className="saas-page-title flex items-center gap-2">
                <Bug size={20} className="text-blue-600" /> Problemas de app/web
              </h2>
              <p className="saas-page-desc">{stats.abiertos} abierto{stats.abiertos !== 1 ? 's' : ''}, {stats.resueltos} resuelto{stats.resueltos !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex flex-col gap-3 sm:items-end">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-lg font-semibold text-slate-900">{stats.abiertos}</p>
                  <p className="text-[11px] font-semibold uppercase text-slate-500">Abiertos</p>
                </div>
                <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2">
                  <p className="text-lg font-semibold text-red-700">{stats.criticos}</p>
                  <p className="text-[11px] font-semibold uppercase text-red-600">Criticos</p>
                </div>
                <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
                  <p className="text-lg font-semibold text-emerald-700">{stats.resueltos}</p>
                  <p className="text-[11px] font-semibold uppercase text-emerald-600">Resueltos</p>
                </div>
              </div>
              <button type="button" onClick={abrirNuevoProblema} className="saas-primary w-full sm:w-auto">
                <Plus size={16} /> Problema
              </button>
            </div>
          </div>

          {mostrarFormulario && (
          <form onSubmit={guardarProblema} className="grid gap-4 border-b border-slate-200 p-5 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="space-y-3">
              <label className="block">
                <span className="block text-xs font-semibold uppercase text-slate-500">Problema</span>
                <input
                  value={form.titulo}
                  onChange={event => setForm(prev => ({...prev, titulo: event.target.value}))}
                  placeholder="Ej. Busqueda no encuentra ventas antiguas"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold uppercase text-slate-500">Detalle</span>
                <textarea
                  value={form.descripcion}
                  onChange={event => setForm(prev => ({...prev, descripcion: event.target.value}))}
                  rows={3}
                  placeholder="Contexto, impacto o pasos para repetirlo"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold uppercase text-slate-500">Archivos a revisar</span>
                <textarea
                  value={form.archivos}
                  onChange={event => setForm(prev => ({...prev, archivos: event.target.value}))}
                  rows={3}
                  placeholder={'src/app/App.jsx\nsrc/features/carpeta/name.jsx'}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold uppercase text-slate-500">Solucion</span>
                <textarea
                  value={form.solucion}
                  onChange={event => setForm(prev => ({...prev, solucion: event.target.value}))}
                  rows={3}
                  placeholder="Cambio aplicado o solucion recomendada"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="block text-xs font-semibold uppercase text-slate-500">Prioridad</span>
                <select
                  value={form.severidad}
                  onChange={event => setForm(prev => ({...prev, severidad: event.target.value}))}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {severidades.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={form.resuelto}
                  onChange={event => setForm(prev => ({...prev, resuelto: event.target.checked}))}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Esta resuelto
              </label>
              <button type="submit" disabled={guardando} className="saas-primary w-full disabled:opacity-60">
                {editingId ? <Save size={16} /> : <Plus size={16} />}
                {guardando ? 'Guardando...' : editingId ? 'Actualizar problema' : 'Guardar problema'}
              </button>
              <button type="button" onClick={cancelarEdicion} className="saas-secondary w-full">
                Cancelar
              </button>
            </div>
          </form>
          )}

          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="saas-searchbox">
              <input
                value={busqueda}
                onChange={event => setBusqueda(event.target.value)}
                placeholder="Buscar problema, solucion o archivo"
                className="saas-search-input"
              />
              <Search size={18} />
            </div>
            <div className="flex flex-wrap gap-2">
              <select value={filtroEstado} onChange={event => setFiltroEstado(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="abiertos">Abiertos</option>
                <option value="resueltos">Resueltos</option>
                <option value="todos">Todos</option>
              </select>
              <select value={filtroSeveridad} onChange={event => setFiltroSeveridad(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="todas">Todas las prioridades</option>
                {severidades.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {problemasFiltrados.length === 0 ? (
              <div className="saas-empty px-4 py-10">
                <Clock3 size={24} />
                <p className="text-sm font-semibold">Sin problemas en esta vista</p>
              </div>
            ) : problemasFiltrados.map(problema => {
              const severidad = getSeveridad(problema.severidad);
              const archivos = rutasArchivos(problema.archivos);
              return (
                <article key={problema.id} className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_180px]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-bold ${severidad.badge}`}>
                        {severidad.label}
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-bold ${problema.resuelto ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                        {problema.resuelto ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                        {problema.resuelto ? 'Resuelto' : 'Pendiente'}
                      </span>
                    </div>
                    <h3 className="mt-3 text-base font-semibold text-slate-900">{problema.titulo}</h3>
                    {problema.descripcion && <p className="mt-2 text-sm leading-6 text-slate-600">{problema.descripcion}</p>}
                    {archivos.length > 0 && (
                      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="flex items-center gap-2 text-xs font-bold uppercase text-slate-600"><FileCode2 size={13} /> Archivos</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {archivos.map(archivo => (
                            <code key={archivo} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700">
                              {archivo}
                            </code>
                          ))}
                        </div>
                      </div>
                    )}
                    {problema.solucion && (
                      <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
                        <p className="flex items-center gap-2 text-xs font-bold uppercase text-emerald-700"><Wrench size={13} /> Solucion</p>
                        <p className="mt-1 text-sm leading-6 text-emerald-900">{problema.solucion}</p>
                      </div>
                    )}
                    <p className="mt-3 text-xs text-slate-400">
                      Actualizado: {fechaCorta(problema.updatedAt)}
                      {problema.resuelto && ` · Resuelto: ${fechaCorta(problema.resolvedAt)}`}
                    </p>
                  </div>
                  <div className="flex flex-row gap-2 lg:flex-col">
                    <button type="button" onClick={() => compartirProblema(problema)} className="saas-secondary flex-1 justify-center lg:flex-none">
                      <Share2 size={15} /> Compartir
                    </button>
                    <button type="button" onClick={() => editarProblema(problema)} className="saas-secondary flex-1 justify-center lg:flex-none">
                      <Edit size={15} /> Editar
                    </button>
                    {problema.resuelto ? (
                      <button type="button" onClick={() => reabrirProblema(problema)} className="saas-secondary flex-1 justify-center lg:flex-none">
                        <RotateCcw size={15} /> Reabrir
                      </button>
                    ) : (
                      <button type="button" onClick={() => resolverProblema(problema)} className="saas-primary flex-1 justify-center lg:flex-none">
                        <CheckCircle2 size={15} /> Resolver
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <aside className="saas-list-shell h-fit">
        <div className="saas-list-toolbar">
          <div>
            <p className="saas-page-kicker">Change logs</p>
            <h2 className="saas-page-title flex items-center gap-2">
              <Megaphone size={20} className="text-blue-600" /> Cambios resueltos
            </h2>
            <p className="saas-page-desc">Ultimas {changelog.length} notificaciones</p>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {changelog.length === 0 ? (
            <div className="saas-empty px-4 py-10">
              <Megaphone size={24} />
              <p className="text-sm font-semibold">Sin cambios resueltos</p>
            </div>
          ) : changelog.map(item => {
            const severidad = getSeveridad(item.severidad);
            const archivos = rutasArchivos(item.archivos);
            return (
              <article key={item.id} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-bold ${severidad.badge}`}>
                    {severidad.label}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400">{fechaCorta(item.createdAt)}</span>
                </div>
                <h3 className="mt-3 text-sm font-semibold text-slate-900">{item.titulo}</h3>
                {item.solucion && <p className="mt-2 text-sm leading-5 text-slate-600">{item.solucion}</p>}
                {archivos.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {archivos.map(archivo => (
                      <code key={archivo} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
                        {archivo}
                      </code>
                    ))}
                  </div>
                )}
                {item.createdBy && <p className="mt-3 truncate text-xs text-slate-400">{item.createdBy}</p>}
              </article>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
