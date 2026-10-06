# Baseline Bugs

Fecha: 2026-10-05 (America/Lima)
Branch: `chore/baseline-stabilization`
Commit previo: `95fdced`; commit de respaldo/base: `b2088dd95b34b19ed4038b2fde6ddcda9a22369c`.

Todos los hallazgos estaban presentes en el estado recibido, incluyendo cambios locales anteriores a esta fase. Las correcciones locales no están desplegadas. Severidades: CRITICAL, HIGH, MEDIUM, LOW.

| ID | Área | Bug | Severidad | Cómo reproducir / evidencia | Estado |
|---|---|---|---|---|---|
| BUG-001 | Deployment/auth | Falta redirección `/api/usuarios` en Netlify. El login pide esa ruta y el fallback SPA entrega HTML. | HIGH | Comparar `obtenerSesionUsuario` en `src/services/functionsClient.js`, su uso en `src/app/App.jsx`, la ruta local y el `netlify.toml` del tag baseline. | RESUELTO. Commit a3e5f59; test baselineRouting pasa. No desplegado: función usuarios remota sigue 404. |
| BUG-002 | Herramientas | El evaluador resuelve el modelo contra cwd con el prefijo del paquete duplicado. | LOW | `npm run evaluate --prefix packages/local-field-verifier` falló con ENOENT en `packages/local-field-verifier/packages/local-field-verifier/models/model.json`. | RESUELTO. Commit a3e5f59; evaluaciones con fixture desde raíz y paquete pasan, evidencia baseline-evidence/evaluator.log. |
| BUG-003 | Seguridad/reglas | Los correos fijos evitan el control de estado de `userRoles`; desactivar o degradar un correo fijo no elimina su acceso directo a Firestore ni sus permisos fijos. | HIGH | Baseline: isAllowedUser/isAdmin/isSuperadmin tenían condiciones OR por email. La corrección exige userRoles válido y active en reglas/API/UI, sin fallback de email ni variables allowlist. | RESUELTO. Commit 3839484; authorization.test.mjs y roles.test.mjs; integración de reglas/Auth en 210b47c, 12/12 pasan. Evidencia stabilization-evidence/emulator-tests-after.log. NO desplegado; preparar roles explícitos antes de release. |
| BUG-004 | Backup de datos | El respaldo denominado completo incluye solo clientes/equipos cargados, limitados a 200 por suscripción y dependientes del módulo abierto. | HIGH | Ahora exportCompleteBackup lee clientes/equipos/registros/ventas del servidor por documentId, con paginación y comparación de conteos antes/después, sin estado React. | RESUELTO. Commit d9dc2f6; completeBackup.test.mjs (7 pruebas), 1201 documentos por colección en fixtures y consultas reales con 206/205 en emulador. Evidencia verify.log y emulator-tests-after.log. No es una exportación administrativa de toda Firestore. |
| BUG-005 | Dependencias | Auditoría de dependencias reporta 16 entradas vulnerables: 13 HIGH, 2 moderate, 1 LOW, 0 CRITICAL. | HIGH | Actualizaciones compatibles y override grpc-js 1.14.5: 16 → 7 entradas; omit=dev → 0. Sin force ni migración Tailwind v4. | MITIGADO, PENDIENTE resolución completa. Commit 210b47c; 5 HIGH y 2 moderate restantes en cadena Tailwind de desarrollo. Audit antes/después, comparación y verify/emuladores en stabilization-evidence/. |
| BUG-006 | Logo/archivos | El selector acepta cualquier `image/*`, incluyendo SVG/GIF; las reglas aceptan únicamente PNG/JPEG/JPG/WebP. | MEDIUM | `ConfiguracionLogo.jsx` valida `file.type.startsWith('image/')`; `firestore.rules:validLogo` restringe MIME. Una imagen SVG/GIF inferior a 650KB pasa validación frontend y falla al persistir. | PENDIENTE. Contrato incompatible confirmado en código; no se subieron archivos a producción. |
| BUG-007 | Documentación | La guía de deployment afirma que no existe script test y que no hay logs estructurados, aunque ambos existen. | LOW | Comparar `docs/enterprise/deployment-devops.md` con `package.json` y `_observability.mjs`. | REGISTRADO. Este baseline establece la información actual; la guía histórica no se reescribió. |
| BUG-008 | Auditoría | Guardado/eliminación de rol y cierre de solicitud existente se confirman antes del batch de auditoría. Si el batch falla, cambia el dato y falta el evento; la API informa error pese a haber persistido. | MEDIUM | `netlify/functions/usuarios.mjs:saveUser/deleteUser` y `solicitudesPublicas.mjs:completeExistingRequest`: `ref.set/delete` seguido de un batch independiente. Inspección estática del orden de operaciones. | PENDIENTE. Falta prueba de fallo inyectado en entorno aislado; no se provocaron fallos ni escrituras externas. |

## Observaciones que no se clasifican como bugs de negocio confirmados

- Las rutas `/api/*` de Firebase Hosting consultadas responden HTML. Es incompatible con el cliente si utiliza rutas relativas. No se confirmó la variable compilada del frontend publicado ni la URL de Netlify: no se afirma que el login real de producción esté roto.
- No existe healthcheck en el adaptador local; `/api/health` devuelve 404. En Firebase el fallback devuelve 200 HTML, que no demuestra salud de API/DB.
- Lint: seis advertencias en `RegistroForm.jsx` y `VentaForm.jsx`; no se demostró un fallo funcional ni se realizó un refactor.
- El evaluador sin `--input` necesita `training/data/corrections.json`, dataset local ignorado que no forma parte del repositorio. Usar el fixture versionado para reproducir esta fase.

## Actualización de estabilización — 2026-10-06

Ver [STABILIZATION_REPORT.md](STABILIZATION_REPORT.md) para alcance, commits, clasificación de dependencias y restricciones de despliegue. RESUELTO describe la rama local, no el estado publicado.

- Backend Netlify identificado con la URL aportada por el usuario: `https://comunicate-registros-v2.netlify.app`. Su bundle usa base vacía y `/api/*` del mismo origen; registros y RENIEC dan 401 JSON sin sesión. `usuarios` no está desplegada (404).
- CORS remoto en registros/RENIEC: Netlify principal, Firebase web.app y localhost admitidos por origen exacto; origen ajeno sin allow-origin. Preview real NO VERIFICADO.
- El frontend Firebase mantiene un bundle antiguo que llama a Cloud Functions consultarReniec/analizarCajaGemini (ambas 404). No usarlo como evidencia del backend Netlify actual.
- No se alteraron secretos, cuentas ni datos productivos. Las escrituras/limpieza de pruebas se limitaron a emuladores localhost con projectId demo-comunicate.
