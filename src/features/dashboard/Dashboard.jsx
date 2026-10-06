import React from 'react';
import {AlertTriangle, ArrowRight, ClipboardList, ImagePlus, Plus, Settings, ShoppingCart, Users} from 'lucide-react';
import {Button} from '../../components/ui/Button.jsx';
import {PageHeader} from '../../components/ui/PageHeader.jsx';
import {puedeUsuario, ROLES_USUARIO} from '../../config/auth.js';

export function Dashboard({stats, setCurrentView, user}) {
  const nombre = user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'Usuario';
  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  const fecha = new Intl.DateTimeFormat('es-PE', {weekday: 'long', day: '2-digit', month: 'long'}).format(new Date());
  const isAdmin = puedeUsuario(user, ROLES_USUARIO.ADMIN);

  const kpis = [
    {label: 'Registros', value: stats.registros, detail: 'Equipos en seguimiento', Icon: ClipboardList, view: 'registros_list'},
    {label: 'Ventas', value: stats.ventas, detail: 'Operaciones de tienda', Icon: ShoppingCart, view: 'ventas_list'},
    {label: 'Clientes', value: stats.clientes, detail: 'Base compartida', Icon: Users, view: 'clientes_list'},
  ];
  const modules = [
    {title: 'Registros de equipos', detail: 'IMEI, operador, estado y constancias', Icon: ClipboardList, view: 'registros_list'},
    {title: 'Ventas de tienda', detail: 'Equipos vendidos, comprobantes e historial', Icon: ShoppingCart, view: 'ventas_list'},
    {title: 'Clientes', detail: 'Documentos, contacto e historial asociado', Icon: Users, view: 'clientes_list'},
    ...(isAdmin ? [{title: 'Foto DNI', detail: 'Captura y gestión de fotografías documentarias', Icon: ImagePlus, view: 'foto_dni'}] : []),
  ];

  return (
    <div className="dashboard-layout">
      <section className="ui-page-surface">
        <PageHeader
          eyebrow={fecha}
          title={`${saludo}, ${nombre}`}
          description="Todo lo necesario para la operación diaria, organizado en un único espacio de trabajo."
          actions={(
            <>
              <Button onClick={() => setCurrentView('ventas_new')}><Plus size={16} /> Nueva venta</Button>
              <Button variant="primary" onClick={() => setCurrentView('registros_new')}><Plus size={16} /> Nuevo registro</Button>
            </>
          )}
        />
        <div className="dashboard-metrics" aria-label="Resumen operativo">
          {kpis.map(({label, value, detail, Icon, view}) => (
            <button key={label} type="button" className="dashboard-metric" onClick={() => setCurrentView(view)}>
              <span className="dashboard-metric__icon" aria-hidden="true">{React.createElement(Icon, {size: 18})}</span>
              <span className="min-w-0">
                <span className="dashboard-metric__label">{label}</span>
                <span className="dashboard-metric__value">{value}</span>
                <span className="dashboard-metric__detail">{detail}</span>
              </span>
              <ArrowRight className="dashboard-row__arrow" size={16} aria-hidden="true" />
            </button>
          ))}
        </div>
        <section className="dashboard-section" aria-labelledby="daily-work-title">
          <div className="dashboard-section__heading">
            <div><p className="ui-eyebrow">Acceso directo</p><h2 id="daily-work-title">Trabajo diario</h2></div>
            <span>Selecciona un módulo para continuar</span>
          </div>
          <div className="dashboard-module-list">
            {modules.map(({title, detail, Icon, view}) => (
              <button key={title} type="button" className="dashboard-row" onClick={() => setCurrentView(view)}>
                <span className="dashboard-row__icon" aria-hidden="true">{React.createElement(Icon, {size: 18})}</span>
                <span className="min-w-0 flex-1"><span className="dashboard-row__title">{title}</span><span className="dashboard-row__detail">{detail}</span></span>
                <ArrowRight className="dashboard-row__arrow" size={16} aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
      </section>
      <section className="dashboard-mobile-settings" aria-label="Herramientas del sistema">
        <button type="button" onClick={() => setCurrentView('problemas_app')}><AlertTriangle size={18} /><span>Problemas</span><ArrowRight size={16} /></button>
        {isAdmin && <button type="button" onClick={() => setCurrentView('configuracion')}><Settings size={18} /><span>Configuración</span><ArrowRight size={16} /></button>}
      </section>
    </div>
  );
}
