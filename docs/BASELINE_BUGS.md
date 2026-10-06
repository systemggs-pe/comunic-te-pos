# Baseline Bugs

Fecha: 2026-10-05 (America/Lima)
Branch: `chore/baseline-stabilization`
Commit previo: `95fdced`; commit de respaldo/base: `b2088dd95b34b19ed4038b2fde6ddcda9a22369c`.

Todos los hallazgos estaban presentes en el estado recibido, incluyendo cambios locales anteriores a esta fase. Las correcciones locales no están desplegadas. Severidades: CRITICAL, HIGH, MEDIUM, LOW.

| ID | Área | Bug | Severidad | Cómo reproducir / evidencia | Estado |
|---|---|---|---|---|---|
| BUG-001 | Deployment/auth | Falta redirección `/api/usuarios` en Netlify. El login pide esa ruta y el fallback SPA entrega HTML. | HIGH | Comparar `obtenerSesionUsuario` en `src/services/functionsClient.js`, su uso en `src/app/App.jsx`, la ruta local y el `netlify.toml` del tag baseline. | CORREGIDO LOCALMENTE; test de paridad de las 10 rutas pasa. Producción pendiente. |
| BUG-002 | Herramientas | El evaluador resuelve el modelo contra cwd con el prefijo del paquete duplicado. | LOW | `npm run evaluate --prefix packages/local-field-verifier` falló con ENOENT en `packages/local-field-verifier/packages/local-field-verifier/models/model.json`. | CORREGIDO LOCALMENTE; evaluaciones con dataset explícito pasan desde raíz y paquete. |
| BUG-003 | Seguridad/reglas | Los correos fijos evitan el control de estado de `userRoles`; desactivar o degradar un correo fijo no elimina su acceso directo a Firestore ni sus permisos fijos. | HIGH | `firestore.rules`, funciones `isAllowedUser`, `isAdmin`, `isSuperadmin`: condición OR con correo fijo independiente de `status`. Contrastar con `resolveUserAccess` del backend, que sí rechaza un documento disabled. Escenario: token verificado del correo fijo + rol disabled sigue satisfaciendo las reglas por correo. | PENDIENTE. Evidencia estática inequívoca; no se modificaron reglas sensibles ni se ejecutó el escenario sobre producción. |
| BUG-004 | Backup de datos | El respaldo denominado completo incluye solo clientes/equipos cargados, limitados a 200 por suscripción y dependientes del módulo abierto. | HIGH | `src/app/App.jsx`: `REFERENCE_DATA_LIMIT = 200`, `referenceQuery`, `descargarRespaldoCompleto` pagina únicamente registros y ventas; exporta arrays de clientes/equipos en memoria. Con más de 200 o sin cargar el módulo, el backup omite datos. | PENDIENTE. Evidencia de código; no se exportaron datos personales. |
| BUG-005 | Dependencias | Auditoría de dependencias reporta 16 entradas vulnerables: 13 HIGH, 2 moderate, 1 LOW, 0 CRITICAL. | HIGH | `npm audit --json`; evidencia completa en `baseline-evidence/npm-audit.json`. Incluye Firebase/grpc y Tailwind/globs, entre otras cadenas. | PENDIENTE. No implica explotación demostrada. No se aplicó audit fix; propone cambios mayores para algunas dependencias. |
| BUG-006 | Logo/archivos | El selector acepta cualquier `image/*`, incluyendo SVG/GIF; las reglas aceptan únicamente PNG/JPEG/JPG/WebP. | MEDIUM | `ConfiguracionLogo.jsx` valida `file.type.startsWith('image/')`; `firestore.rules:validLogo` restringe MIME. Una imagen SVG/GIF inferior a 650KB pasa validación frontend y falla al persistir. | PENDIENTE. Contrato incompatible confirmado en código; no se subieron archivos a producción. |
| BUG-007 | Documentación | La guía de deployment afirma que no existe script test y que no hay logs estructurados, aunque ambos existen. | LOW | Comparar `docs/enterprise/deployment-devops.md` con `package.json` y `_observability.mjs`. | REGISTRADO. Este baseline establece la información actual; la guía histórica no se reescribió. |
| BUG-008 | Auditoría | Guardado/eliminación de rol y cierre de solicitud existente se confirman antes del batch de auditoría. Si el batch falla, cambia el dato y falta el evento; la API informa error pese a haber persistido. | MEDIUM | `netlify/functions/usuarios.mjs:saveUser/deleteUser` y `solicitudesPublicas.mjs:completeExistingRequest`: `ref.set/delete` seguido de un batch independiente. Inspección estática del orden de operaciones. | PENDIENTE. Falta prueba de fallo inyectado en entorno aislado; no se provocaron fallos ni escrituras externas. |

## Observaciones que no se clasifican como bugs de negocio confirmados

- Las rutas `/api/*` de Firebase Hosting consultadas responden HTML. Es incompatible con el cliente si utiliza rutas relativas. No se confirmó la variable compilada del frontend publicado ni la URL de Netlify: no se afirma que el login real de producción esté roto.
- No existe healthcheck en el adaptador local; `/api/health` devuelve 404. En Firebase el fallback devuelve 200 HTML, que no demuestra salud de API/DB.
- Lint: seis advertencias en `RegistroForm.jsx` y `VentaForm.jsx`; no se demostró un fallo funcional ni se realizó un refactor.
- El evaluador sin `--input` necesita `training/data/corrections.json`, dataset local ignorado que no forma parte del repositorio. Usar el fixture versionado para reproducir esta fase.
