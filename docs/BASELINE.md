# Project Baseline

## Fecha
2026-10-05, America/Lima. Los timestamps UTC de logs pueden indicar 2026-10-06.

## Rama
`chore/baseline-stabilization`. Sin push, despliegue, borrado de ramas ni reescritura de historial.

## Commit base
- HEAD recibido: `95fdced` en main; 17 archivos modificados y 5 nuevos.
- Backup de esos cambios: `b2088dd95b34b19ed4038b2fde6ddcda9a22369c`.
- Tag local: `baseline-pre-stabilization`.
- Bundle independiente verificado: `C:/Users/COMUNICATE/.codex/backups/comunicate/baseline-2026-10-05-b2088dd.bundle`; contiene historia completa hasta el tag.
- El backup Git no contiene `.env`, `functions/.env`, dependencias, dist ni otros ignorados y NO es exportación de Firestore. No se modificaron esos archivos ni secretos.
- Para recuperar en otro directorio: `git clone C:/Users/COMUNICATE/.codex/backups/comunicate/baseline-2026-10-05-b2088dd.bundle <directorio-nuevo>`; configurar credenciales por separado. No usar reset sobre el trabajo actual.
- Consultar commit final con `git log -1 --format=%H` (evita referencia circular dentro del propio commit).

## Stack detectado
JavaScript/JSX, React 19.2.8, Vite 7.3.6, Tailwind 3.4.19, Firebase 12.17.1, Firebase Admin 13.10.0, Zod 4.4.3, jsPDF 4.2.1, Node test runner, ESLint 9.39.5. Entorno ejecutado: Node 24.14.0, npm 11.9.0, Windows/PowerShell.

Gestor npm (`package-lock.json`). `npm ls --depth=0` sin dependencias faltantes/inválidas. `deno.lock` existe pero scripts no usan Deno. No se cambió lockfile ni se reinstalaron dependencias. Instalación limpia con `npm ci`: NO VERIFICADO (las pruebas usaron node_modules existente).

## Arquitectura
No es el monorepo apps/web descrito por la petición: frontend en `src/`, API en `netlify/functions/`, adaptador local en `scripts/local-api.mjs`, paquete interno `packages/local-field-verifier` sin npm workspaces. Ese paquete tiene train/evaluate, no lint/test/build/typecheck propios; pruebas de sus funciones están en la suite raíz. No se ejecutó entrenamiento que modifique modelos.

| Capa/funcionalidad | Ubicación | Estado y alcance de evidencia |
|---|---|---|
| Frontend | src/app, src/features | Build y entrega HTTP local VERIFICADOS; UI y flujo E2E NO VERIFICADOS. |
| Auth y sesión | LoginScreen, App, functionsClient, _shared | Firebase Google/token y perfil por API; rechazo sin sesión VERIFICADO; login real/persistencia/revocación NO VERIFICADOS. |
| Usuarios/roles | UsuariosSistema, usuarios.mjs, _roles.mjs | Roles fijos usuario/admin/superadmin y active/disabled; tests con mocks VERIFICADOS; CRUD real NO VERIFICADO. |
| Registros/ventas/clientes/equipos | features, Functions, repositorio Firestore | Tests de validadores, transacciones/locks simulados e historial VERIFICADOS; E2E/escrituras reales NO VERIFICADOS. |
| Empresa | ConfiguracionLogo | Logo en configuracion/logoVentas; CompanySettings y módulo empresarial genérico NO IMPLEMENTADOS. |
| Plantillas/generaciones | registroPdf, ventaPdf, registroEvidenciasPdf, appleStoreReceiptPdf | Formatos de código; pruebas de plan/contenido VERIFICADAS; PDF final renderizado/descarga NO VERIFICADOS. CRUD de templates/generations NO IMPLEMENTADO. |
| Archivos | registroEvidencias, ImageCropModal, ConfiguracionLogo, dniFotos | Data URLs, compresión y proveedor externo; no hay gestor genérico ni integración Firebase Storage activa. Upload/recorte E2E NO VERIFICADOS. |
| Portal público | PublicSolicitudRegistro, solicitudesPublicas.mjs | Tokens hash, expiry y validadores; tests con fixtures VERIFICADOS; envío real NO VERIFICADO. |
| Auditoría | _observability.mjs | Logs/request IDs y queueAuditEvent; tests VERIFICADOS. Atomicidad incompleta en operaciones concretas (BUG-008). |
| OCR/proveedores | analizarCajaGemini, reniec, _appleReceiptsApi | Tests con mocks VERIFICADOS; proveedores con credenciales reales NO VERIFICADOS. OCR local entrenable pausado en UI. |

