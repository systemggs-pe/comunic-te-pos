# Plan de rollback — documentado, no ejecutado

## Disponibilidad y límites

Git: aabd2bd existe; bundle `C:\Users\COMUNICATE\.codex\backups\comunicate\baseline-2026-10-05-b2088dd.bundle` verificado en baseline y preserva el trabajo previo (b2088dd). El historial local conserva estabilización y readiness. **Rollback de código disponible: YES**.

Se creó además `C:\Users\COMUNICATE\.codex\backups\comunicate\release-readiness-2026-10-06.bundle` con historia completa y se ejecutó `git bundle verify`: PASS. Este bundle sí conserva aabd2bd, estabilización y readiness. Puede clonarse en una carpeta nueva y seleccionar aabd2bd en detached HEAD para recuperación offline, sin modificar la rama actual.

Producción: no se identificó el ID del último deploy exitoso de Netlify ni se comprobó backup administrativo completo de Firestore. aabd2bd no se ha identificado como el commit desplegado. Rules productivas leídas: `projects/comunicate-tacna/rulesets/6823ec22-3aec-4c10-a7c7-bc48678fe86c`, hash en evidencia de autorización; distintas de aabd2bd y del código actual. **Rollback productivo completo verificado: NO** hasta confirmar esos recursos.

## Git: recuperación exacta de fuente

No resetear la rama actual ni reescribir historia. Después de aprobación de recuperación, en una ubicación nueva que no exista:

```powershell
git cat-file -t aabd2bd
git worktree add --detach '..\comunicate-rollback-aabd2bd' aabd2bd
git -C '..\comunicate-rollback-aabd2bd' rev-parse HEAD
```

Resultado esperado: `aabd2bd63f06c141be76ac3485983f33f755e471`. Usar `npm ci` y controles del baseline en esa copia; no copiar .env/secrets a Git. Si solo se dispone del bundle, verificar `git bundle verify '<ruta del bundle>'` y clonar a una carpeta nueva; el bundle preserva b2088dd, y aabd2bd requiere recuperar también los commits posteriores del repositorio conservado. No afirmar que ese bundle contiene aabd2bd.

## Netlify y funciones

Antes de una release autorizada, el operador guarda: site ID, deploy ID activo y anterior exitoso, commit asociado, fecha, runtime y configuración de variables por nombres; confirma que ambos contienen frontend y funciones requeridos. Revisar si el deploy antiguo incluye `/api/usuarios` (el publicado previamente devolvía 404).

En incidente, abrir el sitio `comunicate-registros-v2` en Netlify → Deploys → seleccionar el último deploy **probado** → acción de publicar/restaurar ese deploy. Frontend y funciones se recuperan juntos desde ese artefacto; no mezclar ZIPs de otra revisión. Verificar ID activo, login, API/CORS/JSON y datos antes de abrir tráfico. Las variables de entorno son configuración independiente: no asumir que restaurar un deploy restaura secretos; compararlas por nombres sin imprimir valores.

Si no hay artefacto anterior conservado, reconstruir una revisión previamente probada desde checkout separado y validarla antes de solicitar publicación. aabd2bd solo ofrece recuperación de código de baseline: devuelve bypass históricos y puede perder `/api/usuarios`; requiere revisión explícita de seguridad/compatibilidad, no es rollback productivo automáticamente seguro.

## Firestore Rules y datos

Rules se despliegan independientemente de Netlify. Antes de una release, conservar en almacenamiento privado la fuente exacta y ruleset ID/hash de las reglas activas, y probar en emuladores contra el estado migrado. El ID de ruleset leído permite localizar la versión mientras Firebase la conserve; no sustituye una copia/retención confirmada.

Preferir recuperar frontend/API manteniendo la política segura y asignaciones ya verificadas, si el código anterior es compatible. Si hay incompatibilidad, corregir hacia adelante o usar una revisión segura validada. **No desplegar ciegamente firestore.rules de aabd2bd:** contiene bypass por correos que reabren BUG-003. Una restauración excepcional de política anterior requiere autorización específica, análisis de cuentas desactivadas y verificación en emuladores; no forma parte de esta ejecución.

Si falla el acceso nuevo, revisar primero los documentos explícitos con una herramienta administrativa controlada (Admin no depende de client Rules), preservando roles aprobados. No borrar userRoles ni reactivar identidades indiscriminadamente. Si ya hubo daño de datos, usar únicamente el backup administrativo completo y una restauración ensayada/autorizada; el backup UI de cuatro colecciones no cubre autorizaciones ni subcolecciones.

Orden de recuperación: detener escrituras de pruebas → diagnosticar policy/API y elegir combinación compatible en entorno controlado → restaurar conjuntamente frontend/API → ajustar Rules solo si esa combinación lo exige y está autorizada → verificar admin/superadmin, usuario activo/disabled, endpoints y conteos. Registrar incidente y versiones. En esta fase no se ejecutó ningún paso de rollback.
