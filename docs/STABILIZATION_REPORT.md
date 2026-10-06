# Stabilization Report

Fecha: 2026-10-06 (America/Lima). Rama: chore/baseline-stabilization. Commit inicial: aabd2bd63f06c141be76ac3485983f33f755e471.

## Bugs tratados

| Bug | Estado | Commit | Evidencia |
|---|---|---|---|
| BUG-003 | RESUELTO en repositorio; no desplegado | 3839484 | roles/authorization tests y 12 tests de integración de reglas/Auth en emulador |
| BUG-004 | RESUELTO para las cuatro colecciones operativas | d9dc2f6 | 7 tests de backup; paginación real en Firestore emulado |
| BUG-005 | MITIGADO; permanecen alertas de desarrollo | 210b47c | audit antes/después, verify, emuladores después de actualizaciones |

No se repitió el inventario general. Fuentes iniciales: documentos y evidencias de baseline; se inspeccionaron únicamente accesos, backup, dependencias y deployment pertinentes. BUG-006/007/008 permanecen pendientes, fuera de esta prioridad.

## Cambios realizados

### Acceso
Se eliminaron los bypass por correos fijos de Firestore, backend y configuración UI. La única autoridad para acceso es un documento `artifacts/comunicate-pos/users/shared/userRoles/<email>` con rol usuario/admin/superadmin y `status: active`, además de identidad Firebase con email verificado. Un documento ausente, inválido o disabled se deniega; estado faltante no activa implícitamente. Las asignaciones de roles deben indicar status explícito al guardarse.

API verifica ID token con comprobación de revocación (`verifyIdToken(token, true)`) y consulta autorización en cada request. `hasRole`, `assertRole` y `puedeUsuario` exigen active. No hay un catálogo separado de roles activables: el estado pertenece a la asignación userRoles del usuario; no se añadió otro modelo. Se probaron asignaciones desactivadas/roles inválidos.

Se admitió inyección de servicios internos en requireFirebaseUser/handlePost para probar la frontera completa de auth/HTTP. Ningún argumento de request puede seleccionar esos servicios; handlers publicados conservan Firebase Admin por defecto.

**Precondición de release:** el baseline observó cero documentos en userRoles. Si aún no se preparan asignaciones explícitas, este código deniega a todos, incluidos los antiguos administradores. Antes de un despliegue autorizado, un operador debe verificar/preparar las autorizaciones mediante herramientas administrativas controladas, conservando cuentas y datos y revisando las asignaciones. No se crearon registros en producción, no se concedieron permisos nuevos ni se cambió el estado de cuentas reales. No se reintrodujo un fallback para resolver este bloqueo.

### Backup
El backup operativo incluye exclusivamente `clientes`, `equipos`, `registros`, `ventas`, del scope compartido comunicate-pos. Lee directamente servidor con `getDocsFromServer`, ordena por ID de documento (no por fecha, para incluir documentos históricos sin ese campo) y pagina en lotes de 500. No usa los arrays React, el límite 200 ni requiere abrir otros módulos.

Obtiene conteos iniciales de las cuatro colecciones; compara esperado/exportado por colección; vuelve a contar todas al finalizar. Detecta documentos duplicados, crecimiento durante paginación, faltantes, cambio final de cantidades, errores de red/permisos y fallos parciales. Solo después genera el JSON y anuncia éxito. El JSON añade verification.counts, lista de colecciones y complete. Se conserva el esquema operativo superior fecha/clientes/equipos/registros/ventas. IDs exportados son los IDs autoritativos de Firestore, aunque el documento contenga otro campo id.

La UI muestra colección y cantidad exportada/esperada, desactiva doble ejecución y comunica que un fallo no descargó archivo parcial. Se retiró el antiguo exportador parcial sin uso. No se realizan escrituras de datos durante el backup.

**Límites:** no es exportación administrativa de toda la base: no incluye roles, configuración, auditoría, locks, enlaces públicos, subcolecciones ni credenciales. Tampoco es snapshot transaccional: conteos iguales no detectan ediciones concurrentes o sustituciones con igual cardinalidad; ejecutar en ventana sin modificaciones para recuperación consistente. Exportar JSON consume memoria proporcional al tamaño; no se añadió streaming ni rediseño. No se descargaron datos de clientes reales ni se probó la acción del botón en navegador.

