import React, { useState, useEffect, useMemo } from 'react';
import { Menu, X, Home, ShoppingCart, ClipboardList, Plus, Search, Edit, Trash2, Printer, Copy, Eye, CheckCircle2, AlertCircle, Users, ScanBarcode, UploadCloud, ChevronDown, ChevronUp, LogOut, FileText, Share2, Settings, ImagePlus } from 'lucide-react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { EMAILS_PERMITIDOS } from '../config/auth.js';
import { auth, db, appId } from '../lib/firebase.js';
import { LoginScreen } from '../features/auth/LoginScreen.jsx';
import { Dashboard } from '../features/dashboard/Dashboard.jsx';
import { ConfiguracionLogo } from '../features/settings/ConfiguracionLogo.jsx';
import { TopNavItem } from '../components/navigation/TopNavItem.jsx';
import { MobileNavIcon } from '../components/navigation/MobileNavIcon.jsx';
import { AppFooter } from '../components/branding/AppFooter.jsx';
import { IntroSplash } from '../components/branding/IntroSplash.jsx';
import { RegistrosList } from '../features/registros/RegistrosList.jsx';
import { RegistroForm } from '../features/registros/RegistroForm.jsx';
import { VentasList } from '../features/ventas/VentasList.jsx';
import { VentaForm } from '../features/ventas/VentaForm.jsx';
import { ClientesList } from '../features/clientes/ClientesList.jsx';
import { BoletaExtranjera } from '../features/boletas/BoletaExtranjera.jsx';

