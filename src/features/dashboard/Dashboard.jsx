import React from 'react';
import { AlertTriangle, ClipboardList, FileText, Plus, Settings, ShoppingCart, Users } from 'lucide-react';

export function Dashboard({ stats, setCurrentView, user }) {
  const nombre = user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'Usuario';
  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos dias' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  const fecha = new Intl.DateTimeFormat('es-PE', {weekday: 'long', day: '2-digit', month: 'short'}).format(new Date());

  const kpis = [
    {label: 'Registros', value: stats.registros, detail: 'Equipos en seguimiento', Icon: ClipboardList, view: 'registros_list', tone: 'blue'},
    {label: 'Ventas', value: stats.ventas, detail: 'Operaciones de tienda', Icon: ShoppingCart, view: 'ventas_list', tone: 'emerald'},
    {label: 'Clientes', value: stats.clientes, detail: 'Base compartida', Icon: Users, view: 'clientes_list', tone: 'slate'},
  ];

  const modulos = [
    {
      title: 'Registros de equipos',
      detail: 'IMEI, operador, estado y constancias',
      action: 'Abrir registros',
      Icon: ClipboardList,
      view: 'registros_list',
      tone: 'blue',
    },
    {
      title: 'Ventas de tienda',
      detail: 'Registro de equipos vendidos y tickets',
      action: 'Abrir ventas',
      Icon: ShoppingCart,
      view: 'ventas_list',
      tone: 'emerald',
    },
    {
      title: 'Clientes',
      detail: 'DNI, contacto e historial asociado',
      action: 'Ver directorio',
      Icon: Users,
      view: 'clientes_list',
      tone: 'slate',
    },
    {
      title: 'Boleta extranjera',
      detail: 'Documentos y ventas seleccionadas',
      action: 'Preparar boleta',
      Icon: FileText,
      view: 'boleta_extranjera',
      tone: 'amber',
    },
    {
      title: 'Problemas de app/web',
      detail: 'Prioridad, solucion y cambios resueltos',
      action: 'Revisar problemas',
      Icon: AlertTriangle,
      view: 'problemas_app',
      tone: 'amber',
      mobileHidden: true,
    },
  ];

  const toneClasses = {
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    rose: 'bg-rose-50 text-rose-700 border-rose-100',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
  };

  const kpiToneClasses = {
    blue: 'border-blue-100 bg-blue-50 text-blue-700 group-hover:border-blue-200',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700 group-hover:border-emerald-200',
    slate: 'border-slate-200 bg-slate-50 text-slate-600 group-hover:border-slate-300',
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-5">
      <section className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-sm md:flex-row md:items-center md:justify-between md:px-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">{fecha}</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{saludo}, {nombre}</h1>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button onClick={() => setCurrentView('registros_new')}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
            <Plus size={16} /> Nuevo registro
          </button>
          <button onClick={() => setCurrentView('ventas_new')}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2">
            <Plus size={16} /> Nueva venta
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {kpis.map(({label, value, detail, Icon: KpiIcon, view, tone}) => (
          <button key={label} type="button" onClick={() => setCurrentView(view)}
            className="group rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-500">{label}</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
              </div>
              <div className={`rounded-lg border p-2 transition-colors ${kpiToneClasses[tone] || kpiToneClasses.blue}`}>
                {React.createElement(KpiIcon, {size: 18})}
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">{detail}</p>
          </button>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_320px]">
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Trabajo diario</h2>
            <span className="text-xs font-medium text-slate-400">Acceso directo</span>
          </div>
          <div className="divide-y divide-slate-100">
            {modulos.map(({title, detail, action, Icon: ModuleIcon, view, tone, mobileHidden}) => (
              <button key={title} onClick={() => setCurrentView(view)}
                className={`${mobileHidden ? 'hidden md:flex' : 'flex'} group w-full items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-slate-50`}>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${toneClasses[tone]}`}>
                  {React.createElement(ModuleIcon, {size: 18})}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-900">{title}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{detail}</span>
                </span>
                <span className="hidden rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors group-hover:border-blue-200 group-hover:text-blue-700 sm:inline-flex">
                  {action}
                </span>
              </button>
            ))}
          </div>
        </div>

        <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Atajos frecuentes</p>
          <p className="mt-1 truncate text-xs text-slate-500">{user?.email}</p>
          <div className="mt-4 grid gap-2">
            <button onClick={() => setCurrentView('registros_new')}
              className="flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-left text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100">
              Registrar equipo
              <Plus size={16} />
            </button>
            <button onClick={() => setCurrentView('ventas_new')}
              className="flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-left text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100">
              Registrar venta
              <Plus size={16} />
            </button>
            <button onClick={() => setCurrentView('clientes_list')}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100">
              Ver clientes
              {React.createElement(Users, {size: 16})}
            </button>
          </div>
        </aside>
      </section>

      <section className="mt-auto grid gap-2 border-t border-slate-200 pt-4 md:hidden">
        <button
          type="button"
          aria-label="Problemas"
          title="Problemas"
          onClick={() => setCurrentView('problemas_app')}
          className="flex min-h-12 w-full items-center justify-between rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5 text-amber-700 transition-colors hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
        >
          <span className="flex items-center gap-3">
            <AlertTriangle size={18} />
            <span className="text-sm font-semibold">Problemas</span>
          </span>
          <span className="text-xs font-bold uppercase tracking-wide text-amber-700">Abrir</span>
        </button>
        <button
          type="button"
          aria-label="Configuracion"
          title="Configuracion"
          onClick={() => setCurrentView('configuracion')}
          className="flex min-h-12 w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          <span className="flex items-center gap-3">
            <Settings size={18} />
            <span className="text-sm font-semibold">Configuracion</span>
          </span>
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Abrir</span>
        </button>
      </section>
    </div>
  );
}