## Frontend
Vite genera dist y prepara recursos OCR. Backend por `VITE_BACKEND_BASE_URL` o `/api` relativo. Proxy local a 127.0.0.1 por BACKEND_PORT exclusivamente en dev; no es una URL accidental de backend de producción. Firebase web config apunta a un proyecto fijo: aislamiento local/preview/producción no está garantizado por variables. Modificaciones de diseño y roadmap fuera de alcance.

## Backend
Diez rutas POST: analizarCajaGemini, clientes, comprobanteApple, dniFotos, legalConsent, registros, reniec, usuarios, solicitudesPublicas, ventas. Smoke local: nueve rechazan sin token con 401 JSON; solicitudesPublicas con body vacío da 400 JSON. Todas emiten request ID. OPTIONS devuelve 204 y CORS esperado. No existe healthcheck dedicado (GET /api/health = 404 local). Las llamadas de smoke sin token/acción válida no invocaron proveedores ni escrituras de negocio.

## Base de datos
Firestore, no PostgreSQL. Scope `artifacts/comunicate-pos/users/shared`, colecciones clientes, equipos, registros, ventas, userRoles, configuracion, solicitudesPublicas, locks/rate limits y auditoría. Configuración de índices/rules en firestore.indexes.json y firestore.rules. No hay esquema Prisma ni migraciones SQL; backfill-search-index y purge-dni-photo-history son scripts de mantenimiento y NO se ejecutaron.

Lectura real Admin SDK con `.env`, máximo un documento por colección: clientes/equipos/registros/ventas devolvieron 1; userRoles devolvió 0. VERIFICADO acceso de lectura, no integridad global, escrituras ni reglas de cliente. Los resultados contienen solo contadores, sin documentos ni datos personales. Reglas desplegadas e índices remotos NO VERIFICADOS; emulador no configurado en firebase.json y no ejecutado.

## Deployment
Netlify: npm run build, publish dist, Functions esbuild, redirects antes del fallback. Se agregó la ruta usuarios ausente. Firebase Hosting: dist con fallback universal a index.html y headers estáticos; no contiene rewrite a Netlify. Vercel/Railway: NO APLICA, configuraciones ausentes.

| Entorno | Frontend/API | Estado |
|---|---|---|
| LOCAL | Vite proxy /api a adaptador; preview sirve dist sin API proxy | HTTP frontend, diez handlers y CORS VERIFICADOS. |
| PREVIEW | Netlify deploy preview; DEPLOY_PRIME_URL forma parte de CORS | Inspección de código; deploy, variables y credenciales NO VERIFICADOS. |
| PRODUCTION | Firebase web.app declarado en config/legal y sitemap; API Netlify prevista | Root HTTP 200 VERIFICADO. API en Firebase devuelve HTML; backend separado y flujo autenticado NO VERIFICADOS. |

La descarga/inspección de assets publicados sufrió timeout; no se pudo establecer la URL compilada de backend ni paridad de commit/deploy. También se intentó abrir el frontend publicado mediante el navegador integrado: la herramienta agotó el tiempo de espera y no devolvió estado UI; verificación visual NO VERIFICADA. Las rutas Firebase `/api/usuarios`, OPTIONS `/api/registros` y `/api/health` retornaron 200 HTML sin CORS/API request ID. Ese 200 NO acredita una API sana. No se inventó una URL Netlify ni se alteraron dominios. Redirecciones de boletas externas apuntan a una app separada; se conservan y no se comprobaron credenciales/proveedores.

Variables usadas (solo nombres): VITE_BACKEND_BASE_URL, VITE_APP_VERSION (definida desde package.json), BACKEND_PORT, FIREBASE_API_KEY, FIREBASE_SERVICE_ACCOUNT o FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY, ALLOWED_EMAILS, ADMIN_EMAILS, SUPERADMIN_EMAILS, ALLOWED_ORIGINS, URL, DEPLOY_PRIME_URL, RENIEC_TOKEN, RENIEC_TIMEOUT_MS, CODART_TOKEN, CODART_TIMEOUT_MS, CODART_MAX_IMAGE_BYTES, GEMINI_API_KEY, GEMINI_MODEL, GEMINI_TIMEOUT_MS, APPLE_RECEIPTS_API_URL, APPLE_RECEIPTS_API_KEY, APPLE_RECEIPTS_TIMEOUT_MS, RATE_LIMIT_COLLECTION. `.env` local contiene configuración Admin y proveedores; presencia no prueba validez de todos. `functions/.env` no lo carga el adaptador Netlify local. Variables remotas del proveedor NO VERIFICADAS.