## Tests agregados

- `authorization.test.mjs`: 14 pruebas del pipeline HTTP, estado/rol y errores de autenticación; incluye antiguas identidades privilegiadas. Se actualizó el test que antes aceptaba fallback.
- `completeBackup.test.mjs`: 7 pruebas; cuatro colecciones de 1201 documentos, vacíos, límites exactos, fallos parciales, IDs duplicados, conteos inválidos y cambios concurrentes.
- `firestoreRules.integration.mjs`: 12 pruebas con emuladores reales de Firestore y Auth; usuario/admin/superadmin, acceso directo permitido/denegado, revocación de rol con contexto existente, correos desactivados, exportación real paginada de 206 clientes y 205 documentos por cada otra colección, login inválido/válido, API sin permiso, token expirado, cuenta disabled y logout.

Se probaron reglas reales, no una copia JavaScript de las reglas. Proyecto `demo-comunicate`, Firestore 127.0.0.1:8085, Auth 127.0.0.1:9095; guardas abortan fuera de esos endpoints. Solo fixtures sintéticos en emulador; limpieza/escrituras nunca apuntaron a producción. Los emuladores se detienen al terminar.

| Validación final | Resultado |
|---|---|
| npm run verify | VERIFICADO, exit 0 |
| npm test (dentro de verify) | VERIFICADO: 181/181, cero fallos/omitidos |
| npm run lint (dentro de verify) | VERIFICADO: cero errores, seis warnings preexistentes |
| npm run build (dentro de verify) | VERIFICADO: 2177 módulos, 42.31s en este run |
| npm run test:rules después de actualizaciones | VERIFICADO: 12/12, exit 0 |
| npm ls --depth=0 | VERIFICADO: exit 0 |
| Typecheck | NO APLICA: no existe script ni TypeScript |
| Smoke HTTP local final | VERIFICADO: frontend 200; nueve rutas 401 y portal público 400; CORS permitido/ajeno |

`npm run verify` no incluye los emuladores: el control adicional explícito es test:rules. No se afirma que 193 pruebas automaticen toda la UI o todos los flujos productivos.

## Vulnerabilidades antes
Auditoría inicial (audit-before.json): 16 entradas, 13 HIGH, 2 moderate, 1 LOW, 0 CRITICAL. El resultado es un conteo de entradas npm audit que puede incluir propagación por ancestros; no son necesariamente 16 defectos independientes explotables. Agregar la librería de pruebas produjo una entrada heredada adicional intermedia; se eliminó al corregir grpc.

Antes de mutar dependencias se hizo dry-run. `npm audit fix --ignore-scripts` aplicó actualizaciones compatibles sin force. Npm no resolvió la copia grpc antigua anclada por Firestore a ~1.9.0; se añadió override explícito `@grpc/grpc-js: 1.14.5`, manteniendo major 1. Es una excepción al rango minor del proveedor, con riesgo de compatibilidad acotado que se verificó con Auth/Firestore emulados y suite completa. No se afirma compatibilidad con todas las posibles operaciones Firestore no probadas.

