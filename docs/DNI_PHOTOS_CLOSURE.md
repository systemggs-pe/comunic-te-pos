# Mantenimiento Fotos DNI — cierre

Revisión focalizada del estado actual, 2026-10-06, America/Lima. No se consulta Firestore ni CODART real; no hay cambios de secretos, permisos, push ni deploy. La implementación está comprobada mediante mocks. El cierre integral sigue PARTIAL porque faltan comprobación visual y proveedor real.

## Comprobación local y bug evidente

Se inició la página local aislada con el componente real y transporte ficticio, sin imports activos de Firebase ni llamadas al proveedor. El navegador disponible bloqueó `http://localhost:4179` con `ERR_BLOCKED_BY_CLIENT`. No se cambió código, configuración de red ni protecciones para resolver esa limitación. **MANUAL VISUAL TEST REQUIRED** para 375, 390 y 430 px. Teclado móvil real: NO VERIFICADO.

La revisión de procesamiento descubrió un bug independiente del entorno: campos alternativos `anverso`, `reverso` o `foto` se etiquetaban por su posición en una lista de aliases como `image_3`, `image_4`, etc. La UI solo muestra `front`/`back`, por lo que podía ocultar imágenes válidas. Se corrigió únicamente la asignación por cara, buscando el primer alias utilizable. La prueba existente ahora verifica ambas caras, solo reverso, foto genérica y URL inválida con alias válido alternativo. No hay refactor general ni funcionalidades nuevas.

## CODART: configuración revisada

- GET `https://api-codart.cgrt.org/api/v1/consultas/fd/dniv/:dni` (azul) y `/fd/dnivel/:dni` (electrónico). Transporte interno POST `/api/dniFotos`. Bearer del nombre existente CODART_TOKEN, con fallback RENIEC_TOKEN; valores y validez productiva no inspeccionados.
- Plazo proveedor total 55 s; intento predeterminado 25 s. CODART_TIMEOUT_MS positivo puede ajustar el intento hasta 55 s; el tiempo restante limita el segundo intento. Cliente: plazo 65 s con aborto, sin retry adicional.
- Parsing JSON y envelopes data/result; éxito exige foto o datos reconocibles, y el DNI normalizado debe coincidir con el consultado. JSON malformado, estructura inválida, respuesta sin datos utilizables o DNI distinto se rechazan. Nombres/DNI válidos sin foto se conservan. La ausencia de fotografía por sí sola no invalida esos datos.
- HTTP 400: DNI inválido; 404: no encontrado; 401/403: credenciales del proveedor; 402: créditos insuficientes; 429: límite; otros fallos HTTP: upstream. Solo 5xx de ese último grupo son candidatos a retry. Un success=false con mensaje reconocible de ausencia se convierte en no encontrado; no se expone el cuerpo externo.
- Imágenes: PNG/JPEG/WebP en data URI o base64 raster reconocido, hasta dos imágenes y límite predeterminado de 6 MiB por imagen. URLs externas/SVG no se descargan; foto ausente o rota tiene fallback. Una data URI admitida todavía puede no decodificar: la UI maneja onError; eso sigue pendiente de observación visual.

**CODART CONFIGURACIÓN: PASS** en inspección de código y mocks, no certifica credenciales, disponibilidad ni compatibilidad del proveedor actual. **REAL PROVIDER TEST REQUIRED** para confirmar ambos endpoints efectivos, token/permisos/créditos, formato real, latencia, fotos decodificables y cobro por intento. No se ejecutó. Una prueba futura requiere autorización explícita del DNI/alcance y presupuesto: una acción podría hacer hasta dos intentos; probar ambos tipos serían hasta cuatro intentos si ambos reintentan. No usar una consulta real como requisito de las pruebas locales.

## Reintentos y consumo

