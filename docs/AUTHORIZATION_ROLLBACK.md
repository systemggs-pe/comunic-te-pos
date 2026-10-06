# Rollback de autorizaciones — preparado, no ejecutado

## Alcance y precondiciones

Solo revierte los campos/documentos indicados por el backup de la migración de U-003/U-006. No toca Firebase Auth, clientes, registros, ventas, equipos, reglas ni secretos. Es independiente de ROLLBACK_PLAN (código/hosting/reglas). Antes de cualquier reversión real se requiere aprobación específica y una cuenta de recuperación activa/verificada, con asignación superadmin, que quede fuera de las asignaciones revertidas.

**Estado actual:** no se aplicó la migración. Ejecutar su rollback dry-run sobre el backup de preparación devuelve cero cambios: no hay nada que restaurar. **Después del bootstrap**, eliminar sus dos asignaciones dejaría cero admins/superadmins con las reglas nuevas; el script aborta `ROLLBACK_WOULD_REMOVE_LAST_ADMIN_OR_ROLE_MANAGER`. No desactivar esta protección para sortear un problema de login.

## Preparar/revisar restauración

Localizar el backup generado **por el apply correspondiente**, no usar una preview antigua para revertir una operación distinta. Plan y backups están en `.netlify/authorization-migration` (ignorado). Verificar proyecto, fecha, hash del plan, identidades UID/email, existencia previa, beforeFields, patch y afterFields; no publicar datos privados.

```powershell
npm run authorization:rollback -- --backup '<ruta absoluta del backup real>'
# Equivale al comando anterior; no escribe datos ni archivos.
npm run authorization:rollback -- --dry-run --backup '<ruta absoluta del backup real>'
```

El script `scripts/rollback-authorizations.mjs` devuelve cambios por U-003/U-006 y cantidades de administradores. Solo admite el esquema de backup generado por el núcleo. Comprueba identidad habilitada/verificada y evita restaurar sobre cambios concurrentes en los campos administrados. Si el backup fue manipulado o falta, falla cerrado. El hash mostrado corresponde al contenido exacto parseado; una copia editada debe revisarse nuevamente.

## Operación futura, solo tras aprobación separada

La restauración real requiere **ambas** opciones `--apply` y `--confirm-backup <SHA256 canónico exacto mostrado por el dry-run>`, además de `--backup`. No se ejecutaron estas opciones en esta fase; no constituyen por sí solas autorización.

1. Confirmar copia administrativa y acceso de recuperación independiente; detener cambios administrativos concurrentes. Reauditar permisos efectivos del administrador que permanecerá. Si no existe, detenerse y preparar una solución/rollback completo con aprobación específica.
2. Revisar dry-run y el backup real de la migración aprobada. Si roles o identidad cambiaron desde entonces, abortar y diagnosticar en lugar de sobrescribir.
3. Después de la aprobación, la herramienta crea otra copia privada de seguridad de lo que va a restaurar, con creación exclusiva y fsync; falla sin escrituras si no puede guardarla.
4. Relee identidades/documentos y confirma la restauración en una transacción con comparación de versiones de toda la colección de autorizaciones.
5. Reauditar admin/superadmin, cuentas activas/denegadas, backend/Rules y registrar versiones/resultados. No hacer deploy por implicación.

## Reversión exacta por caso

- **Documento creado por esta migración:** solo se elimina ese documento cuando coincide con los cuatro campos posteriores y no contiene datos adicionales. Así se restaura la inexistencia previa. No se eliminan otros documentos ni identidades. Si alguien añadió metadata, aborta para evitar perderla.
- **Documento preexistente actualizado:** restaura únicamente los campos incluidos en el patch. Si el campo existía, vuelve a su valor previo; si estaba ausente, se elimina ese campo con FieldValue.delete. Toda metadata ajena se preserva. No reemplaza el documento completo.
- **Ya restaurado:** cero cambios; no escribe ni genera backup adicional.
- **Cambio concurrente:** aborta; el operador debe revisar el nuevo estado y diseñar una restauración explícita.

Para el dry-run actual ambos documentos son inexistentes, así que un futuro rollback de este bootstrap pediría eliminar solo esas dos asignaciones. Esa reversión no es segura como operación aislada bajo el sistema nuevo si son los únicos administradores. La recuperación exacta de la política anterior exige evaluar conjuntamente API/frontend/Rules y permiso para esos cambios; no se realiza ni se automatiza aquí.

El motor de rollback se probó únicamente sobre fixtures en emuladores, incluido el bloqueo de cero admins y la preservación de metadata al restaurar campos. Backup contiene preimágenes suficientes para esos campos, pero no reemplaza el backup completo de Firestore ni garantiza una transacción conjunta con Auth. Conservar credenciales Admin de recuperación fuera de Git y acceso privado al archivo; nunca incluir claves en el backup.