| Paquete | Severidad inicial | Tipo | Versión antes → después | Actualización y riesgo |
|---|---|---|---|---|
| @fastify/busboy | HIGH | Transitiva | 3.2.0 → 3.2.2 | Patch compatible; baja probabilidad de ruptura, pruebas pasan |
| @firebase/firestore | HIGH heredada | Transitiva | 4.17.0 → 4.17.2 | Patch vía Firebase; corregida cadena grpc |
| @firebase/firestore-compat | HIGH heredada | Transitiva | 0.4.12 → 0.4.14 | Patch, sin cambio de minor 0.x |
| @grpc/grpc-js | HIGH | Transitiva | 1.9.16 y 1.14.4 → 1.14.5 | Override mismo major; tests Firestore/SDK pasan, ver riesgo arriba |
| @humanfs/node | moderate | Transitiva dev | 0.16.7 → 0.16.8 | Patch; lint pasa |
| brace-expansion | HIGH | Transitiva | 1.1.18 → 1.1.21 | Patch compatible |
| braces | HIGH | Transitiva dev | 3.0.3 → 3.0.3 | Sin parche compatible identificado; audit propone migración Tailwind 4, riesgo alto |
| chokidar | HIGH heredada | Transitiva dev | 3.6.0 → 3.6.0 | Sigue heredando braces; no forzar cambio major |
| dompurify | LOW | Transitiva | 3.4.13 → 3.4.16 | Patch; build/pruebas pasan; PDF visual queda pendiente |
| fast-glob | HIGH heredada | Transitiva dev | 3.3.3 → 3.3.3 | Sigue heredando micromatch/braces; fixAvailable genérico no garantiza resolver sin migrar |
| firebase | HIGH heredada | Directa runtime | 12.17.1 → 12.19.0 | Minor dentro de ^12; APIs probadas con emuladores |
| js-yaml | HIGH | Transitiva dev | 4.3.1 → 4.3.2 | Patch compatible |
| micromatch | HIGH heredada | Transitiva dev | 4.0.8 → 4.0.8 | Sin parche compatible de braces identificado |
| postcss-selector-parser | moderate | Transitiva dev | 6.1.2 → 6.1.4 | Persiste alerta; patch corregido 7.1.6 implica cambio major 6→7 y proveedor Tailwind4 |
| source-map-js | HIGH | Transitiva | 1.2.1 → 1.2.2 | Patch compatible |
| tailwindcss | HIGH heredada | Directa dev | 3.4.19 → 3.4.19 | Solución propuesta 4.3.3; breaking change, no aplicada |

## Vulnerabilidades después

- Auditoría completa: **7 entradas: 5 HIGH y 2 moderate**, cero LOW/CRITICAL. `npm audit` retorna 1: el control de seguridad total sigue FALLÓ.
- `npm audit --omit=dev`: **0 alertas**, exit 0. No constituye certificación de seguridad ni elimina el riesgo del build.
- HIGH pendientes: braces, chokidar, fast-glob, micromatch, tailwindcss. moderate: postcss-selector-parser y postcss-nested (entrada heredada adicional).
- Mitigación actual: cadenas restantes son herramientas de desarrollo/build; evitar patrones/selectores y cambios de configuración de fuentes no confiables. No se demostró explotación en runtime. No se aplicaron overrides de major ni downgrade Firebase 12→9 sugerido por audit.
- Se añadió únicamente la dependencia de pruebas `@firebase/rules-unit-testing` 5.0.2 (peer Firebase ^12, Node >=20), no otro backend ni librerías comerciales nuevas.

Evidencia reproducible: audit-before.json, audit-after-safe-update.json (12 entradas intermedias), audit-after.json (7 finales), audit-production.json, dependency-comparison.json, dependencies.txt y logs de instalación. No se ejecutó audit fix --force.

## Backend remoto

El usuario identificó `https://comunicate-registros-v2.netlify.app` como sitio activo. Se descargó su HTML y bundle público `/assets/index-DzFP0IWD.js`. Análisis de AST muestra base de backend vacía (variable is, string vacío y replace), seguida de `/api/${nombre}`: URL efectiva **https://comunicate-registros-v2.netlify.app/api/**, mismo origen. La evidencia guarda hash SHA-256 y estructura relevante, no bundle ni credenciales.

| Request sin sesión | Resultado | Estado |
|---|---|---|
| GET / | 200 HTML | VERIFICADA entrega, no render UI |
| POST /api/registros | 401 JSON | VERIFICADO rechazo sin sesión |
| POST /api/reniec | 401 JSON | VERIFICADO rechazo sin sesión |
| POST /api/usuarios | 404 HTML | FALLÓ disponibilidad de esa función |
| POST /.netlify/functions/usuarios | 404 HTML | Función no publicada; no solo redirect faltante |
| GET /api/health | 200 HTML | NO es healthcheck; fallback SPA |

Se repitieron requests que fallaron transitoriamente por red, sin token/body de negocio. No se cambió backend remoto ni configuración de proveedor. Las respuestas no demuestran conexión DB de esas funciones ni autenticación autorizada remota.

