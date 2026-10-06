# Migración de autorizaciones — propuesta sin ejecutar

## Estado observado

Fuente: `release-evidence/authorization.json`, lecturas de Auth, Firestore y Rules API el 2026-10-06 UTC. Siete identidades habilitadas; cinco verificadas; cero asignaciones. No hay catálogo independiente de roles ni colección de permisos: `userRoles` vincula identidad, rol y estado. El campo `status` activa la asignación; `Auth.disabled` desactiva la identidad por separado.

Los identificadores U-001…U-007 se asignaron por orden alfabético del email normalizado; no son IDs de Firebase y pueden cambiar al agregar cuentas. El operador identifica las cuentas en la consola privada de Firebase, sin publicar la correspondencia en Git.

| Usuario | Rol | Usuario activo | Email verificado | Rol activo | Permisos nuevos | Acceso después | Rules actuales (simulación) | Clasificación |
|---|---|---|---|---|---|---|---|---|
| U-001 | Ausente | Sí | No | No | Ninguno | No | No | REQUIERE CORRECCIÓN |
| U-002 | Ausente | Sí | No | No | Ninguno | No | No | REQUIERE CORRECCIÓN |
| U-003 | Ausente | Sí | Sí | No | Ninguno | No | Sí | RIESGO DE LOCKOUT |
| U-004 | Ausente | Sí | Sí | No | Ninguno | No | No | REQUIERE CORRECCIÓN |
| U-005 | Ausente | Sí | Sí | No | Ninguno | No | No | REQUIERE CORRECCIÓN |
| U-006 | Ausente | Sí | Sí | No | Ninguno | No | Sí | RIESGO DE LOCKOUT |
| U-007 | Ausente | Sí | Sí | No | Ninguno | No | No | REQUIERE CORRECCIÓN |

La política desplegada tiene una allowlist fija. U-003 y U-006 cumplen su condición de lectura operacional; esto es una simulación con identidades actuales, no prueba de una sesión/token vigente ni de autorización del backend anterior. Las otras tres verificadas también quedarían bloqueadas por las nuevas reglas, pero no tienen acceso directo según esa política actual. No hay administrador explícito válido; **NO DESPLEGAR**.

## Documentos exactos esperados

Para cada cuenta cuyo acceso haya aprobado el responsable, crear o corregir posteriormente:

`artifacts/comunicate-pos/users/shared/userRoles/<email verificado exacto en minúsculas>`

Campos mínimos de autorización: `role` exactamente `usuario`, `admin` o `superadmin`; `status` exactamente `active` o `disabled`. Email Auth/token debe coincidir exactamente con el ID del documento. Backend normaliza, Rules no; mayúsculas/espacios y `ACTIVE`/`ADMIN` pueden producir discrepancias y deben corregirse previamente. Si Auth contiene un email no canónico, detener esa asignación y revisar identidad: no duplicar privilegios para sortear la diferencia.

Ejemplo de esquema sin datos personales:

```json
{"email":"<email real verificado>","uid":"<uid real>","role":"<rol aprobado>","status":"active"}
```

`email`/`uid` son datos de trazabilidad usados por la UI; Rules/API autorizan por ID del documento y `role`/`status`. La interfaz de administración añade timestamps y actor al guardar. No sustituir documentos existentes completos si contienen metadata legítima. No inventar colecciones `roles`, `permissions` ni custom claims para esta release.

| Rol activo | Permisos relevantes |
|---|---|
| usuario | Lecturas operativas del scope compartido; operaciones API sujetas a validaciones específicas; sin administración de roles |
| admin | Lo anterior más configuración administrativa admitida; sin listar/modificar userRoles |
| superadmin | Lo anterior más gestión de usuarios mediante `/api/usuarios`; lectura directa de userRoles |
| disabled / ausente / inválido | Acceso protegido denegado |

Todas las mutaciones operativas directas a Firestore continúan denegadas; pasan por API. El rol por sí solo no elimina controles de negocio de cada función.

## Cambios pendientes de aprobación

