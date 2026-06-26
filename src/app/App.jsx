import React, { Suspense, lazy, useState, useEffect, useMemo } from 'react';
import { Menu, X, Home, ShoppingCart, ClipboardList, Plus, Search, Edit, Trash2, Printer, Copy, Eye, CheckCircle2, AlertCircle, AlertTriangle, Users, ScanBarcode, UploadCloud, ChevronDown, ChevronUp, LogOut, FileText, Share2, Settings, ImagePlus } from 'lucide-react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, orderBy, limit, startAfter, getDocs, getCountFromServer } from 'firebase/firestore';
import { EMAILS_PERMITIDOS } from '../config/auth.js';
import { PRODUCT_BRAND, SOFTWARE_BRAND } from '../config/branding.js';
import {mergeBoletaExtranjeraEmisores} from '../config/boletaExtranjera.js';
import { auth, db, appId } from '../lib/firebase.js';
import { LoginScreen } from '../features/auth/LoginScreen.jsx';
import { TopNavItem } from '../components/navigation/TopNavItem.jsx';
import { MobileNavIcon } from '../components/navigation/MobileNavIcon.jsx';
import { AppFooter } from '../components/branding/AppFooter.jsx';
import { IntroSplash } from '../components/branding/IntroSplash.jsx';
import { ConfirmModal } from '../components/ui/ConfirmModal.jsx';
import { CookieConsentBanner } from '../features/legal/CookieConsentBanner.jsx';
import { LegalDocumentPage } from '../features/legal/LegalDocumentPage.jsx';
import { isLegalPath, slugFromPath } from '../features/legal/legalRouting.js';
import {clientLogger} from '../utils/logger.js';
import {normalizeSearchTerm, registroMatchesSearch, ventaMatchesSearch} from '../utils/searchRecords.js';

const lazyNamed = (loader, name) => lazy(() => loader().then(module => ({default: module[name]})));
const Dashboard = lazyNamed(() => import('../features/dashboard/Dashboard.jsx'), 'Dashboard');
const ConfiguracionLogo = lazyNamed(() => import('../features/settings/ConfiguracionLogo.jsx'), 'ConfiguracionLogo');
const RegistrosList = lazyNamed(() => import('../features/registros/RegistrosList.jsx'), 'RegistrosList');
const RegistroForm = lazyNamed(() => import('../features/registros/RegistroForm.jsx'), 'RegistroForm');
const VentasList = lazyNamed(() => import('../features/ventas/VentasList.jsx'), 'VentasList');
const VentaForm = lazyNamed(() => import('../features/ventas/VentaForm.jsx'), 'VentaForm');
const ClientesList = lazyNamed(() => import('../features/clientes/ClientesList.jsx'), 'ClientesList');
const DniFotosPage = lazyNamed(() => import('../features/dniFotos/DniFotosPage.jsx'), 'DniFotosPage');
const BoletaExtranjera = lazyNamed(() => import('../features/boletas/BoletaExtranjera.jsx'), 'BoletaExtranjera');
const BoletaPublicaPage = lazyNamed(() => import('../features/boletas/BoletaPublicaPage.jsx'), 'BoletaPublicaPage');
const ProblemasApp = lazyNamed(() => import('../features/problemas/ProblemasApp.jsx'), 'ProblemasApp');

const INTRO_LOGIN_KEY = 'ggs_intro_after_login_uid';
const INTRO_SEEN_PREFIX = 'ggs_intro_seen_at_';
const INTRO_REPEAT_AFTER_MS = 12 * 60 * 60 * 1000;
const PAGE_SIZE = 40;
const SEARCH_PAGE_SIZE = 300;
const MAX_HISTORY_SEARCH_DOCS = 600;
const BOLETAS_EXTRANJERAS_PAGE_SIZE = 200;

function sortByDateDesc(items) {
  return [...items].sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
}

function mergeRealtimeWithCache(realtimeMap, cacheMap) {
  const merged = new Map(cacheMap);
  realtimeMap.forEach((item, id) => merged.set(id, item));
  return sortByDateDesc([...merged.values()]);
}

function addItemsToCache(cacheMap, items) {
  items.forEach(item => cacheMap.set(item.id, item));
}

function removeItemFromSearchCache(searchCache, id) {
  searchCache.forEach((items, term) => {
    const filtered = items.filter(item => item.id !== id);
    if (filtered.length !== items.length) searchCache.set(term, filtered);
  });
}

function applySnapshotChanges(realtimeMap, changes) {
  const removedIds = [];
  changes.forEach(change => {
    const id = change.doc.id;
    if (change.type === 'removed') {
      realtimeMap.delete(id);
      removedIds.push(id);
      return;
    }
    realtimeMap.set(id, {id, ...change.doc.data()});
  });
  return removedIds;
}

