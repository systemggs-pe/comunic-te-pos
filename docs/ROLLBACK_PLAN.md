# Plan de rollback — documentado, no ejecutado

## Disponibilidad y límites

Git: aabd2bd existe; bundle `C:\Users\COMUNICATE\.codex\backups\comunicate\baseline-2026-10-05-b2088dd.bundle` verificado en baseline y preserva el trabajo previo (b2088dd). El historial local conserva estabilización y readiness. **Rollback de código disponible: YES**.

Se creó además `C:\Users\COMUNICATE\.codex\backups\comunicate\release-readiness-2026-10-06.bundle` con historia completa y se ejecutó `git bundle verify`: PASS. Este bundle sí conserva aabd2bd, estabilización y readiness. Puede clonarse en una carpeta nueva y seleccionar aabd2bd en detached HEAD para recuperación offline, sin modificar la rama actual.

Producción: el ID del último deploy exitoso de Netlify y su commit siguen **MANUAL REQUIRED**; aabd2bd no se ha identificado como el commit desplegado. Rules productivas leídas: `projects/comunicate-tacna/rulesets/6823ec22-3aec-4c10-a7c7-bc48678fe86c`, SHA256 `4ea7dd18938b5762e5aac9629d3361ae1fbc92595c7edc8dbf3c18538c2e80e5`; distintas de aabd2bd y del código actual. Se guardó fuente exacta en `.netlify/rollback/firestore.rules` y metadatos privados en `.netlify/rollback/ruleset.json`. **Rollback productivo completo verificado: MANUAL REQUIRED**, aunque existan copias locales; faltan versión Netlify y ensayo de recuperación.

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

En incidente autorizado, abrir el sitio `comunicate-registros-v2` en Netlify → Deploys → seleccionar el último deploy **probado** → acción de publicar/restaurar ese deploy. Frontend y funciones se recuperan juntos desde ese artefacto; no mezclar ZIPs de otra revisión. Verificar ID activo, login, API/CORS/JSON y datos antes de abrir tráfico. Las variables de entorno son configuración independiente: no asumir que restaurar un deploy restaura secretos; compararlas por nombres, contexto y scope sin imprimir valores. [Referencia de gestión de deploys](https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/).

Si no hay artefacto anterior conservado, reconstruir una revisión previamente probada desde checkout separado y validarla antes de solicitar publicación. aabd2bd solo ofrece recuperación de código de baseline: devuelve bypass históricos y puede perder `/api/usuarios`; requiere revisión explícita de seguridad/compatibilidad, no es rollback productivo automáticamente seguro.

## Firestore Rules y datos

Rules se despliegan independientemente de Netlify. Antes de una release, conservar en almacenamiento privado la fuente exacta y ruleset ID/hash de las reglas activas, y probar en emuladores contra el estado migrado. El ID de ruleset leído permite localizar la versión mientras Firebase la conserve; no sustituye una copia/retención confirmada.

Preferir recuperar frontend/API manteniendo la política segura y asignaciones ya verificadas, si el código anterior es compatible. Si hay incompatibilidad, corregir hacia adelante o usar una revisión segura validada. **No desplegar ciegamente firestore.rules de aabd2bd:** contiene bypass por correos que reabren BUG-003. Una restauración excepcional de política anterior requiere autorización específica, análisis de cuentas desactivadas y verificación en emuladores; no forma parte de esta ejecución.

Si falla el acceso nuevo, revisar primero los documentos explícitos con una herramienta administrativa controlada (Admin no depende de client Rules), preservando roles aprobados. No borrar userRoles ni reactivar identidades indiscriminadamente. Si ya hubo daño de datos, usar únicamente el backup administrativo completo y una restauración ensayada/autorizada; el backup UI de cuatro colecciones no cubre autorizaciones ni subcolecciones.

