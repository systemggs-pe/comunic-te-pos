import React, { Suspense, lazy, useState, useEffect, useMemo } from 'react';
import { X, Home, ShoppingCart, ClipboardList, Search, CheckCircle2, AlertCircle, AlertTriangle, Users, UploadCloud, LogOut, Settings, ImagePlus, ChevronRight } from 'lucide-react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { onSnapshot, setDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { EMAILS_PERMITIDOS } from '../config/auth.js';
import { PRODUCT_BRAND, SOFTWARE_BRAND } from '../config/branding.js';
import { auth, db, appId } from '../lib/firebase.js';
import { LoginScreen } from '../features/auth/LoginScreen.jsx';
import { FloatingNavigation } from '../components/navigation/FloatingNavigation.jsx';
import { AppFooter } from '../components/branding/AppFooter.jsx';
import { IntroSplash } from '../components/branding/IntroSplash.jsx';
import { ConfirmModal } from '../components/ui/ConfirmModal.jsx';
import { IconButton } from '../components/ui/Button.jsx';
import { StatusBadge } from '../components/ui/StatusBadge.jsx';
import { ThemeToggle } from '../components/ui/ThemeToggle.jsx';
import { CookieConsentBanner } from '../features/legal/CookieConsentBanner.jsx';
import { LegalDocumentPage } from '../features/legal/LegalDocumentPage.jsx';
import { isLegalPath, slugFromPath } from '../features/legal/legalRouting.js';
import {clientLogger} from '../utils/logger.js';
import {normalizeSearchTerm, registroMatchesSearch, ventaMatchesSearch} from '../utils/searchRecords.js';
import {indexClientesByDni, mapClienteDocument, normalizeDni} from '../utils/clientes.js';
import {consultarEstadosRegistroImeis, consultarHistorialOperativo} from '../services/functionsClient.js';
import {createFirestoreRepository, mapSnapshotDocs} from '../repositories/firestoreRepository.js';

const lazyNamed = (loader, name) => lazy(() => loader().then(module => ({default: module[name]})));
const Dashboard = lazyNamed(() => import('../features/dashboard/Dashboard.jsx'), 'Dashboard');
const ConfiguracionLogo = lazyNamed(() => import('../features/settings/ConfiguracionLogo.jsx'), 'ConfiguracionLogo');
const RegistrosList = lazyNamed(() => import('../features/registros/RegistrosList.jsx'), 'RegistrosList');
const RegistroForm = lazyNamed(() => import('../features/registros/RegistroForm.jsx'), 'RegistroForm');
const VentasList = lazyNamed(() => import('../features/ventas/VentasList.jsx'), 'VentasList');
const VentaForm = lazyNamed(() => import('../features/ventas/VentaForm.jsx'), 'VentaForm');
const ClientesList = lazyNamed(() => import('../features/clientes/ClientesList.jsx'), 'ClientesList');
const DniFotosPage = lazyNamed(() => import('../features/dniFotos/DniFotosPage.jsx'), 'DniFotosPage');
const ProblemasApp = lazyNamed(() => import('../features/problemas/ProblemasApp.jsx'), 'ProblemasApp');

const INTRO_LOGIN_KEY = 'ggs_intro_after_login_uid';
const INTRO_SEEN_PREFIX = 'ggs_intro_seen_at_';
const INTRO_REPEAT_AFTER_MS = 12 * 60 * 60 * 1000;
const PAGE_SIZE = 40;
const REFERENCE_DATA_LIMIT = 200;

const VIEW_LABELS = {
  dashboard: 'Inicio',
  registros_list: 'Registros',
  registros_new: 'Nuevo registro',
  registros_edit: 'Editar registro',
  ventas_list: 'Ventas',
  ventas_new: 'Nueva venta',
  ventas_edit: 'Editar venta',
  clientes_list: 'Clientes',
  foto_dni: 'Foto DNI',
  problemas_app: 'Problemas de la aplicación',
  configuracion: 'Configuración',
};

