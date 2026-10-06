# FINAL RELEASE PRECHECK — COMPLETADO

2026-10-06 UTC. Rama `chore/baseline-stabilization`; HEAD de inicio `0fbde0cdd9317139e3d3769f98065993d6a57f26`. Cambios locales sin commit, push ni deploy. Se completaron las comprobaciones solicitadas; **READY FOR DEPLOY: NO** por backup incompleto y lecturas Firestore bloqueadas por cuota. No se cambió producción, secretos, identidades, roles ni Rules. La migración no se repitió.

| Comprobación | Resultado |
| --- | --- |
| API USUARIOS ARTIFACT | PASS |
| BACKUP COMPLETO | FAIL — Firestore `8 RESOURCE_EXHAUSTED: Quota exceeded` |
| BACKUP TIMESTAMP | N/A: ningún backup completo nuevo certificado |
| NETLIFY VARIABLES | MANUAL REQUIRED |
| GOOGLE AUTH | MANUAL REQUIRED |
| ROLLBACK PRODUCTIVO | MANUAL REQUIRED |
| U-003 | Última lectura exitosa: superadmin / active; lectura directa final falló por cuota |
| U-006 | Última lectura exitosa: admin / active; lectura directa final falló por cuota |
| ADMIN VÁLIDO | Dos en última lectura exitosa; revalidación final bloqueada |
| LOCKOUT | Cero pérdidas por política en último precheck exitoso de autorización; disponibilidad de lecturas actualmente afectada por cuota |
| TESTS | PASS — 212/212 |
| INTEGRACIÓN | PASS — 14 Rules + 7 migración, fixtures aislados en demo-comunicate |
| LINT | PASS — cero errores, seis advertencias existentes |
| BUILD | PASS — 16.49 s en verify final |
| AUDIT PRODUCCIÓN | PASS — cero vulnerabilidades (`npm audit --omit=dev`) |
| TECHNICAL CHECKS | FAIL |
| MANUAL CHECKS | PENDING |
| RELEASE PRECHECK | FAIL — exit 1 |
| READY FOR DEPLOY | NO |

## Diagnóstico previo y artefacto regenerado

Se ejecutó el precheck antes de editar. El manifest generado el `2026-10-06T05:47:46.882Z` tenía una sola discrepancia: `package.json` esperaba SHA256 `de0ed32ac0af51137d83889bbfab720a78f5dc84fcadc3bc8ed0bb6223272138`, pero la revisión al inicio de esta fase tenía `856edebcd4cb16d0cf8935c5ac6578175004992efe819fc805a8306b11cfc43e`. Los comandos de preparación de autorizaciones habían cambiado package.json después del empaquetado. El ZIP mismo todavía coincidía con su hash; el mensaje previo no distinguía correctamente ese input obsoleto. [Evidencia previa](final-release-evidence/artifact-before.json).

Se regeneraron las Functions con `@netlify/zip-it-and-ship-it@16.3.0`, dirigido a Node 22, sin instalar dependencias nuevas en el proyecto ni publicar. Nuevo manifest: `2026-10-06T07:13:20.131Z`; package.json actual `71989734acc7ea8260616c0d27a03b2a5909727bdf39442701d408a190cca95f`. ZIP usuarios `e2cb14238ad9d6ce4943b96f3b88a09584770fec9bff6336fe926ddff8dafa76`; **922 inputs coincidentes**, imports/dependencias incluidos. Handler extraído y cargado con Node local: POST `me` sin bearer = **401 application/json**. No se hizo petición autenticada contra handlers productivos. [Artefacto](final-release-evidence/artifact-after.json), [empaquetado](final-release-evidence/packaging.json).

Los ZIPs y `dist` son locales/ignorados; runtime real de Netlify pendiente. El nuevo precheck detalla hashes discordantes y separa PASS/FAIL/MANUAL REQUIRED: exit 0 YES, exit 1 NO, exit 2 CONDITIONAL. Los pendientes manuales por sí solos ya no se presentan como fallos técnicos; un fallo real sí bloquea.

## Backup y bloqueo externo

Se ejecutó el exportador operativo implementado con adaptador Admin de solo lectura y un recorrido suplementario de todas las colecciones/subcolecciones. Se añadieron paginación, conteos iniciales/exportados/finales, descubrimiento bajo padres inexistentes, encoding tipado y checksum. La exportación no publica datos ni crea jobs/buckets ni documentos.

