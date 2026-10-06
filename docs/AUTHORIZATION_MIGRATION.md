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

1. Confirmar titular y rol mínimo de U-003 y U-006. Preparar sus documentos con estado explícito para conservar acceso. No inferir automáticamente superadmin por un correo histórico.
2. Confirmar cuál será el administrador y cuál tendrá responsabilidad de gestionar autorizaciones. Debe existir al menos un admin válido y, para recuperación mediante `/api/usuarios`, al menos un superadmin verificado y activo. Puede ser la misma cuenta superadmin; no hay requisito de concederlo a ambas.
3. Revisar U-004/U-005/U-007: asignar rol únicamente si su acceso está autorizado; la presencia en Auth no concede acceso por sí sola. Documentar exclusiones intencionales.
4. Revisar U-001/U-002: no marcar `emailVerified` automáticamente ni activar accesos hasta verificar identidad mediante el flujo legítimo. Si no deben usar la app, conservar la denegación.
5. Tras autorización separada y backup administrativo, el operador realiza exclusivamente los cambios aprobados usando consola/Admin controlado. La API nueva no puede bootstrapear el primer superadmin sin asignación previa. Esta fase no incluye herramienta escritora ni ejecuta esa operación.
6. Repetir auditoría y precheck; verificar U-003/U-006 conservan acceso, cuentas intencionalmente excluidas se deniegan, admin/superadmin válidos y Google login real. Registrar fecha y responsable fuera de Git si contiene datos personales.

No se crean ni eliminan usuarios, no se cambian proveedores/secretos y no se usan fallbacks de email. La migración de datos debe preceder a cualquier API/regla que exija estas asignaciones.