1. **Roles confirmados por el usuario el 2026-10-06:** U-003 será superadmin/active y U-006 admin/active. La confirmación autoriza preparar plan/scripts/dry-run; no ejecutar `--apply`. La identificación se hizo por lectura de Auth y documentos, y se contrastó con los defaults históricos. El plan privado fija UID y email exactos; no depende del ordinal U-003/U-006 para resolver futuras identidades.
2. U-003 tendrá gestión de autorizaciones mediante `/api/usuarios`; U-006 administración sin gestión de roles. La simulación debe seguir demostrando al menos un admin válido y un superadmin activo antes de cualquier escritura futura.
3. Revisar U-004/U-005/U-007: asignar rol únicamente si su acceso está autorizado; la presencia en Auth no concede acceso por sí sola. Documentar exclusiones intencionales.
4. Revisar U-001/U-002: no marcar `emailVerified` automáticamente ni activar accesos hasta verificar identidad mediante el flujo legítimo. Si no deben usar la app, conservar la denegación.
5. Tras autorización separada para aplicar y backup, el operador realiza exclusivamente los cambios del plan revisado mediante el script administrativo controlado descrito abajo. La API nueva no puede bootstrapear el primer superadmin sin asignación previa. Se preparó la herramienta; no se ejecutó ninguna escritura productiva.
6. Repetir auditoría y precheck; verificar U-003/U-006 conservan acceso, cuentas intencionalmente excluidas se deniegan, admin/superadmin válidos y Google login real. Registrar fecha y responsable fuera de Git si contiene datos personales.

No se crean ni eliminan usuarios, no se cambian proveedores/secretos y no se usan fallbacks de email. La migración de datos debe preceder a cualquier API/regla que exija estas asignaciones.

## Dry-run exacto preparado — NO aplicado

Plan privado: `.netlify/authorization-migration/plan.json` (ignorado por Git; incluye únicamente proyecto, versión y dos asignaciones con UID/email/role/status). SHA-256 canónico del plan: `54da86f32708fef16e6ce9776d61fbd5e0a64544b7e745ad098f838fc3dd197c`. Las direcciones fueron mostradas al titular en el chat para confirmar; no se guarda la correspondencia de identidad en documentos públicos del repositorio.

```text
AUTHORIZATION MIGRATION DRY RUN

USER: U-003
CURRENT:
- active: true (Auth habilitado y email verificado)
- role: AUSENTE
- role active: false
- permissions: Sin autorización explícita; acceso directo por allowlist antigua
PROPOSED:
- active: true
- role: superadmin
- role active: true
- permissions: Operación + administración + gestión de usuarios/roles
CHANGES: crear email, uid, role="superadmin", status="active"

USER: U-006
CURRENT:
- active: true (Auth habilitado y email verificado)
- role: AUSENTE
- role active: false
- permissions: Sin autorización explícita; acceso directo por allowlist antigua
PROPOSED:
- active: true
- role: admin
- role active: true
- permissions: Operación + administración; sin gestión de usuarios/roles
CHANGES: crear email, uid, role="admin", status="active"

ROLES TO CREATE: ningún catálogo; dos asignaciones userRoles
DOCUMENTS TO MODIFY: NINGUNO
DOCUMENTS TO CREATE:
- artifacts/comunicate-pos/users/shared/userRoles/<email real U-003>
- artifacts/comunicate-pos/users/shared/userRoles/<email real U-006>
LOCKOUT AFTER MIGRATION: NO (para las dos cuentas confirmadas)
ADMIN VALID AFTER MIGRATION: YES (2 administrativos; 1 superadmin)
PRODUCTION WRITES: NO
```

No se incorpora campo `active` ni array `permissions` al documento: son estados/etiquetas calculados del rol y `status`. Los cuatro campos escritos son exactamente email, uid, role y status. No se añaden timestamps/actor ficticios; el plan/backup local aporta evidencia de esta operación administrativa. Las otras cinco cuentas no reciben privilegios ni documentos: su política de acceso sigue pendiente de una decisión separada.

## Scripts y controles

```powershell
# Ambos comandos son dry-run; el primero también es el comportamiento predeterminado.
npm run authorization:migrate
npm run authorization:migrate -- --dry-run
# Solo lecturas productivas; además crea una copia privada local de preimágenes.
npm run authorization:migrate -- --dry-run --prepare-backup
```

`scripts/migrate-authorizations.mjs` llama al núcleo validado y al adaptador Firebase Admin; no usa API pública ni su rate limiter. Cuenta/proyecto fijo comunicate-tacna; rechaza env de emulador en CLI productivo, usuario inexistente/UID cambiado, email no canónico, Auth disabled/no verificado, rol desconocido/inactivo, roles distintos de los confirmados, conflictos de identidad persistida y ausencia de administrador/superadmin en resultado. UID/email se vuelven a comprobar inmediatamente antes de la transacción.

Creación con precondición de inexistencia; documentos existentes se actualizan únicamente en los campos necesarios. No se reemplazan documentos completos ni metadata. Toda la operación Firestore se confirma en una transacción: versiones de todos los documentos de autorización se comparan dentro de ella, incluidas otras cuentas administrativas, para abortar cambios concurrentes que invaliden la simulación. No hay escrituras parciales ni cambios a Auth.