function SearchResultIcon({type}) {
  if (type === 'registro') return <ClipboardList size={17} />;
  if (type === 'venta') return <ShoppingCart size={17} />;
  return <Users size={17} />;
}

function MoreMenuItem({Icon, title, description, active = false, tone = 'neutral', showChevron = true, value, onClick}) {
  return (
    <button type="button" className="app-more-item" data-active={active} data-tone={tone} onClick={onClick} aria-current={active ? 'page' : undefined}>
      <span className="app-more-item__icon" aria-hidden="true">{React.createElement(Icon, {size: 18, strokeWidth: 1.85})}</span>
      <span className="app-more-item__copy"><span>{title}</span><small>{description}</small></span>
      {value && <span className="app-more-item__value">{value}</span>}
      {!value && showChevron && <ChevronRight size={16} className="app-more-item__chevron" aria-hidden="true" />}
    </button>
  );
}

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
  const [showIntro, setShowIntro] = useState(false);
  const [pendingView, setPendingView] = useState(null);

  const [clientes, setClientes] = useState([]);
  const [equipos, setEquipos]   = useState([]);
  const [registros, setRegistros] = useState([]);
  const [ventas, setVentas]       = useState([]);
  const [cargandoRegistros, setCargandoRegistros] = useState(true);
  const [cargandoVentas, setCargandoVentas]       = useState(true);
  const [cargandoMasRegistros, setCargandoMasRegistros] = useState(false);
  const [cargandoMasVentas, setCargandoMasVentas] = useState(false);
  const [hayMasRegistros, setHayMasRegistros] = useState(false);
  const [hayMasVentas, setHayMasVentas] = useState(false);
  const [buscandoHistorial, setBuscandoHistorial] = useState({registros: false, ventas: false});
  const [totales, setTotales] = useState({registros: 0, ventas: 0, clientes: 0});
  const [referenceDataActive, setReferenceDataActive] = useState(false);
  const [imeisRegistradosVentas, setImeisRegistradosVentas] = useState({key: '', values: null});
  const repository = useMemo(() => createFirestoreRepository(db, appId), []);

  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const toastTimerRef = React.useRef(null);
  const lastIntroUserRef = React.useRef(null);
  const lastRegistroDocRef = React.useRef(null);
  const lastVentaDocRef = React.useRef(null);
  const registrosRealtimeRef = React.useRef(new Map());
  const registrosCacheRef = React.useRef(new Map());
  const ventasRealtimeRef = React.useRef(new Map());
  const ventasCacheRef = React.useRef(new Map());
  const clientesRealtimeRef = React.useRef(new Map());
  const clientesExactosRef = React.useRef(new Map());
  const clientesConsultadosRef = React.useRef(new Set());
  const searchCacheRef = React.useRef({registros: new Map(), ventas: new Map()});
  const searchRequestRef = React.useRef({registros: 0, ventas: 0});

  const rebuildRegistrosState = React.useCallback(() => {
    setRegistros(mergeRealtimeWithCache(registrosRealtimeRef.current, registrosCacheRef.current));
  }, []);

  const rebuildVentasState = React.useCallback(() => {
    setVentas(mergeRealtimeWithCache(ventasRealtimeRef.current, ventasCacheRef.current));
  }, []);

  const rebuildClientesState = React.useCallback(() => {
    const merged = indexClientesByDni(clientesRealtimeRef.current.values());
    clientesExactosRef.current.forEach(cliente => merged.set(cliente.dni, cliente));
    setClientes([...merged.values()]);
  }, []);

  const ventasImeiStatusKey = useMemo(() => {
    if (!currentView.startsWith('ventas')) return '';
    return Array.from(new Set(ventas.slice(0, 120).flatMap(venta => [
      venta.imeiEquipo,
      venta.imei2Equipo,
    ]).filter(Boolean))).sort().join('|');
  }, [currentView, ventas]);

  useEffect(() => {
    if (!user || !ventasImeiStatusKey) return;
    let active = true;
    consultarEstadosRegistroImeis(ventasImeiStatusKey.split('|'))
      .then(result => {
        if (active) setImeisRegistradosVentas({key: ventasImeiStatusKey, values: new Set(result.registeredImeis || [])});
      })
      .catch(error => {
        clientLogger.error('app.ventas.registration_status_error', error, {count: ventasImeiStatusKey.split('|').length});
        if (active) setImeisRegistradosVentas({key: ventasImeiStatusKey, values: new Set()});
      });
    return () => { active = false; };
  }, [user, ventasImeiStatusKey]);

  const clientePorDni = useMemo(() => {
    return indexClientesByDni(clientes);
  }, [clientes]);

  const equipoPorImei = useMemo(() => {
    return new Map(equipos.map(equipo => [String(equipo.idEquipo || ''), equipo]));
  }, [equipos]);

  const showToast = React.useCallback((message, type = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ show: true, message, type });
    toastTimerRef.current = setTimeout(() => {
      setToast({ show: false, message: '', type: 'success' });
      toastTimerRef.current = null;
    }, 3000);
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

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
  // clientes + equipos: se activan solo al abrir módulos que los necesitan
  // registros: solo cuando se navega a registros
  // ventas: solo cuando se navega a ventas
  const unsubRegistrosRef = React.useRef(null);
  const unsubVentasRef    = React.useRef(null);

  const refrescarTotales = React.useCallback(async () => {
    if (!auth.currentUser) return;
    try {
      setTotales(await repository.counts());
    } catch (err) {
      clientLogger.error('app.totals.load_error', err);
    }
  }, [repository]);

  const necesitaDatosReferencia = currentView.startsWith('registros')
    || currentView.startsWith('ventas')
    || (mostrarBusqueda && busquedaGlobal.trim().length >= 3);

  useEffect(() => {
    if (!user || !necesitaDatosReferencia || referenceDataActive) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReferenceDataActive(true);
  }, [necesitaDatosReferencia, referenceDataActive, user]);

  useEffect(() => {
    if (!user || !referenceDataActive) return;

    const unsubClientes = onSnapshot(
      repository.referenceQuery('clientes', REFERENCE_DATA_LIMIT),
      (snap) => {
        clientesRealtimeRef.current = new Map(snap.docs.map(documento => {
          const cliente = mapClienteDocument(documento);
          return [cliente.dni, cliente];
        }));
        rebuildClientesState();
      },
      (err) => clientLogger.error('app.clientes.snapshot_error', err, {collection: 'clientes'})
    );
    const unsubEquipos = onSnapshot(
      repository.referenceQuery('equipos', REFERENCE_DATA_LIMIT),
      (snap) => setEquipos(mapSnapshotDocs(snap)),
      (err) => clientLogger.error('app.equipos.snapshot_error', err, {collection: 'equipos'})
    );

    return () => { unsubClientes(); unsubEquipos(); };
  }, [rebuildClientesState, referenceDataActive, repository, user]);

  useEffect(() => {
    if (!user || !referenceDataActive) return undefined;

    const loadedDnis = new Set(clientes.map(cliente => normalizeDni(cliente.dni || cliente.id)).filter(Boolean));
    const movementDnis = Array.from(new Set([
      ...ventas.map(venta => normalizeDni(venta.dniCliente)),
      ...registros.map(registro => normalizeDni(registro.dniCliente)),
    ].filter(Boolean)));
    const pendingDnis = movementDnis
      .filter(dni => !loadedDnis.has(dni) && !clientesConsultadosRef.current.has(dni))
      .slice(0, 30);

    if (!pendingDnis.length) return undefined;
    pendingDnis.forEach(dni => clientesConsultadosRef.current.add(dni));

    const requestedUid = user.uid;
    getDocs(repository.exactClientsQuery(pendingDnis))
      .then(snap => {
        if (auth.currentUser?.uid !== requestedUid) return;
        snap.docs.forEach(documento => {
          const cliente = mapClienteDocument(documento);
          clientesExactosRef.current.set(cliente.dni, cliente);
        });
        rebuildClientesState();
      })
      .catch(error => {
        pendingDnis.forEach(dni => clientesConsultadosRef.current.delete(dni));
        clientLogger.error('app.clientes.exact_lookup_error', error, {count: pendingDnis.length});
      });
  }, [clientes, rebuildClientesState, referenceDataActive, registros, repository, user, ventas]);

  useEffect(() => {
    if (!user) return;
    const unsubLogo = onSnapshot(
      repository.logo,
      (snap) => {
        if (snap.exists()) setLogoVentas(snap.data().dataUrl || null);
        else setLogoVentas(null);
      },
      (err) => clientLogger.error('app.logo.snapshot_error', err, {collection: 'configuracion/logoVentas'})
    );

    return () => unsubLogo();
  }, [repository, user]);

  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refrescarTotales();
  }, [user, refrescarTotales]);

  // Suscribir/desuscribir registros según la vista
  useEffect(() => {
    const necesitaRegistros = currentView.startsWith('registros');
    if (!user || !necesitaRegistros) return;
    if (unsubRegistrosRef.current) return; // ya suscrito

    const registrosQuery = repository.recentQuery('registros', PAGE_SIZE);
    unsubRegistrosRef.current = onSnapshot(
      registrosQuery,
      (snap) => {
        const changes = snap.docChanges();
        const removedIds = applySnapshotChanges(registrosRealtimeRef.current, changes);
        if (changes.length) searchCacheRef.current.registros.clear();
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

    // Keep the listener for the whole authenticated session. Re-subscribing
    // on every navigation would reread the first page of records.
    return undefined;
  }, [user, currentView, rebuildRegistrosState, repository]);

  // Suscribir/desuscribir ventas según la vista
  useEffect(() => {
    const necesitaVentas = currentView.startsWith('ventas');
    if (!user || !necesitaVentas) return;
    if (unsubVentasRef.current) return; // ya suscrito

    const ventasQuery = repository.recentQuery('ventas', PAGE_SIZE);
    unsubVentasRef.current = onSnapshot(
      ventasQuery,
      (snap) => {
        const changes = snap.docChanges();
        const removedIds = applySnapshotChanges(ventasRealtimeRef.current, changes);
        if (changes.length) searchCacheRef.current.ventas.clear();
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

    // Keep the listener for the whole authenticated session. Re-subscribing
    // on every navigation would reread the first page of sales.
    return undefined;
  }, [user, currentView, rebuildVentasState, repository]);

  const cargarMasRegistros = async () => {
    if (!lastRegistroDocRef.current || cargandoMasRegistros) return;
    setCargandoMasRegistros(true);
    try {
      const snap = await getDocs(repository.pageQuery('registros', PAGE_SIZE, lastRegistroDocRef.current));
      const data = snap.docs.map(d => ({id: d.id, ...d.data()}));
      lastRegistroDocRef.current = snap.docs.at(-1) || lastRegistroDocRef.current;
      setHayMasRegistros(snap.size === PAGE_SIZE);
      addItemsToCache(registrosCacheRef.current, data);
      searchCacheRef.current.registros.clear();
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
      const snap = await getDocs(repository.pageQuery('ventas', PAGE_SIZE, lastVentaDocRef.current));
      const data = snap.docs.map(d => ({id: d.id, ...d.data()}));
      lastVentaDocRef.current = snap.docs.at(-1) || lastVentaDocRef.current;
      setHayMasVentas(snap.size === PAGE_SIZE);
      addItemsToCache(ventasCacheRef.current, data);
      searchCacheRef.current.ventas.clear();
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

  const cargarColeccionCompletaOrdenada = React.useCallback(
    nombre => repository.fetchAllOrdered(nombre),
    [repository],
  );

  const incorporarClientesConsultados = React.useCallback((items = []) => {
    let changed = false;
    items.forEach(item => {
      const cliente = {...item, dni: normalizeDni(item?.dni || item?.id)};
      if (!cliente.dni) return;
      clientesExactosRef.current.set(cliente.dni, cliente);
      clientesConsultadosRef.current.add(cliente.dni);
      changed = true;
    });
    if (changed) rebuildClientesState();
  }, [rebuildClientesState]);

  const buscarRegistrosEnHistorial = React.useCallback(async (term) => {
    const needle = normalizeSearchTerm(term);
    if (needle.length < 3) return [];
    const cached = searchCacheRef.current.registros.get(needle);
    if (Array.isArray(cached) && cached.length) {
      addItemsToCache(registrosCacheRef.current, cached);
      rebuildRegistrosState();
      return cached;
    }

    const requestId = searchRequestRef.current.registros + 1;
    searchRequestRef.current.registros = requestId;
    setBuscandoHistorial(prev => ({...prev, registros: true}));
    try {
      const response = await consultarHistorialOperativo({searchTerm: needle, limit: 120});
      incorporarClientesConsultados(Array.isArray(response.clientes) ? response.clientes : []);
      const resultados = Array.isArray(response.registros) ? response.registros : [];
      if (resultados.length) searchCacheRef.current.registros.set(needle, resultados);
      else searchCacheRef.current.registros.delete(needle);
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
  }, [incorporarClientesConsultados, rebuildRegistrosState]);

  const buscarVentasEnHistorial = React.useCallback(async (term) => {
    const needle = normalizeSearchTerm(term);
    if (needle.length < 3) return [];
    const cached = searchCacheRef.current.ventas.get(needle);
    if (Array.isArray(cached) && cached.length) {
      addItemsToCache(ventasCacheRef.current, cached);
      rebuildVentasState();
      return cached;
    }

    const requestId = searchRequestRef.current.ventas + 1;
    searchRequestRef.current.ventas = requestId;
    setBuscandoHistorial(prev => ({...prev, ventas: true}));
    try {
      const response = await consultarHistorialOperativo({searchTerm: needle, limit: 120});
      incorporarClientesConsultados(Array.isArray(response.clientes) ? response.clientes : []);
      const resultados = Array.isArray(response.ventas) ? response.ventas : [];
      if (resultados.length) searchCacheRef.current.ventas.set(needle, resultados);
      else searchCacheRef.current.ventas.delete(needle);
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
  }, [incorporarClientesConsultados, rebuildVentasState]);

  useEffect(() => {
    searchCacheRef.current.registros.clear();
    searchCacheRef.current.ventas.clear();
  }, [clientes, equipos]);

  // Cancelar todas las suscripciones al cerrar sesión
  useEffect(() => {
    if (!user) {
      if (unsubRegistrosRef.current) { unsubRegistrosRef.current(); unsubRegistrosRef.current = null; }
      if (unsubVentasRef.current) { unsubVentasRef.current(); unsubVentasRef.current = null; }
      lastRegistroDocRef.current = null;
      lastVentaDocRef.current = null;
      registrosRealtimeRef.current.clear();
      registrosCacheRef.current.clear();
      ventasRealtimeRef.current.clear();
      ventasCacheRef.current.clear();
      searchCacheRef.current.registros.clear();
      searchCacheRef.current.ventas.clear();
      clientesRealtimeRef.current.clear();
      clientesExactosRef.current.clear();
      clientesConsultadosRef.current.clear();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRegistros([]); setVentas([]); setClientes([]); setEquipos([]);
      setBuscandoHistorial({registros: false, ventas: false});
      setHayMasRegistros(false); setHayMasVentas(false); setTotales({registros: 0, ventas: 0, clientes: 0});
      setReferenceDataActive(false);
      setImeisRegistradosVentas({key: '', values: null});
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
    showToast('Respaldo descargado', 'success');
  };

  const descargarRespaldoCompleto = async () => {
    const hoy = new Date().toISOString().slice(0, 10);
    try {
      const [registrosBackup, ventasBackup] = await Promise.all([
        cargarColeccionCompletaOrdenada('registros'),
        cargarColeccionCompletaOrdenada('ventas'),
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
      ) res.push({ tipo: 'registro', titulo: `${cl.nombre || r.nombreCliente || r.dniCliente}`, subtitulo: `${r.nRegistro} · IMEI ${r.imeiRegistrado || r.imeiEquipo}`, data: r });
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
      ) res.push({ tipo: 'venta', titulo: `${cl.nombre || v.nombreCliente || v.dniCliente}`, subtitulo: `${v.nVenta} · ${v.marcaEquipo || ''} ${v.modeloEquipo || ''}`, data: v });
    });
    // Buscar en clientes
    clientes.forEach(c => {
      if (normalizeSearchTerm(c.dni).includes(q) || normalizeSearchTerm(c.nombre).includes(q) || normalizeSearchTerm(c.celular).includes(q) || normalizeSearchTerm(c.correo).includes(q)) {
        res.push({ tipo: 'cliente', titulo: c.nombre, subtitulo: `Doc: ${c.dni} · ${c.celular || ''}`, data: c });
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
  const currentSectionLabel = VIEW_LABELS[currentView] || SOFTWARE_BRAND;
  const primaryNavigationItems = [
    {id: 'dashboard', label: 'Inicio', Icon: Home, active: currentView === 'dashboard', onSelect: () => navegarA('dashboard')},
    {id: 'registros', label: 'Registros', Icon: ClipboardList, active: currentView.startsWith('registros'), onSelect: () => navegarA('registros_list')},
    {id: 'ventas', label: 'Ventas', Icon: ShoppingCart, active: currentView.startsWith('ventas'), onSelect: () => navegarA('ventas_list')},
    {id: 'clientes', label: 'Clientes', Icon: Users, active: currentView === 'clientes_list', onSelect: () => navegarA('clientes_list')},
  ];
  const moreNavigationActive = ['foto_dni', 'problemas_app', 'configuracion'].includes(currentView);

  const abrirResultadoBusqueda = (resultado) => {
    setBusquedaGlobal('');
    setMostrarBusqueda(false);
    if (resultado.tipo === 'registro') navegarA('registros_list');
    else if (resultado.tipo === 'venta') navegarA('ventas_list');
    else navegarA('clientes_list');
  };

  const searchResultsPanel = mostrarBusqueda && busquedaGlobal.trim().length >= 2 ? (
    <div className="app-search-results" role="region" aria-label="Resultados de búsqueda">
      {resultadosBusqueda.length > 0 ? (
        <>
          {resultadosBusqueda.map((resultado, index) => (
            <button
              key={`${resultado.tipo}-${resultado.data?.id || index}`}
              type="button"
              onMouseDown={() => abrirResultadoBusqueda(resultado)}
              className="app-search-result"
            >
              <span className="app-search-result__icon" aria-hidden="true"><SearchResultIcon type={resultado.tipo} /></span>
              <span className="min-w-0">
                <span className="block truncate text-[0.8125rem] font-semibold text-[var(--ui-text)]">{resultado.titulo}</span>
                <span className="mt-0.5 block truncate text-xs text-[var(--ui-text-tertiary)]">{resultado.subtitulo}</span>
              </span>
              <StatusBadge tone={resultado.tipo === 'venta' ? 'success' : resultado.tipo === 'registro' ? 'accent' : 'neutral'}>{resultado.tipo}</StatusBadge>
            </button>
          ))}
          <p className="px-3 py-2 text-center text-[0.6875rem] text-[var(--ui-text-tertiary)]" aria-live="polite">
            {resultadosBusqueda.length} {resultadosBusqueda.length === 1 ? 'resultado' : 'resultados'}
          </p>
        </>
      ) : (
        <p className="px-4 py-5 text-center text-sm text-[var(--ui-text-tertiary)]" aria-live="polite">
          {buscandoBusquedaGlobal ? 'Buscando en el historial…' : `Sin resultados para “${busquedaGlobal}”`}
        </p>
      )}
    </div>
  ) : null;

  if (legalSlug) {
    return (
      <>
        <LegalDocumentPage slug={legalSlug} />
        <CookieConsentBanner />
      </>
    );
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--ui-canvas)] text-[var(--ui-text-tertiary)]" role="status">
        <span className="ui-button__spinner mr-3" aria-hidden="true" />
        Cargando sistema…
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <LoginScreen showToast={showToast} EMAILS_PERMITIDOS={EMAILS_PERMITIDOS} auth={auth} />
        <CookieConsentBanner />
        {toast.show && (
          <div className={`ui-toast ui-toast--${toast.type === 'success' ? 'success' : 'error'}`} role={toast.type === 'success' ? 'status' : 'alert'}>
            <span className="flex items-center" aria-hidden="true">
              {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            </span>
            {toast.message}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="app-shell">
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
      <a className="ui-skip-link" href="#app-main">Saltar al contenido</a>

      <section className="app-workspace">
        <header className="app-command-bar">
          <div className="app-command-bar__identity">
            <span className="app-command-bar__mark" aria-hidden="true">CM</span>
            <div className="app-command-bar__title">
              <p>{currentSectionLabel}</p>
              <p>{PRODUCT_BRAND} · {SOFTWARE_BRAND}</p>
            </div>
          </div>
          <div className="app-command-bar__tools">
            <div className="app-global-search app-command-bar__desktop-only">
              <Search className="app-global-search__leading" size={16} aria-hidden="true" />
              <input
                value={busquedaGlobal}
                onChange={event => { setBusquedaGlobal(event.target.value); setMostrarBusqueda(true); }}
                onFocus={() => setMostrarBusqueda(true)}
                onBlur={() => window.setTimeout(() => setMostrarBusqueda(false), 200)}
                placeholder="Buscar en todo el sistema"
                aria-label="Buscar clientes, registros y ventas"
                className="app-global-search__input"
              />
              {busquedaGlobal && <button type="button" className="app-global-search__clear" onClick={() => setBusquedaGlobal('')} aria-label="Limpiar búsqueda"><X size={14} /></button>}
              {searchResultsPanel}
            </div>
            <IconButton className="md:hidden" label="Buscar" onClick={() => setMostrarBusqueda(value => !value)}><Search size={18} /></IconButton>
          </div>
        </header>

        {mostrarBusqueda && (
          <div className="relative z-40 border-b border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 md:hidden">
            <div className="app-global-search w-full">
              <Search className="app-global-search__leading" size={16} aria-hidden="true" />
              <input autoFocus value={busquedaGlobal} onChange={event => setBusquedaGlobal(event.target.value)} placeholder="Cliente, IMEI o número…" aria-label="Buscar clientes, registros y ventas" className="app-global-search__input" />
              {busquedaGlobal && <button type="button" className="app-global-search__clear" onClick={() => setBusquedaGlobal('')} aria-label="Limpiar búsqueda"><X size={14} /></button>}
              {searchResultsPanel}
            </div>
          </div>
        )}

        <main id="app-main" className="app-main" tabIndex="-1">
        <Suspense fallback={<div className="py-12 text-center text-sm text-slate-400">Cargando modulo...</div>}>
          {currentView === 'dashboard' && <Dashboard stats={totales} setCurrentView={navegarA} user={user} />}

          {currentView === 'registros_list' && <RegistrosList data={registros} cargando={cargandoRegistros} clientes={clientes} equipos={equipos} onNew={() => {setEditingData(null); setFormDirty(false); navegarA('registros_new');}} onEdit={(data) => { setEditingData(data); setFormDirty(false); navegarA('registros_edit'); }} showToast={showToast} onDeleted={quitarRegistroLocal} onLoadMore={cargarMasRegistros} hasMore={hayMasRegistros} loadingMore={cargandoMasRegistros} total={totales.registros} onSearchAll={buscarRegistrosEnHistorial} searchingAll={buscandoHistorial.registros} />}
          {(currentView === 'registros_new' || currentView === 'registros_edit') && <RegistroForm user={user} clientes={clientes} equipos={equipos} registros={registros} initialData={editingData} onCancel={() => { setEditingData(null); setFormDirty(false); navegarA('registros_list'); }} onSave={() => { setEditingData(null); setFormDirty(false); refrescarTotales(); setCurrentView('registros_list'); }} onDirty={() => setFormDirty(true)} showToast={showToast} />}

          {currentView === 'ventas_list' && <VentasList data={ventas} cargando={cargandoVentas} clientes={clientes} equipos={equipos} registeredImeis={imeisRegistradosVentas.key === ventasImeiStatusKey ? imeisRegistradosVentas.values : null} logoVentas={logoVentas} onNew={() => {setEditingData(null); setFormDirty(false); navegarA('ventas_new');}} onEdit={(data) => { setEditingData(data); setFormDirty(false); navegarA('ventas_edit'); }} showToast={showToast} onDeleted={quitarVentaLocal} onLoadMore={cargarMasVentas} hasMore={hayMasVentas} loadingMore={cargandoMasVentas} total={totales.ventas} onSearchAll={buscarVentasEnHistorial} searchingAll={buscandoHistorial.ventas} />}
          {(currentView === 'ventas_new' || currentView === 'ventas_edit') && <VentaForm user={user} clientes={clientes} equipos={equipos} logoVentas={logoVentas} initialData={currentView === 'ventas_edit' ? editingData : null} onCancel={() => { setFormDirty(false); navegarA('ventas_list'); }} onSave={() => { setFormDirty(false); refrescarTotales(); setCurrentView('ventas_list'); }} onDirty={() => setFormDirty(true)} showToast={showToast} />}

          {currentView === 'clientes_list' && <ClientesList showToast={showToast} />}

          {currentView === 'foto_dni' && <DniFotosPage showToast={showToast} />}

          {currentView === 'problemas_app' && <ProblemasApp user={user} showToast={showToast} />}

          {currentView === 'configuracion' && (
            <ConfiguracionLogo
              logoVentas={logoVentas}
              onLogoChange={async (dataUrl) => {
                if (dataUrl) await setDoc(repository.logo, { dataUrl });
                else await deleteDoc(repository.logo);
              }}
              showToast={showToast}
            />
          )}
        </Suspense>

        {toast.show && (
          <div className={`ui-toast ui-toast--${toast.type === 'success' ? 'success' : 'error'}`} role={toast.type === 'success' ? 'status' : 'alert'}>
            <span className="flex items-center" aria-hidden="true">
              {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            </span>
            {toast.message}
          </div>
        )}
        </main>
        <AppFooter />
        <FloatingNavigation items={primaryNavigationItems} moreActive={moreNavigationActive}>
          <>
              <div className="app-more-account">
                <span className="app-more-account__avatar" aria-hidden="true">{user.email?.slice(0, 2).toUpperCase()}</span>
                <span className="min-w-0"><strong>Sesión activa</strong><small>{user.email}</small></span>
              </div>

              <div className="app-more-group">
                <p className="app-more-group__label">Módulos</p>
                <MoreMenuItem Icon={ImagePlus} title="Foto DNI" description="Consultar imágenes documentarias" active={currentView === 'foto_dni'} onClick={() => navegarA('foto_dni')} />
                <MoreMenuItem Icon={AlertTriangle} title="Problemas" description="Incidencias y cambios resueltos" active={currentView === 'problemas_app'} tone="warning" onClick={() => navegarA('problemas_app')} />
                <MoreMenuItem Icon={Settings} title="Configuración" description="Logo y preferencias del sistema" active={currentView === 'configuracion'} onClick={() => navegarA('configuracion')} />
              </div>

              <div className="app-more-group">
                <p className="app-more-group__label">Sistema</p>
                <MoreMenuItem Icon={UploadCloud} title="Descargar respaldo" description="Exportar los datos operativos" value="JSON" onClick={descargarRespaldoCompleto} />
                <ThemeToggle presentation="menu" />
                <MoreMenuItem Icon={LogOut} title="Cerrar sesión" description="Salir de esta cuenta" tone="danger" showChevron={false} onClick={() => signOut(auth)} />
              </div>
          </>
        </FloatingNavigation>
      </section>
      <CookieConsentBanner />
    </div>
  );
}

// ============================================================================
// COMPONENTES AUXILIARES
// ============================================================================


export default App;