El frontend Firebase `comunicate-tacna.web.app` sirve otra versión: bundle `/assets/index-DukDfu43.js` usa Cloud Functions `https://us-central1-comunicate-tacna.cloudfunctions.net/consultarReniec` y `/analizarCajaGemini`; ambas respondieron 404 HTML. No es el backend de la app Netlify. Esta diferencia debe reconciliarse antes de publicar una release coherente; no se tocaron dominios, canonicales o despliegues fuera de alcance.

No se dispone de metadatos confiables que vinculen deploy remoto con commit local. No hay healthcheck dedicado en el repositorio; no se añadió nueva funcionalidad.

## CORS

Comprobado mediante OPTIONS real en `/api/registros` y `/api/reniec` de Netlify:

| ORIGIN | RESULTADO | CÓDIGO | OBSERVACIÓN |
|---|---|---|---|
| https://comunicate-registros-v2.netlify.app | VERIFICADO admitido | 204 | allow-origin exacto, Vary: Origin |
| https://comunicate-tacna.web.app | VERIFICADO admitido | 204 | allow-origin exacto, Vary: Origin |
| http://localhost:5173 | VERIFICADO admitido | 204 | Desarrollo admitido; sin wildcard |
| https://stabilization-invalid.example | VERIFICADO sin admisión CORS | 204 | Sin allow-origin; respuesta OPTIONS 204 por sí sola no concede acceso |
| Preview real de Netlify | NO VERIFICADO | — | No se identificó URL real; no se inventó deploy |

Métodos POST, OPTIONS; headers Content-Type, Authorization, X-Request-Id. No hay allow-origin * ni allow-credentials true en las respuestas observadas. En usuarios todos los OPTIONS son 404, porque la función no existe en ese deploy. No se corrigió CORS de rutas sanas ni se intentó arreglar un 404 mediante allowlist.

Código local usa URL/DEPLOY_PRIME_URL para el propio deployment; esto no prueba un preview real ni que la API principal admita cualquier preview. Esa verificación sigue pendiente con URL de preview autorizada.

## Autenticación

| Caso | Evidencia | Estado |
|---|---|---|
| Login válido/inválido | Auth emulator, identidad sintética email/password | VERIFICADO en integración; Google OAuth real NO VERIFICADO |
| Usuario/rol desactivado | Reglas y API con fixture disabled, incluyendo correos antiguos | VERIFICADO en emuladores y tests |
| Rol sin permisos | Usuario→admin bloqueado, admin→superadmin bloqueado en reglas | VERIFICADO |
| Acceso directo a ruta/dato protegido | Pipeline API + consultas directas a Firestore | VERIFICADO en integración; navegación UI real NO VERIFICADA |
| Sesión expirada | Token con exp vencido en Auth emulator + verifier tests | VERIFICADO rechazo emulado; no prueba criptografía de tokens productivos |
| Cuenta Firebase disabled / token revocado | Admin/Auth emulator + tests verifier | VERIFICADO rechazo; prueba de token revocado con mock, no revocación de usuario real |
| Logout | signOut emulado deja currentUser null; API sin token rechaza | VERIFICADO SDK/integración; botón UI real NO VERIFICADO |
| API sin autenticación | Netlify registros/reniec 401 JSON y smoke local | VERIFICADO |

Intento de navegador integrado para Netlify falló al adjuntar webview (~22s), sin pantalla. No se marcaron pruebas visuales o Google Login como completadas. No se utilizaron tokens reales, credenciales de usuarios ni se aceptaron términos de cuentas.

## Riesgos restantes

1. Preparar autorizaciones explícitas antes de despliegue para evitar bloqueo total; sin bypass por email.
2. Siete alertas de desarrollo y override minor grpc que requieren seguimiento ante actualizaciones de Firebase.
3. `usuarios` no está desplegada, reglas productivas no actualizadas por esta fase y dos sitios sirven versiones distintas.
4. Backup operativo no es snapshot transaccional ni exportación de toda Firestore; mantener ventanas sin escrituras y un backup administrativo separado para recuperación integral.
5. BUG-006/008 y warnings de lint preexistentes permanecen; no se ampliaron refactors.

