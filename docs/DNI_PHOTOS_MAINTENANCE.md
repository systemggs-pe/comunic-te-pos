# Mantenimiento Fotos DNI

Actualización del cierre: ver [DNI_PHOTOS_CLOSURE.md](DNI_PHOTOS_CLOSURE.md). Se corrigió además la asignación de cara en aliases de imagen, reforzando pruebas. La verificación visual continúa bloqueada por el entorno; no se ejecutó consulta real al proveedor.

## Flujo identificado antes de editar

`src/features/dniFotos/DniFotosPage.jsx` inicia la consulta de ocho dígitos y tipo azul/electrónico. `consultarDniFotos` en `src/services/functionsClient.js` llama a POST `/api/dniFotos` con bearer. `netlify/functions/dniFotos.mjs` conserva autorización admin y rate limit; CODART recibe GET `/fd/dniv/:dni` o `/fd/dnivel/:dni`. No se cambia proveedor, permisos ni autenticación.

La respuesta normalizada es `{success, source, data: {dni, nombres, apellidos, genero, edad, tipo, tipoLabel, images}}`; imágenes permitidas: data URI raster/base64, nunca URLs arbitrarias. El flujo de nombres RENIEC usado por otros formularios es independiente: no se añade una segunda consulta ni se modifica ese módulo.

Antes del cambio: timeout de foto 55 segundos incluyendo descarga JSON; cache en memoria del servidor diez minutos, limitada a 100 entradas/48 MB, sin cache HTTP; promesa compartida y lease distribuido de 70 segundos evitan cobros simultáneos. Sin reintentos automáticos. El lease/rate limit usan Firestore en producción; todas las pruebas de esta tarea usan mocks y no ejecutan esos accesos remotos.

Problemas observados antes de editar:
- Fotos ausentes convierten datos personales válidos en respuesta inválida; UI exige imágenes para mostrar resultados.
- 404 del proveedor no tiene clasificación propia y el cliente convierte cualquier 404 interno en backend no publicado.
- Errores de red desconocidos pueden propagarse como mensajes técnicos; JSON malformado y 5xx se agrupan.
- No hay política acotada de reintentos ni logs de intento/duración sin datos personales.
- El guard evita taps duplicados y bloquea DNI/tipo durante carga, impidiendo corregir la entrada hasta finalizar. No hay invalidación explícita al cambiar contexto o desmontar; se necesita al permitir edición durante la espera.
- El loader es solo esqueletos de imagen; falta texto visible, foto ausente clara y acción «Intentar nuevamente».
- No hay cache local breve en memoria del componente; una instancia fría del backend puede repetir una consulta reciente.

## Límites de verificación

Sin consultas a Firestore, proveedor real, cambios de secretos, push ni deploy. Pruebas de proveedor, cache y concurrencia con fixtures. La validación visual móvil debe usar una página local aislada con transporte ficticio, sin sesión Firebase real. Se conservará evidencia de las comprobaciones ejecutadas y sus límites al cerrar.

## Cambios implementados

- Códigos diferenciados para DNI inválido/no encontrado, proveedor indisponible, timeout, límite, credenciales/créditos, respuesta inválida, error interno y red del usuario. UI usa un catálogo cerrado de mensajes y nunca imprime el error técnico recibido.
- Máximo dos intentos exclusivamente para timeout, red temporal, HTTP 5xx o 429 con Retry-After válido de hasta dos segundos. Espera inicial 500 ms (o espera solicitada); plazo total proveedor 55 s, por intento 25 s por defecto, configurable con el nombre existente CODART_TIMEOUT_MS. No se cambia ningún secreto. Cliente tiene límite de 65 s incluyendo transporte/token, aborta al expirar y no añade un ciclo de reintentos.
- Reintentos dentro de la misma promesa y lease: no añaden lecturas Firestore por intento. Cada consulta puede consumir hasta dos cargos CODART; aviso visible. Créditos, autorización permanente, 404 y respuesta malformada nunca se reintentan automáticamente.
- Cache servidor existente diez minutos, con logs HIT/MISS/EXPIRED sin DNI ni imágenes. Cache de página solo en memoria: un resultado, dos minutos, máximo dos millones de caracteres; una imagen grande permanece únicamente en el resultado visible. Sin localStorage/IndexedDB y sin persistencia tras desmontar. Actualizar fuerza consulta nueva; errores no se cachean.
- Guard sincrónico contra taps/Enter duplicados. Cambiar DNI/tipo invalida el resultado pendiente sin iniciar otra consulta mientras siga activa; desmontar descarta datos y errores antiguos. No abortar una consulta de proveedor en curso para empezar otra evita cobros superpuestos.
- Datos válidos sobreviven a foto ausente/URL inutilizable. Anverso/reverso conservan su posición aunque uno falte. Fallback de imagen rota y loader de decodificación no disparan llamadas adicionales. DNI editable durante carga, botón Consultar deshabilitado, texto visible y acción Intentar nuevamente; botones con mínimo 44 px y textos que pueden ajustarse en móvil.
- Logs backend incluyen proveedor/endpoint, tipo de error, intento, duración acumulada y HTTP. Nunca cuerpo externo, token, URL con DNI, nombres o imágenes.

## Evidencia final y límites

`npm test`: 225/225 PASS con Firebase dirigido a localhost y servicios externos mockeados. La suite DNI contiene 32 pruebas (25 proveedor + siete modelo/cliente), incluidas expiración de cache, timeout en body/cliente, retries exitosos/agotados, 404, límite con/sin espera, red, datos sin foto, deduplicación y respuestas antiguas. `npm run lint`: PASS, cero errores/seis advertencias preexistentes. `npm run build`: PASS, 18.67 s. Logs locales en la carpeta temporal `comunicate-dni-maintenance`, sin datos reales ni secretos.

Se preparó fuera del repositorio una página local con el componente real, transporte sustituido y casos foto ausente/lenta/rota/timeout. El único navegador disponible bloqueó tanto 127.0.0.1:4179 como localhost:4179 con ERR_BLOCKED_BY_CLIENT; se restableció el viewport. **NO VERIFICADO visualmente a 375/390/430 px**, incluidos teclado virtual, scroll horizontal y decodificación real de imagen. Los ajustes responsive están implementados, pero la evidencia automática del modelo no sustituye esa comprobación. No se forzó ni desactivó ninguna protección del navegador.

**META ALCANZADA: PARTIAL** hasta completar esa revisión móvil y smoke autorizado del runtime/proveedor desplegado. Esta tarea no modifica autorización, reglas, el flujo RENIEC de otros formularios ni documentos productivos. `AGENTS.md` ya estaba modificado por la regla de cuota de la tarea anterior y se conserva sin cambios adicionales. No hay commit, push ni deploy en esta fase.

Archivos modificados en esta tarea: `netlify/functions/dniFotos.mjs`, `netlify/tests/dniFotos.test.mjs`, `src/services/functionsClient.js` (solo manejo de Fotos DNI), `src/features/dniFotos/DniFotosPage.jsx`, `package.json` (añade la suite local al comando test).

Archivos creados: `src/features/dniFotos/dniPhotoLookup.js`, `netlify/tests/dniPhotoLookup.test.mjs` y este informe. Ninguna dependencia nueva ni archivos sensibles modificados.
