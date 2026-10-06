# Release readiness — BLOQUEADA

Auditoría de solo lectura, 2026-10-06 UTC, rama `chore/baseline-stabilization`, inicio `32301d6`. **READY TO DEPLOY: NO**.

## Bloqueo documentado antes de preparar un despliegue

Firebase `comunicate-tacna`: 7 identidades Auth, todas habilitadas; 5 con email verificado y 2 sin verificar. La colección `artifacts/comunicate-pos/users/shared/userRoles` contiene **0 documentos**. Administradores válidos: **0**; superadministradores válidos: **0**. Las nuevas reglas y API bloquearían a las 7 identidades. La comparación posterior con la política publicada confirma **2 riesgos de lockout (U-003/U-006)** y 5 cuentas que requieren revisión/corrección. No se ha confirmado quién utiliza actualmente una sesión productiva.

Se detiene la preparación operativa de despliegue. Solo continúan el precheck, pruebas locales y documentación expresamente solicitados. No se ejecutan push, deploy, migración ni escrituras productivas.

Las reglas productivas se leyeron mediante Firebase Rules API: ruleset `6823ec22-3aec-4c10-a7c7-bc48678fe86c`, SHA-256 `4ea7dd18938b5762e5aac9629d3361ae1fbc92595c7edc8dbf3c18538c2e80e5`. Difieren de las locales y de aabd2bd. Usan únicamente una allowlist de dos correos verificados para lectura compartida; el reporte anonimiza las identidades. No se han publicado allowlists ni credenciales.

## Usuarios, roles y seguridad

Tabla por identidad, permisos y cambios exactos: [AUTHORIZATION_MIGRATION.md](AUTHORIZATION_MIGRATION.md). No se asigna automáticamente ningún rol. El primer superadmin requiere bootstrap administrativo aprobado porque la nueva API ya exige un superadmin existente. Auth.disabled y userRoles.status son controles distintos. Para bloquear inmediatamente lecturas directas de una sesión existente, desactivar también la asignación: Rules no consulta Auth.disabled en cada request; los ID tokens ya emitidos pueden seguir vigentes hasta caducar. La API sí comprueba revocación/desactivación con verifyIdToken(token, true).

Firestore Rules: VERIFICADO en emuladores para active, disabled, ausencia de documento/estado, rol desconocido, no autenticado, email no verificado, usuario sin permiso administrativo, admin, superadmin, recuperación con el mismo contexto y email/rol no canónicos. No hay catálogo independiente de rol activo. El evaluador del precheck modela la intersección de login/API/Rules, no reemplaza las pruebas del motor real. Reconoce políticas publicadas conocidas por fingerprint/equivalencia; una política desconocida falla cerrada.

## API usuarios y artefactos

VERIFICADO localmente: función usuarios.mjs, export handler, diez redirects anteriores al fallback SPA, esbuild en netlify.toml, firebase-admin declarado y imports/dependencias empaquetados. `release:package` utiliza el empaquetador oficial fijado @netlify/zip-it-and-ship-it 16.3.0, instalado temporalmente fuera del proyecto. Se generaron ZIPs locales, incluido `.netlify/release-artifacts/usuarios.zip`; manifest relaciona su hash con 922 inputs y los archivos de fuentes/configuración/dependencias.

El ZIP se extrajo en una carpeta temporal y se cargó su handler real: POST `me` sin bearer devolvió **401 JSON**, sin inicializar autenticación ni efectuar requests/escrituras de datos. Evidencia: [artifact-smoke.json](release-evidence/artifact-smoke.json), [packaging.json](release-evidence/packaging.json). Ningún archivo de credenciales/env ni ninguno de los siete paquetes vulnerables apareció en inputs de usuarios. Los ZIPs son locales/ignorados, no se publicaron ni se sometieron a API productiva.