`--apply` existe exclusivamente para una fase futura aprobada: requiere además `--confirm-plan <SHA256 canónico exacto mostrado por el dry-run>`. La bandera no sustituye autorización del usuario. Tras todas las comprobaciones y antes de la transacción, guarda backup privado con creación exclusiva y fsync. Si el backup falla, no escribe. Relee estado/identidades y aborta si cambia el plan efectivo o las versiones. Un reintento con estado ya migrado produce cero cambios (idempotencia).

La confirmación humana recibida **no autoriza aplicar**: READY TO APPLY NO hasta aprobación expresa de la ejecución. No se invocó CLI con `--apply` en producción ni en pruebas. Solo se ejercitó el motor transaccional con fixtures sintéticos del proyecto demo-comunicate.

## Backup privado

Se preparó una copia de lectura de las preimágenes de los dos documentos ausentes en `.netlify/authorization-migration/backups/authorization-migration-backup-1791266976607-0691cf86-789d-4689-8b4c-902efe5faba4.json`. Guarda existencia previa, presencia/valor de cada campo de autorización, patch esperado, campos posteriores, versiones, UID/email de los afectados y hash del plan; no contiene tokens, claves ni datos de terceros.

El dry-run predeterminado no crea archivos ni escribe Firestore. `--prepare-backup` es un opt-in de copia **local**. Antes de un futuro apply se genera siempre otro backup fresco; esta copia preparatoria no basta para omitir ese paso. El directorio .netlify está ignorado por Git. En Windows mode 0600/0700 no implementa ACL NTFS: conservar carpeta bajo el perfil privado del operador y limitar acceso; no subir plan/backups al repositorio ni a canales públicos. No se modifica el ACL del proyecto automáticamente.

Backup de autorizaciones no es backup completo de Firestore. No se cambian datos operativos, proveedores, secretos ni reglas. Auth y Firestore no comparten transacción: una desactivación/recreación Auth que ocurra tras la última lectura no puede bloquearse atómicamente; coordinar ventana sin cambios administrativos, reauditar inmediatamente después de la aplicación futura y detener deploy si hay discrepancia. Si hay timeout/respuesta incierta, consultar estado y backup antes de reintentar; no asumir rollback automático.

## Verificación y rollback

Evidencias de esta fase: `docs/authorization-evidence`. Pruebas cubren plan válido, identidad ausente/recreada, rol inexistente/inactivo, admin habilitado/deshabilitado/no verificado, cero admins, dry-run sin escrituras, backup fallido, concurrencia, metadata preservada, idempotencia y rollback seguro. Integración prueba Auth/Firestore reales en emuladores y backend/Rules después de aplicar únicamente fixtures sintéticos. Reglas existentes se vuelven a comprobar aparte.

Rollback preparado: [AUTHORIZATION_ROLLBACK.md](AUTHORIZATION_ROLLBACK.md). Restaurar ambas asignaciones a ausencia tras publicar el sistema nuevo quitaría los últimos administradores; el script lo **impide**, incluso en dry-run. No se ejecutó rollback real. Estado productivo al cerrar esta preparación sigue sin asignaciones: READY FOR RELEASE NO.

### Resultados ejecutados de preparación

| Control | Resultado |
|---|---|
| CLI dry-run explícito + backup preview | PASS, exit 0; dos creaciones, cero actualizaciones, cero escrituras productivas |
| CLI sin parámetros (default dry-run) | PASS, exit 0 al repetir; una primera lectura agotó el límite de 60s y abortó sin escrituras |
| CLI rollback por defecto sobre preview | PASS, exit 0; cero cambios, cero escrituras |
| Núcleo unitario nuevo | 20/20 PASS |
| npm run verify | PASS, exit 0; 204/204 tests, lint 0 errores/6 warnings existentes, build 2178 módulos |
| npm run test:authorizations | 7/7 PASS en demo-comunicate |
| npm run test:rules existente | 14/14 PASS |
| npm audit --omit=dev | 0 vulnerabilidades, exit 0 |
| Lectura de producción posterior | 7 usuarios, 0 asignaciones, 0 admins: estado sin modificar |

Las integraciones emitieron avisos de deprecación de url.parse del Firebase CLI; los 21 escenarios terminaron correctamente. El timeout productivo aislado y la repetición satisfactoria quedan en evidencia; no se incrementó el límite ni se reintentaron escrituras. Hashes/lecturas no prueban una sesión Google real; esa validación sigue pendiente de release.

READY TO APPLY: **NO en esta fase**; el plan está preparado y los roles confirmados, pero falta autorización separada para ejecutar la escritura. READY FOR RELEASE sigue **NO**. Ningún CLI se invocó con --apply; no se hizo push/deploy ni se alteraron secretos. La copia preparada no reemplaza la nueva copia obligatoria antes de cualquier aplicación futura.
