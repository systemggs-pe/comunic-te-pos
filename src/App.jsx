import React, { useState, useEffect, useMemo } from 'react';
import { 
  Menu, X, Home, ShoppingCart, ClipboardList, Plus, 
  Search, Edit, Trash2, Printer, Copy, Eye, CheckCircle2, AlertCircle, Users, ScanBarcode, UploadCloud, ChevronDown, ChevronUp, LogOut, FileText, Share2, Settings, ImagePlus
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, addDoc, deleteDoc, updateDoc } from 'firebase/firestore';

// ============================================================================
// 🔒 LISTA DE CORREOS PERMITIDOS 
// ============================================================================
const EMAILS_PERMITIDOS = [
  "brand050103@gmail.com",
  "lauryruyz50@gmail.com",
];

// ============================================================================
// CONFIGURACIÓN DE FIREBASE 
// ============================================================================
const firebaseConfig = {
  apiKey: "AIzaSyBLosM4ocr9OBLcpcRUc5QF3k8eVc4h5mA",
  authDomain: "comunicate-tacna.firebaseapp.com",
  projectId: "comunicate-tacna",
  storageBucket: "comunicate-tacna.firebasestorage.app",
  messagingSenderId: "769900776082",
  appId: "1:769900776082:web:2ab9cf77e2ac793fe2344b",
  measurementId: "G-KNYEG7V0KW"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
// Un identificador fijo para tu base de datos principal
const appId = 'comunicate-pos';
const FUNCTIONS_BASE_URL = import.meta.env.VITE_FUNCTIONS_BASE_URL || `https://us-central1-${firebaseConfig.projectId}.cloudfunctions.net`;

async function llamarFuncionSegura(nombre, payload) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('AUTH_REQUIRED');
  const resp = await fetch(`${FUNCTIONS_BASE_URL}/${nombre}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || 'FUNCTION_ERROR');
  return data;
}

async function consultarReniecDni(dni) {
  return llamarFuncionSegura('consultarReniec', { dni: String(dni) });
}

// ============================================================================
// 🔢 ALGORITMO DE LUHN — Validación de IMEI
// ============================================================================
function luhn(imei) {
  if (!imei || imei.length !== 15 || !/^\d{15}$/.test(imei)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = parseInt(imei[i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

function normalizarEscaneo(datos = {}) {
  const texto = (valor) => String(valor ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  const imei = (valor) => String(valor ?? '').replace(/\D/g, '').slice(0, 15);
  const gb = (valor) => {
    const match = String(valor ?? '').match(/\d{1,4}/);
    return match ? match[0] : '';
  };

  return {
    imei1: imei(datos.imei1),
    imei2: imei(datos.imei2),
    sn: texto(datos.sn),
    marca: texto(datos.marca),
    modelo: texto(datos.modelo),
    nombreComercial: texto(datos.nombreComercial),
    ram: gb(datos.ram),
    memoria: gb(datos.memoria),
    color: texto(datos.color),
  };
}

// ============================================================================
// COMPONENTES PRINCIPALES
// ============================================================================

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [editingData, setEditingData] = useState(null);
  const [formDirty, setFormDirty] = useState(false);
  const [busquedaGlobal, setBusquedaGlobal] = useState('');
  const [mostrarBusqueda, setMostrarBusqueda] = useState(false);
  const [logoVentas, setLogoVentas] = useState(null);

  const [clientes, setClientes] = useState([]);
  const [equipos, setEquipos]   = useState([]);
  const [registros, setRegistros] = useState([]);
  const [ventas, setVentas]       = useState([]);
  const [cargandoRegistros, setCargandoRegistros] = useState(true);
  const [cargandoVentas, setCargandoVentas]       = useState(true);

  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

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
    </div>
  );
}

// ============================================================================
// COMPONENTES AUXILIARES
// ============================================================================

function ConfiguracionLogo({ logoVentas, onLogoChange, showToast }) {
  const [guardando, setGuardando] = useState(false);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Solo se aceptan imágenes.', 'error'); return; }
    if (file.size > 2 * 1024 * 1024) { showToast('La imagen no debe superar 2MB.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      setGuardando(true);
      try {
        await onLogoChange(ev.target.result);
        showToast('Logo guardado en la nube ✓', 'success');
      } catch(err) {
        showToast('Error al guardar el logo', 'error');
      } finally {
        setGuardando(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleEliminar = async () => {
    if (!window.confirm('¿Eliminar el logo?')) return;
    setGuardando(true);
    try {
      await onLogoChange(null);
      showToast('Logo eliminado ✓', 'success');
    } catch(err) {
      showToast('Error al eliminar el logo', 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2">
          <ImagePlus size={20} className="text-blue-600" /> Logo para Tickets de Venta
        </h2>
        <p className="text-xs text-gray-400 mb-6">La imagen aparecerá en la parte superior del ticket PDF al imprimir una venta. Se sincroniza en todos los dispositivos.</p>

        {/* Preview */}
        <div className="flex flex-col items-center gap-4 mb-6">
          {logoVentas ? (
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 w-full flex flex-col items-center gap-3 bg-gray-50">
              <img src={logoVentas} alt="Logo actual" className="max-h-28 max-w-full object-contain rounded" />
              <span className="text-xs text-green-600 font-medium flex items-center gap-1">✓ Logo guardado en la nube</span>
            </div>
          ) : (
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 w-full flex flex-col items-center gap-2 bg-gray-50 text-gray-300">
              <ImagePlus size={40} />
              <span className="text-sm">Sin logo configurado</span>
            </div>
          )}
        </div>

        {/* Botones */}
        <div className="flex gap-3">
          <label className={`flex-1 ${guardando ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
            <div className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold text-center transition-colors">
              {guardando ? '⏳ Guardando...' : logoVentas ? '🔄 Cambiar logo' : '📁 Subir logo'}
            </div>
            <input type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={guardando} />
          </label>
          {logoVentas && (
            <button onClick={handleEliminar} disabled={guardando}
              className="px-4 py-2.5 border border-red-200 text-red-500 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
              Eliminar
            </button>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-3">Formatos: PNG, JPG, WebP · Máximo 2MB · Se guarda en Firebase y aplica en todos los dispositivos.</p>
      </div>
    </div>
  );
}

function LoginScreen({ showToast, EMAILS_PERMITIDOS, auth }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      if (!EMAILS_PERMITIDOS.includes(result.user.email)) {
        await signOut(auth);
        showToast('Acceso denegado. Tu correo no está autorizado.', 'error');
        return;
      }
      showToast('Sesión iniciada con Google');
    } catch (error) {
      console.error("Error Google Auth:", error);
      if (error.code !== 'auth/popup-closed-by-user') {
        showToast('Error al iniciar sesión', 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full text-center border border-gray-100">
        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <Users size={32} />
        </div>
        <h1 className="text-2xl font-extrabold text-gray-800 mb-2">COMUNIC@TE POS</h1>
        <p className="text-sm text-gray-500 mb-8">Acceso privado al sistema</p>
        
        <button 
          onClick={handleGoogleLogin} 
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 text-gray-700 py-3 px-4 rounded-xl hover:bg-gray-50 transition shadow-sm mb-4 font-medium disabled:opacity-50"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {isLoading ? 'Verificando...' : 'Ingresar con Google'}
        </button>
      </div>
    </div>
  );
}

function TopNavItem({ Icon, label, active, onClick }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-slate-800 hover:text-white'}`}>
      <Icon size={17} /> {label}
    </button>
  );
}

function MobileNavIcon({ Icon, active, onClick, title }) {
  return (
    <button onClick={onClick} title={title}
      className={`p-2 rounded-lg transition-colors ${active ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-slate-800 hover:text-white'}`}>
      <Icon size={20} />
    </button>
  );
}

function Dashboard({ stats, setCurrentView, user }) {
  const nombre = user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'Usuario';
  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <div className="min-h-full flex flex-col">
      {/* Hero saludo */}
      <div className="text-center py-10 px-4">
        <p className="text-sm text-gray-400 uppercase tracking-widest mb-1">{saludo}</p>
        <h1 className="text-4xl font-bold text-gray-800 mb-2">{nombre}</h1>
        <p className="text-gray-400 text-sm">Selecciona un módulo para comenzar</p>
      </div>

      {/* Tarjetas de módulos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 px-2 pb-8">

        {/* Ventas */}
        <div onClick={() => setCurrentView('ventas_list')}
          className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-purple-200 transition-all duration-200 cursor-pointer overflow-hidden">
          <div className="p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-purple-50 flex items-center justify-center mb-5 group-hover:bg-purple-100 transition-colors">
              <ShoppingCart size={28} className="text-purple-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-800 mb-1">Ventas (Tienda)</h2>
            <p className="text-sm text-gray-400 mb-6">Punto de venta, accesorios y tickets.</p>
            <div className="w-full bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors">
              Ingresar
            </div>
          </div>
          <div className="border-t border-gray-50 px-8 py-3 bg-gray-50 flex items-center justify-between">
            <span className="text-xs text-gray-400">Total registradas</span>
            <span className="text-sm font-bold text-gray-700">{stats.ventas}</span>
          </div>
        </div>

        {/* Registros — destacado */}
        <div onClick={() => setCurrentView('registros_list')}
          className="group bg-blue-600 rounded-2xl shadow-md hover:shadow-lg hover:bg-blue-700 transition-all duration-200 cursor-pointer overflow-hidden">
          <div className="p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mb-5 group-hover:bg-white/30 transition-colors">
              <ClipboardList size={28} className="text-white" />
            </div>
            <h2 className="text-lg font-bold text-white mb-1">Registros (Equipos)</h2>
            <p className="text-sm text-blue-100 mb-6">Gestión de IMEIs y constancias.</p>
            <div className="w-full bg-white text-blue-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-blue-50 transition-colors">
              Ingresar
            </div>
          </div>
          <div className="border-t border-white/10 px-8 py-3 bg-blue-700/40 flex items-center justify-between">
            <span className="text-xs text-blue-200">Total registrados</span>
            <span className="text-sm font-bold text-white">{stats.registros}</span>
          </div>
        </div>

        {/* Clientes */}
        <div onClick={() => setCurrentView('clientes_list')}
          className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-green-200 transition-all duration-200 cursor-pointer overflow-hidden">
          <div className="p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mb-5 group-hover:bg-green-100 transition-colors">
              <Users size={28} className="text-green-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-800 mb-1">Directorio Clientes</h2>
            <p className="text-sm text-gray-400 mb-6">Historial unificado y base de datos.</p>
            <div className="w-full bg-green-600 hover:bg-green-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors">
              Ver Clientes
            </div>
          </div>
          <div className="border-t border-gray-50 px-8 py-3 bg-gray-50 flex items-center justify-between">
            <span className="text-xs text-gray-400">Total clientes</span>
            <span className="text-sm font-bold text-gray-700">{stats.clientes}</span>
          </div>
        </div>
      </div>

      {/* Accesos rápidos */}
      <div className="flex justify-center gap-4 pb-10">
        <button onClick={() => setCurrentView('registros_new')}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-blue-200 text-blue-600 text-sm font-medium hover:bg-blue-50 transition-colors">
          <Plus size={16} /> Nuevo Registro
        </button>
        <button onClick={() => setCurrentView('ventas_new')}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-purple-200 text-purple-600 text-sm font-medium hover:bg-purple-50 transition-colors">
          <Plus size={16} /> Nueva Venta
        </button>
      </div>

      {/* Footer */}
      <div className="mt-auto text-center pb-6">
        <p className="text-xs text-gray-300 font-medium">v3.0.0 · Creado por Brand Daniel Peralta Rodriguez</p>
        <p className="text-xs text-gray-300">SOPORTE +51 946 007 646 · <span className="text-blue-400">brand050103@gmail.com</span></p>
      </div>
    </div>
  );
}

function RegistrosList({ data, cargando, ventas, clientes, equipos, onNew, onEdit, showToast, db, auth, appId }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [ticketData, setTicketData] = useState(null);
  const [viewingRegistro, setViewingRegistro] = useState(null);

  const getCliente = (dni) => clientes.find(c => c.dni === dni) || {};

  const filteredData = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return data.filter(r => {
      const cliente = clientes.find(c => c.dni === r.dniCliente) || {};
      return (r.imeiEquipo && r.imeiEquipo.includes(searchTerm)) ||
             (r.imei2Equipo && r.imei2Equipo.includes(searchTerm)) ||
             (r.dniCliente && r.dniCliente.includes(searchTerm)) ||
             (cliente.nombre && cliente.nombre.toLowerCase().includes(term));
    });
  }, [data, clientes, searchTerm]);

  const handleCopy = (item) => {
    const cliente = getCliente(item.dniCliente);
    const imeiRegistrado = item.imeiRegistrado || item.imeiEquipo;
    const text = `IMEI: ${imeiRegistrado}\nDNI: ${item.dniCliente}\nCELULAR: ${cliente.celular || ''}\nNOMBRE CLIENTE: ${cliente.nombre || ''}\nDIRECCION: ${cliente.direccion || ''}\nCORREO ELECTRONICO: ${cliente.correo || ''}`;
    navigator.clipboard.writeText(text).then(() => showToast('Datos copiados')).catch(() => showToast('Error al copiar', 'error'));
  };

  const handleShare = async (row) => {
    const cliente = getCliente(row.dniCliente);
    const imeiRegistrado = row.imeiRegistrado || row.imeiEquipo;
    const texto = `IMEI: ${imeiRegistrado}
DNI: ${row.dniCliente}
CELULAR: ${cliente.celular || ''}
NOMBRE CLIENTE: ${cliente.nombre || ''}
DIRECCION: ${cliente.direccion || ''}
CORREO ELECTRONICO: ${cliente.correo || ''}`;

    // Intentar Web Share API con archivos PDF si están disponibles
    const tieneArchivos = row.pdfDniUrl || row.pdfCajaUrl || row.pdfReciboUrl;

    if (navigator.share && tieneArchivos) {
      try {
        // Descargar los PDFs como blobs y pasarlos a share
        const archivos = [];
        const fetchPdf = async (url, nombre) => {
          if (!url) return;
          try {
            const resp = await fetch(url);
            const blob = await resp.blob();
            archivos.push(new File([blob], nombre, { type: 'application/pdf' }));
          } catch (_) {}
        };
        await fetchPdf(row.pdfDniUrl,    `DNI_${row.dniCliente}.pdf`);
        await fetchPdf(row.pdfCajaUrl,   `CAJA_${row.dniCliente}.pdf`);
        await fetchPdf(row.pdfReciboUrl, `RECIBO_${row.dniCliente}.pdf`);

        if (navigator.canShare && navigator.canShare({ files: archivos })) {
          await navigator.share({ title: `Registro ${row.nRegistro}`, text: texto, files: archivos });
        } else {
          await navigator.share({ title: `Registro ${row.nRegistro}`, text: texto });
        }
        return;
      } catch (e) {
        if (e.name !== 'AbortError') showToast('Error al compartir', 'error');
        return;
      }
    }

    // Fallback: solo texto (+ links si los hay)
    if (navigator.share) {
      let shareText = texto;
      if (row.pdfDniUrl)    shareText += `

PDF DNI: ${row.pdfDniUrl}`;
      if (row.pdfCajaUrl)   shareText += `
PDF Caja: ${row.pdfCajaUrl}`;
      if (row.pdfReciboUrl) shareText += `
PDF Recibo: ${row.pdfReciboUrl}`;
      try {
        await navigator.share({ title: `Registro ${row.nRegistro}`, text: shareText });
      } catch (e) {
        if (e.name !== 'AbortError') showToast('Error al compartir', 'error');
      }
      return;
    }

    // Sin Web Share API: copiar al portapapeles
    let shareText = texto;
    if (row.pdfDniUrl)    shareText += `

PDF DNI: ${row.pdfDniUrl}`;
    if (row.pdfCajaUrl)   shareText += `
PDF Caja: ${row.pdfCajaUrl}`;
    if (row.pdfReciboUrl) shareText += `
PDF Recibo: ${row.pdfReciboUrl}`;
    navigator.clipboard.writeText(shareText)
      .then(() => showToast('Datos copiados para compartir'))
      .catch(() => showToast('Error al copiar', 'error'));
  };

  const handleDelete = async (id) => {
    if(window.confirm("¿Estás seguro de eliminar este registro?")) {
      try {
        if(auth.currentUser) {
          const uid = 'shared';
          const registro = data.find(r => r.id === id);

          await deleteDoc(doc(db, 'artifacts', appId, 'users', uid, 'registros', id));

          if (registro?.imeiEquipo) {
            const imei1 = registro.imeiEquipo;
            // ¿Quedan otros registros para este equipo?
            const otrosReg = data.filter(r => r.id !== id && r.imeiEquipo === imei1);
            // ¿Tiene alguna venta activa?
            const tieneVenta = ventas.some(v => v.imeiEquipo === imei1);

            if (otrosReg.length === 0 && !tieneVenta) {
              // Sin registros ni ventas → eliminar el equipo completamente
              await deleteDoc(doc(db, 'artifacts', appId, 'users', uid, 'equipos', imei1));
              // Si el cliente no tiene más equipos, eliminar también el cliente
              const otrosEquipos = equipos.filter(e => e.idDuenio === registro.dniCliente && e.idEquipo !== imei1);
              if (otrosEquipos.length === 0) {
                await deleteDoc(doc(db, 'artifacts', appId, 'users', uid, 'clientes', registro.dniCliente));
              }
            } else {
              // Solo actualizar flags de registro
              const imei2 = registro.imei2Equipo || '';
              const imei1Reg = otrosReg.some(r => r.imeiRegistrado === imei1);
              const imei2Reg = imei2 ? otrosReg.some(r => r.imeiRegistrado === imei2) : false;
              await updateDoc(doc(db, 'artifacts', appId, 'users', uid, 'equipos', imei1), {
                isRegistrado: imei1Reg || imei2Reg,
                imei1Registrado: imei1Reg,
                imei2Registrado: imei2Reg,
              });
            }
          }
          showToast('Registro eliminado correctamente');
        }
      } catch (e) { console.error(e); showToast('Error al eliminar', 'error'); }
    }
  };

  const [desbloqueando, setDesbloqueando] = useState(null);

  const handleDesbloquear = async (row) => {
    setDesbloqueando(row.id);
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'users', 'shared', 'registros', row.id), { estado: 'NO BLOQUEADO' });
      showToast(`${row.nRegistro} desbloqueado ✓`);
    } catch (e) {
      console.error(e);
      showToast('Error al desbloquear', 'error');
    } finally {
      setDesbloqueando(null);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden relative">
      {ticketData && null}
      {viewingRegistro && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 relative">
            <button onClick={() => setViewingRegistro(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X size={20}/></button>
            <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">Detalles del Registro</h3>
            <div className="space-y-4 text-sm">
              {/* Equipo */}
              <div>
                <p className="text-xs font-semibold text-blue-600 uppercase mb-2 border-b pb-1">Equipo</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 bg-gray-50 p-3 rounded border border-gray-100">
                  <p><strong className="text-gray-700">IMEI registrado:</strong></p>
                  <p className="font-mono text-gray-600">{viewingRegistro.imeiRegistrado || viewingRegistro.imeiEquipo}</p>
                  <p><strong className="text-gray-700">Marca:</strong></p>
                  <p className="text-gray-600">{viewingRegistro.marcaEquipo || '-'}</p>
                  <p><strong className="text-gray-700">Modelo:</strong></p>
                  <p className="text-gray-600">{viewingRegistro.modeloEquipo || '-'}</p>
                  <p><strong className="text-gray-700">Nombre comercial:</strong></p>
                  <p className="text-gray-600">{viewingRegistro.nombreComercialEquipo || '-'}</p>
                  <p><strong className="text-gray-700">Estado:</strong></p>
                  <p><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${viewingRegistro.estado === 'BLOQUEADO' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{viewingRegistro.estado || '-'}</span></p>
                  <p><strong className="text-gray-700">Operador:</strong></p>
                  <p className="text-gray-600">{viewingRegistro.operador || '-'}</p>
                  <p><strong className="text-gray-700">Tipo:</strong></p>
                  <p className="text-gray-600">{viewingRegistro.tipo || '-'}</p>
                  <p><strong className="text-gray-700">Precio:</strong></p>
                  <p className="text-green-700 font-bold">S/. {parseFloat(viewingRegistro.precio || 0).toFixed(2)}</p>
                  <p><strong className="text-gray-700">Fecha:</strong></p>
                  <p className="text-gray-600">{viewingRegistro.fecha ? new Date(viewingRegistro.fecha).toLocaleString('es-PE') : '-'}</p>
                  <p><strong className="text-gray-700">N° Registro:</strong></p>
                  <p className="text-gray-600">{viewingRegistro.nRegistro || '-'}</p>
                </div>
              </div>
              {/* Cliente */}
              <div>
                <p className="text-xs font-semibold text-blue-600 uppercase mb-2 border-b pb-1">Cliente</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 bg-gray-50 p-3 rounded border border-gray-100">
                  <p><strong className="text-gray-700">Nombre:</strong></p>
                  <p className="text-gray-600">{getCliente(viewingRegistro.dniCliente).nombre || '-'}</p>
                  <p><strong className="text-gray-700">DNI:</strong></p>
                  <p className="text-gray-600">{viewingRegistro.dniCliente}</p>
                  <p><strong className="text-gray-700">Celular:</strong></p>
                  <p className="text-gray-600">{getCliente(viewingRegistro.dniCliente).celular || viewingRegistro.celularCliente || '-'}</p>
                  <p><strong className="text-gray-700">N° Referencia:</strong></p>
                  <p className="text-gray-600">{viewingRegistro.celularRef || '-'}</p>
                  <p><strong className="text-gray-700">Correo:</strong></p>
                  <p className="text-gray-600">{getCliente(viewingRegistro.dniCliente).correo || '-'}</p>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button onClick={() => setViewingRegistro(null)} className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 w-full justify-center flex">Cerrar</button>
            </div>
          </div>
        </div>
      )}
      <div className="p-4 md:p-6 border-b border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="relative w-full md:w-96">
          <input type="text" placeholder="Buscar por DNI o IMEI..." className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          <Search className="absolute left-3 top-2.5 text-gray-400" size={20} />
        </div>
        <button onClick={onNew} className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center justify-center"><Plus className="mr-2" size={20} /> Nuevo Registro</button>
      </div>

      {/* ── MÓVIL: tarjetas ── */}
      <div className="md:hidden divide-y divide-gray-100">
        {cargando ? (
          <div className="py-12 flex flex-col items-center gap-3 text-gray-400">
            <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
            <span className="text-sm">Cargando registros...</span>
          </div>
        ) : filteredData.length === 0 ? (
          <p className="px-4 py-8 text-center text-gray-400 text-sm">No se encontraron registros</p>
        ) : filteredData.map(row => (
          <div key={row.id} className="p-4 hover:bg-gray-50">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-semibold text-gray-800 text-sm">{getCliente(row.dniCliente).nombre || row.dniCliente}</p>
                <p className="text-xs text-gray-400">{row.nRegistro} · {new Date(row.fecha).toLocaleDateString()}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${row.estado === 'BLOQUEADO' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{row.estado}</span>
                {row.estado === 'BLOQUEADO' && (
                  <button
                    onClick={() => handleDesbloquear(row)}
                    disabled={desbloqueando === row.id}
                    title="Cambiar a NO BLOQUEADO"
                    className={`relative inline-flex items-center h-5 w-9 rounded-full transition-colors focus:outline-none ${desbloqueando === row.id ? 'bg-gray-300 cursor-wait' : 'bg-red-500 hover:bg-red-400'}`}
                  >
                    <span className={`inline-block w-3.5 h-3.5 bg-white rounded-full shadow transition-transform ${desbloqueando === row.id ? 'translate-x-3' : 'translate-x-1'}`}/>
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-600 mb-1">{row.marcaEquipo} {row.nombreComercialEquipo || row.modeloEquipo}</p>
            <p className="text-xs font-mono text-blue-600 mb-1">{row.imeiEquipo}</p>
            <p className="text-xs text-gray-400 mb-3">{row.operador} · {row.tipo}</p>
            <div className="flex gap-2">
              <button onClick={() => setViewingRegistro(row)} className="flex-1 flex items-center justify-center gap-1 py-1.5 border rounded-lg text-xs text-gray-600 hover:bg-gray-100"><Eye size={14}/> Ver</button>
              <button onClick={() => onEdit(row)} className="flex-1 flex items-center justify-center gap-1 py-1.5 border rounded-lg text-xs text-yellow-600 hover:bg-yellow-50"><Edit size={14}/> Editar</button>
              <button onClick={() => { const cl = getCliente(row.dniCliente); generarTicketRegistroPDF({...row, nombreCliente: cl.nombre || row.dniCliente, correoCliente: cl.correo || '', celularCliente: cl.celular || row.celularCliente || '', celularRef: cl.celularRef || row.celularRef || ''}); }} className="flex-1 flex items-center justify-center gap-1 py-1.5 border rounded-lg text-xs text-purple-600 hover:bg-purple-50"><Printer size={14}/> Ticket</button>
              <button onClick={() => generarStickerRegistroPDF(row)} className="flex-1 flex items-center justify-center gap-1 py-1.5 border rounded-lg text-xs text-orange-600 hover:bg-orange-50" title="Imprimir sticker 40×30mm"><ScanBarcode size={14}/> Sticker</button>
              <button onClick={() => handleShare(row)} className="flex-1 flex items-center justify-center gap-1 py-1.5 border rounded-lg text-xs text-blue-600 hover:bg-blue-50"><Share2 size={14}/> Compartir</button>
              <button onClick={() => handleDelete(row.id)} className="px-3 py-1.5 border rounded-lg text-xs text-red-500 hover:bg-red-50"><Trash2 size={14}/></button>
            </div>
          </div>
        ))}
      </div>

      {/* ── DESKTOP: tabla ── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-sm text-gray-600">
          <thead className="bg-gray-50 text-gray-700 uppercase text-xs font-semibold">
            <tr><th className="px-6 py-3">Fecha / ID</th><th className="px-6 py-3">Cliente</th><th className="px-6 py-3">Equipo (IMEI)</th><th className="px-6 py-3">Estado/Operador</th><th className="px-6 py-3 text-right">Acciones</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {cargando ? (
              <tr><td colSpan="5" className="px-6 py-12 text-center">
                <div className="flex flex-col items-center gap-3 text-gray-400">
                  <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                  <span className="text-sm">Cargando registros...</span>
                </div>
              </td></tr>
            ) : filteredData.length === 0 ? (<tr><td colSpan="5" className="px-6 py-8 text-center text-gray-400">No se encontraron registros</td></tr>) : (
              filteredData.map(row => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4"><div className="font-medium text-gray-800">{new Date(row.fecha).toLocaleDateString()}</div><div className="text-xs text-gray-400">{row.nRegistro}</div></td>
                  <td className="px-6 py-4"><div className="font-medium">{getCliente(row.dniCliente).nombre || row.dniCliente}</div><div className="text-xs">{row.dniCliente}</div></td>
                  <td className="px-6 py-4"><div>{row.modeloEquipo}</div><div className="text-xs text-blue-600 font-mono">{row.imeiEquipo}</div></td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs ${row.estado === 'BLOQUEADO' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{row.estado}</span>
                      {row.estado === 'BLOQUEADO' && (
                        <button
                          onClick={() => handleDesbloquear(row)}
                          disabled={desbloqueando === row.id}
                          title="Cambiar a NO BLOQUEADO"
                          className={`relative inline-flex items-center h-5 w-9 rounded-full transition-colors focus:outline-none ${desbloqueando === row.id ? 'bg-gray-300 cursor-wait' : 'bg-red-500 hover:bg-red-400'}`}
                        >
                          <span className={`inline-block w-3.5 h-3.5 bg-white rounded-full shadow transition-transform ${desbloqueando === row.id ? 'translate-x-3' : 'translate-x-1'}`}/>
                        </button>
                      )}
                    </div>
                    <div className="text-xs mt-1">{row.operador}</div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setViewingRegistro(row)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"><Eye size={18} /></button>
                      <button onClick={() => onEdit(row)} className="p-1.5 text-gray-500 hover:text-yellow-600 hover:bg-yellow-50 rounded"><Edit size={18} /></button>
                      <button onClick={() => { const cl = getCliente(row.dniCliente); generarTicketRegistroPDF({...row, nombreCliente: cl.nombre || row.dniCliente, correoCliente: cl.correo || '', celularCliente: cl.celular || row.celularCliente || '', celularRef: cl.celularRef || row.celularRef || ''}); }} className="p-1.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded" title="Descargar ticket PDF"><Printer size={18} /></button>
                      <button onClick={() => generarStickerRegistroPDF(row)} className="p-1.5 text-gray-500 hover:text-orange-600 hover:bg-orange-50 rounded" title="Imprimir sticker 40×30mm"><ScanBarcode size={18} /></button>
                      <button onClick={() => handleShare(row)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded" title="Compartir registro"><Share2 size={18} /></button>
                      <button onClick={() => handleDelete(row.id)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={18} /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// ESCÁNER IA — panel flotante esquina inferior derecha, no bloquea el formulario
// ============================================================================
function EscanerIA({ onResult, onClose }) {
  const videoRef  = React.useRef(null);
  const canvasRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const [fase, setFase]         = React.useState('camara'); // 'camara' | 'preview' | 'procesando'
  const [fotoBase64, setFoto]   = React.useState(null);
  const [error, setError]       = React.useState('');
  const [msg, setMsg]           = React.useState('');

  const abrirCamara = React.useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('La camara solo funciona en HTTPS, localhost o navegadores compatibles.');
    }
    return navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 3840 }, height: { ideal: 2160 } }
    });
  }, []);

  React.useEffect(() => {
    let activo = true;
    abrirCamara().then(stream => {
      if (!activo) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
    }).catch(() => setError('Sin acceso a cámara. Verifica permisos.'));
    return () => { activo = false; streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, [abrirCamara]);

  const capturar = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    // Sin ningún preprocesamiento: enviamos la imagen tal cual a Gemini mediante Cloud Functions.
    const base64 = canvas.toDataURL('image/jpeg', 0.97).split(',')[1];
    setFoto(base64);
    setFase('preview');
    streamRef.current?.getTracks().forEach(t => t.stop());
  };

  const analizar = async () => {
    if (!fotoBase64) {
      setError('Primero toma una foto de la caja.');
      return;
    }
    setFase('procesando');
    setMsg('Analizando...');
    setError('');
    try {
      const data = await llamarFuncionSegura('analizarCajaGemini', { imageBase64: fotoBase64 });

      if (data.error) {
        console.error('Gemini API error:', data.error);
        const mensaje = data.error.message || 'No se pudo analizar la imagen.';
        const keyFiltrada = /api key|leaked|key/i.test(mensaje);
        setError(keyFiltrada ? 'La API key de Gemini fue bloqueada. Actualiza GEMINI_API_KEY en functions/.env.' : `Error API: ${mensaje}`);
        setFase('preview'); setMsg('');
        return;
      }

      const texto = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!texto) {
        setError('Gemini no devolvió texto. Reintenta.');
        setFase('preview'); setMsg('');
        return;
      }

      const extraer = (campo) => {
        const r = new RegExp(`"${campo}"\\s*:\\s*"([^"]*)"`, 'i');
        const m = texto.match(r);
        return m ? m[1].trim() : '';
      };

      let parsed = {};
      const matchCompleto = texto.match(/\{[\s\S]*\}/);
      if (matchCompleto) {
        try { parsed = JSON.parse(matchCompleto[0]); } catch (_) {}
      }
      if (!Object.values(parsed).some(v => v)) {
        parsed = {
          imei1:           extraer('imei1'),
          imei2:           extraer('imei2'),
          sn:              extraer('sn'),
          marca:           extraer('marca'),
          modelo:          extraer('modelo'),
          nombreComercial: extraer('nombreComercial'),
          ram:             extraer('ram'),
          memoria:         extraer('memoria'),
          color:           extraer('color'),
        };
      }

      const normalizado = normalizarEscaneo(parsed);
      onResult(normalizado);
    } catch (e) {
      console.error('Error escáner:', e);
      setError(`Error: ${e.message}`);
      setFase('preview');
      setMsg('');
    }
  };

  const reintentar = () => {
    setFoto(null); setError(''); setMsg(''); setFase('camara');
    abrirCamara()
      .then(stream => { streamRef.current = stream; if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); } })
      .catch((e) => setError(e.message || 'Sin acceso a camara. Verifica permisos.'));
  };

  return (
    // Panel fijo en esquina inferior derecha — NO bloquea el formulario
    <div className="fixed bottom-4 right-4 z-[200] w-72 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900">
        <div className="flex items-center gap-2 text-white text-xs font-medium">
          <ScanBarcode size={15} />
          {fase === 'camara'     && 'Apunta a la caja del equipo'}
          {fase === 'preview'    && 'Revisar foto'}
          {fase === 'procesando' && (msg || 'Procesando...')}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={16} /></button>
      </div>

      {/* Visor compacto */}
      <div className="relative bg-black" style={{aspectRatio:'4/3'}}>
        {fase === 'camara' && (
          <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
        )}
        {(fase === 'preview' || fase === 'procesando') && fotoBase64 && (
          <img src={`data:image/jpeg;base64,${fotoBase64}`} alt="preview" className="w-full h-full object-cover" />
        )}
        {fase === 'procesando' && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <p className="text-white text-xs px-3 text-center">Leyendo datos...</p>
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Acciones */}
      <div className="px-3 py-2.5 flex flex-col gap-2">
        {error && <p className="text-red-500 text-xs text-center">{error}</p>}
        {fase === 'camara' && (
          <button onClick={capturar}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg flex items-center justify-center gap-2">
            <ScanBarcode size={16} /> Tomar foto
          </button>
        )}
        {(fase === 'preview' || (fase === 'procesando' && error)) && (
          <div className="flex gap-2">
            <button onClick={reintentar}
              className="flex-1 border border-gray-300 text-gray-600 text-xs py-2 rounded-lg hover:bg-gray-50">
              Repetir
            </button>
            <button onClick={analizar} disabled={fase === 'procesando'}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium py-2 rounded-lg">
              Analizar IA
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RegistroForm({ user, clientes, equipos, registros, initialData, onCancel, onSave, onDirty, showToast, db, appId }) {
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
    dni: '', nombre: '', celular: '', celularRef: '', correo: '', direccion: '', imei: '', imei2: '', sn: '', marca: '', modelo: '', nombreComercial: '', estado: 'NO BLOQUEADO', operador: 'BITEL', tipo: 'TIENDA', precio: '', fecha: toLocalDatetimeValue(new Date().toISOString())
  });

  useEffect(() => {
    if (initialData) {
      const cliente = clientes.find(c => c.dni === initialData.dniCliente) || {};
      const eq = equipos.find(e => e.idEquipo === initialData.imeiEquipo) || {};
      setFormData({
        dni: initialData.dniCliente || '', nombre: cliente.nombre || '', celular: cliente.celular || '', celularRef: cliente.celularRef || cliente.celular || '', correo: cliente.correo || '', direccion: cliente.direccion || '', imei: initialData.imeiEquipo || '', imei2: eq.imei2 || '', sn: eq.sn || '', marca: initialData.marcaEquipo || '', modelo: initialData.modeloEquipo || '', nombreComercial: initialData.nombreComercialEquipo || '', estado: initialData.estado || 'NO BLOQUEADO', operador: initialData.operador || 'BITEL', tipo: initialData.tipo || 'TIENDA', precio: initialData.precio || '', fecha: toLocalDatetimeValue(initialData.fecha)
      });
      setShowManualEqForm(true);
    }
  }, [initialData, clientes]);







  const [mostrarEscaner, setMostrarEscaner] = useState(false);
  const [buscandoReniec, setBuscandoReniec] = useState(false);
  const [datosAnterioresReg, setDatosAnterioresReg] = useState(null);

  const buscarReniec = async (dni) => {
    setBuscandoReniec(true);
    try {
      const json = await consultarReniecDni(dni);
      if (json.success && json.result) {
        const r = json.result;
        setFormData(prev => ({
          ...prev,
          nombre:    r.full_name  ? r.full_name  : prev.nombre,
          direccion: r.address && !r.address.includes('*') ? r.address : prev.direccion,
          correo:    r.email   && !r.email.includes('*')   ? r.email   : prev.correo,
        }));
        showToast('✓ Datos encontrados en RENIEC', 'success');
      } else {
        showToast('DNI no encontrado en RENIEC', 'error');
      }
    } catch (e) {
      console.error('RENIEC error:', e);
      showToast(e.message === 'RENIEC_TOKEN_MISSING' ? 'Falta configurar token RENIEC' : 'Error al consultar RENIEC', 'error');
    } finally {
      setBuscandoReniec(false);
    }
  };

  const onEscaneo = (datos) => {
    setMostrarEscaner(false);
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
      };
      return next;
    });
    const campos = [datos.imei1, datos.marca, datos.nombreComercial].filter(Boolean).join(' · ');
    showToast(campos ? `✓ ${campos}` : 'Sin datos — rellena manualmente', campos ? 'success' : 'error');
  };

  useEffect(() => {
    if (formData.dni.length >= 8 && !initialData) {
      const clienteExistente = clientes.find(c => c.dni === formData.dni);
      if (clienteExistente) {
        setDatosAnterioresReg({ celular: clienteExistente.celular || '', correo: clienteExistente.correo || '' });
        setFormData(prev => ({ ...prev, nombre: clienteExistente.nombre, celular: clienteExistente.celular, celularRef: prev.celularRef || clienteExistente.celular, correo: clienteExistente.correo, direccion: clienteExistente.direccion || '' }));
      } else {
        setDatosAnterioresReg(null);
        buscarReniec(formData.dni);
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
    } else if (!initialData && formData.dni.length < 8) {
      setEquiposCliente([]);
      setShowManualEqForm(true);
    }
  }, [formData.dni, clientes, equipos, initialData]);

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
      nombreComercial: eq.nombreComercial || ''
    }));
    setImeiSeleccionado(null);
    setShowManualEqForm(true);
  };

  const CAMPOS_SOLO_NUMEROS = ['dni', 'celular', 'celularRef', 'imei', 'imei2'];
  const CAMPOS_MAYUSCULAS   = ['nombre', 'marca', 'modelo', 'nombreComercial', 'sn', 'operador', 'estado', 'tipo'];
  const CAMPOS_CORREO       = ['correo'];

  const handleChange = (e) => {
    const { name, value } = e.target;
    let val = value;
    if (CAMPOS_SOLO_NUMEROS.includes(name)) val = val.replace(/\D/g, '');
    if (name === 'imei' || name === 'imei2') val = val.slice(0, 15);
    if (name === 'celular' || name === 'celularRef') val = val.slice(0, 9);
    if (CAMPOS_MAYUSCULAS.includes(name)) val = val.toUpperCase();
    onDirty?.();
    setFormData(prev => {
      const next = { ...prev, [name]: val };
      if (name === 'celular' && !prev.celularRef) next.celularRef = val;
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

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

    // Confirmación final
    const confirmMsg = `¿Los datos son correctos?\n\n👤 Cliente: ${formData.nombre} (DNI: ${formData.dni})\n📱 Equipo: ${formData.marca} ${formData.nombreComercial} ${formData.modelo}\n🔢 IMEI: ${formData.imei}\n📡 Operador: ${formData.operador} | ${formData.estado}\n🏷 Tipo: ${formData.tipo}\n💰 Precio: S/. ${parseFloat(formData.precio || 0).toFixed(2)}`;
    if (!window.confirm(confirmMsg)) return;

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
        dniCliente: formData.dni, celularCliente: formData.celular,
        celularRef: formData.celularRef || formData.celular,
        imeiEquipo: imei1Real, imeiRegistrado: formData.imei, imei2Equipo: imei2Real,
        modeloEquipo: formData.modelo, marcaEquipo: formData.marca,
        nombreComercialEquipo: formData.nombreComercial,
        estado: formData.estado, operador: formData.operador,
        tipo: formData.tipo, precio: formData.precio,
        fecha: new Date(formData.fecha).toISOString(),
      };

      // Eliminar docs viejos si cambiaron DNI o IMEI (en paralelo)
      const deleteOps = [];
      if (initialData && initialData.dniCliente !== formData.dni)
        deleteOps.push(deleteDoc(doc(db, 'artifacts', appId, 'users', 'shared', 'clientes', initialData.dniCliente)));
      if (initialData && initialData.imeiEquipo !== imei1Real)
        deleteOps.push(deleteDoc(doc(db, 'artifacts', appId, 'users', 'shared', 'equipos', initialData.imeiEquipo)));
      if (deleteOps.length) await Promise.all(deleteOps);

      // Guardar cliente, equipo y registro en paralelo
      if (initialData) {
        registroData.nRegistro = initialData.nRegistro;
        await Promise.all([
          setDoc(doc(db, 'artifacts', appId, 'users', 'shared', 'clientes', formData.dni),
            { dni: formData.dni, nombre: formData.nombre, celular: formData.celular, celularRef: formData.celularRef || formData.celular, correo: formData.correo, direccion: formData.direccion }, { merge: true }),
          setDoc(doc(db, 'artifacts', appId, 'users', 'shared', 'equipos', imei1Real),
            { idEquipo: imei1Real, idDuenio: formData.dni, imei2: imei2Real, sn: formData.sn, marca: formData.marca, modelo: formData.modelo, nombreComercial: formData.nombreComercial, isRegistrado: true,
              imei1Registrado: formData.imei === imei1Real ? true : (eqExistente.imei1Registrado || false),
              imei2Registrado: formData.imei === imei2Real ? true : (eqExistente.imei2Registrado || false),
            }, { merge: true }),
          setDoc(doc(db, 'artifacts', appId, 'users', 'shared', 'registros', initialData.id), registroData),
        ]);
        showToast('Actualizado exitosamente');
      } else {
        const siguiente = (registros.length + 1).toString().padStart(5, '0');
        registroData.nRegistro = `RECO-${siguiente}`;
        await Promise.all([
          setDoc(doc(db, 'artifacts', appId, 'users', 'shared', 'clientes', formData.dni),
            { dni: formData.dni, nombre: formData.nombre, celular: formData.celular, celularRef: formData.celularRef || formData.celular, correo: formData.correo, direccion: formData.direccion }, { merge: true }),
          setDoc(doc(db, 'artifacts', appId, 'users', 'shared', 'equipos', imei1Real),
            { idEquipo: imei1Real, idDuenio: formData.dni, imei2: imei2Real, sn: formData.sn, marca: formData.marca, modelo: formData.modelo, nombreComercial: formData.nombreComercial, isRegistrado: true,
              imei1Registrado: formData.imei === imei1Real ? true : (eqExistente.imei1Registrado || false),
              imei2Registrado: formData.imei === imei2Real ? true : (eqExistente.imei2Registrado || false),
            }, { merge: true }),
          addDoc(collection(db, 'artifacts', appId, 'users', 'shared', 'registros'), registroData),
        ]);
        showToast('Guardado exitosamente');
      }
      (onSave || onCancel)();
    } catch (error) { console.error(error); showToast('Error al guardar', 'error'); } finally { setLoading(false); }
  };

  const [paso, setPaso] = useState(1);

  const validarPaso1 = () => {
    if (!formData.dni || !formData.nombre || !formData.celular) {
      showToast('Completa DNI, nombre y celular', 'error'); return false;
    }
    if (!formData.direccion.trim()) {
      showToast('La dirección es obligatoria', 'error'); return false;
    }
    if (!formData.correo.trim()) {
      showToast('El correo electrónico es obligatorio', 'error'); return false;
    }
    return true;
  };
  const validarPaso2 = () => {
    if (!formData.imei || !formData.marca || !formData.modelo) {
      showToast('Completa IMEI, marca y modelo', 'error'); return false;
    }
    if (!formData.nombreComercial) {
      showToast('El nombre comercial es obligatorio', 'error'); return false;
    }
    if (imeiYaRegistrado(formData.imei)) {
      showToast(`El IMEI ${formData.imei} ya tiene un registro activo`, 'error'); return false;
    }
    return true;
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 max-w-2xl mx-auto overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
        <h3 className="font-semibold text-gray-700">{initialData ? 'Editar Registro' : 'Nuevo Registro'}</h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
      </div>

      {/* Indicador de pasos */}
      <div className="flex items-center px-6 pt-5 pb-2 gap-2">
        {[1,2,3].map(n => (
          <React.Fragment key={n}>
            <div className={`flex items-center gap-2 ${paso === n ? 'text-blue-600' : paso > n ? 'text-green-600' : 'text-gray-400'}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors
                ${paso === n ? 'border-blue-600 bg-blue-50 text-blue-600' : paso > n ? 'border-green-500 bg-green-50 text-green-600' : 'border-gray-300 text-gray-400'}`}>
                {paso > n ? '✓' : n}
              </div>
              <span className="text-xs font-medium hidden sm:block">
                {n === 1 ? 'Cliente' : n === 2 ? 'Equipo' : 'Detalle'}
              </span>
            </div>
            {n < 3 && <div className={`flex-1 h-0.5 ${paso > n ? 'bg-green-400' : 'bg-gray-200'}`} />}
          </React.Fragment>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="p-6">

        {/* PASO 1 — DATOS DEL CLIENTE */}
        {paso === 1 && (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-blue-600 uppercase border-b pb-2">Datos del Cliente</h4>
            {buscandoReniec && (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
                <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                Consultando RENIEC...
              </div>
            )}
            {datosAnterioresReg && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                <p className="font-semibold mb-1">⚠ Cliente existente — datos anteriores registrados:</p>
                {datosAnterioresReg.celular && <p>📱 Celular anterior: <span className="font-mono font-bold">{datosAnterioresReg.celular}</span></p>}
                {datosAnterioresReg.correo  && <p>✉ Correo anterior: <span className="font-mono font-bold">{datosAnterioresReg.correo}</span></p>}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="block text-xs text-gray-500 mb-1">DNI *</label><input name="dni" value={formData.dni} onChange={handleChange} className="w-full border rounded p-2 text-sm" inputMode="numeric" placeholder="8 dígitos" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Nombre Completo *</label><input name="nombre" value={formData.nombre} onChange={handleChange} className="w-full border rounded p-2 text-sm" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Celular *</label><input name="celular" value={formData.celular} onChange={handleChange} className="w-full border rounded p-2 text-sm" inputMode="numeric" maxLength={9} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">N° Referencia</label><input name="celularRef" value={formData.celularRef} onChange={handleChange} placeholder={formData.celular || 'Igual al celular'} className="w-full border rounded p-2 text-sm" inputMode="numeric" maxLength={9} /></div>
              <div className="sm:col-span-2"><label className="block text-xs text-gray-500 mb-1">Dirección *</label><input name="direccion" value={formData.direccion} onChange={handleChange} className="w-full border rounded p-2 text-sm" placeholder="Av. / Jr. / Calle..." /></div>
              <div className="sm:col-span-2"><label className="block text-xs text-gray-500 mb-1">Correo Electrónico *</label><input type="email" name="correo" value={formData.correo} onChange={handleChange} className="w-full border rounded p-2 text-sm" /></div>
            </div>
            <div className="flex justify-between pt-4 border-t">
              <button type="button" onClick={onCancel} className="px-5 py-2 border rounded text-gray-600 hover:bg-gray-50 text-sm">Cancelar</button>
              <button type="button" onClick={() => validarPaso1() && setPaso(2)} className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">Siguiente →</button>
            </div>
          </div>
        )}



        {/* PASO 2 — DATOS DEL EQUIPO */}
        {paso === 2 && (
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h4 className="text-sm font-semibold text-blue-600 uppercase">Datos del Equipo</h4>
              {showManualEqForm && <button type="button" onClick={() => setMostrarEscaner(true)} className="flex items-center text-xs bg-gray-800 text-white px-3 py-1.5 rounded"><ScanBarcode size={14} className="mr-1"/> Escanear</button>}
            </div>
            {mostrarEscaner && <EscanerIA onResult={onEscaneo} onClose={() => setMostrarEscaner(false)} />}

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
                  <button type="button" onClick={() => {setShowManualEqForm(true); setFormData(prev => ({...prev, imei:'', imei2:'', marca:'', modelo:'', nombreComercial:''}))}} className="text-sm text-blue-700 hover:underline">+ Agregar equipo nuevo</button>
                </div>
              </div>
            )}

            {showManualEqForm && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                <label className="block text-xs text-gray-500 mb-1">IMEI a registrar *</label>
                <input name="imei" value={formData.imei} onChange={handleChange}
                  className={`w-full border rounded p-2 text-sm font-mono ${formData.imei.length === 15 ? (luhn(formData.imei) ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50') : ''}`}
                  placeholder="15 dígitos" />
                {formData.imei.length === 15 && (
                  <p className={`text-xs mt-1 font-medium ${luhn(formData.imei) ? 'text-green-600' : 'text-red-600'}`}>
                    {luhn(formData.imei) ? '✓ IMEI válido' : '✗ IMEI inválido — verifica los dígitos'}
                  </p>
                )}
              </div>
                <div><label className="block text-xs text-gray-500 mb-1">N° de Serie (S/N)</label><input name="sn" value={formData.sn} onChange={handleChange} className="w-full border rounded p-2 text-sm font-mono" /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Nombre Comercial *</label><input name="nombreComercial" value={formData.nombreComercial} onChange={handleChange} className="w-full border rounded p-2 text-sm" placeholder="Ej: GALAXY A56" /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Marca *</label><input name="marca" value={formData.marca} onChange={handleChange} className="w-full border rounded p-2 text-sm" /></div>
                <div className="sm:col-span-2"><label className="block text-xs text-gray-500 mb-1">Modelo *</label><input name="modelo" value={formData.modelo} onChange={handleChange} className="w-full border rounded p-2 text-sm" /></div>
              </div>
            )}

            <div className="flex justify-between pt-4 border-t">
              <button type="button" onClick={() => setPaso(1)} className="px-5 py-2 border rounded text-gray-600 hover:bg-gray-50 text-sm">← Atrás</button>
              <button type="button" onClick={() => validarPaso2() && setPaso(3)} className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">Siguiente →</button>
            </div>
          </div>
        )}

        {/* PASO 3 — OPERADOR, ESTADO, TIPO, PRECIO */}
        {paso === 3 && (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-blue-600 uppercase border-b pb-2">Detalle del Registro</h4>
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

            {/* Resumen completo para confirmar */}
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-100 space-y-2 text-sm">
              <p className="font-semibold text-blue-800 mb-1">📋 Verifica que los datos sean correctos:</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
                <span className="font-medium text-gray-700">Cliente:</span><span>{formData.nombre}</span>
                <span className="font-medium text-gray-700">DNI:</span><span>{formData.dni}</span>
                <span className="font-medium text-gray-700">Celular:</span><span>{formData.celular}</span>
                <span className="font-medium text-gray-700">Dirección:</span><span>{formData.direccion}</span>
                <span className="font-medium text-gray-700">Correo:</span><span>{formData.correo}</span>
                <span className="font-medium text-gray-700">Equipo:</span><span>{formData.marca} {formData.nombreComercial}</span>
                <span className="font-medium text-gray-700">Modelo:</span><span>{formData.modelo}</span>
                <span className="font-medium text-gray-700">IMEI registrado:</span><span className="font-mono">{formData.imei}</span>
                <span className="font-medium text-gray-700">Operador:</span><span>{formData.operador}</span>
                <span className="font-medium text-gray-700">Estado:</span><span>{formData.estado}</span>
                <span className="font-medium text-gray-700">Tipo:</span><span>{formData.tipo}</span>
                <span className="font-medium text-gray-700">Precio:</span><span className="text-green-700 font-bold">S/. {parseFloat(formData.precio || 0).toFixed(2)}</span>
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t">
              <button type="button" onClick={() => setPaso(2)} className="px-5 py-2 border rounded text-gray-600 hover:bg-gray-50 text-sm">← Atrás</button>
              <button type="submit" disabled={loading} className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-semibold">
                {loading ? 'Guardando...' : '✓ Confirmar y Guardar'}
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

function VentasList({ data, cargando, registros, clientes, equipos, logoVentas, onNew, onEdit, showToast, db, auth, appId }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [viewingVenta, setViewingVenta] = useState(null);
  const [ticketVentaData, setTicketVentaData] = useState(null);
  const [ticketPendiente, setTicketPendiente] = useState(null); // data pendiente hasta elegir tamaño

  const getCliente = (dni) => clientes.find(c => c.dni === dni) || {};
  const getEquipo  = (imei) => equipos.find(e => e.idEquipo === imei) || {};

  const ticketData = (row) => {
    const eq = getEquipo(row.imeiEquipo);
    return {
      ...row,
      nombreCliente: getCliente(row.dniCliente).nombre || row.dniCliente,
      sn:            eq.sn    || row.sn    || '',
      imei2Equipo:   eq.imei2 || row.imei2Equipo || '',
      color:         eq.color || row.color || '',
      ram:           eq.ram   || row.ram   || '',
      memoria:       eq.memoria || row.memoria || '',
      nombreComercial: eq.nombreComercial || row.nombreComercial || '',
    };
  };

  const filteredData = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return data.filter(v => {
      const cliente = clientes.find(c => c.dni === v.dniCliente) || {};
      return (v.imeiEquipo && v.imeiEquipo.includes(searchTerm)) ||
             (v.dniCliente && v.dniCliente.includes(searchTerm)) ||
             (cliente.nombre && cliente.nombre.toLowerCase().includes(term));
    });
  }, [data, clientes, searchTerm]);

  const handleDelete = async (id) => {
    if(window.confirm("¿Estás seguro de eliminar esta venta?")) {
      try {
        if(auth.currentUser) {
          const uid = 'shared';
          const venta = data.find(v => v.id === id);

          await deleteDoc(doc(db, 'artifacts', appId, 'users', uid, 'ventas', id));

          if (venta?.imeiEquipo) {
            const imei1 = venta.imeiEquipo;
            // ¿Quedan otras ventas para este equipo?
            const otrasVentas = data.filter(v => v.id !== id && v.imeiEquipo === imei1);
            // ¿Tiene algún registro activo?
            const tieneRegistro = registros.some(r => r.imeiEquipo === imei1);

            if (otrasVentas.length === 0 && !tieneRegistro) {
              // Sin ventas ni registros → eliminar el equipo completamente
              await deleteDoc(doc(db, 'artifacts', appId, 'users', uid, 'equipos', imei1));
              // Si el cliente no tiene más equipos, eliminar también el cliente
              const otrosEquipos = equipos.filter(e => e.idDuenio === venta.dniCliente && e.idEquipo !== imei1);
              if (otrosEquipos.length === 0) {
                await deleteDoc(doc(db, 'artifacts', appId, 'users', uid, 'clientes', venta.dniCliente));
              }
            } else {
              // Solo quitar el flag de vendido
              await updateDoc(doc(db, 'artifacts', appId, 'users', uid, 'equipos', imei1), {
                isVendido: otrasVentas.length > 0,
              });
            }
          }
          showToast('Venta eliminada');
        }
      } catch (e) { console.error(e); showToast('Error al eliminar', 'error'); }
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden relative">
      {ticketVentaData && null}
      {/* Modal tamaño de papel */}
      {ticketPendiente && (
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 text-center">
            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Printer size={22} className="text-purple-600" />
            </div>
            <h3 className="text-base font-bold text-gray-800 mb-1">¿Tamaño de impresora?</h3>
            <p className="text-xs text-gray-400 mb-5">Elige el ancho del papel de tu impresora térmica</p>
            <div className="flex gap-3">
              <button onClick={() => { generarTicketVentaPDF(ticketPendiente, 58, logoVentas); setTicketPendiente(null); }}
                className="flex-1 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm transition-colors">
                58 mm
              </button>
              <button onClick={() => { generarTicketVentaPDF(ticketPendiente, 80, logoVentas); setTicketPendiente(null); }}
                className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition-colors">
                80 mm
              </button>
            </div>
            <button onClick={() => setTicketPendiente(null)} className="mt-3 text-xs text-gray-400 hover:text-gray-600 w-full py-1">Cancelar</button>
          </div>
        </div>
      )}
      {viewingVenta && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setViewingVenta(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X size={20}/></button>
            <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">Detalles de la Venta</h3>
            <div className="space-y-4 text-sm">
              {/* Venta */}
              <div>
                <p className="text-xs font-semibold text-green-600 uppercase mb-2 border-b pb-1">Venta</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 bg-gray-50 p-3 rounded border border-gray-100">
                  <p><strong className="text-gray-700">Código:</strong></p><p className="text-gray-600">{viewingVenta.nVenta}</p>
                  <p><strong className="text-gray-700">Fecha:</strong></p><p className="text-gray-600">{new Date(viewingVenta.fecha).toLocaleString('es-PE')}</p>
                  <p><strong className="text-gray-700">Precio:</strong></p><p className="text-green-700 font-bold">S/. {parseFloat(viewingVenta.precio).toFixed(2)}</p>
                </div>
              </div>
              {/* Cliente */}
              <div>
                <p className="text-xs font-semibold text-green-600 uppercase mb-2 border-b pb-1">Cliente</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 bg-gray-50 p-3 rounded border border-gray-100">
                  <p><strong className="text-gray-700">Nombre:</strong></p><p className="text-gray-600">{getCliente(viewingVenta.dniCliente).nombre || '-'}</p>
                  <p><strong className="text-gray-700">DNI:</strong></p><p className="text-gray-600">{viewingVenta.dniCliente}</p>
                  <p><strong className="text-gray-700">Celular:</strong></p><p className="text-gray-600">{getCliente(viewingVenta.dniCliente).celular || '-'}</p>
                </div>
              </div>
              {/* Equipo */}
              <div>
                <p className="text-xs font-semibold text-green-600 uppercase mb-2 border-b pb-1">Equipo</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 bg-gray-50 p-3 rounded border border-gray-100">
                  <p><strong className="text-gray-700">Marca:</strong></p><p className="text-gray-600">{viewingVenta.marcaEquipo || '-'}</p>
                  <p><strong className="text-gray-700">Modelo:</strong></p><p className="text-gray-600">{viewingVenta.modeloEquipo || '-'}</p>
                  <p><strong className="text-gray-700">Nombre comercial:</strong></p><p className="text-gray-600">{viewingVenta.nombreComercial || getEquipo(viewingVenta.imeiEquipo).nombreComercial || '-'}</p>
                  <p><strong className="text-gray-700">Color:</strong></p><p className="text-gray-600">{viewingVenta.color || getEquipo(viewingVenta.imeiEquipo).color || '-'}</p>
                  <p><strong className="text-gray-700">RAM:</strong></p><p className="text-gray-600">{viewingVenta.ram ? viewingVenta.ram + ' GB' : getEquipo(viewingVenta.imeiEquipo).ram ? getEquipo(viewingVenta.imeiEquipo).ram + ' GB' : '-'}</p>
                  <p><strong className="text-gray-700">Memoria:</strong></p><p className="text-gray-600">{viewingVenta.memoria ? viewingVenta.memoria + ' GB' : getEquipo(viewingVenta.imeiEquipo).memoria ? getEquipo(viewingVenta.imeiEquipo).memoria + ' GB' : '-'}</p>
                  <p><strong className="text-gray-700">IMEI 1:</strong></p><p className="font-mono text-gray-600">{viewingVenta.imeiEquipo}</p>
                  {(viewingVenta.imei2Equipo || getEquipo(viewingVenta.imeiEquipo).imei2) && <><p><strong className="text-gray-700">IMEI 2:</strong></p><p className="font-mono text-gray-600">{viewingVenta.imei2Equipo || getEquipo(viewingVenta.imeiEquipo).imei2}</p></>}
                  {(viewingVenta.sn || getEquipo(viewingVenta.imeiEquipo).sn) && <><p><strong className="text-gray-700">S/N:</strong></p><p className="font-mono text-gray-600">{viewingVenta.sn || getEquipo(viewingVenta.imeiEquipo).sn}</p></>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="p-4 md:p-6 border-b border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="relative w-full md:w-96"><input type="text" placeholder="Buscar venta..." className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /><Search className="absolute left-3 top-2.5 text-gray-400" size={20} /></div>
        <button onClick={onNew} className="w-full md:w-auto bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center justify-center"><Plus className="mr-2" size={20} /> Nueva Venta</button>
      </div>

      {/* ── MÓVIL: tarjetas ── */}
      <div className="md:hidden divide-y divide-gray-100">
        {cargando ? (
          <div className="py-12 flex flex-col items-center gap-3 text-gray-400">
            <div className="w-8 h-8 border-4 border-green-200 border-t-green-600 rounded-full animate-spin"></div>
            <span className="text-sm">Cargando ventas...</span>
          </div>
        ) : filteredData.length === 0 ? (
          <p className="px-4 py-8 text-center text-gray-400 text-sm">No se encontraron ventas</p>
        ) : filteredData.map(row => (
          <div key={row.id} className="p-4 hover:bg-gray-50">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-semibold text-gray-800 text-sm">{getCliente(row.dniCliente).nombre || row.dniCliente}</p>
                <p className="text-xs text-gray-400">{row.nVenta} · {new Date(row.fecha).toLocaleDateString()}</p>
              </div>
              <span className="font-bold text-green-600 text-sm">S/ {parseFloat(row.precio).toFixed(2)}</span>
            </div>
            <p className="text-xs text-gray-600 mb-1">
              {row.marcaEquipo} {row.nombreComercial || getEquipo(row.imeiEquipo).nombreComercial || row.modeloEquipo}
            </p>
            <div className="mb-3 space-y-0.5">
              {(() => {
                const eq = getEquipo(row.imeiEquipo);
                const imei2 = eq.imei2 || row.imei2Equipo || '';
                const reg1 = eq.imei1Registrado;
                const reg2 = eq.imei2Registrado;
                return (
                  <>
                    <p className={`text-xs font-mono ${reg1 ? 'text-green-600 font-semibold' : 'text-gray-400'}`}>
                      {reg1 && '✓ '}{row.imeiEquipo}
                    </p>
                    {imei2 && (
                      <p className={`text-xs font-mono ${reg2 ? 'text-green-600 font-semibold' : 'text-gray-400'}`}>
                        {reg2 && '✓ '}{imei2}
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setViewingVenta(row)} className="flex-1 flex items-center justify-center gap-1 py-1.5 border rounded-lg text-xs text-gray-600 hover:bg-gray-100"><Eye size={14}/> Ver</button>
              <button onClick={() => onEdit(row)} className="flex-1 flex items-center justify-center gap-1 py-1.5 border rounded-lg text-xs text-yellow-600 hover:bg-yellow-50"><Edit size={14}/> Editar</button>
              <button onClick={() => setTicketPendiente(ticketData(row))} className="flex-1 flex items-center justify-center gap-1 py-1.5 border rounded-lg text-xs text-purple-600 hover:bg-purple-50"><Printer size={14}/> Ticket</button>
              <button onClick={() => handleDelete(row.id)} className="px-3 py-1.5 border rounded-lg text-xs text-red-500 hover:bg-red-50"><Trash2 size={14}/></button>
            </div>
          </div>
        ))}
      </div>

      {/* ── DESKTOP: tabla ── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-sm text-gray-600">
          <thead className="bg-gray-50 text-gray-700 uppercase text-xs font-semibold">
            <tr><th className="px-6 py-3">Fecha / ID</th><th className="px-6 py-3">Cliente</th><th className="px-6 py-3">Equipo Vendido</th><th className="px-6 py-3 text-right">Monto</th><th className="px-6 py-3 text-right">Acciones</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {cargando ? (
              <tr><td colSpan="5" className="px-6 py-12 text-center">
                <div className="flex flex-col items-center gap-3 text-gray-400">
                  <div className="w-8 h-8 border-4 border-green-200 border-t-green-600 rounded-full animate-spin"></div>
                  <span className="text-sm">Cargando ventas...</span>
                </div>
              </td></tr>
            ) : filteredData.length === 0 ? (
              <tr><td colSpan="5" className="px-6 py-8 text-center text-gray-400">No se encontraron ventas</td></tr>
            ) : filteredData.map(row => (
              <tr key={row.id} className="hover:bg-gray-50">
                <td className="px-6 py-4"><div className="font-medium">{new Date(row.fecha).toLocaleDateString()}</div><div className="text-xs">{row.nVenta}</div></td>
                <td className="px-6 py-4"><div className="font-medium">{getCliente(row.dniCliente).nombre || row.dniCliente}</div><div className="text-xs">{row.dniCliente}</div></td>
                <td className="px-6 py-4">
                  {(() => {
                    const eq = getEquipo(row.imeiEquipo);
                    const imei2 = eq.imei2 || row.imei2Equipo || '';
                    const reg1 = eq.imei1Registrado;
                    const reg2 = eq.imei2Registrado;
                    const nombre = row.nombreComercial || eq.nombreComercial || row.modeloEquipo;
                    return (
                      <>
                        <div className="font-medium text-gray-800">{row.marcaEquipo} {nombre}</div>
                        <div className={`text-xs font-mono mt-0.5 ${reg1 ? 'text-green-600 font-semibold' : 'text-gray-400'}`}>
                          {reg1 && <span className="mr-0.5">✓</span>}{row.imeiEquipo}
                        </div>
                        {imei2 && (
                          <div className={`text-xs font-mono ${reg2 ? 'text-green-600 font-semibold' : 'text-gray-400'}`}>
                            {reg2 && <span className="mr-0.5">✓</span>}{imei2}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </td>
                <td className="px-6 py-4 text-right font-bold text-green-600">S/ {parseFloat(row.precio).toFixed(2)}</td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => setViewingVenta(row)} className="p-1.5 text-gray-500 hover:text-green-600"><Eye size={18} /></button>
                    <button onClick={() => onEdit(row)} className="p-1.5 text-gray-500 hover:text-yellow-600"><Edit size={18} /></button>
                    <button onClick={() => setTicketPendiente(ticketData(row))} className="p-1.5 text-gray-500 hover:text-purple-600" title="Descargar ticket PDF"><Printer size={18} /></button>
                    <button onClick={() => handleDelete(row.id)} className="p-1.5 text-gray-500 hover:text-red-600"><Trash2 size={18} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VentaForm({ user, clientes, equipos, ventas, logoVentas, initialData, onCancel, onSave, onDirty, showToast, db, appId }) {
  const [loading, setLoading] = useState(false);

  const toLocalDatetimeValue = (isoString) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [formData, setFormData] = useState({ dni: '', nombre: '', celular: '', correo: '', imei1: '', imei2: '', sn: '', nombreComercial: '', ram: '', memoria: '', marca: '', modelo: '', color: '', precio: '', fecha: toLocalDatetimeValue(new Date().toISOString()) });

  useEffect(() => {
    if (initialData) {
      const cliente = clientes.find(c => c.dni === initialData.dniCliente) || {};
      setFormData({ dni: initialData.dniCliente || '', nombre: cliente.nombre || '', celular: cliente.celular || '', correo: cliente.correo || '', imei1: initialData.imeiEquipo || '', imei2: '', sn: '', nombreComercial: initialData.nombreComercial || '', ram: initialData.ram || '', memoria: initialData.memoria || '', marca: initialData.marcaEquipo || '', modelo: initialData.modeloEquipo || '', color: initialData.color || '', precio: initialData.precio || '', fecha: toLocalDatetimeValue(initialData.fecha) });
      const e = equipos.find(eq => eq.idEquipo === initialData.imeiEquipo);
      if (e) setFormData(prev => ({...prev, imei2: e.imei2||'', sn: e.sn||'', nombreComercial: e.nombreComercial||'', ram: e.ram||'', memoria: e.memoria||'', color: e.color||''}));
    }
  }, [initialData, clientes, equipos]);

  const [mostrarEscaner, setMostrarEscaner] = useState(false);
  const [buscandoReniecV, setBuscandoReniecV] = useState(false);
  const [datosAnterioresV, setDatosAnterioresV] = useState(null);

  const buscarReniecV = async (dni) => {
    setBuscandoReniecV(true);
    try {
      const json = await consultarReniecDni(dni);
      if (json.success && json.result) {
        const r = json.result;
        setFormData(prev => ({
          ...prev,
          nombre: r.full_name ? r.full_name : prev.nombre,
          correo: r.email && !r.email.includes('*') ? r.email : prev.correo,
        }));
        showToast('✓ Datos encontrados en RENIEC', 'success');
      } else {
        showToast('DNI no encontrado en RENIEC', 'error');
      }
    } catch (e) {
      console.error('RENIEC error:', e);
      showToast(e.message === 'RENIEC_TOKEN_MISSING' ? 'Falta configurar token RENIEC' : 'Error al consultar RENIEC', 'error');
    } finally {
      setBuscandoReniecV(false);
    }
  };

  const onEscaneo = (datos) => {
    setMostrarEscaner(false);
    onDirty?.();
    setFormData(prev => ({
      ...prev,
      imei1:           datos.imei1           || prev.imei1,
      imei2:           datos.imei2           || prev.imei2,
      sn:              datos.sn              || prev.sn,
      marca:           datos.marca           || prev.marca,
      modelo:          datos.modelo          || prev.modelo,
      nombreComercial: datos.nombreComercial || prev.nombreComercial,
      ram:             datos.ram             || prev.ram,
      memoria:         datos.memoria         || prev.memoria,
      color:           datos.color           || prev.color,
    }));
    const campos = [datos.imei1, datos.marca, datos.nombreComercial].filter(Boolean).join(' · ');
    showToast(campos ? `✓ ${campos}` : 'Sin datos — rellena manualmente', campos ? 'success' : 'error');
  };

  useEffect(() => {
    if (formData.dni.length >= 8 && !initialData) {
      const c = clientes.find(c => c.dni === formData.dni);
      if (c) {
        setDatosAnterioresV({ celular: c.celular || '', correo: c.correo || '' });
        setFormData(prev => ({ ...prev, nombre: c.nombre, celular: c.celular, correo: c.correo }));
      } else {
        setDatosAnterioresV(null);
        buscarReniecV(formData.dni);
      }
    }
  }, [formData.dni, clientes, initialData]);

  useEffect(() => {
    if (formData.imei1.length >= 14 && !initialData) {
      const e = equipos.find(e => e.idEquipo === formData.imei1);
      if (e) setFormData(prev => ({
        ...prev,
        imei2:           prev.imei2           || e.imei2 || '',
        marca:           prev.marca           || e.marca || '',
        modelo:          prev.modelo          || e.modelo || '',
        nombreComercial: prev.nombreComercial || e.nombreComercial || '',
        sn:              prev.sn              || e.sn || '',
      }));
    }
  }, [formData.imei1, equipos, initialData]);

  const CAMPOS_SOLO_NUMEROS_V = ['dni', 'celular', 'imei1', 'imei2'];
  const CAMPOS_MAYUSCULAS_V   = ['nombre', 'marca', 'modelo', 'nombreComercial', 'sn', 'color'];

  const handleChange = (e) => {
    const { name, value } = e.target;
    let val = value;
    if (CAMPOS_SOLO_NUMEROS_V.includes(name)) val = val.replace(/\D/g, '');
    if (name === 'imei1' || name === 'imei2') val = val.slice(0, 15);
    if (name === 'celular') val = val.slice(0, 9);
    if (CAMPOS_MAYUSCULAS_V.includes(name)) val = val.toUpperCase();
    onDirty?.();
    setFormData(prev => ({ ...prev, [name]: val }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Validar nombre comercial obligatorio
    if (!formData.nombreComercial) {
      showToast('El nombre comercial es obligatorio', 'error'); return;
    }
    if (!luhn(formData.imei1)) {
      showToast('El IMEI 1 no es válido — verifica los dígitos', 'error'); return;
    }
    if (formData.imei2 && !luhn(formData.imei2)) {
      showToast('El IMEI 2 no es válido — verifica los dígitos', 'error'); return;
    }
    // Confirmación final
    const confirmMsg = `¿Los datos son correctos?\n\n👤 Cliente: ${formData.nombre} (DNI: ${formData.dni})\n📱 Equipo: ${formData.marca} ${formData.nombreComercial}\n🔢 IMEI 1: ${formData.imei1}${formData.imei2 ? `\n🔢 IMEI 2: ${formData.imei2}` : ''}${formData.sn ? `\n📟 S/N: ${formData.sn}` : ''}\n💰 Precio: S/. ${parseFloat(formData.precio || 0).toFixed(2)}`;
    if (!window.confirm(confirmMsg)) return;
    setLoading(true);
    try {
      const userId = 'shared';

      // Eliminar docs viejos si cambiaron (en paralelo)
      const deleteOpsV = [];
      if (initialData && initialData.dniCliente !== formData.dni)
        deleteOpsV.push(deleteDoc(doc(db, 'artifacts', appId, 'users', 'shared', 'clientes', initialData.dniCliente)));
      if (initialData && initialData.imeiEquipo !== formData.imei1)
        deleteOpsV.push(deleteDoc(doc(db, 'artifacts', appId, 'users', 'shared', 'equipos', initialData.imeiEquipo)));
      if (deleteOpsV.length) await Promise.all(deleteOpsV);

      const ventaData = {
        dniCliente: formData.dni, imeiEquipo: formData.imei1,
        modeloEquipo: formData.modelo, marcaEquipo: formData.marca,
        nombreComercial: formData.nombreComercial, ram: formData.ram,
        memoria: formData.memoria, color: formData.color, precio: formData.precio,
        fecha: new Date(formData.fecha).toISOString(),
      };
      const clienteDoc = setDoc(doc(db, 'artifacts', appId, 'users', 'shared', 'clientes', formData.dni),
        { dni: formData.dni, nombre: formData.nombre, celular: formData.celular, correo: formData.correo }, { merge: true });
      const equipoDoc = setDoc(doc(db, 'artifacts', appId, 'users', 'shared', 'equipos', formData.imei1),
        { idEquipo: formData.imei1, idDuenio: formData.dni, imei2: formData.imei2, sn: formData.sn, nombreComercial: formData.nombreComercial, marca: formData.marca, modelo: formData.modelo, ram: formData.ram, memoria: formData.memoria, color: formData.color, isVendido: true }, { merge: true });

      if (initialData) {
        ventaData.nVenta = initialData.nVenta;
        await Promise.all([clienteDoc, equipoDoc,
          setDoc(doc(db, 'artifacts', appId, 'users', 'shared', 'ventas', initialData.id), ventaData)]);
        showToast('Venta actualizada');
      } else {
        const siguiente = (ventas.length + 1).toString().padStart(4, '0');
        ventaData.nVenta = `VEN-${siguiente}`;
        await Promise.all([clienteDoc, equipoDoc,
          addDoc(collection(db, 'artifacts', appId, 'users', 'shared', 'ventas'), ventaData)]);
        showToast('Venta registrada — generando ticket...');
        const tData = { ...ventaData, nombreCliente: formData.nombre, dniCliente: formData.dni, imei2Equipo: formData.imei2, sn: formData.sn };
        setTicketPendienteForm(tData);
        return; // no llamar onSave todavía, se llama desde el modal
      }
      (onSave || onCancel)();
    } catch (error) { console.error(error); showToast('Error al procesar venta', 'error'); } finally { setLoading(false); }
  };

  const [paso, setPaso] = useState(1);
  const [ticketPendienteForm, setTicketPendienteForm] = useState(null);

  const validarPaso1V = () => {
    if (!formData.dni || !formData.nombre) {
      showToast('Completa DNI y nombre', 'error'); return false;
    }
    return true;
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 max-w-2xl mx-auto overflow-hidden">
      {/* Modal tamaño papel */}
      {ticketPendienteForm && (
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 text-center">
            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Printer size={22} className="text-purple-600" />
            </div>
            <h3 className="text-base font-bold text-gray-800 mb-1">¿Tamaño de impresora?</h3>
            <p className="text-xs text-gray-400 mb-5">Elige el ancho del papel de tu impresora térmica</p>
            <div className="flex gap-3">
              <button onClick={() => { generarTicketVentaPDF(ticketPendienteForm, 58, logoVentas); setTicketPendienteForm(null); (onSave || onCancel)(); }}
                className="flex-1 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm">58 mm</button>
              <button onClick={() => { generarTicketVentaPDF(ticketPendienteForm, 80, logoVentas); setTicketPendienteForm(null); (onSave || onCancel)(); }}
                className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm">80 mm</button>
            </div>
            <button onClick={() => { setTicketPendienteForm(null); (onSave || onCancel)(); }} className="mt-3 text-xs text-gray-400 hover:text-gray-600 w-full py-1">Omitir ticket</button>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
        <h3 className="font-semibold text-gray-700">{initialData ? 'Editar Venta' : 'Registrar Venta'}</h3>
        <button onClick={onCancel} className="text-gray-400"><X size={20}/></button>
      </div>

      {/* Indicador de pasos */}
      <div className="flex items-center px-6 pt-5 pb-2 gap-2">
        {[1,2].map(n => (
          <React.Fragment key={n}>
            <div className={`flex items-center gap-2 ${paso === n ? 'text-green-600' : paso > n ? 'text-green-600' : 'text-gray-400'}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors
                ${paso === n ? 'border-green-600 bg-green-50 text-green-600' : paso > n ? 'border-green-500 bg-green-50 text-green-600' : 'border-gray-300 text-gray-400'}`}>
                {paso > n ? '✓' : n}
              </div>
              <span className="text-xs font-medium hidden sm:block">{n === 1 ? 'Cliente' : 'Equipo y Precio'}</span>
            </div>
            {n < 2 && <div className={`flex-1 h-0.5 ${paso > n ? 'bg-green-400' : 'bg-gray-200'}`} />}
          </React.Fragment>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="p-6">

        {/* PASO 1 — DATOS DEL CLIENTE */}
        {paso === 1 && (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-green-600 uppercase border-b pb-2">Datos del Cliente</h4>
            {buscandoReniecV && (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
                <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                Consultando RENIEC...
              </div>
            )}
            {datosAnterioresV && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                <p className="font-semibold mb-1">⚠ Cliente existente — datos anteriores registrados:</p>
                {datosAnterioresV.celular && <p>📱 Celular anterior: <span className="font-mono font-bold">{datosAnterioresV.celular}</span></p>}
                {datosAnterioresV.correo  && <p>✉ Correo anterior: <span className="font-mono font-bold">{datosAnterioresV.correo}</span></p>}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="block text-xs text-gray-500 mb-1">DNI *</label><input name="dni" value={formData.dni} onChange={handleChange} className="w-full border rounded p-2 text-sm" inputMode="numeric" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Nombre *</label><input name="nombre" value={formData.nombre} onChange={handleChange} className="w-full border rounded p-2 text-sm" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Celular</label><input name="celular" value={formData.celular} onChange={handleChange} className="w-full border rounded p-2 text-sm" inputMode="numeric" maxLength={9} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Correo</label><input type="email" name="correo" value={formData.correo} onChange={handleChange} className="w-full border rounded p-2 text-sm" /></div>
            </div>
            <div className="flex justify-between pt-4 border-t">
              <button type="button" onClick={onCancel} className="px-5 py-2 border rounded text-gray-600 hover:bg-gray-50 text-sm">Cancelar</button>
              <button type="button" onClick={() => validarPaso1V() && setPaso(2)} className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm">Siguiente →</button>
            </div>
          </div>
        )}

        {/* PASO 2 — EQUIPO Y PRECIO */}
        {paso === 2 && (
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h4 className="text-sm font-semibold text-green-600 uppercase">Equipo y Precio</h4>
              <button type="button" onClick={() => setMostrarEscaner(true)} className="text-xs bg-gray-800 text-white px-3 py-1.5 rounded flex items-center gap-1"><ScanBarcode size={14}/> Escanear</button>
            </div>
            {mostrarEscaner && <EscanerIA onResult={onEscaneo} onClose={() => setMostrarEscaner(false)} />}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">IMEI 1 *</label>
                <input required name="imei1" value={formData.imei1} onChange={handleChange}
                  className={`w-full border rounded p-2 text-sm font-mono ${formData.imei1.length === 15 ? (luhn(formData.imei1) ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50') : ''}`} />
                {formData.imei1.length === 15 && (
                  <p className={`text-xs mt-1 font-medium ${luhn(formData.imei1) ? 'text-green-600' : 'text-red-600'}`}>
                    {luhn(formData.imei1) ? '✓ IMEI válido' : '✗ IMEI inválido — verifica los dígitos'}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">IMEI 2</label>
                <input name="imei2" value={formData.imei2} onChange={handleChange}
                  className={`w-full border rounded p-2 text-sm font-mono ${formData.imei2.length === 15 ? (luhn(formData.imei2) ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50') : ''}`} />
                {formData.imei2.length === 15 && (
                  <p className={`text-xs mt-1 font-medium ${luhn(formData.imei2) ? 'text-green-600' : 'text-red-600'}`}>
                    {luhn(formData.imei2) ? '✓ IMEI válido' : '✗ IMEI inválido — verifica los dígitos'}
                  </p>
                )}
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">N° de Serie</label><input name="sn" value={formData.sn} onChange={handleChange} className="w-full border rounded p-2 text-sm font-mono" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Nombre Comercial *</label><input required name="nombreComercial" value={formData.nombreComercial} onChange={handleChange} className="w-full border rounded p-2 text-sm" placeholder="Ej: GALAXY A56" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Marca</label><input name="marca" value={formData.marca} onChange={handleChange} className="w-full border rounded p-2 text-sm" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Modelo</label><input name="modelo" value={formData.modelo} onChange={handleChange} className="w-full border rounded p-2 text-sm" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">RAM (GB)</label><input name="ram" value={formData.ram} onChange={handleChange} className="w-full border rounded p-2 text-sm" placeholder="ej: 8" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Memoria (GB)</label><input name="memoria" value={formData.memoria} onChange={handleChange} className="w-full border rounded p-2 text-sm" placeholder="ej: 256" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Color</label><input name="color" value={formData.color} onChange={handleChange} className="w-full border rounded p-2 text-sm" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Precio (S/.) *</label><input required type="number" step="0.01" name="precio" value={formData.precio} onChange={handleChange} className="w-full border rounded p-2 text-sm font-bold text-green-700" /></div>
              <div className="sm:col-span-2"><label className="block text-xs text-gray-500 mb-1">Fecha y hora *</label><input required type="datetime-local" name="fecha" value={formData.fecha} onChange={handleChange} className="w-full border rounded p-2 text-sm" /></div>
            </div>

            {/* Resumen completo para confirmar */}
            <div className="bg-green-50 rounded-lg p-4 border border-green-100 space-y-2 text-sm">
              <p className="font-semibold text-green-800 mb-1">📋 Verifica que los datos sean correctos:</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
                <span className="font-medium text-gray-700">Cliente:</span><span>{formData.nombre}</span>
                <span className="font-medium text-gray-700">DNI:</span><span>{formData.dni}</span>
                <span className="font-medium text-gray-700">Equipo:</span><span>{formData.marca} {formData.nombreComercial}</span>
                <span className="font-medium text-gray-700">Modelo:</span><span>{formData.modelo}</span>
                <span className="font-medium text-gray-700">IMEI 1:</span><span className="font-mono">{formData.imei1}</span>
                {formData.imei2 && <><span className="font-medium text-gray-700">IMEI 2:</span><span className="font-mono">{formData.imei2}</span></>}
                {formData.sn && <><span className="font-medium text-gray-700">S/N:</span><span className="font-mono">{formData.sn}</span></>}
                {formData.memoria && <><span className="font-medium text-gray-700">Memoria:</span><span>{formData.memoria} GB</span></>}
                {formData.color && <><span className="font-medium text-gray-700">Color:</span><span>{formData.color}</span></>}
                <span className="font-medium text-gray-700">Precio:</span><span className="text-green-700 font-bold">S/. {parseFloat(formData.precio || 0).toFixed(2)}</span>
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t">
              <button type="button" onClick={() => setPaso(1)} className="px-5 py-2 border rounded text-gray-600 hover:bg-gray-50 text-sm">← Atrás</button>
              <button type="submit" disabled={loading} className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-semibold">
                {loading ? 'Guardando...' : '✓ Confirmar y Guardar'}
              </button>
            </div>
          </div>
        )}

      </form>
    </div>
  );
}


// ============================================================================
// MÓDULO: CLIENTES Y EQUIPOS
// ============================================================================
function ClientesList({ clientes, equipos, registros }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  // Fuente de verdad: qué IMEIs tienen al menos 1 registro activo
  const imeisRegistrados = useMemo(() => {
    const set = new Set();
    registros.forEach(r => {
      // Solo el IMEI específico que se registró
      if (r.imeiRegistrado) set.add(r.imeiRegistrado);
    });
    return set;
  }, [registros]);

  // Agrupa los documentos de equipos que son el mismo físico:
  // - Si doc A tiene imei2 === idEquipo de doc B, son el mismo equipo → fusionar en uno
  const agruparEquipos = (eqs) => {
    const vistos = new Set();
    const grupos = [];
    for (const eq of eqs) {
      if (vistos.has(eq.idEquipo)) continue;
      // Detectar gemelo por: imei2 cruzado O mismo S/N (mismo equipo físico con 2 docs)
      const gemelo = eqs.find(e =>
        e.idEquipo !== eq.idEquipo &&
        !vistos.has(e.idEquipo) &&
        (
          (eq.imei2 && e.idEquipo === eq.imei2) ||   // el imei2 de eq es el idEquipo del otro
          (e.imei2  && eq.idEquipo === e.imei2)  ||   // el imei2 del otro apunta a eq
          (eq.sn && e.sn && eq.sn === e.sn)           // mismo número de serie → mismo físico
        )
      );
      if (gemelo) {
        // El principal es el que ya tiene imei2, o el de IMEI numéricamente menor
        const principal = eq.imei2 ? eq : gemelo.imei2 ? gemelo : (eq.idEquipo < gemelo.idEquipo ? eq : gemelo);
        const secundario = principal === eq ? gemelo : eq;
        grupos.push({
          ...principal,
          imei2: principal.imei2 || secundario.idEquipo,
          sn: principal.sn || secundario.sn,
          imei1Registrado: principal.imei1Registrado || principal.isRegistrado || false,
          imei2Registrado: secundario.imei2Registrado || secundario.imei1Registrado || secundario.isRegistrado || false,
          isRegistrado: principal.isRegistrado || secundario.isRegistrado,
          isVendido: principal.isVendido || secundario.isVendido,
        });
        vistos.add(principal.idEquipo);
        vistos.add(secundario.idEquipo);
      } else {
        grupos.push(eq);
        vistos.add(eq.idEquipo);
      }
    }
    return grupos;
  };

  const filteredClientes = useMemo(() => {
    return clientes.filter(c => {
      // Solo mostrar clientes que tienen al menos 1 equipo activo
      const tieneEquipos = equipos.some(e => e.idDuenio === c.dni);
      if (!tieneEquipos) return false;
      if (!searchTerm) return true;
      return c.dni.includes(searchTerm) || (c.nombre && c.nombre.toLowerCase().includes(searchTerm.toLowerCase()));
    });
  }, [clientes, equipos, searchTerm]);

  const initials = (nombre) => {
    if (!nombre) return '?';
    const parts = nombre.trim().split(' ').filter(Boolean);
    return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0].slice(0,2).toUpperCase();
  };

  return (
    <div className="min-h-full">
      <div className="mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Directorio de Clientes</h2>
            <p className="text-sm text-gray-400 mt-0.5">{filteredClientes.length} cliente{filteredClientes.length !== 1 ? 's' : ''} con equipos activos</p>
          </div>
          <div className="relative w-full md:w-80">
            <input
              type="text"
              placeholder="Buscar por nombre o DNI..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-300 focus:outline-none bg-white shadow-sm text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
          </div>
        </div>

        {filteredClientes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Users size={56} strokeWidth={1} className="mb-4 text-gray-200" />
            <p className="text-base font-medium text-gray-400">No se encontraron clientes</p>
            <p className="text-sm text-gray-300 mt-1">Prueba con otro nombre o DNI</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredClientes.map(cliente => {
              const eqsRaw = equipos.filter(e => e.idDuenio === cliente.dni);
              const eqs = agruparEquipos(eqsRaw);
              const isExpanded = expandedId === cliente.dni;
              const totalRegistrados = eqs.filter(eq => imeisRegistrados.has(eq.idEquipo) || (eq.imei2 && imeisRegistrados.has(eq.imei2))).length;
              const totalVendidos = eqs.filter(eq => eq.isVendido).length;

              return (
                <div
                  key={cliente.dni}
                  className="bg-white rounded-2xl shadow-md hover:shadow-lg transition-shadow duration-200 border border-gray-100 overflow-hidden"
                >
                  <div className="p-5">
                    {/* Avatar + nombre */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 font-bold text-sm shrink-0 border border-gray-200">
                        {initials(cliente.nombre)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-gray-800 text-sm leading-tight truncate">{cliente.nombre}</p>
                        <p className="text-xs text-gray-400 font-mono mt-0.5">DNI {cliente.dni}</p>
                        {cliente.celular && <p className="text-xs text-gray-400 mt-0.5">{cliente.celular}</p>}
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex gap-2 mb-4">
                      <div className="flex-1 bg-gray-50 rounded-lg px-3 py-2 text-center border border-gray-100">
                        <p className="text-base font-bold text-gray-700">{eqs.length}</p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">Equipo{eqs.length !== 1 ? 's' : ''}</p>
                      </div>
                      {totalRegistrados > 0 && (
                        <div className="flex-1 bg-gray-50 rounded-lg px-3 py-2 text-center border border-gray-100">
                          <p className="text-base font-bold text-gray-700">{totalRegistrados}</p>
                          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Registrado{totalRegistrados !== 1 ? 's' : ''}</p>
                        </div>
                      )}
                      {totalVendidos > 0 && (
                        <div className="flex-1 bg-gray-50 rounded-lg px-3 py-2 text-center border border-gray-100">
                          <p className="text-base font-bold text-gray-700">{totalVendidos}</p>
                          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Vendido{totalVendidos !== 1 ? 's' : ''}</p>
                        </div>
                      )}
                    </div>

                    {/* Botón ver equipos */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : cliente.dni)}
                      className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors duration-150"
                    >
                      <span>{isExpanded ? 'Ocultar equipos' : `Ver ${eqs.length} equipo${eqs.length !== 1 ? 's' : ''}`}</span>
                      <ChevronDown size={15} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Equipos expandidos */}
                    {isExpanded && (
                      <div className="mt-3 space-y-2">
                        {eqs.map(eq => {
                          const imei1Reg = imeisRegistrados.has(eq.idEquipo);
                          const imei2Reg = eq.imei2 && imeisRegistrados.has(eq.imei2);
                          const tieneRegistro = imei1Reg || imei2Reg;
                          return (
                            <div key={eq.idEquipo} className="rounded-xl p-3 border border-gray-100 bg-gray-50">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <p className="font-semibold text-gray-700 text-xs leading-tight">
                                  {eq.marca} {eq.nombreComercial || eq.modelo}
                                </p>
                                <div className="flex gap-1 shrink-0">
                                  {tieneRegistro && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600 font-semibold uppercase tracking-wide">Lista Blanca</span>
                                  )}
                                  {eq.isVendido && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600 font-semibold uppercase tracking-wide">Vendido</span>
                                  )}
                                </div>
                              </div>
                              {eq.modelo && eq.nombreComercial && (
                                <p className="text-[10px] text-gray-400 mb-1.5">{eq.modelo}</p>
                              )}
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-gray-400 w-12 shrink-0">IMEI 1</span>
                                  <span className={`text-[10px] font-mono px-1 py-0.5 rounded ${imei1Reg ? 'bg-gray-800 text-white font-semibold' : 'text-gray-500'}`}>
                                    {imei1Reg && '✓ '}{eq.idEquipo}
                                  </span>
                                </div>
                                {eq.imei2 && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] text-gray-400 w-12 shrink-0">IMEI 2</span>
                                    <span className={`text-[10px] font-mono px-1 py-0.5 rounded ${imei2Reg ? 'bg-gray-800 text-white font-semibold' : 'text-gray-500'}`}>
                                      {imei2Reg && '✓ '}{eq.imei2}
                                    </span>
                                  </div>
                                )}
                                {eq.sn && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] text-gray-400 w-12 shrink-0">S/N</span>
                                    <span className="text-[10px] font-mono text-gray-500">{eq.sn}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

async function generarTicketRegistroPDF(data) {
  const cargar = (src) => new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  if (!window.jspdf)     await cargar('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  if (!window.JsBarcode) await cargar('https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js');

  const { jsPDF } = window.jspdf;
  const mmW = 62;
  const FONT = 'courier'; // fuente monoespaciada tipo consola

  // Código de barras a alta resolución
  const codigoBarras = data.imeiRegistrado || data.imeiEquipo || '';
  let barcodeImg = null, barcodeH = 0;
  if (codigoBarras) {
    try {
      const c = document.createElement('canvas');
      window.JsBarcode(c, codigoBarras, {
        format: 'CODE128', width: 3, height: 80,
        displayValue: true, fontSize: 20, margin: 8,
        background: '#ffffff', lineColor: '#000000'
      });
      barcodeImg = c.toDataURL('image/png');
      barcodeH = (mmW - 6) * (c.height / c.width);
    } catch (_) {}
  }

  const renderPDF = (doc, dibujar) => {
    let y = 4;
    const cx = mmW / 2;
    const F = 1.3; // factor de escala de fuente +30%
    const lh = 3.6;
    const lhB = (sz) => lh + (sz * F - 7) * 0.35;

    const sep = (dash = false) => {
      if (dibujar) { doc.setLineDash(dash ? [0.6, 0.6] : []); doc.setDrawColor(0); doc.line(1, y, mmW - 1, y); doc.setLineDash([]); }
      y += 2.5;
    };
    const tc = (text, sz) => {
      if (dibujar) { doc.setFontSize(sz * F); doc.setFont(FONT, 'normal'); doc.text(String(text ?? ''), cx, y, { align: 'center' }); }
      y += lhB(sz);
    };
    const fila = (label, valor, sz = 7) => {
      doc.setFontSize(sz * F); doc.setFont(FONT, 'normal');
      if (dibujar) doc.text(label + ':', 2, y);
      const lw = doc.getTextWidth(label + ': ');
      const lines = doc.splitTextToSize(String(valor ?? ''), mmW - 2 - lw - 1);
      if (dibujar) doc.text(lines, 2 + lw, y);
      y += lhB(sz) * Math.max(lines.length, 1);
    };
    const filaDerecha = (label, valor, sz = 7) => {
      doc.setFontSize(sz * F); doc.setFont(FONT, 'normal');
      if (dibujar) { doc.text(label + ':', 2, y); doc.text(String(valor ?? ''), mmW - 2, y, { align: 'right' }); }
      y += lhB(sz);
    };

    const fecha = new Date(data.fecha);
    const pad = n => String(n).padStart(2, '0');
    const fechaStr = `${pad(fecha.getDate())}/${pad(fecha.getMonth()+1)}/${fecha.getFullYear()}`;
    const horaStr  = `${pad(fecha.getHours())}:${pad(fecha.getMinutes())}:${pad(fecha.getSeconds())}`;

    // CABECERA
    sep(true);
    tc('CENTRO DE REGISTRO', 8);
    tc('INDEPENDIENTE', 8);
    tc('REGISTRO DE EQUIPO', 7.5);
    tc('LISTA BLANCA - OSIPTEL', 7.5);
    tc(data.nRegistro || '', 7.5);
    tc('TACNA - TACNA', 7);
    sep(true);
    tc('AV. PATRICIO MELENDEZ 234', 6.5);
    tc('GALERIAS DE GAMARRA INT. 1B', 6.5);
    tc('CEL. 052 607 065', 6.5);
    sep(true);

    // DATOS CLIENTE
    fila('NOMBRE',   data.nombreCliente  || '');
    fila('DNI',      data.dniCliente     || '');
    fila('CORREO',   data.correoCliente  || '');
    fila('CELULAR',  data.celularCliente || '');
    fila('CEL. REF', data.celularRef     || '');
    sep(true);

    // DATOS EQUIPO
    fila('IMEI',     data.imeiRegistrado || data.imeiEquipo || '');
    fila('MARCA',    data.marcaEquipo    || '');
    fila('MODELO',   data.modeloEquipo   || '');
    fila('N. COM.',  data.nombreComercialEquipo || '');
    fila('OPERADOR', data.operador       || '');
    fila('TIPO',     data.tipo           || '');
    sep(true);

    // CÓDIGO DE BARRAS
    if (barcodeImg) {
      if (dibujar) doc.addImage(barcodeImg, 'PNG', 3, y, mmW - 6, barcodeH);
      y += barcodeH + 2;
    }
    sep(true);

    // FECHA HORA
    if (dibujar) {
      doc.setFontSize(6.5 * F); doc.setFont(FONT, 'normal');
      doc.text('FECHA', 2, y); doc.text('HORA', mmW - 2, y, { align: 'right' });
    }
    y += lhB(6.5);
    if (dibujar) {
      doc.text(fechaStr, 2, y); doc.text(horaStr, mmW - 2, y, { align: 'right' });
    }
    y += lhB(6.5) + 2;

    // PIE
    tc('*************************************', 6);
    tc('ESTE EQUIPO HA PASADO', 7);
    tc('LAS VALIDACIONES', 7);
    tc('QUE EXIGIMOS PARA', 7);
    tc('REGISTRAR SU EQUIPO', 7);
    tc('A OSIPTEL', 7);
    tc('***********************************', 6);
    y += 4;

    return y;
  };

  const docMedida = new jsPDF({ unit: 'mm', format: [mmW, 300], orientation: 'portrait' });
  const altoTotal = renderPDF(docMedida, false);
  const docFinal  = new jsPDF({ unit: 'mm', format: [mmW, altoTotal], orientation: 'portrait' });
  renderPDF(docFinal, true);

  const nombre = `REGISTRO-${data.nRegistro || 'ticket'}.pdf`;
  const blob = docFinal.output('blob');
  const url  = URL.createObjectURL(blob);
  window.open(url, '_blank');
  const a = document.createElement('a');
  a.href = url; a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}


// ============================================================================
// STICKER DE REGISTRO — 40 mm × 30 mm
// ============================================================================
async function generarStickerRegistroPDF(data) {
  const cargar = (src) => new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  if (!window.jspdf)     await cargar('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  if (!window.JsBarcode) await cargar('https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js');

  const { jsPDF } = window.jspdf;

  // PDF landscape: 40mm ancho × 30mm alto
  // jsPDF landscape: format=[alto, ancho] con orientation='landscape'
  const MM   = 2.8346;          // 1 mm en puntos
  const W    = 40 * MM;         // 113.39 pt
  const H    = 30 * MM;         //  85.04 pt
  const M    = 1.2 * MM;        // margen lateral
  const FONT = 'helvetica';
  const cx   = W / 2;

  const imeiVal = data.imeiRegistrado || data.imeiEquipo || '';
  const modelo  = data.modeloEquipo || '';
  const sn      = data.sn || '';

  // Código de barras del IMEI — sin texto, margen mínimo
  let barcodeImg = null;
  if (imeiVal) {
    try {
      const c = document.createElement('canvas');
      window.JsBarcode(c, imeiVal, {
        format: 'CODE128', width: 2, height: 60,
        displayValue: false, margin: 2,
        background: '#ffffff', lineColor: '#000000'
      });
      barcodeImg = c.toDataURL('image/png');
    } catch (_) {}
  }

  const doc = new jsPDF({ unit: 'pt', format: [H, W], orientation: 'landscape' });

  // ── Helpers con Y dinámica ──
  // lh = interlineado en pt para un fontSize dado
  const lh = (fs) => fs * 1.25;
  let y = 0;

  // Imprime texto centrado con wrap, devuelve nueva Y
  const tc = (text, fs, bold = false) => {
    doc.setFont(FONT, bold ? 'bold' : 'normal');
    doc.setFontSize(fs);
    const lines = doc.splitTextToSize(text, W - M * 2);
    lines.forEach((l, i) => doc.text(l, cx, y + lh(fs) * i, { align: 'center' }));
    y += lh(fs) * lines.length;
  };

  // Imprime fila "LABEL: valor" con wrap en el valor
  const tr = (label, value, fs) => {
    doc.setFont(FONT, 'normal'); doc.setFontSize(fs);
    const labelTxt = label + ': ';
    const lw = doc.getTextWidth(labelTxt);
    doc.text(labelTxt, M, y);
    const lines = doc.splitTextToSize(value, W - M - lw - M * 0.5);
    lines.forEach((l, i) => doc.text(l, M + lw, y + lh(fs) * i));
    y += lh(fs) * lines.length;
  };

  const sep = () => {
    y += 0.8 * MM;
    doc.setDrawColor(0); doc.setLineWidth(0.3);
    doc.line(M, y, W - M, y);
    y += 1.2 * MM;
  };

  // ── Encabezado ──
  y = 2.5 * MM;
  tc('EQUIPO REGISTRADO A LISTA BLANCA POR COMUNIC@TE', 5.5, false);

  y += 1.5 * MM;

  // ── MODELO y S/N ──
  tr('MODELO', modelo, 5.5);
  if (sn) { y += 0.5 * MM; tr('S/N', sn, 5.5); }

  y += 1.5 * MM;

  // ── Código de barras: ocupa el espacio restante menos 4mm para el IMEI ──
  const bcY = y;
  const bcH = H - bcY - 4.5 * MM;   // espacio restante menos línea IMEI
  if (barcodeImg && bcH > 2 * MM) {
    doc.addImage(barcodeImg, 'PNG', M, bcY, W - M * 2, bcH);
  }
  y = bcY + bcH + 1.2 * MM;

  // ── IMEI ──
  doc.setFont(FONT, 'normal'); doc.setFontSize(5.2);
  doc.text(`IMEI: ${imeiVal}`, cx, y, { align: 'center' });

  // ── Borde exterior ──
  doc.setDrawColor(0); doc.setLineWidth(0.4);
  doc.rect(0.3, 0.3, W - 0.6, H - 0.6);

  const nombre = `STICKER-${data.nRegistro || imeiVal}.pdf`;
  const blob = doc.output('blob');
  const url  = URL.createObjectURL(blob);
  window.open(url, '_blank');
  const a = document.createElement('a');
  a.href = url; a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

// ============================================================================
// MÓDULO: BOLETA EXTRANJERA (Chile)
// ============================================================================

// Conversión PEN → CLP redondeada al múltiplo de 5000 o 10000 más cercano
function penToClp(pen) {
  const raw = parseFloat(pen || 0) * 266.67; // tasa aproximada
  // Redondear al múltiplo de 5000 más cercano
  return Math.round(raw / 5000) * 5000;
}
function formatClp(clp) {
  return clp.toLocaleString('es-CL');
}

function toLocalDatetimeValueBoleta(date) {
  const d = date instanceof Date ? date : new Date(date);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function BoletaExtranjera({ clientes, equipos, ventas, showToast }) {
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
        if (activo) showToast(e.message === 'RENIEC_TOKEN_MISSING' ? 'Falta configurar token RENIEC' : 'Error al consultar DNI', 'error');
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
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Modal selección tipo de boleta */}
      {modalBoleta && (
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <FileText size={22} className="text-blue-600" />
            </div>
            <h3 className="text-base font-bold text-gray-800 text-center mb-1">¿Qué boleta deseas generar?</h3>
            <p className="text-xs text-gray-400 text-center mb-5">Selecciona el formato según tu impresora</p>
            <div className="space-y-3">
              <button
                onClick={async () => { setModalBoleta(null); await generarBoletaExtranjera(modalBoleta); }}
                className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm flex flex-col items-center gap-0.5 transition-colors">
                <span>Boleta 1</span>
                <span className="text-xs font-normal opacity-80">Formato térmico 48mm — Roberto Pizarro</span>
              </button>
              <button
                onClick={async () => { setModalBoleta(null); await generarBoletaExtranjera2(modalBoleta); }}
                className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm flex flex-col items-center gap-0.5 transition-colors">
                <span>Boleta 2</span>
                <span className="text-xs font-normal opacity-80">Formato 80mm — Álvaro Pizarro · PDF417</span>
              </button>
            </div>
            <button onClick={() => setModalBoleta(null)} className="mt-4 text-xs text-gray-400 hover:text-gray-600 w-full py-1">Cancelar</button>
          </div>
        </div>
      )}
      {/* Header + tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><FileText size={20} className="text-blue-600"/> Boleta Extranjera (Chile)</h2>

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

        <div className="flex gap-2 mb-5">
          <button onClick={() => setModo('buscar')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${modo === 'buscar' ? 'bg-blue-600 text-white' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
            Buscar por DNI
          </button>
          <button onClick={() => setModo('nueva')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${modo === 'nueva' ? 'bg-blue-600 text-white' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
            + Nueva Boleta
          </button>
        </div>

        {/* ── MODO BUSCAR ── */}
        {modo === 'buscar' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input value={searchDni} onChange={e => setSearchDni(e.target.value.replace(/\D/g,''))}
                onKeyDown={e => e.key === 'Enter' && buscar()}
                placeholder="DNI del cliente..." inputMode="numeric"
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              <button onClick={buscar} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-1">
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
                    <button onClick={emitirDesdeVentas} className="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2">
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
              <button type="button" onClick={() => setMostrarEscanerBoleta(true)} className="flex items-center text-xs bg-gray-800 text-white px-3 py-1.5 rounded gap-1">
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
              <button onClick={() => setForm(emptyForm)} className="px-4 py-2 border rounded text-gray-500 text-sm hover:bg-gray-50">Limpiar</button>
              <button onClick={emitirNueva} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2">
                <Printer size={16}/> Generar Boleta
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

async function generarBoletaExtranjera({ cliente, ventas, equiposMap, totalClp, fechaHora }) {
  const cargar = (src) => new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  if (!window.jspdf)     await cargar('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  if (!window.JsBarcode) await cargar('https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js');

  const { jsPDF } = window.jspdf;
  const mmW = 48;
  const FONT = 'courier';
  // Courier es ancho — sin escala, tamaños pequeños para que quepan en 48mm
  const F = 1.0;

  // Código de barras: S/N del primer equipo o IMEI
  const primerEq = equiposMap[ventas[0]?.imeiEquipo] || {};
  const codigoBarras = primerEq.sn || ventas[0]?.imeiEquipo || '';
  let barcodeImg = null, barcodeH = 0;
  if (codigoBarras) {
    try {
      const c = document.createElement('canvas');
      window.JsBarcode(c, codigoBarras, { format: 'CODE128', width: 2, height: 60, displayValue: true, fontSize: 16, margin: 6, background: '#ffffff', lineColor: '#000000' });
      barcodeImg = c.toDataURL('image/png');
      barcodeH = (mmW - 6) * (c.height / c.width);
    } catch (_) {}
  }

  // Número de boleta auto (timestamp)
  const nBoleta = String(Date.now()).slice(-4).padStart(4, '0');

  const renderPDF = (doc, dibujar) => {
    let y = 4;
    const cx  = mmW / 2;
    const M   = 2;
    const F   = 1; // mismo factor que tickets de venta y registro
    const lh  = (sz) => sz * F * 0.42 + 1.0;

    const sep = () => {
      if (dibujar) {
        doc.setLineDash([0.5, 0.5]);
        doc.setDrawColor(130);
        doc.line(M, y, mmW - M, y);
        doc.setLineDash([]);
        doc.setDrawColor(0);
      }
      y += 2.5;
    };

    const tc = (text, sz, bold = false) => {
      doc.setFontSize(sz * F); doc.setFont(FONT, bold ? 'bold' : 'normal');
      const lines = doc.splitTextToSize(String(text ?? ''), mmW - M * 2);
      if (dibujar) lines.forEach((l, i) => doc.text(l, cx, y + i * lh(sz), { align: 'center' }));
      y += lh(sz) * lines.length;
    };

    const tl = (text, sz) => {
      doc.setFontSize(sz * F); doc.setFont(FONT, 'normal');
      const lines = doc.splitTextToSize(String(text ?? ''), mmW - M * 2);
      if (dibujar) {
        lines.forEach((l, i) => doc.text(l, i === 0 ? M : M + 3, y + i * lh(sz)));
      }
      y += lh(sz) * lines.length;
    };

    const fila = (label, valor, sz = 6.5) => {
      doc.setFontSize(sz * F); doc.setFont(FONT, 'normal');
      const labelTxt = label + ': ';
      const lw    = doc.getTextWidth(labelTxt);
      const lines = doc.splitTextToSize(String(valor ?? ''), mmW - M - lw - M);
      if (dibujar) {
        doc.text(labelTxt, M, y);
        lines.forEach((l, i) => doc.text(l, M + lw, y + i * lh(sz)));
      }
      y += lh(sz) * Math.max(lines.length, 1);
    };

    const fecha = fechaHora ? new Date(fechaHora) : new Date();
    const pad = n => String(n).padStart(2, '0');
    const fechaStr = `${pad(fecha.getDate())}/${pad(fecha.getMonth()+1)}/${fecha.getFullYear().toString().slice(2)}`;
    const horaStr  = `${pad(fecha.getHours())}:${pad(fecha.getMinutes())}:${pad(fecha.getSeconds())}`;

    // ── CABECERA (centrada, bold) ──
    y += 1;
    tc(`R.U.T.  17.673.680 - 1`, 7, true);
    tc(`BOLETA ELECTRONICA N°  ${nBoleta}`, 7, true);
    tc('SII ARICA', 7, true);
    y += 1;
    sep();
    y += 1;

    // ── TIENDA (izquierda) ──
    tl('ROBERTO IGNACIO', 6.5);
    tl('PIZARRO VILLAROEL', 6.5);
    tl('VENTA CELULARES ACCESORIOS', 6.5);
    tl('18 DE SEPTIEMBRE #257', 6.5);
    tl('LOCAL 68 - COM. SANTA BLANCA', 6.5);
    y += 1;
    sep();
    y += 2;

    // ── CLIENTE + EQUIPOS (izquierda, sin separador entre cliente y equipo) ──
    if (cliente.nombre) fila('NOMBRE', cliente.nombre.toUpperCase(), 6.5);
    if (cliente.dni)    fila('RUT',    cliente.dni, 6.5);
    y += 1;

    ventas.forEach(v => {
      const eq  = equiposMap[v.imeiEquipo] || {};
      const mem = eq.memoria || v.memoria || '';
      const nom = eq.nombreComercial || v.nombreComercial || v.modeloEquipo || '';
      // "IPHONE 11 128GB" — sin etiqueta
      tl(`${nom}${mem ? ' ' + mem + 'GB' : ''}`.trim(), 6.5);
      const color = eq.color || v.color || '';
      if (color) fila('COLOR', color, 6.5);
      fila('IMEI', v.imeiEquipo || '', 6.5);
      if (eq.imei2) fila('IMEI', eq.imei2, 6.5);
    });

    y += 1;
    // SUB TOTAL e DESCUENTOS (izquierda)
    const subClp = penToClp(ventas.reduce((s,v) => s + parseFloat(v.precio||0), 0));
    fila('SUB TOTAL',        subClp.toLocaleString('es-CL'), 6.5);
    fila('TOTAL DESCUENTOS', '0', 6.5);
    y += 2;

    // TOTAL grande alineado a la derecha
    if (dibujar) {
      doc.setFontSize(8 * F); doc.setFont(FONT, 'normal');
      doc.text(`TOTAL:  $ ${totalClp.toLocaleString('es-CL')}`, mmW - M, y, { align: 'right' });
    }
    y += lh(8) + 1;
    sep();
    y += 2;

    // ── CÓDIGO DE BARRAS (centrado) ──
    if (barcodeImg) {
      if (dibujar) doc.addImage(barcodeImg, 'PNG', 3, y, mmW - 6, barcodeH);
      y += barcodeH + 2;
    }
    sep();
    y += 1;

    // ── FECHA / HORA ──
    if (dibujar) {
      doc.setFontSize(6.5 * F); doc.setFont(FONT, 'normal');
      doc.text('FECHA', M, y);
      doc.text('HORA', mmW - M, y, { align: 'right' });
    }
    y += lh(6.5);
    if (dibujar) {
      doc.setFontSize(6.5 * F); doc.setFont(FONT, 'normal');
      doc.text(fechaStr, M, y);
      doc.text(horaStr, mmW - M, y, { align: 'right' });
    }
    y += lh(6.5) + 2;

    // ── PIE (mixtas, centrado) ──
    tc('********************************', 5.5);
    tc('Esta boleta es indispensable', 6.5);
    tc('para', 6.5);
    tc('cambios y devoluciones.', 6.5);
    tc('********************************', 5.5);
    y += 4;

    return y;
  };

  const docMedida = new jsPDF({ unit: 'mm', format: [mmW, 300], orientation: 'portrait' });
  const altoTotal = renderPDF(docMedida, false);
  const docFinal  = new jsPDF({ unit: 'mm', format: [mmW, altoTotal], orientation: 'portrait' });
  renderPDF(docFinal, true);

  const nombre = `BOLETA-${nBoleta}.pdf`;
  const blob = docFinal.output('blob');
  const url  = URL.createObjectURL(blob);
  window.open(url, '_blank');
  const a = document.createElement('a');
  a.href = url; a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}


async function generarBoletaExtranjera2({ cliente, ventas, equiposMap, totalClp, fechaHora }) {
  const cargar = (src) => new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  if (!window.jspdf) await cargar('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  // PDF417: cargar desde /pdf417.js (archivo local en /public del proyecto)
  // Siempre intentar — si ya está cargado __pdf417gen existe y no recarga
  if (!window.__pdf417gen) {
    await new Promise((res, rej) => {
      const existing = document.querySelector('script[data-pdf417]');
      if (existing) { res(); return; }
      const s = document.createElement('script');
      s.setAttribute('data-pdf417', '1');
      s.src = '/pdf417.js';
      s.onload = res;
      s.onerror = () => {
        // fallback: intentar jsdelivr si la ruta local falla
        const s2 = document.createElement('script');
        s2.setAttribute('data-pdf417', '1');
        s2.src = 'https://cdn.jsdelivr.net/npm/pdf417@0.1.5/build/index.js';
        s2.onload = res; s2.onerror = rej;
        document.head.appendChild(s2);
      };
      document.head.appendChild(s);
    });
    // Exponer si la librería usa export default
    if (!window.__pdf417gen && window.pdf417) {
      window.__pdf417gen = window.pdf417.default || window.pdf417;
    }
  }
  if (typeof window.__pdf417gen !== 'function') {
    throw new Error('No se pudo cargar la librería PDF417. Asegúrate de colocar pdf417.js en la carpeta /public de tu proyecto.');
  }

  const { jsPDF } = window.jspdf;
  const mmW  = 80;
  const M    = 5;
  const FONT = 'courier';
  const FS   = 9; // ← tamaño de fuente de la boleta 2, cámbialo aquí
  const nBoleta = String(Date.now()).slice(-3).padStart(3, '0');

  // Totales
  const totalNum = typeof totalClp === 'number' ? totalClp
    : parseInt(String(totalClp).replace(/\D/g, ''), 10) || 0;
  const iva = Math.round(totalNum - totalNum / 1.19);

  // Fecha aaaa-mm-dd
  const fecha    = fechaHora ? new Date(fechaHora) : new Date();
  const pad      = n => String(n).padStart(2, '0');
  const fechaStr = `${fecha.getFullYear()}-${pad(fecha.getMonth()+1)}-${pad(fecha.getDate())}`;

  // Equipo
  const pV  = ventas[0] || {};
  const pEq = equiposMap[pV.imeiEquipo] || {};
  const nombreComercial = pEq.nombreComercial || pV.nombreComercial || pV.modeloEquipo || '';
  const memoria = pEq.memoria || pV.memoria || '';
  const color   = pEq.color   || pV.color   || '';
  const imei1   = pV.imeiEquipo || '';
  const imei2   = pEq.imei2 || pV.imei2Equipo || '';

  // PDF417 real — obligatorio
  const pdf417W = mmW - M * 2;
  const gen417 = window.__pdf417gen;
  const texto417 = [
    nBoleta, cliente.dni || '', cliente.nombre || '',
    imei1, imei2,
    `${nombreComercial}${memoria ? ' ' + memoria + 'GB' : ''}`,
    color, totalNum, iva, fechaStr, '18.478.314-2', 'SII Res.99/2014'
  ].join('|');
  const dataUrl417 = gen417(texto417, 2, 1);
  const img417 = new Image();
  await new Promise((res, rej) => { img417.onload = res; img417.onerror = rej; img417.src = dataUrl417; });
  const pdf417Img = dataUrl417;
  const pdf417H = img417.naturalHeight > 0
    ? pdf417W * (img417.naturalHeight / img417.naturalWidth)
    : 24;

  const renderPDF = (doc, dibujar) => {
    let y = 0;
    const cx = mmW / 2;
    const lh = sz => sz * 0.37 + 1.2;

    const nl = (n = 1) => { y += n; };
    const tl = (txt, sz, bold = false) => {
      doc.setFontSize(sz); doc.setFont(FONT, bold ? 'bold' : 'normal');
      const lines = doc.splitTextToSize(String(txt ?? ''), mmW - M * 2);
      if (dibujar) lines.forEach((l, i) => doc.text(l, M, y + i * lh(sz)));
      y += lh(sz) * lines.length;
    };
    const tr = (txt, sz) => {
      doc.setFontSize(sz); doc.setFont(FONT, 'normal');
      if (dibujar) doc.text(String(txt ?? ''), mmW - M, y, { align: 'right' });
      y += lh(sz);
    };

    nl(5);
    tl('                               ', FS);
    tl('                               ', FS);
    tl('ALVARO JOSE PIZARRO VILLARROEL', FS);
    tl('18.478.314-2', FS);
    tl('Giro: VTA.CELULARES,TARJETA', FS);
    tl('PREPAGO,', FS);
    tl('CHIPS,ACCESORIOS,ELECTROD.ELECTRONI', FS);
    tl('COS.', FS);
    tl('18 DE SEPTIEMBRE 257', FS);
    tl('Arica', FS);
    nl(2);
    tl(`BOLETA ELECTRÓNICA NUMERO: ${nBoleta}`, FS);
    tl('REF. VENDEDOR: 18478314-2', FS);
    tl(`Fecha: ${fechaStr}`, FS);
    nl(2);
    tl('Dirección: Santiago', FS);
    nl(3);
    tl('Venta', FS);
    nl(2);
    if (cliente.nombre) tl(`NOMBRE: ${cliente.nombre.toUpperCase()}`, FS);
    if (cliente.dni)    tl(`RUT: ${cliente.dni}`, FS);
    nl(1);
    const prodStr = `${nombreComercial}${memoria ? ' ' + memoria + 'GB' : ''}`.trim();
    if (prodStr) tl(prodStr, FS);
    if (color)   tl(`COLOR: ${color.toUpperCase()}`, FS);
    if (imei1)   tl(`IMEI: ${imei1}`, FS);
    if (imei2)   tl(`IMEI: ${imei2}`, FS);
    nl(2);
    tr(`$ ${totalNum.toLocaleString('es-CL')}`, FS);
    nl(2);
    tl('El IVA incluido en esta boleta es', FS);
    tl(`de: $ ${iva.toLocaleString('es-CL')}`, FS);
    nl(5);
    if (pdf417Img) {
      if (dibujar) doc.addImage(pdf417Img, 'PNG', M, y, pdf417W, pdf417H);
      y += pdf417H;
    }
    nl(3);
    tl('Timbre Electrónico SII', FS);
    tl('Res. 99 de 2014', FS);
    tl('Verifique documento en sii.cl', FS);
    tl('                               ', FS);
    tl('                               ', FS);
    nl(6);
    return y;
  };

  const docMedida = new jsPDF({ unit: 'mm', format: [mmW, 500], orientation: 'portrait' });
  const altoTotal = renderPDF(docMedida, false);
  const docFinal  = new jsPDF({ unit: 'mm', format: [mmW, altoTotal], orientation: 'portrait' });
  renderPDF(docFinal, true);

  const nombre2 = `BOLETA2-${nBoleta}.pdf`;
  const blob2   = docFinal.output('blob');
  const url2    = URL.createObjectURL(blob2);
  window.open(url2, '_blank');
  const a2 = document.createElement('a');
  a2.href = url2; a2.download = nombre2; a2.click();
  setTimeout(() => URL.revokeObjectURL(url2), 15000);
}





function TicketRegistroImpresion({ data, onClose }) {
  useEffect(() => { window.print(); }, []);
  return (
    <div className="fixed inset-0 bg-white z-[100] flex justify-center items-start overflow-auto p-4 md:p-10 print:p-0 print:bg-transparent">
      <button onClick={onClose} className="absolute top-4 right-4 bg-gray-200 p-2 rounded-full print:hidden"><X size={24} /></button>
      <div className="w-[181px] bg-white text-black font-mono text-[10px] leading-tight mx-auto print:m-0 print:absolute print:top-0 print:left-0">
        <div className="text-center mb-2"><p className="font-bold text-[12px]">TICKET DE REGISTRO</p><p>NUMERO = {data.nRegistro}</p></div>
        <p className="text-center">------------------------</p>
        <div className="mb-2"><p>NOMBRE: {data.nombreCliente}</p><p>DNI: {data.dniCliente}</p><p>IMEI: {data.imeiEquipo}</p></div>
        <p className="text-center">------------------------</p>
        <div className="text-center mb-2"><p>{new Date(data.fecha).toLocaleDateString()}</p></div>
        <div className="h-8"></div>
      </div>
      <style dangerouslySetInnerHTML={{__html: `@media print { body > *:not(.fixed) { display: none !important; } .print\\:hidden { display: none !important; } @page { margin: 0; size: 48mm auto; } }`}} />
    </div>
  );
}


async function generarTicketVentaPDF(data, mmW = 58, logoVentas = null) {
  const cargar = (src) => new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  if (!window.jspdf)     await cargar('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  if (!window.JsBarcode) await cargar('https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js');

  const { jsPDF } = window.jspdf;
  // mmW comes from parameter (58 or 80)
  const M   = 2;    // margen lateral mínimo
  const F   = 'courier';

  // Código de barras = número de serie (SN)
  const cbVal = data.sn || data.imeiEquipo || '';
  let barcodeImg = null, barcodeH = 0;
  if (cbVal) {
    try {
      const c = document.createElement('canvas');
      window.JsBarcode(c, cbVal, {
        format: 'CODE128', width: 2.2, height: 60,
        displayValue: true, fontSize: 16, margin: 5
      });
      barcodeImg = c.toDataURL('image/png');
      barcodeH   = (mmW - M*2) * (c.height / c.width);
    } catch(_) {}
  }

  const render = (doc, draw) => {
    const cx  = mmW / 2;
    const pad = n => String(n).padStart(2,'0');
    const dt  = new Date(data.fecha);
    const fechaStr = `${pad(dt.getDate())}/${pad(dt.getMonth()+1)}/${dt.getFullYear()}`;
    const horaStr  = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    const precio   = parseFloat(data.precio || 0).toFixed(2);

    let y = 5;

    // Tamaños optimizados para impresora térmica 58mm — legibles
    const SZ = { xs:7.5, sm:8.5, md:9.5, lg:11.5, xl:14 };
    const LH = { xs:4.0, sm:4.6, md:5.2, lg:6.0, xl:7.2 };

    // Medir cuántos chars entran en el ancho útil
    doc.setFont(F, 'normal');
    doc.setFontSize(SZ.xs);
    const charW = doc.getTextWidth('A');
    const totalCols = Math.floor((mmW - M*2) / charW);

    const line = (text, sz, bold=false) => {
      if (draw) {
        doc.setFont(F, bold ? 'bold' : 'normal');
        doc.setFontSize(sz);
        doc.text(String(text??''), cx, y, { align:'center' });
      }
      y += LH[Object.keys(SZ).find(k => SZ[k]===sz)] ?? 5;
    };

    // Separador — solo guiones, tamaño md para que se vean más grandes y menos densos
    const rule = () => {
      doc.setFont(F, 'normal');
      doc.setFontSize(SZ.md);
      const cw = doc.getTextWidth('-');
      const n  = Math.floor((mmW - M*2) / cw);
      if (draw) doc.text('-'.repeat(n), M, y);
      y += LH.md;
    };

    const row = (left, right, sz=SZ.sm, bold=false) => {
      if (draw) {
        doc.setFont(F, bold ? 'bold' : 'normal');
        doc.setFontSize(sz);
        doc.text(String(left??''), M, y);
        doc.text(String(right??''), mmW-M, y, { align:'right' });
      }
      y += LH[Object.keys(SZ).find(k=>SZ[k]===sz)] ?? 5;
    };

    const wrap = (label, value, sz=SZ.sm) => {
      if (!value) return;
      doc.setFont(F, 'normal');
      doc.setFontSize(sz);
      const lw    = doc.getTextWidth(label);
      const lines = doc.splitTextToSize(String(value), mmW - M - lw - 1);
      if (draw) {
        doc.setFont(F, 'bold');   doc.text(label, M, y);
        doc.setFont(F, 'normal'); doc.text(lines, M + lw, y);
      }
      y += (LH[Object.keys(SZ).find(k=>SZ[k]===sz)] ?? 5) * lines.length;
    };

    // ── LOGO (si está configurado) ──
    if (logoVentas) {
      const logoMaxW = mmW - M * 2;
      const logoH = 18; // alto fijo en mm
      const logoX = M;
      if (draw) doc.addImage(logoVentas, 'PNG', logoX, y, logoMaxW, logoH, undefined, 'FAST');
      y += logoH + 3;
      rule();
    }

    // ── ENCABEZADO ──
    line('COMUNIC@TE', SZ.xl + 3);
    line('RECIBO DE VENTA', SZ.md);
    line(data.nVenta || '', SZ.sm);
    rule();
    line('VENTA DE CELULARES Y ACCESORIOS', SZ.xs);
    line('Av. Patricio Melendez 234', SZ.xs);
    line('Galerias Gamarra Int. 1B - Tacna', SZ.xs);
    line('Tel. 052 607 065', SZ.xs);
    rule();

    // ── CLIENTE ──
    wrap('Nombre: ', data.nombreCliente || '');
    wrap('DNI:    ', data.dniCliente    || '');
    rule();

    // ── EQUIPO ──
    wrap('Marca:   ', data.marcaEquipo || '');
    wrap('Modelo:  ', data.nombreComercial || data.modeloEquipo || '');
    if (data.color)   wrap('Color:   ', data.color);
    if (data.ram)     wrap('RAM:     ', data.ram + ' GB');
    if (data.memoria) wrap('Memoria: ', data.memoria + ' GB');
    rule();
    wrap('IMEI 1:  ', data.imeiEquipo || '');
    if (data.imei2Equipo) wrap('IMEI 2:  ', data.imei2Equipo);
    if (data.sn)          wrap('S/N:     ', data.sn);
    rule();

    // ── PAGO ──
    wrap('Metodo:  ', 'Al contado');
    rule();
    row('Subtotal:', `S/. ${precio}`, SZ.sm);
    rule();
    row('TOTAL:   ', `S/. ${precio}`, SZ.lg);
    rule();
    y += 2;

    // ── CÓDIGO DE BARRAS (S/N) ──
    if (barcodeImg) {
      if (draw) doc.addImage(barcodeImg, 'PNG', M, y, mmW - M*2, barcodeH);
      y += barcodeH + 2;
    }
    rule();
    row('Fecha:', fechaStr);
    row('Hora: ', horaStr);
    rule();

    // ── PIE ──
    line('No se aceptan cambios', SZ.xs);
    line('ni devoluciones.', SZ.xs);
    line('El cliente estuvo conforme', SZ.xs);
    line('con el producto adquirido.', SZ.xs);
    rule();
    line('Consultas solo con caja', SZ.xs);
    line('y recibo otorgado.', SZ.xs);
    y += 5;

    return y;
  };

  const docM = new jsPDF({ unit:'mm', format:[mmW,300], orientation:'portrait' });
  const alto = render(docM, false);
  const docF = new jsPDF({ unit:'mm', format:[mmW, alto], orientation:'portrait' });
  render(docF, true);

  const nombre = `VENTA-${data.nVenta||'ticket'}.pdf`;
  const blob = docF.output('blob');
  const url  = URL.createObjectURL(blob);
  window.open(url, '_blank');
  const a = document.createElement('a');
  a.href = url; a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}