Los primeros intentos agotaron el plazo de cinco minutos. Al aumentar concurrencia se obtuvo un fallo real `8 RESOURCE_EXHAUSTED: Quota exceeded`; un intento diagnóstico confirmó el mismo código. Se detuvieron las lecturas pendientes. La configuración final vuelve a un máximo conservador de ocho lecturas de metadatos simultáneas y diez minutos de plazo; no se ejecutó otro backup tras confirmar agotamiento de cuota. Ninguna exportación parcial se certificó como completa ni se usó para pasar el precheck. [Fallo seguro](final-release-evidence/backup-failure.json).

No se identificó la cuota exacta, su ventana ni el horario de recuperación: revisar Firebase/Google Cloud Console, sin inferir que subir concurrencia soluciona el problema. El servicio documenta RESOURCE_EXHAUSTED como agotamiento de cuota/capacidad; no es evidencia de una asignación de rol incorrecta. [Referencia oficial](https://firebase.google.com/docs/firestore/use-rest-api?hl=en). No se cambió facturación, cuotas ni configuración remota.

La última lectura exitosa de identidades/documentos está fechada `2026-10-06T07:14:13.340Z`: U-003 superadmin activo, U-006 admin activo; ambas identidades habilitadas/verificadas, dos administradores, un superadmin, dos documentos userRoles. Otro precheck posterior también confirmó dos administradores y cero pérdidas de acceso por política. La lectura directa final de ambos documentos falló por el mismo código 8. El último precheck ya reporta Firebase FAIL y backup FAIL. No afirmar verificación fresca de permisos ni disponibilidad del servicio. [Última lectura confirmada](final-release-evidence/production-read.json), [fallo de relectura](final-release-evidence/authorizations-read-failure.json), [precheck final](final-release-evidence/precheck-final.log).

## Validaciones y recuperación

`npm run verify`: 212 tests PASS, lint cero errores/seis warnings, build PASS. Integraciones reales de emuladores: 14 Rules y siete migración, ninguna contra producción. Auditoría productiva cero vulnerabilidades; no se cambiaron dependencias. [Resultados](final-release-evidence/validation.json), [audit](final-release-evidence/audit-production.json).

Variables de Netlify no pudieron consultarse sin credenciales API/CLI ni conector. `.env` solo verifica presencia local y no se publicaron valores. Lista exacta, scopes/contextos y YES/NO pendientes: [FINAL_RELEASE_MANUAL_CHECKS.md](FINAL_RELEASE_MANUAL_CHECKS.md). Google popup/persistencia/logout/refresh y casos disabled/recuperación siguen pendientes en entorno controlado; tests de backend no son E2E de navegador.

La fuente productiva exacta de Rules quedó preservada privadamente con ruleset ID y SHA256. Se actualizó [ROLLBACK_PLAN.md](ROLLBACK_PLAN.md) para frontend+Functions, Rules, autorizaciones y datos, incluyendo verificaciones posteriores. Deploy Netlify anterior y ensayo aislado de restauración siguen sin certificar. El backup JSON tipado no es formato de import administrado; restaurar ambos roles al estado anterior dejaría cero administradores y no es recuperación segura.

## Bloqueos restantes y acciones manuales

1. Revisar la cuota Firestore y su recuperación en Console; cuando vuelvan las lecturas, ejecutar un backup completo nuevo y revalidar U-003/U-006, administrador y precheck. No cambiar cuotas/facturación automáticamente ni repetir la migración.
2. Comprobar variables Netlify por nombres/contexto/scope, Node efectivo y IDs/commits de deploy activo y anterior probado; conservar evidencia privada sin secretos.
3. Ejecutar los casos Google Auth y ensayo aislado de recuperación del checklist; registrar las tres constancias manuales solo después de resultados reales. Fallos confirmados bloquean release. No hacer push ni deploy con este informe.

## Archivos y Git

Creados: `scripts/release-backup.mjs`, `scripts/release-backup-core.mjs`, `scripts/release-readiness.mjs`, `netlify/tests/releaseReadiness.test.mjs`, este informe, `docs/FINAL_RELEASE_MANUAL_CHECKS.md` y evidencia segura en `docs/final-release-evidence/`.

Modificados: `scripts/release-precheck.mjs`, `package.json` (comando backup/tests; sin dependencias nuevas), `docs/RELEASE_CHECKLIST.md`, `docs/RELEASE_READINESS.md`, `docs/ROLLBACK_PLAN.md`.

Backups/planes/source Rules/env/artifacts y logs privados permanecen ignorados bajo `.netlify`; no se incluyeron datos de clientes, UIDs, emails ni secretos en evidencia versionable. Git mantiene la rama y HEAD originales con cambios locales sin commit. No push ni deploy.