## Pendientes
- Verificar/preparar documentos de rol bajo control administrativo antes de una release autorizada.
- Desplegar código/reglas de forma coordinada solo tras autorización futura; esta solicitud prohíbe despliegue/push.
- Completar Google OAuth, persistencia de sesión y logout UI con usuario autorizado, preview real y verificación del commit desplegado.
- Revisar migración Tailwind4 en fase propia con comprobación visual; no forzar breaking changes.
- Prueba visual de descarga del backup con datos de prueba y recuperación integral fuera de producción.

## Recomendación para siguiente fase
**NO está listo para continuar con funcionalidades del roadmap.** La corrección local prioritaria está probada, pero quedan alertas y requisitos de release/autenticación remota. Primero resolver esos pendientes, después abrir cambios de producto.

## Comandos y reproducibilidad

Principales comandos ejecutados:
```powershell
git status --short
git branch --show-current
git log --oneline -5
npm audit --json > docs/stabilization-evidence/audit-before.json
npm audit fix --dry-run --json
npm install --save-dev @firebase/rules-unit-testing@5.0.2 --ignore-scripts
node --test netlify/tests/authorization.test.mjs netlify/tests/completeBackup.test.mjs netlify/tests/roles.test.mjs
npm run test:rules
npm audit fix --ignore-scripts
npm pkg set 'overrides.@grpc/grpc-js=1.14.5'
npm install --ignore-scripts
npm run verify
npm run test:rules
npm audit --json > docs/stabilization-evidence/audit-after.json
npm audit --omit=dev --json > docs/stabilization-evidence/audit-production.json
npm ls --depth=0
node scripts/baseline-smoke.mjs
node scripts/verify-remote-backend.mjs
node scripts/verify-remote-backend.mjs https://comunicate-registros-v2.netlify.app
node --check scripts/verify-remote-backend.mjs
git diff --check
```

Dry-run produjo texto de acciones antes del JSON; se guardó como audit-dry-run.log. Los intentos de parsearlo inicialmente como JSON fallaron sin alterar dependencias. Los códigos no cero de audit son alertas, no build fallido. Las lecturas de archivos/AST guardaron solo estructura y versiones seguras. Audits no realizaron migraciones ni cambios de datos.

Prerrequisitos del harness: Firebase CLI 15.17.0 y Java 21. En esta máquina solo había Java 7; se descargó Temurin JRE 21.0.12.1+1 portátil desde Adoptium, se verificó checksum SHA-256 (`d35f31e712f0fcf6ac5a093edc90204fbff22f720ba3950bd09d331d5e621636`) y se usó PATH/JAVA_HOME exclusivamente en el proceso de pruebas, sin modificar configuración global. Firebase CLI descargó Firestore emulator 1.21.0.

Para repetir aquí:
```powershell
$javaRuntimeDir = Get-ChildItem -LiteralPath "$env:USERPROFILE/.codex/tools/stabilization-java" -Directory -Filter 'jdk*' | Select-Object -First 1
$env:JAVA_HOME = $javaRuntimeDir.FullName
$env:PATH = (Join-Path $javaRuntimeDir.FullName 'bin') + ';' + $env:PATH
npm run test:rules
```

Referencias oficiales consultadas para el harness: [Firebase Rules unit tests](https://firebase.google.com/docs/rules/unit-tests), [Adoptium portable archives y checksums](https://adoptium.net/installation/archives). Versiones/dependencias se comprobaron con npm view y los lockfiles; no se asumió ausencia de breaking changes por el nombre del paquete.

Ver [stabilization-evidence](stabilization-evidence/) para logs, requests, auditorías y comparación. Commit documental final se obtiene con `git log -1 --format=%H`, evitando referencia circular. No hubo push, deploy ni modificaciones de datos/secretos reales.

Los logs versionados conservan resultados y timestamps; se normalizaron saltos de línea y espacios finales para que git diff --check no reporte formato de salida de las herramientas. El control de coincidencias de secretos locales devolvió cero.