El empaquetador también produce ZIPs para módulos auxiliares; los diez handlers públicos son los de redirects. Debe confirmarse el inventario final del build de Netlify. Hubo warning de import.meta en branding.js al generar CommonJS: APP_VERSION usa fallback de versión; no rompió el handler usuarios. Runtime/build Node del hosting pendientes de comprobación; empaquetado simulado con Node 22 y carga ejecutada con Node local 24.14.0. No se afirma haber probado ejecución Lambda Node 22.

La versión remota anterior no se volvió a consultar, conforme a la solicitud. El 404 conocido de `/api/usuarios` se resuelve solo al publicar posteriormente una release completa y validada. Estado del flujo productivo: **NO VERIFICADA**; artefacto/contrato sin autenticación local: **VERIFICADO**.

## Google Auth — revisión estática

| Aspecto | Resultado y límite |
|---|---|
| Login | LoginScreen usa GoogleAuthProvider/signInWithPopup y aceptación legal; errores muestran mensaje y cierran sesión salvo popup cancelado. Consentimiento legal llama API y necesita autorización; no es comprobación de solo lectura productiva. |
| Persistencia | getAuth usa persistencia browser predeterminada del SDK instalado (IndexedDB/local/session según disponibilidad); no hay setPersistence personalizado. Debe comprobarse en navegador real, incluidos restricciones de almacenamiento. |
| Logout | Menú llama signOut; onAuthStateChanged limpia usuario. Hay posible carrera: respuesta antigua de obtenerSesionUsuario puede completar tras logout/cambio de cuenta porque el callback async no tiene generación/cancelación. No se reprodujo en navegador ni se modificó producto en esta fase. |
| Token expirado | functionsClient usa getIdToken, que refresca vía SDK; backend verifica token/revocación. El emulador prueba rechazo 401 de token expirado; no certifica popup/refresh de Google real. |
| Sin documento / identidad inexistente | me deniega 403 si falta asignación; el callback muestra error y signOut. Identity inexistente/invalidada es rechazada por verificación del backend. |
| Desactivación después de login | API y Rules reconsultan asignación; emulador confirma revocación con contexto existente. UI conserva perfil anterior hasta evento auth/recarga y puede mostrar controles obsoletos; la seguridad efectiva permanece en API/Rules. |
| Recuperación de permisos | Emulador confirma que active nuevamente permite el contexto. UI necesita recarga o relogin para refrescar perfil; no hay suscripción realtime a userRoles. |

**MANUAL TEST REQUIRED**: Google popup/cancelación/dominio autorizado; usuario sin rol; logout rápido mientras me está pendiente y cambio rápido de cuenta; recarga/reapertura/pestañas múltiples; token auto-refresh; desactivación con sesión abierta y recuperación; estados/toasts en móvil; proveedor Google y dominios en consola. No se cambiaron proveedores, secretos ni configuración de autenticación productiva. Firebasebrowser del SDK se revisó en node_modules/@firebase/auth/dist/esm/index-4NFEPWkC.js, getAuth/persistencia y getIdToken.

## Validación ejecutada

| Control | Resultado |
|---|---|
| npm run verify | PASS, exit 0 |
| Tests | 184/184, 0 fallos/omitidos |
| Integración npm run test:rules | 14/14, exit 0; proyecto demo-comunicate exclusivamente |
| Lint | 0 errores, 6 warnings preexistentes |
| Build | PASS, 2178 módulos, 41.80s en verify |
| Typecheck | NO APLICA, script ausente |
| npm run release:precheck | **FAIL esperado, exit 1; READY FOR RELEASE: NO** |
| npm audit --omit=dev | **0 vulnerabilities**, exit 0 |
| Auditoría completa | 7 entradas: 5 HIGH, 2 moderate; exit 1 esperado |
| Handler del ZIP usuarios | 401 JSON sin credenciales, PASS |

El precheck repite tests/build y lee Firebase; no utiliza handlers con tokens reales ni modifica datos. PASS: conexión, cinco identidades habilitadas/verificadas, env locales por presencia, routing/permisos, artefacto, tests y build. FAIL: roles activos, admin, superadmin, conservación de acceso de dos cuentas y constancias operativas pendientes. Variables locales no prueban variables Netlify. Gate manual registrado por operador y vigente, no equivale a autorización de deploy.