La copia exacta de Rules está preservada localmente, pero publicar esa política requiere aprobación específica y validación de seguridad. Comprobar su SHA256 contra el anterior y ensayar los casos de permisos en emuladores antes de usarla. Como procedimiento de recuperación futuro, ejecutar desde `.netlify/rollback` con `firebase deploy --config firebase.json --project comunicate-tacna --only firestore:rules`; **no ejecutado ni autorizado en esta fase**. Confirmar después el ruleset activo y su fuente: el nombre local de archivo no demuestra qué política quedó publicada.

## Autorizaciones y datos: backups y restauración controlada

La última lectura exitosa confirmó U-003 = superadmin/active y U-006 = admin/active, dos administradores válidos y un superadmin. La lectura directa final quedó bloqueada por `8 RESOURCE_EXHAUSTED: Quota exceeded`; no certificar una revalidación posterior hasta recuperar lecturas. La migración ya fue aplicada y no se vuelve a ejecutar. El backup anterior a ella sigue en `.netlify/authorization-migration/backups/authorization-migration-backup-1791268034073-5beef7f1-70fc-4a59-a90c-90fed356d569.json`. Su restauración eliminando ambos roles dejaría cero administradores para la API actual: **no es una recuperación segura de acceso**. Revisar plan, estado actual y evidencia de rollback antes de una operación separadamente autorizada. Preservar asignaciones existentes al recuperar frontend/API compatibles.

`npm run release:backup` hace lecturas administrativas del proyecto confirmado, reutiliza el exportador operativo completo y recorre todas las colecciones/subcolecciones, incluso bajo documentos padre inexistentes. Exporta páginas ordenadas, compara conteos iniciales/exportados/finales y vuelve a descubrir la topología. Archivo privado: `.netlify/release-backup/firestore-full-<timestamp>.json`; metadata segura: `.netlify/release-backup/evidence.json`. El precheck exige scope completo, checksum coincidente y antigüedad inferior a 24 horas. La evidencia final registra el timestamp, hash y conteos efectivamente obtenidos; no suponer PASS antes de que termine.

El JSON tipado conserva int64, timestamps, referencias, bytes y valores especiales; `decodeFirestore` permite reconstruir valores. **No es un export administrado compatible con `gcloud firestore import`** ([formato del servicio administrado](https://firebase.google.com/docs/firestore/manage-data/export-import?hl=en)). No se ejecutó un job administrado ni escritura en bucket. La copia no es una instantánea transaccional: cambios de contenido con igual conteo durante la lectura pueden no detectarse. Para una recuperación productiva se necesita una ventana controlada, retención privada accesible y ensayo de restauración en proyecto aislado, todavía MANUAL REQUIRED.

Tras autorización de recuperación de datos: validar proyecto, hash, formato y rutas seleccionadas; crear backup fresco del estado presente; ensayar la decodificación y restauración en entorno aislado; comparar campos/tipos/conteos y aprobar el alcance antes de escrituras productivas. Preservar documentos no afectados y roles actuales; no borrar colecciones ni importar todos los datos indiscriminadamente. El script de esta fase solo exporta y no contiene un aplicador de restauración productiva.

Después de restaurar: comprobar deploy/frontend/functions y Rules efectivos, U-003/U-006 y administrador de recuperación; login permitido/no autorizado, sesiones y disabled con fixtures aislados; `/api/usuarios` sin auth = 401 JSON y `me` autorizado; CORS/orígenes; conteos por colección, relaciones e integridad de datos, PDFs y registros de prueba aprobados. Ejecutar `npm run verify`, integraciones de Rules/autorización y `npm run release:precheck`; conservar evidencia privada del incidente. Detenerse ante fallos de autorización o integridad, sin arreglos adicionales automáticos.

Orden de recuperación: detener escrituras de pruebas → diagnosticar policy/API y elegir combinación compatible en entorno controlado → restaurar conjuntamente frontend/API → ajustar Rules solo si esa combinación lo exige y está autorizada → verificar admin/superadmin, usuario activo/disabled, endpoints y conteos. Registrar incidente y versiones. En esta fase no se ejecutó ningún paso de rollback.