function App() {
  const publicBoletaRoute = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    return path === '/boleta' || path === '/boleta-publica';
  }, []);
  const legalSlug = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return isLegalPath(window.location.pathname) ? slugFromPath(window.location.pathname) : null;
  }, []);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');
  const [editingData, setEditingData] = useState(null);
  const [formDirty, setFormDirty] = useState(false);
  const [busquedaGlobal, setBusquedaGlobal] = useState('');
  const [mostrarBusqueda, setMostrarBusqueda] = useState(false);
  const [logoVentas, setLogoVentas] = useState(null);
  const [boletaEmisoresConfig, setBoletaEmisoresConfig] = useState(() => mergeBoletaExtranjeraEmisores());
  const [showIntro, setShowIntro] = useState(false);
  const [pendingView, setPendingView] = useState(null);

  const [clientes, setClientes] = useState([]);
  const [equipos, setEquipos]   = useState([]);
  const [registros, setRegistros] = useState([]);
  const [ventas, setVentas]       = useState([]);
  const [boletasExtranjeras, setBoletasExtranjeras] = useState([]);
  const [cargandoBoletasExtranjeras, setCargandoBoletasExtranjeras] = useState(true);
  const [cargandoRegistros, setCargandoRegistros] = useState(true);
  const [cargandoVentas, setCargandoVentas]       = useState(true);
  const [cargandoMasRegistros, setCargandoMasRegistros] = useState(false);
  const [cargandoMasVentas, setCargandoMasVentas] = useState(false);
  const [hayMasRegistros, setHayMasRegistros] = useState(false);
  const [hayMasVentas, setHayMasVentas] = useState(false);
  const [buscandoHistorial, setBuscandoHistorial] = useState({registros: false, ventas: false});
  const [totales, setTotales] = useState({registros: 0, ventas: 0});

  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const lastIntroUserRef = React.useRef(null);
  const lastRegistroDocRef = React.useRef(null);
  const lastVentaDocRef = React.useRef(null);
  const registrosRealtimeRef = React.useRef(new Map());
  const registrosCacheRef = React.useRef(new Map());
  const ventasRealtimeRef = React.useRef(new Map());
  const ventasCacheRef = React.useRef(new Map());
  const searchCacheRef = React.useRef({registros: new Map(), ventas: new Map()});
  const searchRequestRef = React.useRef({registros: 0, ventas: 0});
  const unsubBoletasRef = React.useRef(null);

  const rebuildRegistrosState = React.useCallback(() => {
    setRegistros(mergeRealtimeWithCache(registrosRealtimeRef.current, registrosCacheRef.current));
  }, []);

  const rebuildVentasState = React.useCallback(() => {
    setVentas(mergeRealtimeWithCache(ventasRealtimeRef.current, ventasCacheRef.current));
  }, []);

  const clientePorDni = useMemo(() => {
    return new Map(clientes.map(cliente => [String(cliente.dni || ''), cliente]));
  }, [clientes]);

  const equipoPorImei = useMemo(() => {
    return new Map(equipos.map(equipo => [String(equipo.idEquipo || ''), equipo]));
  }, [equipos]);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  // ── Navegación segura con confirmación si hay formulario sucio ──
  const navegarA = (vista) => {
    if (formDirty) {
      setPendingView(vista);
      return;
    }
    setCurrentView(vista);
    setBusquedaGlobal('');
    setMostrarBusqueda(false);
  };

  const confirmarSalidaSinGuardar = () => {
    if (!pendingView) return;
    setFormDirty(false);
    setCurrentView(pendingView);
    setBusquedaGlobal('');
    setMostrarBusqueda(false);
    setPendingView(null);
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

  const registrosRef = useMemo(
    () => collection(db, 'artifacts', appId, 'users', 'shared', 'registros'),
    []
  );
  const ventasRef = useMemo(
    () => collection(db, 'artifacts', appId, 'users', 'shared', 'ventas'),
    []
  );
  const boletasExtranjerasRef = useMemo(
    () => collection(db, 'artifacts', appId, 'users', 'shared', 'boletasExtranjeras'),
    []
  );

  const refrescarTotales = React.useCallback(async () => {
    if (!auth.currentUser) return;
    try {
      const [registrosCount, ventasCount] = await Promise.all([
        getCountFromServer(registrosRef),
        getCountFromServer(ventasRef),
      ]);
      setTotales({
        registros: registrosCount.data().count,
        ventas: ventasCount.data().count,
      });
    } catch (err) {
      clientLogger.error('app.totals.load_error', err);
    }
  }, [registrosRef, ventasRef]);

  useEffect(() => {
    if (!user) return;

    // Clientes y equipos — siempre activos (son ligeros y necesarios en toda la app)
    const unsubClientes = onSnapshot(
      collection(db, 'artifacts', appId, 'users', 'shared', 'clientes'),
      (snap) => setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      (err) => clientLogger.error('app.clientes.snapshot_error', err, {collection: 'clientes'})
    );
    const unsubEquipos = onSnapshot(
      collection(db, 'artifacts', appId, 'users', 'shared', 'equipos'),
      (snap) => setEquipos(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      (err) => clientLogger.error('app.equipos.snapshot_error', err, {collection: 'equipos'})
    );

    // Logo de ventas — sincronizado desde Firestore
    const unsubLogo = onSnapshot(
      doc(db, 'artifacts', appId, 'users', 'shared', 'configuracion', 'logoVentas'),
      (snap) => {
        if (snap.exists()) setLogoVentas(snap.data().dataUrl || null);
        else setLogoVentas(null);
      },
      (err) => clientLogger.error('app.logo.snapshot_error', err, {collection: 'configuracion/logoVentas'})
    );

    const unsubBoletaEmisores = onSnapshot(
      doc(db, 'artifacts', appId, 'users', 'shared', 'configuracion', 'boletaExtranjeraEmisores'),
      (snap) => {
        setBoletaEmisoresConfig(mergeBoletaExtranjeraEmisores(snap.exists() ? snap.data() : {}));
      },
      (err) => clientLogger.error('app.boleta_emisores.snapshot_error', err, {collection: 'configuracion/boletaExtranjeraEmisores'})
    );

    return () => { unsubClientes(); unsubEquipos(); unsubLogo(); unsubBoletaEmisores(); };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refrescarTotales();
  }, [user, refrescarTotales]);

  useEffect(() => {
    const necesitaBoletas = currentView === 'boleta_extranjera';
    if (!user || !necesitaBoletas) {
      if (unsubBoletasRef.current) {
        unsubBoletasRef.current();
        unsubBoletasRef.current = null;
      }
      return;
    }
    if (unsubBoletasRef.current) return;

    setCargandoBoletasExtranjeras(true);
    unsubBoletasRef.current = onSnapshot(
      query(boletasExtranjerasRef, orderBy('createdAt', 'desc'), limit(BOLETAS_EXTRANJERAS_PAGE_SIZE)),
      (snap) => {
        setBoletasExtranjeras(snap.docs.map(documento => ({id: documento.id, ...documento.data()})));
        setCargandoBoletasExtranjeras(false);
      },
      (err) => {
        clientLogger.error('app.boletas_extranjeras.snapshot_error', err, {collection: 'boletasExtranjeras'});
        setCargandoBoletasExtranjeras(false);
      }
    );
  }, [user, currentView, boletasExtranjerasRef]);

  // Suscribir/desuscribir registros según la vista
  useEffect(() => {
    const necesitaRegistros = currentView.startsWith('registros') || currentView === 'boleta_extranjera';
    if (!user || !necesitaRegistros) return;
    if (unsubRegistrosRef.current) return; // ya suscrito

    const registrosQuery = query(registrosRef, orderBy('fecha', 'desc'), limit(PAGE_SIZE));
    unsubRegistrosRef.current = onSnapshot(
      registrosQuery,
      (snap) => {
        const removedIds = applySnapshotChanges(registrosRealtimeRef.current, snap.docChanges());
        removedIds.forEach(id => {
          registrosCacheRef.current.delete(id);
          removeItemFromSearchCache(searchCacheRef.current.registros, id);
        });
        lastRegistroDocRef.current = snap.docs.at(-1) || null;
        setHayMasRegistros(snap.size === PAGE_SIZE);
        rebuildRegistrosState();
        setCargandoRegistros(false);
      },
      (err) => { clientLogger.error('app.registros.snapshot_error', err, {collection: 'registros'}); setCargandoRegistros(false); }
    );

    return () => {
      // Mantener la suscripción activa mientras el usuario esté logueado
      // Solo se cancela al cerrar sesión
    };
  }, [user, currentView, registrosRef, rebuildRegistrosState]);

  // Suscribir/desuscribir ventas según la vista
  useEffect(() => {
    const necesitaVentas = currentView.startsWith('ventas') || currentView === 'boleta_extranjera';
    if (!user || !necesitaVentas) return;
    if (unsubVentasRef.current) return; // ya suscrito

    const ventasQuery = query(ventasRef, orderBy('fecha', 'desc'), limit(PAGE_SIZE));
    unsubVentasRef.current = onSnapshot(
      ventasQuery,
      (snap) => {
        const removedIds = applySnapshotChanges(ventasRealtimeRef.current, snap.docChanges());
        removedIds.forEach(id => {
          ventasCacheRef.current.delete(id);
          removeItemFromSearchCache(searchCacheRef.current.ventas, id);
        });
        lastVentaDocRef.current = snap.docs.at(-1) || null;
        setHayMasVentas(snap.size === PAGE_SIZE);
        rebuildVentasState();
        setCargandoVentas(false);
      },
      (err) => { clientLogger.error('app.ventas.snapshot_error', err, {collection: 'ventas'}); setCargandoVentas(false); }
    );

    return () => {};
  }, [user, currentView, ventasRef, rebuildVentasState]);

  const cargarMasRegistros = async () => {
    if (!lastRegistroDocRef.current || cargandoMasRegistros) return;
    setCargandoMasRegistros(true);
    try {
      const snap = await getDocs(query(
        registrosRef,
        orderBy('fecha', 'desc'),
        startAfter(lastRegistroDocRef.current),
        limit(PAGE_SIZE),
      ));
      const data = snap.docs.map(d => ({id: d.id, ...d.data()}));
      lastRegistroDocRef.current = snap.docs.at(-1) || lastRegistroDocRef.current;
      setHayMasRegistros(snap.size === PAGE_SIZE);
      addItemsToCache(registrosCacheRef.current, data);
      rebuildRegistrosState();
    } catch (err) {
      clientLogger.error('app.registros.load_more_error', err, {pageSize: PAGE_SIZE});
      showToast('Error al cargar mas registros', 'error');
    } finally {
      setCargandoMasRegistros(false);
    }
  };

  const cargarMasVentas = async () => {
    if (!lastVentaDocRef.current || cargandoMasVentas) return;
    setCargandoMasVentas(true);
    try {
      const snap = await getDocs(query(
        ventasRef,
        orderBy('fecha', 'desc'),
        startAfter(lastVentaDocRef.current),
        limit(PAGE_SIZE),
      ));
      const data = snap.docs.map(d => ({id: d.id, ...d.data()}));
      lastVentaDocRef.current = snap.docs.at(-1) || lastVentaDocRef.current;
      setHayMasVentas(snap.size === PAGE_SIZE);
      addItemsToCache(ventasCacheRef.current, data);
      rebuildVentasState();
    } catch (err) {
      clientLogger.error('app.ventas.load_more_error', err, {pageSize: PAGE_SIZE});
      showToast('Error al cargar mas ventas', 'error');
    } finally {
      setCargandoMasVentas(false);
    }
  };

  const quitarRegistroLocal = (id) => {
    registrosRealtimeRef.current.delete(id);
    registrosCacheRef.current.delete(id);
    removeItemFromSearchCache(searchCacheRef.current.registros, id);
    rebuildRegistrosState();
    setTotales(prev => ({...prev, registros: Math.max(prev.registros - 1, 0)}));
  };

  const quitarVentaLocal = (id) => {
    ventasRealtimeRef.current.delete(id);
    ventasCacheRef.current.delete(id);
    removeItemFromSearchCache(searchCacheRef.current.ventas, id);
    rebuildVentasState();
    setTotales(prev => ({...prev, ventas: Math.max(prev.ventas - 1, 0)}));
  };

  const cargarColeccionCompletaOrdenada = async (ref) => {
    const pageSize = 500;
    const items = [];
    let cursor = null;
    for (;;) {
      const pageQuery = cursor
        ? query(ref, orderBy('fecha', 'desc'), startAfter(cursor), limit(pageSize))
        : query(ref, orderBy('fecha', 'desc'), limit(pageSize));
      const snap = await getDocs(pageQuery);
      items.push(...snap.docs.map(d => ({id: d.id, ...d.data()})));
      if (snap.size < pageSize) break;
      cursor = snap.docs.at(-1);
    }
    return items;
  };

  const leerCoincidenciasHistorial = React.useCallback(async (collectionRef, term, matchesItem) => {
    const resultados = [];
    let cursor = null;
    let revisados = 0;
    while (revisados < MAX_HISTORY_SEARCH_DOCS) {
      const pageSize = Math.min(SEARCH_PAGE_SIZE, MAX_HISTORY_SEARCH_DOCS - revisados);
      const pageQuery = cursor
        ? query(collectionRef, orderBy('fecha', 'desc'), startAfter(cursor), limit(pageSize))
        : query(collectionRef, orderBy('fecha', 'desc'), limit(pageSize));
      const snap = await getDocs(pageQuery);
      revisados += snap.size;
      snap.docs.forEach(documento => {
        const item = {id: documento.id, ...documento.data()};
        if (matchesItem(item)) resultados.push(item);
      });
      if (snap.size < pageSize) break;
      cursor = snap.docs.at(-1);
    }
    return resultados;
  }, []);

  const buscarRegistrosEnHistorial = React.useCallback(async (term) => {
    const needle = normalizeSearchTerm(term);
    if (needle.length < 3) return [];
    const cached = searchCacheRef.current.registros.get(needle);
    if (cached) {
      if (cached.length) {
        addItemsToCache(registrosCacheRef.current, cached);
        rebuildRegistrosState();
      }
      return cached;
    }

    const requestId = searchRequestRef.current.registros + 1;
    searchRequestRef.current.registros = requestId;
    setBuscandoHistorial(prev => ({...prev, registros: true}));
    try {
      const resultados = await leerCoincidenciasHistorial(registrosRef, needle, registro => {
        const cliente = clientePorDni.get(String(registro.dniCliente || '')) || {};
        return registroMatchesSearch(registro, needle, cliente);
      });
      searchCacheRef.current.registros.set(needle, resultados);
      if (requestId === searchRequestRef.current.registros && resultados.length) {
        addItemsToCache(registrosCacheRef.current, resultados);
        rebuildRegistrosState();
      }
      return resultados;
    } catch (err) {
      clientLogger.error('app.registros.history_search_error', err, {termLength: needle.length});
      return [];
    } finally {
      if (requestId === searchRequestRef.current.registros) {
        setBuscandoHistorial(prev => ({...prev, registros: false}));
      }
    }
  }, [clientePorDni, leerCoincidenciasHistorial, registrosRef, rebuildRegistrosState]);

  const buscarVentasEnHistorial = React.useCallback(async (term) => {
    const needle = normalizeSearchTerm(term);
    if (needle.length < 3) return [];
    const cached = searchCacheRef.current.ventas.get(needle);
    if (cached) {
      if (cached.length) {
        addItemsToCache(ventasCacheRef.current, cached);
        rebuildVentasState();
      }
      return cached;
    }

    const requestId = searchRequestRef.current.ventas + 1;
    searchRequestRef.current.ventas = requestId;
    setBuscandoHistorial(prev => ({...prev, ventas: true}));
    try {
      const resultados = await leerCoincidenciasHistorial(ventasRef, needle, venta => {
        const cliente = clientePorDni.get(String(venta.dniCliente || '')) || {};
        const equipo = equipoPorImei.get(String(venta.imeiEquipo || '')) || {};
        return ventaMatchesSearch(venta, needle, cliente, equipo);
      });
      searchCacheRef.current.ventas.set(needle, resultados);
      if (requestId === searchRequestRef.current.ventas && resultados.length) {
        addItemsToCache(ventasCacheRef.current, resultados);
        rebuildVentasState();
      }
      return resultados;
    } catch (err) {
      clientLogger.error('app.ventas.history_search_error', err, {termLength: needle.length});
      return [];
    } finally {
      if (requestId === searchRequestRef.current.ventas) {
        setBuscandoHistorial(prev => ({...prev, ventas: false}));
      }
    }
  }, [clientePorDni, equipoPorImei, leerCoincidenciasHistorial, ventasRef, rebuildVentasState]);

  useEffect(() => {
    searchCacheRef.current.registros.clear();
    searchCacheRef.current.ventas.clear();
  }, [clientes, equipos]);

  // Cancelar todas las suscripciones al cerrar sesión
  useEffect(() => {
    if (!user) {
      if (unsubRegistrosRef.current) { unsubRegistrosRef.current(); unsubRegistrosRef.current = null; }
      if (unsubVentasRef.current)    { unsubVentasRef.current();    unsubVentasRef.current    = null; }
      if (unsubBoletasRef.current)   { unsubBoletasRef.current();   unsubBoletasRef.current   = null; }
      lastRegistroDocRef.current = null;
      lastVentaDocRef.current = null;
      registrosRealtimeRef.current.clear();
      registrosCacheRef.current.clear();
      ventasRealtimeRef.current.clear();
      ventasCacheRef.current.clear();
      searchCacheRef.current.registros.clear();
      searchCacheRef.current.ventas.clear();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRegistros([]); setVentas([]); setClientes([]); setEquipos([]); setBoletasExtranjeras([]);
      setBuscandoHistorial({registros: false, ventas: false});
      setHayMasRegistros(false); setHayMasVentas(false); setTotales({registros: 0, ventas: 0});
    }
  }, [user]);

  // ── RESPALDO MANUAL (botón en topbar) ──
  // eslint-disable-next-line no-unused-vars
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

  const descargarRespaldoCompleto = async () => {
    const hoy = new Date().toISOString().slice(0, 10);
    try {
      const [registrosBackup, ventasBackup] = await Promise.all([
        cargarColeccionCompletaOrdenada(registrosRef),
        cargarColeccionCompletaOrdenada(ventasRef),
      ]);
      if (registrosBackup.length + ventasBackup.length === 0) { showToast('No hay datos para respaldar', 'error'); return; }
      const backup = { fecha: new Date().toISOString(), clientes, equipos, registros: registrosBackup, ventas: ventasBackup };
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `backup_comunicate_${hoy}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Respaldo descargado completo', 'success');
    } catch (err) {
      clientLogger.error('app.backup.full_download_error', err);
      showToast('Error al generar respaldo', 'error');
    }
  };

  // ── BUSCADOR GLOBAL ──
  const resultadosBusqueda = useMemo(() => {
    const q = normalizeSearchTerm(busquedaGlobal);
    if (q.length < 3) return [];
    const res = [];
    // Buscar en registros
    registros.forEach(r => {
      const cl = clientePorDni.get(String(r.dniCliente || '')) || {};
      if (registroMatchesSearch(r, q, cl) || (
        r.imeiEquipo?.includes(q) ||
        r.imeiRegistrado?.includes(q) ||
        r.dniCliente?.includes(q) ||
        cl.nombre?.toLowerCase().includes(q) ||
        r.modeloEquipo?.toLowerCase().includes(q) ||
        r.nRegistro?.toLowerCase().includes(q))
      ) res.push({ tipo: 'registro', icono: '📋', titulo: `${cl.nombre || r.dniCliente}`, subtitulo: `${r.nRegistro} · IMEI ${r.imeiRegistrado || r.imeiEquipo}`, data: r });
    });
    // Buscar en ventas
    ventas.forEach(v => {
      const cl = clientePorDni.get(String(v.dniCliente || '')) || {};
      const eq = equipoPorImei.get(String(v.imeiEquipo || '')) || {};
      if (ventaMatchesSearch(v, q, cl, eq) || (
        v.imeiEquipo?.includes(q) ||
        v.imei2Equipo?.includes(q) ||
        eq.imei2?.includes(q) ||
        v.dniCliente?.includes(q) ||
        cl.nombre?.toLowerCase().includes(q) ||
        v.modeloEquipo?.toLowerCase().includes(q) ||
        v.nVenta?.toLowerCase().includes(q))
      ) res.push({ tipo: 'venta', icono: '🛒', titulo: `${cl.nombre || v.dniCliente}`, subtitulo: `${v.nVenta} · ${v.marcaEquipo || ''} ${v.modeloEquipo || ''}`, data: v });
    });
    // Buscar en clientes
    clientes.forEach(c => {
      if (normalizeSearchTerm(c.dni).includes(q) || normalizeSearchTerm(c.nombre).includes(q) || normalizeSearchTerm(c.celular).includes(q) || normalizeSearchTerm(c.correo).includes(q)) {
        res.push({ tipo: 'cliente', icono: '👤', titulo: c.nombre, subtitulo: `Doc: ${c.dni} · ${c.celular || ''}`, data: c });
      }
    });
    return res.slice(0, 10); // máximo 10 resultados
  }, [busquedaGlobal, registros, ventas, clientes, clientePorDni, equipoPorImei]);

  useEffect(() => {
    const term = busquedaGlobal.trim();
    if (!mostrarBusqueda || term.length < 3) return undefined;
    const timeoutId = window.setTimeout(() => {
      if (!totales.registros || registros.length < totales.registros) buscarRegistrosEnHistorial(term);
      if (!totales.ventas || ventas.length < totales.ventas) buscarVentasEnHistorial(term);
    }, 700);
    return () => window.clearTimeout(timeoutId);
  }, [busquedaGlobal, buscarRegistrosEnHistorial, buscarVentasEnHistorial, mostrarBusqueda, registros.length, totales.registros, totales.ventas, ventas.length]);

  const buscandoBusquedaGlobal = buscandoHistorial.registros || buscandoHistorial.ventas;

  if (publicBoletaRoute) {
    return (
      <>
        <Suspense fallback={<div className="min-h-screen bg-[var(--ggs-bg)] p-6 text-sm font-semibold text-slate-600">Cargando consulta...</div>}>
          <BoletaPublicaPage />
        </Suspense>
        <CookieConsentBanner />
      </>
    );
  }

  if (legalSlug) {
    return (
      <>
        <LegalDocumentPage slug={legalSlug} />
        <CookieConsentBanner />
      </>
    );
  }

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">Cargando sistema...</div>;
  }

  if (!user) {
    return (
      <>
        <LoginScreen showToast={showToast} EMAILS_PERMITIDOS={EMAILS_PERMITIDOS} auth={auth} />
        <CookieConsentBanner />
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
    <div className="flex h-screen flex-col overflow-hidden bg-[oklch(0.976_0.006_250)] font-sans text-slate-900">
      {showIntro && <IntroSplash />}
      <ConfirmModal
        open={Boolean(pendingView)}
        title="Salir sin guardar"
        message="Los datos ingresados se perderan."
        confirmLabel="Salir"
        cancelLabel="Quedarme"
        tone="danger"
        onConfirm={confirmarSalidaSinGuardar}
        onCancel={() => setPendingView(null)}
      />

      {/* ── TOPBAR ── */}
      <header className="z-50 flex shrink-0 flex-wrap items-center justify-between border-b border-slate-200 bg-[oklch(0.988_0.004_250)] px-4 py-2 text-slate-900 shadow-sm md:px-6">

        {/* Logo */}
        <div className="flex items-center gap-3">
          <span className="select-none text-base font-extrabold tracking-wide text-slate-950">{PRODUCT_BRAND}</span>
          <span className="hidden rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:inline-flex">{SOFTWARE_BRAND}</span>
        </div>

        {/* Nav desktop */}
        <nav className="order-last hidden w-full flex-wrap items-center gap-1.5 border-t border-slate-200 pt-2 md:flex">
          <TopNavItem Icon={Home}          label="Inicio"            active={currentView === 'dashboard'}          onClick={() => navegarA('dashboard')} />
          <TopNavItem Icon={ClipboardList} label="Registros"         active={currentView.startsWith('registros')} onClick={() => navegarA('registros_list')} />
          <TopNavItem Icon={ShoppingCart}  label="Ventas"            active={currentView.startsWith('ventas')}    onClick={() => navegarA('ventas_list')} tone="emerald" />
          <TopNavItem Icon={Users}         label="Clientes"          active={currentView === 'clientes_list'}     onClick={() => navegarA('clientes_list')} />
          <TopNavItem Icon={ImagePlus}     label="Foto DNI"          active={currentView === 'foto_dni'}          onClick={() => navegarA('foto_dni')} />
          <TopNavItem Icon={FileText}      label="Boleta Extranjera" active={currentView === 'boleta_extranjera'} onClick={() => navegarA('boleta_extranjera')} />
          <TopNavItem iconOnly Icon={AlertTriangle} label="Problemas" active={currentView === 'problemas_app'} onClick={() => navegarA('problemas_app')} tone="amber" className="ml-auto" />
          <TopNavItem iconOnly Icon={Settings} label="Configuracion" active={currentView === 'configuracion'} onClick={() => navegarA('configuracion')} />
        </nav>

        {/* Derecha desktop: buscador + email + logout */}
        <div className="hidden items-center gap-2 md:flex">
          {/* Buscador global */}
          <div className="relative">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
              <Search size={14} className="text-slate-400" />
              <input
                value={busquedaGlobal}
                onChange={e => { setBusquedaGlobal(e.target.value); setMostrarBusqueda(true); }}
                onFocus={() => setMostrarBusqueda(true)}
                onBlur={() => setTimeout(() => setMostrarBusqueda(false), 200)}
                placeholder="Buscar..."
                className="w-40 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 lg:w-56"
              />
              {busquedaGlobal && <button onClick={() => setBusquedaGlobal('')} className="text-slate-400 hover:text-slate-700"><X size={12}/></button>}
            </div>
            {/* Dropdown resultados */}
            {mostrarBusqueda && resultadosBusqueda.length > 0 && (
              <div className="absolute right-0 top-10 z-[999] w-80 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
                {resultadosBusqueda.map((r, i) => (
                  <button key={i} onMouseDown={() => {
                    setBusquedaGlobal(''); setMostrarBusqueda(false);
                    if (r.tipo === 'registro') navegarA('registros_list');
                    else if (r.tipo === 'venta') navegarA('ventas_list');
                    else navegarA('clientes_list');
                  }} className="flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50">
                    <span className="text-lg mt-0.5">{r.icono}</span>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{r.titulo}</p>
                      <p className="truncate text-xs text-slate-400">{r.subtitulo}</p>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium mt-1
                      ${r.tipo === 'registro' ? 'bg-blue-100 text-blue-700' : r.tipo === 'venta' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}`}>
                      {r.tipo}
                    </span>
                  </button>
                ))}
                <p className="py-2 text-center text-xs text-slate-400">{resultadosBusqueda.length} resultado(s)</p>
              </div>
            )}
            {mostrarBusqueda && busquedaGlobal.length >= 2 && resultadosBusqueda.length === 0 && (
              <div className="absolute right-0 top-10 z-[999] w-64 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-xl">
                <p className="text-center text-sm text-slate-400">{buscandoBusquedaGlobal ? 'Buscando historial...' : `Sin resultados para "${busquedaGlobal}"`}</p>
              </div>
            )}
          </div>
          <span className="hidden max-w-[180px] truncate text-xs font-medium text-slate-500 xl:block">{user.email}</span>
          <button onClick={descargarRespaldoCompleto} title="Descargar respaldo"
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-50">
            <UploadCloud size={16} /> Respaldo
          </button>
          <button onClick={() => signOut(auth)} title="Cerrar sesión"
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50">
            <LogOut size={16} /> Salir
          </button>
        </div>

        {/* Nav móvil */}
        <div className="flex md:hidden items-center gap-1">
          <MobileNavIcon Icon={Search}       active={mostrarBusqueda}                          onClick={() => setMostrarBusqueda(v => !v)}         title="Buscar" />
          <button onClick={() => signOut(auth)} title="Cerrar sesión"
            className="rounded-lg p-2 text-red-600 transition-colors hover:bg-red-50">
            <LogOut size={20} />
          </button>
        </div>

      </header>

      <nav className="grid shrink-0 grid-cols-3 gap-1 border-b border-slate-200 bg-white px-2 py-1.5 md:hidden">
        <MobileNavIcon showLabel Icon={Home}          active={currentView === 'dashboard'}             onClick={() => navegarA('dashboard')}               title="Inicio" />
        <MobileNavIcon showLabel Icon={ClipboardList} active={currentView.startsWith('registros')}    onClick={() => navegarA('registros_list')}           title="Registros" />
        <MobileNavIcon showLabel Icon={ShoppingCart}  active={currentView.startsWith('ventas')}       onClick={() => navegarA('ventas_list')}              title="Ventas" tone="emerald" />
        <MobileNavIcon showLabel Icon={Users}         active={currentView === 'clientes_list'}        onClick={() => navegarA('clientes_list')}            title="Clientes" />
        <MobileNavIcon showLabel Icon={ImagePlus}     active={currentView === 'foto_dni'}             onClick={() => navegarA('foto_dni')}                 title="Foto DNI" />
        <MobileNavIcon showLabel Icon={FileText}      active={currentView === 'boleta_extranjera'}    onClick={() => navegarA('boleta_extranjera')}        title="Boleta" />
      </nav>

      {/* Buscador móvil desplegable */}
      {mostrarBusqueda && (
        <div className="relative z-40 border-b border-slate-200 bg-white px-4 py-2 md:hidden">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <Search size={14} className="text-slate-400" />
            <input autoFocus value={busquedaGlobal} onChange={e => setBusquedaGlobal(e.target.value)}
              placeholder="Buscar cliente, IMEI, N° registro..."
              className="flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400" />
            {busquedaGlobal && <button onClick={() => setBusquedaGlobal('')}><X size={14} className="text-slate-400"/></button>}
          </div>
          {resultadosBusqueda.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-50 border-t border-slate-100 bg-white shadow-xl">
              {resultadosBusqueda.map((r, i) => (
                <button key={i} onMouseDown={() => {
                  setBusquedaGlobal(''); setMostrarBusqueda(false);
                  if (r.tipo === 'registro') navegarA('registros_list');
                  else if (r.tipo === 'venta') navegarA('ventas_list');
                  else navegarA('clientes_list');
                }} className="flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50">
                  <span className="text-base mt-0.5">{r.icono}</span>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{r.titulo}</p>
                    <p className="truncate text-xs text-slate-400">{r.subtitulo}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── CONTENIDO ── */}
      <main className="relative flex-1 overflow-auto p-4 md:p-5">
        <Suspense fallback={<div className="py-12 text-center text-sm text-slate-400">Cargando modulo...</div>}>
          {currentView === 'dashboard' && <Dashboard stats={{registros: totales.registros, ventas: totales.ventas, clientes: clientes.length}} setCurrentView={navegarA} user={user} />}

          {currentView === 'registros_list' && <RegistrosList data={registros} cargando={cargandoRegistros} clientes={clientes} equipos={equipos} onNew={() => {setEditingData(null); setFormDirty(false); navegarA('registros_new');}} onEdit={(data) => { setEditingData(data); setFormDirty(false); navegarA('registros_edit'); }} showToast={showToast} onDeleted={quitarRegistroLocal} onLoadMore={cargarMasRegistros} hasMore={hayMasRegistros} loadingMore={cargandoMasRegistros} total={totales.registros} onSearchAll={buscarRegistrosEnHistorial} searchingAll={buscandoHistorial.registros} />}
          {(currentView === 'registros_new' || currentView === 'registros_edit') && <RegistroForm user={user} clientes={clientes} equipos={equipos} registros={registros} initialData={currentView === 'registros_edit' ? editingData : null} onCancel={() => { setFormDirty(false); navegarA('registros_list'); }} onSave={() => { setFormDirty(false); refrescarTotales(); setCurrentView('registros_list'); }} onDirty={() => setFormDirty(true)} showToast={showToast} />}

          {currentView === 'ventas_list' && <VentasList data={ventas} cargando={cargandoVentas} clientes={clientes} equipos={equipos} logoVentas={logoVentas} onNew={() => {setEditingData(null); setFormDirty(false); navegarA('ventas_new');}} onEdit={(data) => { setEditingData(data); setFormDirty(false); navegarA('ventas_edit'); }} showToast={showToast} onDeleted={quitarVentaLocal} onLoadMore={cargarMasVentas} hasMore={hayMasVentas} loadingMore={cargandoMasVentas} total={totales.ventas} onSearchAll={buscarVentasEnHistorial} searchingAll={buscandoHistorial.ventas} />}
          {(currentView === 'ventas_new' || currentView === 'ventas_edit') && <VentaForm user={user} clientes={clientes} equipos={equipos} boletaEmisoresConfig={boletaEmisoresConfig} logoVentas={logoVentas} initialData={currentView === 'ventas_edit' ? editingData : null} onCancel={() => { setFormDirty(false); navegarA('ventas_list'); }} onSave={() => { setFormDirty(false); refrescarTotales(); setCurrentView('ventas_list'); }} onDirty={() => setFormDirty(true)} showToast={showToast} />}

          {currentView === 'clientes_list' && <ClientesList showToast={showToast} />}

          {currentView === 'foto_dni' && <DniFotosPage showToast={showToast} />}

          {currentView === 'boleta_extranjera' && <BoletaExtranjera clientes={clientes} equipos={equipos} ventas={ventas} boletasExtranjeras={boletasExtranjeras} cargandoBoletasExtranjeras={cargandoBoletasExtranjeras} boletaEmisoresConfig={boletaEmisoresConfig} showToast={showToast} onSearchVentas={buscarVentasEnHistorial} searchingVentas={buscandoHistorial.ventas} />}

          {currentView === 'problemas_app' && <ProblemasApp user={user} showToast={showToast} />}

          {currentView === 'configuracion' && (
            <ConfiguracionLogo
              logoVentas={logoVentas}
              boletaEmisoresConfig={boletaEmisoresConfig}
              onLogoChange={async (dataUrl) => {
                const logoRef = doc(db, 'artifacts', appId, 'users', 'shared', 'configuracion', 'logoVentas');
                if (dataUrl) await setDoc(logoRef, { dataUrl });
                else await deleteDoc(logoRef);
              }}
              onBoletaEmisoresChange={async (config) => {
                const emisoresRef = doc(db, 'artifacts', appId, 'users', 'shared', 'configuracion', 'boletaExtranjeraEmisores');
                await setDoc(emisoresRef, mergeBoletaExtranjeraEmisores(config), {merge: true});
              }}
              showToast={showToast}
            />
          )}
        </Suspense>

        {toast.show && (
          <div className={`fixed bottom-4 right-4 z-50 flex items-center rounded-lg px-4 py-3 text-sm text-white shadow-lg ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
            <span className="mr-2 flex items-center">
              {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            </span>
            {toast.message}
          </div>
        )}
      </main>
      <AppFooter />
      <CookieConsentBanner />
    </div>
  );
}

// ============================================================================
// COMPONENTES AUXILIARES
// ============================================================================


export default App;