Máximo **dos intentos totales**, no dos reintentos. Retry solo para timeout del proveedor, fallo de red temporal, HTTP 5xx, o 429 con Retry-After válido entre 0 y 2 s. Espera mínima 500 ms; el segundo intento debe caber en el plazo total. No reintentar DNI inválido/tipo inválido, 404/no encontrado, 401/403, 402, respuesta inválida, error interno no clasificado, 429 sin espera válida/corta ni conflicto de consulta en curso. El cliente no reintenta tras su propio timeout de 65 s.

**RIESGO DE CONSUMO DE CRÉDITOS: MEDIUM**, evaluación cualitativa. Abortar nuestro fetch por timeout no demuestra que CODART canceló su procesamiento o cobro. El primer intento puede haberse cobrado aun sin respuesta, y el segundo puede cobrar otro crédito: una sola acción del usuario puede consumir dos consultas. También podría haber cargos en errores 5xx/red según la política externa, que no se ha certificado. No hay idempotency key que garantice un único cobro en CODART.

Cache reciente puede evitar llamadas; Actualizar/Intentar nuevamente forza una acción nueva y puede agregar otros dos intentos. La deduplicación y el lease evitan consultas simultáneas desde la app, pero no deduplican cobros dentro del proveedor ni conservan cache entre instancias frías. Los retries se ejecutan dentro del mismo lease, sin añadir accesos Firestore por cada intento. No se cambió esta política en el cierre.

## Checklist visual manual — ocho pasos

Usar solo la página local aislada con fixtures (`http://localhost:4179`, mientras el servidor temporal siga disponible) en un navegador propio que permita localhost. No usar backend productivo ni consultas reales. Si el servidor ya se cerró, reactivar el fixture aislado antes de la prueba; no sustituirlo por la app conectada a Firebase/CODART.

1. Abrir el fixture y confirmar que muestra «Caso de prueba» y contador de «Consultas ficticias». Son datos inventados y transporte mock.
2. Repetir la revisión a 375, 390 y 430 px: página sin scroll horizontal, textos completos, input y acciones visibles; medir controles táctiles al menos 44 px y guardar una captura por ancho.
3. Ingresar ocho dígitos de prueba; verificar teclado/input numeric declarado, límite de longitud y botón Consultar accesible y habilitado solo con DNI válido.
4. Elegir «Respuesta lenta», consultar y repetir taps/Enter: loader/texto visibles, DNI conservado y botón bloqueado; el contador debe subir solo una vez.
5. Durante esa carga, cambiar el DNI: el resultado viejo no debe aparecer; al finalizar, consultar el nuevo y comprobar coincidencia del resultado.
6. Elegir «Timeout»: mensaje comprensible, sin códigos/stack, y botón «Intentar nuevamente» visible/tocable; probar la acción solo con el mock.
7. Elegir «Sin foto» y «Imagen rota»: datos personales visibles, etiquetas Anverso/Reverso, placeholder/fallback correcto y ausencia de nuevas consultas al decodificar. Revisar también ambas caras/solo reverso con fixtures de ese caso antes de certificar posición e imágenes.
8. En un smartphone real y únicamente con un entorno de fixtures accesible y aprobado, comprobar teclado, scroll y accesibilidad de acciones. Sin ese dispositivo/entorno registrar teclado móvil como NO VERIFICADO, aunque DevTools simule el ancho.

## Criterio de cierre

Solo marcar META YES después de evidencia visual satisfactoria y comprobación real del proveedor expresamente autorizada. Mientras falten: implementación PASS, móvil MANUAL REQUIRED, proveedor MANUAL REQUIRED y META PARTIAL. No se ejecutan prechecks, backups ni análisis generales.

Validaciones de este cierre: `npm test` PASS, 225/225 (incluye 32 casos DNI); `npm run lint` PASS, cero errores y seis advertencias existentes; `npm run build` PASS, 32.85 s. Los comandos se ejecutaron con Firebase dirigido a localhost y las suites usando mocks. Logs `closure-tests.log`, `closure-lint.log`, `closure-build.log` en la carpeta temporal `comunicate-dni-maintenance`; no contienen consultas reales a Firestore/CODART. El servidor de fixtures temporal solo escucha en loopback, y no debe confundirse con la aplicación/producto publicado.