Logs y reportes: [verify.log](release-evidence/verify.log), [integration.log](release-evidence/integration.log), [precheck.log](release-evidence/precheck.log), [authorization.json](release-evidence/authorization.json), [audit-production.json](release-evidence/audit-production.json), [audit-full.json](release-evidence/audit-full.json). Los scripts realizan únicamente lecturas productivas; los tests escriben fixtures en emulador y los builds generan archivos locales.

## Vulnerabilidades de desarrollo — deuda NO bloqueante

Según audit omit=dev=0 y el árbol conocido de Tailwind; no hubo migración mayor ni actualización de dependencias en esta fase. Las siete entradas incluyen propagación, no siete defectos independientes.

| Paquete | Severidad npm | Motivo / cadena |
|---|---|---|
| braces | HIGH | Agotamiento de stack por patrones anidados; herramientas de glob |
| chokidar | HIGH | Propagada desde braces |
| micromatch | HIGH | Propagada desde braces |
| fast-glob | HIGH | Propagada desde micromatch |
| tailwindcss 3.4.19 | HIGH | Ancestro de las herramientas de desarrollo afectadas |
| postcss-selector-parser | moderate | Complejidad cuadrática al analizar selectores |
| postcss-nested | moderate | Propagada desde postcss-selector-parser |

Detalle/advisories en audit-full.json; las dos alertas raíz son [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) y [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf). No se encontró evidencia de inclusión en runtime usuarios; frontend usa Tailwind/PostCSS en compilación de CSS. El empaquetador temporal tiene su propio árbol, fuera de las dependencias del proyecto, y no se sube como runtime. Mantener seguimiento de la deuda y evitar procesar patrones/estilos arbitrarios no confiables en CI; no bloquea esta release por sí sola conforme al criterio solicitado.

## Orden condicional y rollback

1. Obtener aprobación separada para migración, conservar backup administrativo y ejecutar solo asignaciones aprobadas; confirmar al menos un admin y un superadmin, y cero pérdida involuntaria de acceso. Sin ello no avanzar.
2. Tras precheck/controles/manuales PASS y autorización explícita, publicar frontend + funciones del mismo commit en un deploy Netlify atómico. Validar admin/API antes de Rules.
3. Publicar Rules nuevas y comprobar versiones, permisos y checklist post-deploy; ante incidente aplicar combinación de rollback revisada, sin reabrir bypass.

Checklist completo: [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). Recuperación exacta de fuente aabd2bd, Netlify y Rules por separado: [ROLLBACK_PLAN.md](ROLLBACK_PLAN.md). Código Git recuperable: YES. Rollback productivo completo verificado: NO (faltan deploy ID y backup administrativo/retención de ruleset). No se ejecutó recuperación.

## Riesgos restantes y cierre

Bloqueante principal: faltan todas las asignaciones explícitas, especialmente las dos identidades que hoy pueden leer y el superadmin para bootstrap. Pendientes: backup completo y restauración, variables/runtime/dominios productivos, Google y UI manual, versiones productivas trazables. Posible carrera auth/UI y perfil obsoleto documentados; requieren prueba manual antes de release. BUG-006 (MIME logo), BUG-007 (guía histórica) y BUG-008 (mutación/auditoría no atómica) permanecen como en baseline; no se ocultaron ni se implementó roadmap.

**RELEASE READINESS — COMPLETADO; READY TO DEPLOY: NO.** Se completó diagnóstico/documentación/precheck/pruebas sin producción mutada, push ni deploy. La fase detectó y preservó el bloqueo antes de cualquier preparación operativa de publicación. Commit inicial completo: `32301d6df7bef7f0a13aee1ea8513ef5bc3a5619`; el commit que incorpora este informe identifica el cierre local de readiness.