const INTRO_LOGIN_KEY = 'ggs_intro_after_login_uid';
const INTRO_SEEN_PREFIX = 'ggs_intro_seen_at_';
const INTRO_REPEAT_AFTER_MS = 12 * 60 * 60 * 1000;

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');
  const [editingData, setEditingData] = useState(null);
  const [formDirty, setFormDirty] = useState(false);
  const [busquedaGlobal, setBusquedaGlobal] = useState('');
  const [mostrarBusqueda, setMostrarBusqueda] = useState(false);
  const [logoVentas, setLogoVentas] = useState(null);
  const [showIntro, setShowIntro] = useState(false);

  const [clientes, setClientes] = useState([]);
  const [equipos, setEquipos]   = useState([]);
  const [registros, setRegistros] = useState([]);
  const [ventas, setVentas]       = useState([]);
  const [cargandoRegistros, setCargandoRegistros] = useState(true);
  const [cargandoVentas, setCargandoVentas]       = useState(true);

  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const lastIntroUserRef = React.useRef(null);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  // ── Navegación segura con confirmación si hay formulario sucio ──
  const navegarA = (vista) => {
    if (formDirty) {
      if (!window.confirm('¿Salir sin guardar? Los datos ingresados se perderán.')) return;
      setFormDirty(false);
    }
    setCurrentView(vista);
    setBusquedaGlobal('');
    setMostrarBusqueda(false);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        if (EMAILS_PERMITIDOS.includes(currentUser.email)) {
          setUser(currentUser);
        } else {
          await signOut(auth);
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      lastIntroUserRef.current = null;
      return;
    }

    if (lastIntroUserRef.current === user.uid) return;

    const now = Date.now();
    const seenKey = `${INTRO_SEEN_PREFIX}${user.uid}`;
    const lastSeenAt = Number(window.localStorage.getItem(seenKey) || 0);
    const loginUid = window.sessionStorage.getItem(INTRO_LOGIN_KEY);
    const shouldShowIntro = loginUid === user.uid || !lastSeenAt || now - lastSeenAt > INTRO_REPEAT_AFTER_MS;

    lastIntroUserRef.current = user.uid;
    window.sessionStorage.removeItem(INTRO_LOGIN_KEY);

    if (!shouldShowIntro) return;

    window.localStorage.setItem(seenKey, String(now));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowIntro(true);
    const timeoutId = window.setTimeout(() => setShowIntro(false), 2400);
    return () => window.clearTimeout(timeoutId);
  }, [user]);

  // ── SUSCRIPCIONES LAZY POR MÓDULO ──
  // clientes + equipos: siempre cargados (necesarios en múltiples módulos)
  // registros: solo cuando se navega a registros
  // ventas: solo cuando se navega a ventas
  const unsubRegistrosRef = React.useRef(null);
  const unsubVentasRef    = React.useRef(null);

  useEffect(() => {
    if (!user) return;

    // Clientes y equipos — siempre activos (son ligeros y necesarios en toda la app)
    const unsubClientes = onSnapshot(
      collection(db, 'artifacts', appId, 'users', 'shared', 'clientes'),
      (snap) => setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      (err) => console.error('Error clientes:', err)
    );
    const unsubEquipos = onSnapshot(
      collection(db, 'artifacts', appId, 'users', 'shared', 'equipos'),
      (snap) => setEquipos(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      (err) => console.error('Error equipos:', err)
    );

    // Logo de ventas — sincronizado desde Firestore
    const unsubLogo = onSnapshot(
      doc(db, 'artifacts', appId, 'users', 'shared', 'configuracion', 'logoVentas'),
      (snap) => {
        if (snap.exists()) setLogoVentas(snap.data().dataUrl || null);
        else setLogoVentas(null);
      },
      (err) => console.error('Error logo:', err)
    );

    return () => { unsubClientes(); unsubEquipos(); unsubLogo(); };
  }, [user]);

  // Suscribir/desuscribir registros según la vista
  useEffect(() => {
    const necesitaRegistros = currentView.startsWith('registros') || currentView === 'dashboard' || currentView === 'boleta_extranjera' || currentView === 'clientes_list';
    if (!user || !necesitaRegistros) return;
    if (unsubRegistrosRef.current) return; // ya suscrito

    unsubRegistrosRef.current = onSnapshot(
      collection(db, 'artifacts', appId, 'users', 'shared', 'registros'),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        setRegistros(data);
        setCargandoRegistros(false);
      },
      (err) => { console.error('Error registros:', err); setCargandoRegistros(false); }
    );

    return () => {
      // Mantener la suscripción activa mientras el usuario esté logueado
      // Solo se cancela al cerrar sesión
    };
  }, [user, currentView]);

  // Suscribir/desuscribir ventas según la vista
  useEffect(() => {
    const necesitaVentas = currentView.startsWith('ventas') || currentView === 'dashboard' || currentView === 'boleta_extranjera';
    if (!user || !necesitaVentas) return;
    if (unsubVentasRef.current) return; // ya suscrito

    unsubVentasRef.current = onSnapshot(
      collection(db, 'artifacts', appId, 'users', 'shared', 'ventas'),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        setVentas(data);
        setCargandoVentas(false);
      },
      (err) => { console.error('Error ventas:', err); setCargandoVentas(false); }
    );

    return () => {};
  }, [user, currentView]);

  // Cancelar todas las suscripciones al cerrar sesión
  useEffect(() => {
    if (!user) {
      if (unsubRegistrosRef.current) { unsubRegistrosRef.current(); unsubRegistrosRef.current = null; }
      if (unsubVentasRef.current)    { unsubVentasRef.current();    unsubVentasRef.current    = null; }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRegistros([]); setVentas([]); setClientes([]); setEquipos([]);
    }
  }, [user]);

  // ── RESPALDO MANUAL (botón en topbar) ──
  const descargarRespaldo = () => {
    if (registros.length + ventas.length === 0) { showToast('No hay datos para respaldar', 'error'); return; }
    const hoy = new Date().toISOString().slice(0, 10);
    const backup = { fecha: new Date().toISOString(), clientes, equipos, registros, ventas };
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `backup_comunicate_${hoy}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Respaldo descargado ✓', 'success');
  };

  // ── BUSCADOR GLOBAL ──
  const resultadosBusqueda = useMemo(() => {
    const q = busquedaGlobal.trim().toLowerCase();
    if (q.length < 2) return [];
    const res = [];
    // Buscar en registros
    registros.forEach(r => {
      const cl = clientes.find(c => c.dni === r.dniCliente) || {};
      if (
        r.imeiEquipo?.includes(q) ||
        r.imeiRegistrado?.includes(q) ||
        r.dniCliente?.includes(q) ||
        cl.nombre?.toLowerCase().includes(q) ||
        r.modeloEquipo?.toLowerCase().includes(q) ||
        r.nRegistro?.toLowerCase().includes(q)
      ) res.push({ tipo: 'registro', icono: '📋', titulo: `${cl.nombre || r.dniCliente}`, subtitulo: `${r.nRegistro} · IMEI ${r.imeiRegistrado || r.imeiEquipo}`, data: r });
    });
    // Buscar en ventas
    ventas.forEach(v => {
      const cl = clientes.find(c => c.dni === v.dniCliente) || {};
      if (
        v.imeiEquipo?.includes(q) ||
        v.dniCliente?.includes(q) ||
        cl.nombre?.toLowerCase().includes(q) ||
        v.modeloEquipo?.toLowerCase().includes(q) ||
        v.nVenta?.toLowerCase().includes(q)
      ) res.push({ tipo: 'venta', icono: '🛒', titulo: `${cl.nombre || v.dniCliente}`, subtitulo: `${v.nVenta} · ${v.marcaEquipo || ''} ${v.modeloEquipo || ''}`, data: v });
    });
    // Buscar en clientes
    clientes.forEach(c => {
      if (c.dni?.includes(q) || c.nombre?.toLowerCase().includes(q) || c.celular?.includes(q)) {
        res.push({ tipo: 'cliente', icono: '👤', titulo: c.nombre, subtitulo: `DNI: ${c.dni} · ${c.celular || ''}`, data: c });
      }
    });
    return res.slice(0, 10); // máximo 10 resultados
  }, [busquedaGlobal, registros, ventas, clientes]);

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">Cargando sistema...</div>;
  }

  if (!user) {
    return (
      <>
        <LoginScreen showToast={showToast} EMAILS_PERMITIDOS={EMAILS_PERMITIDOS} auth={auth} />
        {toast.show && (
          <div className={`fixed bottom-4 right-4 px-4 py-3 rounded shadow-lg flex items-center text-white ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'} transition-opacity z-[9999]`}>
            <span className="mr-2 flex items-center">
              {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            </span>
            {toast.message}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden font-sans">
      {showIntro && <IntroSplash />}

      {/* ── TOPBAR ── */}
      <header className="bg-slate-900 text-white flex items-center justify-between px-4 md:px-6 h-14 shrink-0 z-50">

        {/* Logo */}
        <span className="text-lg font-extrabold tracking-wide select-none">COMUNIC@TE</span>

        {/* Nav desktop */}
        <nav className="hidden md:flex items-center gap-1">
          <TopNavItem Icon={Home}          label="Inicio"            active={currentView === 'dashboard'}          onClick={() => navegarA('dashboard')} />
          <TopNavItem Icon={ClipboardList} label="Registros"         active={currentView.startsWith('registros')} onClick={() => navegarA('registros_list')} />
          <TopNavItem Icon={ShoppingCart}  label="Ventas"            active={currentView.startsWith('ventas')}    onClick={() => navegarA('ventas_list')} />
          <TopNavItem Icon={Users}         label="Clientes"          active={currentView === 'clientes_list'}     onClick={() => navegarA('clientes_list')} />
          <TopNavItem Icon={FileText}      label="Boleta Extranjera" active={currentView === 'boleta_extranjera'} onClick={() => navegarA('boleta_extranjera')} />
          <TopNavItem Icon={Settings}      label="Configuración"     active={currentView === 'configuracion'}     onClick={() => navegarA('configuracion')} />
        </nav>

        {/* Derecha desktop: buscador + email + logout */}
        <div className="hidden md:flex items-center gap-3">
          {/* Buscador global */}
          <div className="relative">
            <div className="flex items-center bg-slate-800 rounded-lg px-3 py-1.5 gap-2">
              <Search size={14} className="text-gray-400" />
              <input
                value={busquedaGlobal}
                onChange={e => { setBusquedaGlobal(e.target.value); setMostrarBusqueda(true); }}
                onFocus={() => setMostrarBusqueda(true)}
                onBlur={() => setTimeout(() => setMostrarBusqueda(false), 200)}
                placeholder="Buscar..."
                className="bg-transparent text-sm text-white placeholder-gray-500 outline-none w-40"
              />
              {busquedaGlobal && <button onClick={() => setBusquedaGlobal('')} className="text-gray-500 hover:text-white"><X size={12}/></button>}
            </div>
            {/* Dropdown resultados */}
            {mostrarBusqueda && resultadosBusqueda.length > 0 && (
              <div className="absolute top-10 right-0 w-80 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden z-[999]">
                {resultadosBusqueda.map((r, i) => (
                  <button key={i} onMouseDown={() => {
                    setBusquedaGlobal(''); setMostrarBusqueda(false);
                    if (r.tipo === 'registro') navegarA('registros_list');
                    else if (r.tipo === 'venta') navegarA('ventas_list');
                    else navegarA('clientes_list');
                  }} className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 border-b border-gray-50 text-left">
                    <span className="text-lg mt-0.5">{r.icono}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{r.titulo}</p>
                      <p className="text-xs text-gray-400 truncate">{r.subtitulo}</p>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium mt-1
                      ${r.tipo === 'registro' ? 'bg-blue-100 text-blue-700' : r.tipo === 'venta' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}`}>
                      {r.tipo}
                    </span>
                  </button>
                ))}
                <p className="text-xs text-gray-400 text-center py-2">{resultadosBusqueda.length} resultado(s)</p>
              </div>
            )}
            {mostrarBusqueda && busquedaGlobal.length >= 2 && resultadosBusqueda.length === 0 && (
              <div className="absolute top-10 right-0 w-64 bg-white rounded-xl shadow-xl border border-gray-100 px-4 py-3 z-[999]">
                <p className="text-sm text-gray-400 text-center">Sin resultados para "{busquedaGlobal}"</p>
              </div>
            )}
          </div>
          <span className="text-xs text-gray-400 truncate max-w-[160px]">{user.email}</span>
          <button onClick={descargarRespaldo} title="Descargar respaldo"
            className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 hover:bg-slate-800 px-2 py-1.5 rounded-lg transition-colors text-xs">
            <UploadCloud size={16} /> Respaldo
          </button>
          <button onClick={() => signOut(auth)} title="Cerrar sesión"
            className="flex items-center gap-1.5 text-red-400 hover:text-red-300 hover:bg-slate-800 px-2 py-1.5 rounded-lg transition-colors text-xs">
            <LogOut size={16} /> Salir
          </button>
        </div>

        {/* Nav móvil */}
        <div className="flex md:hidden items-center gap-1">
          <MobileNavIcon Icon={Search}       active={mostrarBusqueda}                          onClick={() => setMostrarBusqueda(v => !v)}         title="Buscar" />
          <MobileNavIcon Icon={Home}          active={currentView === 'dashboard'}             onClick={() => navegarA('dashboard')}               title="Inicio" />
          <MobileNavIcon Icon={ClipboardList} active={currentView.startsWith('registros')}    onClick={() => navegarA('registros_list')}           title="Registros" />
          <MobileNavIcon Icon={ShoppingCart}  active={currentView.startsWith('ventas')}       onClick={() => navegarA('ventas_list')}              title="Ventas" />
          <MobileNavIcon Icon={Users}         active={currentView === 'clientes_list'}        onClick={() => navegarA('clientes_list')}            title="Clientes" />
          <MobileNavIcon Icon={FileText}      active={currentView === 'boleta_extranjera'}    onClick={() => navegarA('boleta_extranjera')}        title="Boleta" />
          <MobileNavIcon Icon={Settings}      active={currentView === 'configuracion'}        onClick={() => navegarA('configuracion')}            title="Config" />
          <button onClick={() => signOut(auth)} title="Cerrar sesión"
            className="p-2 rounded-lg text-red-400 hover:bg-slate-800 hover:text-red-300 transition-colors">
            <LogOut size={20} />
          </button>
        </div>

      </header>

      {/* Buscador móvil desplegable */}
      {mostrarBusqueda && (
        <div className="md:hidden bg-slate-800 px-4 py-2 relative z-40">
          <div className="flex items-center gap-2 bg-slate-700 rounded-lg px-3 py-2">
            <Search size={14} className="text-gray-400" />
            <input autoFocus value={busquedaGlobal} onChange={e => setBusquedaGlobal(e.target.value)}
              placeholder="Buscar cliente, IMEI, N° registro..."
              className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none" />
            {busquedaGlobal && <button onClick={() => setBusquedaGlobal('')}><X size={14} className="text-gray-400"/></button>}
          </div>
          {resultadosBusqueda.length > 0 && (
            <div className="absolute left-0 right-0 top-full bg-white shadow-xl border-t border-gray-100 z-50">
              {resultadosBusqueda.map((r, i) => (
                <button key={i} onMouseDown={() => {
                  setBusquedaGlobal(''); setMostrarBusqueda(false);
                  if (r.tipo === 'registro') navegarA('registros_list');
                  else if (r.tipo === 'venta') navegarA('ventas_list');
                  else navegarA('clientes_list');
                }} className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 border-b border-gray-50 text-left">
                  <span className="text-base mt-0.5">{r.icono}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{r.titulo}</p>
                    <p className="text-xs text-gray-400 truncate">{r.subtitulo}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── CONTENIDO ── */}
      <main className="flex-1 overflow-auto p-4 md:p-6 relative">
          {currentView === 'dashboard' && <Dashboard stats={{registros: registros.length, ventas: ventas.length, clientes: clientes.length}} setCurrentView={navegarA} user={user} />}

          {currentView === 'registros_list' && <RegistrosList data={registros} cargando={cargandoRegistros} ventas={ventas} clientes={clientes} equipos={equipos} onNew={() => {setEditingData(null); setFormDirty(false); navegarA('registros_new');}} onEdit={(data) => { setEditingData(data); setFormDirty(false); navegarA('registros_edit'); }} showToast={showToast} db={db} auth={auth} appId={appId} />}
          {(currentView === 'registros_new' || currentView === 'registros_edit') && <RegistroForm user={user} clientes={clientes} equipos={equipos} registros={registros} initialData={currentView === 'registros_edit' ? editingData : null} onCancel={() => { setFormDirty(false); navegarA('registros_list'); }} onSave={() => { setFormDirty(false); setCurrentView('registros_list'); }} onDirty={() => setFormDirty(true)} showToast={showToast} db={db} appId={appId} />}

          {currentView === 'ventas_list' && <VentasList data={ventas} cargando={cargandoVentas} registros={registros} clientes={clientes} equipos={equipos} logoVentas={logoVentas} onNew={() => {setEditingData(null); setFormDirty(false); navegarA('ventas_new');}} onEdit={(data) => { setEditingData(data); setFormDirty(false); navegarA('ventas_edit'); }} showToast={showToast} db={db} auth={auth} appId={appId} />}
          {(currentView === 'ventas_new' || currentView === 'ventas_edit') && <VentaForm user={user} clientes={clientes} equipos={equipos} ventas={ventas} logoVentas={logoVentas} initialData={currentView === 'ventas_edit' ? editingData : null} onCancel={() => { setFormDirty(false); navegarA('ventas_list'); }} onSave={() => { setFormDirty(false); setCurrentView('ventas_list'); }} onDirty={() => setFormDirty(true)} showToast={showToast} db={db} appId={appId} />}

          {currentView === 'clientes_list' && <ClientesList clientes={clientes} equipos={equipos} registros={registros} />}

          {currentView === 'boleta_extranjera' && <BoletaExtranjera clientes={clientes} equipos={equipos} ventas={ventas} showToast={showToast} />}

          {currentView === 'configuracion' && (
            <ConfiguracionLogo
              logoVentas={logoVentas}
              onLogoChange={async (dataUrl) => {
                const logoRef = doc(db, 'artifacts', appId, 'users', 'shared', 'configuracion', 'logoVentas');
                if (dataUrl) await setDoc(logoRef, { dataUrl });
                else await deleteDoc(logoRef);
              }}
              showToast={showToast}
            />
          )}

        {toast.show && (
          <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-xl shadow-lg flex items-center text-white text-sm ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'} z-50`}>
            <span className="mr-2 flex items-center">
              {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            </span>
            {toast.message}
          </div>
        )}
      </main>
      <AppFooter />
    </div>
  );
}

// ============================================================================
// COMPONENTES AUXILIARES
// ============================================================================


export default App;


