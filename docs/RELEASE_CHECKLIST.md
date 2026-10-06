# Checklist de release — NO autorizado para ejecución

Estado actualizado: migración aplicada anteriormente; dos asignaciones activas y dos administradores válidos, incluido un superadmin. Esta lista describe una release futura. Ver FINAL_RELEASE_PRECHECK_REPORT y FINAL_RELEASE_MANUAL_CHECKS para la evidencia final y pendientes. No se ejecutó push/deploy.

## PRE-DEPLOY

- [x] Backup Git disponible: bundle de baseline y commit aabd2bd; ver ROLLBACK_PLAN.
- [ ] Backup Firestore administrativo disponible y restauración ensayada, incluyendo userRoles/configuración/auditoría/subcolecciones. El JSON de cuatro colecciones operativas no basta.
- [ ] Tests PASS en la revisión final aprobada.
- [ ] Integración PASS: `npm run test:rules`, JRE 21 portable documentado en STABILIZATION_REPORT.
- [ ] Build PASS: `npm run verify`.
- [ ] Artefactos Netlify locales regenerados y comprobados en la misma revisión.
- [ ] Release precheck YES: `npm run release:precheck`; exit 0 = YES, 1 = NO, 2 = CONDITIONAL. CONDITIONAL conserva pendientes manuales y no autoriza deploy.
- [ ] Administrador activo confirmado y superadmin disponible para gestión/recuperación.
- [ ] Roles activos confirmados; U-003/U-006 conservan acceso; exclusiones revisadas.
- [ ] Firestore Rules verificadas en emuladores y comparación con política productiva actual revisada.
- [ ] Variables de producción verificadas por nombre/contexto/scope en Netlify; lista exacta en FINAL_RELEASE_MANUAL_CHECKS. No publicar valores ni inferir configuración remota desde `.env`.
- [ ] VITE_BACKEND_BASE_URL vacío/same-origin, o backend explícito validado con CORS; dominio principal comunicate-registros-v2.netlify.app y dominios Google autorizados comprobados.
- [ ] Versiones Node build/runtime de Netlify comprobadas; empaquetado local usa Node 22. `.env` local no demuestra variables del hosting.
- [ ] IDs del último deploy exitoso Netlify y ruleset anterior guardados; backups y credenciales de recuperación accesibles al operador.
- [ ] MANUAL TEST REQUIRED: Google login/logout/persistencia/revocación/recuperación en entorno controlado; requisitos detallados en RELEASE_READINESS.
- [ ] Autorización explícita de push/deploy recibida después de revisar estos resultados.

### Reproducir empaquetado local (sin deploy)

Netlify usa [zip-it-and-ship-it](https://github.com/netlify/build/tree/main/packages/zip-it-and-ship-it) para empaquetar funciones. Se usó 16.3.0 instalado fuera del repositorio; no se modificó la cadena de dependencias de la app.

```powershell
$releasePackagerDir = Join-Path $env:TEMP 'comunicate-release-packager-16.3.0'
npm install --prefix $releasePackagerDir --no-save --ignore-scripts @netlify/zip-it-and-ship-it@16.3.0
npm run release:package -- (Join-Path $releasePackagerDir 'node_modules/@netlify/zip-it-and-ship-it/dist/main.js')
npm run release:precheck
```

ZIPs y manifest local: `.netlify/release-artifacts` (ignorado por Git). Frontend: `dist`. Vite no genera los ZIP de funciones; ambos artefactos se requieren. El precheck compara ZIP usuarios y hashes de fuentes/dependencias/configuración para rechazar evidencia obsoleta. No verifica credenciales por requests productivos autenticados: rate limiting podría escribir.

Para que los gates manuales pasen, el operador registra `.netlify/release-gates.json` (ignorado; sin secretos) tras comprobaciones reales. No generar constancias falsas. Es una declaración del operador, no una autorización de deploy ni prueba automática de servicios externos. `checkedAt` debe ser ISO UTC de menos de 24 horas; `packageSha256` hash de package-lock.json y `rulesSha256` hash de firestore.rules. Cada propiedad `productionEnvironment`, `googleAuth`, `productionRollback` debe contener `{ "verified": true, "evidence": "<referencia privada al resultado real>" }`. Sin archivo, evidencia, vigencia o hashes coincidentes el resultado queda MANUAL REQUIRED/CONDITIONAL, salvo fallo técnico o manual confirmado. El backup completo se genera con `npm run release:backup` y se comprueba automáticamente por scope/conteos/hash/vigencia; la restauración sigue necesitando ensayo aislado.

## DEPLOY (solo tras autorización)

Orden condicionado a autorizaciones de datos ya migradas y probadas:

1. Confirmar migración y backup/rollback; regenerar artefactos del commit aprobado; revalidar todos los gates. Si cero administradores o alguien pierde acceso involuntariamente, detenerse.
2. Publicar frontend y funciones/API **en un único deploy Netlify del mismo commit**, de manera atómica. La API nueva exige roles activos inmediatamente; por eso la migración va antes. Validar `/api/usuarios` y sesiones con las reglas aún anteriores. No publicar frontend aisladamente ni mezclar una API vieja sin usuarios con UI nueva.
3. Publicar Firestore Rules nuevas solo después del gate anterior, confirmar versión/hash/reglas y ejecutar post-deploy. Las reglas antiguas conservan bypass durante esa ventana; limitarla y cerrar rápidamente. Si falla la API/admin, abortar el cambio de Rules y seguir rollback revisado.

- [ ] Deploy frontend (paso 2, mismo release que API).
- [ ] Deploy funciones/API (paso 2).
- [ ] Deploy Firestore Rules (paso 3).
- [ ] Confirmar versión publicada: commit/deploy ID frontend + funciones, ruleset ID/hash y dominio esperado. No inferirla por un HTTP 200 de SPA.

## POST-DEPLOY

- [ ] Login Google (cuenta autorizada; popup/domain).
- [ ] Sesión persistente tras recarga y reapertura.
- [ ] Logout y navegación atrás sin recuperar acceso.
- [ ] Usuario activo con permisos esperados.
- [ ] Usuario desactivado: nuevas lecturas/API denegadas con sesión abierta.
- [ ] Roles: usuario/admin/superadmin, ausencia y rol inválido denegados; recuperación autorizada.
- [ ] `/api/usuarios`: `me` correcto; list/save/delete solo superadmin; sin auth 401 JSON (sin realizar cambios reales no aprobados).
- [ ] `/api/registros`: autorización, errores y respuestas JSON.
- [ ] RENIEC: consulta autorizada, errores controlados, CORS.
- [ ] Crear registro usando fixture aprobado sin afectar datos reales.
- [ ] Editar registro de prueba y comprobar consistencia.
- [ ] Backup: conteos completos de cuatro colecciones, sin archivo parcial ante fallo.
- [ ] Generación PDF y datos de prueba correctos.
- [ ] Navegación móvil.
- [ ] Consola sin errores críticos y logs sin datos sensibles.

Si falla acceso administrativo, permisos o integridad, detener pruebas que escriban; seguir ROLLBACK_PLAN. Ninguna prueba post-deploy está ejecutada en esta fase.