CORS local VERIFICADO para localhost permitido y origen ajeno sin allow-origin. CORS real del backend Netlify NO VERIFICADO; CORS no reemplaza autenticación. La allowlist del código conserva localhost también en producción (observación, no vulnerabilidad explotada demostrada).

## Estado de TypeScript
NO APLICA: proyecto JavaScript/JSX, sin script typecheck ni tsconfig. `@types/react` no significa que exista chequeo de tipos. Build prueba transformación/bundling, no typecheck. No se inventó script ni se instaló TypeScript.

## Estado de lint
VERIFICADO: exit 0, cero errores, seis warnings preexistentes en RegistroForm.jsx y VentaForm.jsx (set-state-in-effect y una exhaustive-deps). La configuración actual solo cubre js/jsx; mjs no recibe las mismas reglas. Syntax checks de los scripts nuevos VERIFICADOS.

## Estado de tests
VERIFICADO: suite inicial 159/159; final 160/160, cero fallos/omitidos. Nueva prueba comprueba paridad de rutas API locales con Netlify y prioridad sobre fallback. Tests de lógica/fixtures no prueban producción. Evaluador corregido: seis ejemplos versionados, 12 campos esperados correctos; solo nombreComercial/color tienen muestras, no afirmar exactitud general del OCR.

## Estado del build
VERIFICADO: build inicial y final exit 0, 2177 módulos. Build final 16.48s en esta máquina; esta duración no constituye medición de rendimiento de usuarios ni comparativa controlada.

## Estado de Prisma
NO APLICA: sin Prisma, schema.prisma, Client ni migraciones. No se instalaron ni ejecutaron validate/generate/migrate status/reset. `Organization` únicamente aparece como tipo JSON-LD legal; no es modelo antiguo de datos. CompanySettings NO IMPLEMENTADO.

## Bugs conocidos
Ver [BASELINE_BUGS.md](BASELINE_BUGS.md): ocho hallazgos; dos corregidos localmente. No se afirmó que las reglas sensibles o producción estén estabilizadas por pasar tests.

## Riesgos conocidos
BUG-003 y BUG-004 son prioritarios: permisos directos de usuarios fijos y respaldo incompleto de datos. Audit registra 16 entradas con severidad máxima HIGH; requiere analizar compatibilidad/exposición antes de actualizar. No se modificaron reglas, credenciales ni políticas de negocio. No se realizó exportación/restauración Firestore. Ninguna prueba de escritura en producción.

## Observaciones
Fase de preparación/documentación ejecutada; NO equivale a sistema certificado de extremo a extremo ni aprobación de release. Quedan pendientes backend remoto, sesión real, UI responsive, PDFs finales, reglas en emulador, índices/proveedor remoto y backup de datos recuperable. Registrar NO APLICA para módulos ausentes en vez de implementarlos. No se añadieron features.

## Reproducibilidad y evidencia
- `npm run verify`: scripts existentes typecheck si existe, lint, test, build; continúa para registrar todos los fallos y devuelve 1 si cualquiera falla. No toca DB ni hace deploy.
- `node scripts/baseline-smoke.mjs`: servidores locales temporales, entrega frontend y rechazo API/CORS; requiere build previo. Cierra sus procesos.
- `node --env-file=.env scripts/baseline-smoke.mjs --production`: solicitudes HTTP sin sesión; no guarda cuerpos ni credenciales.
- `node --env-file=.env scripts/baseline-smoke.mjs --database`: lecturas limitadas por Admin; usar solo un proyecto autorizado. No incluye escrituras. El resultado del probe muestra observaciones HTTP, no una certificación por su exit code.
- [Comandos y resultados](BASELINE_COMMANDS.md), [log verify](baseline-evidence/verify.log), [smoke local](baseline-evidence/local-smoke.json), [producción](baseline-evidence/production-smoke.json), [DB](baseline-evidence/database-smoke.json), [audit](baseline-evidence/npm-audit.json), [evaluador](baseline-evidence/evaluator.log).
