# Automatización de boletas en Registro Apple

Implementación local, 2026-10-06. No se consultó Firestore remoto ni APIs productivas, no se emitieron boletas reales y no se hizo push/deploy. Evidencia funcional: mocks, fixtures y bases simuladas; no certifica integración productiva.

## Flujo anterior y nuevo

Antes: completar Registro Apple, solicitar/continuar la comprobación del IMEI, abrir por separado la aplicación de boletas cuando no existía comprobante, volver a introducir cliente/equipo, generar y regresar a comprobar en POS.

Ahora: `RegistroForm` conoce cliente y equipo → IMEI seleccionado válido (Luhn), IMEI primario/secundario coherentes y documento/nombre completos → debounce de 600 ms → servicio existente `obtenerComprobanteApple` → función `comprobanteApple` → repositorio `searchHistory` → validación compartida → asociación visual. No requiere un botón inicial de búsqueda.

Solo un NOT_FOUND inequívoco prepara un borrador. «Revisar y generar boleta» abre la aplicación existente con campos permitidos en el fragmento de URL. El receptor elimina el fragmento antes del login y mantiene el borrador en memoria; no lo guarda en almacenamiento persistente. La aplicación de boletas conserva su propia sesión Google y permisos actuales: puede requerir iniciar sesión allí. El fragmento contiene datos personales, no credenciales; no debe compartirse ni registrarse.

El usuario completa datos ausentes, revisa y marca confirmación; «Confirmar y generar» llama al servicio existente `guardarBoletaExtranjera`. Después regresa a POS y pulsa «Ya generé la boleta: comprobar», que fuerza una consulta nueva. Guardar el registro mantiene la revalidación final del servidor sin cache.

La política anterior de boletas (seleccionar formato guarda y genera PDF) se conserva en formularios ordinarios. Únicamente el flujo preparado desde POS exige la confirmación adicional; preparar o abrir un borrador nunca lo emite.

## Estados

| Estado | Comportamiento |
| --- | --- |
| IDLE | Sin flujo Apple activo. |
| WAITING_FOR_DATA | Faltan cliente/documento/IMEIs válidos; cero consultas. |
| SEARCHING | Una búsqueda en curso. |
| RECEIPT_FOUND | Resultado pasa al validador compartido. |
| VALIDATED | Comprobante ACTIVA, completo, IMEI coincidente y fingerprint válido. |
| RECEIPT_NOT_FOUND | Ausencia confirmada, nunca un error de transporte. |
| PREPARING_RECEIPT | Construcción local de datos permitidos. |
| READY_TO_CREATE | Borrador listo para revisión explícita. |
| ERROR | Error comprensible; no prepara una boleta ni reintenta automáticamente. |
| SAVED_REFERENCE | Edición con referencia/fingerprint previos y equipo sin cambios; se verificará nuevamente al guardar. No afirma vigencia remota actual. |

## Datos y fuente de verdad

| Campos reales | Clasificación | Fuente |
| --- | --- | --- |
| nombre, rut/documento, tipoDocumento | AUTO si conocidos; ausentes MANUAL | Cliente del registro actual. |
| imei1, imei2, marca | AUTO cuando existen; secundario ausente permanece vacío | Equipo actual; marca APPLE. |
| modelo, nombreComercial, sn, memoria, color | AUTO si disponibles; ausentes MANUAL | Equipo del registro. |
| precio de venta, fechaHora de venta, formato | MANUAL | Revisión del usuario en boletas. |
| nBoleta, estado, updatedAt, fingerprint, totales, emisor configurado | DERIVED | Modelo, configuración y servidor del repositorio. |

`Registro.precio` corresponde al trámite/servicio, no al precio de venta del equipo. La fecha del registro tampoco acredita la fecha de venta: ambos campos quedan sin precargar. Teléfono, vendedor o sede no se agregan como campos ficticios al modelo de boleta. Los AUTO precargados no se editan en el receptor: una corrección debe comenzar en POS y preparar un borrador nuevo. No se dispara RENIEC/OCR ni la carga inicial del historial de 50 documentos en este flujo.

## Concurrencia, cache, edición y fingerprint

- La búsqueda visual reutiliza el lookup existente y su cache positivo de 30 segundos. Debounce, deduplicación de promesas y serialización evitan búsquedas simultáneas/repetidas. Respuestas de generaciones anteriores no pueden asociarse al IMEI nuevo.
- NOT_FOUND y errores detienen la búsqueda automática; pulsar Siguiente repetidamente no vuelve a consultar. Reintentar o comprobar tras generar es una acción explícita y sin cache. No se agregan retries automáticos.
- Cambiar IMEI invalida referencia, fingerprint, resultado y preparación. Perder datos mínimos invalida búsquedas pendientes. Cambios de campos precargados actualizan el borrador local.
- Editar sin cambiar datos críticos conserva una referencia con hash previo y difiere la lectura hasta guardar. Referencias legacy sin hash requieren búsqueda. Cambiar IMEI reinicia la automatización, sin emitir automáticamente.
- La confirmación en boletas usa `reuseExisting: true`. La comprobación final de documento, locks de IMEI y consulta legacy ocurre dentro de la transacción existente del repositorio, antes de escribir. Si apareció un documento ACTIVA completo y compatible, se devuelve como reutilizado; no se crea otra boleta ni se imprime automáticamente esa existente. Anuladas, legacy o incompletas bloquean el flujo.
- El receptor deduplica doble clic y conserva el resultado exitoso en memoria. Un fallo permite reintento explícito; si la respuesta de creación se perdió, los locks/transacción permiten reutilizar la existente. El borrador expira a los 10 minutos.
- POS conserva el SHA-256 y updatedAt del contrato anterior. Guardar reconsulta el repositorio, compara el fingerprint esperado y devuelve 409 si cambió; el cache visual no autoriza una escritura.
- Al cambiar el origen del borrador, POS envía invalidación al receptor por `postMessage` con origen exacto y canal aleatorio; el receptor escucha incluso antes de login y bloquea la confirmación si recibe la invalidación. No transfiere tokens. Se elimina el acceso inverso `opener`.

## Errores y logs

IMEI/documento inválidos esperan corrección local. ACTIVA válida continúa; ANULADA y LEGACY se rechazan sin activar ni reemplazar documentos. Timeout, red, 500, 429, autorización, respuesta inválida y conflictos presentan mensajes de negocio. Un 404 genérico/HTML/ruta inexistente no se interpreta como ausencia; se exige un contrato explícito de resultado vacío. Respuestas contradictorias con `error` o `success: false` tampoco preparan creación.

El flujo de confirmación registra solo evento, resultado y código de una lista cerrada (o SERVICE_ERROR). No registra cuerpo, datos personales, tokens ni comprobante completo. Se reutilizan los logs seguros del transporte existente.

## Cuota y límites de evidencia

Todas las verificaciones ejecutadas fueron locales. Consumo remoto ejecutado para esta tarea: cero lecturas/escrituras. En uso real, la búsqueda y la revalidación consumen lecturas; deduplicar no hace gratuitas las consultas. No se estimó ni autorizó un recorrido masivo, backup o prueba productiva.

Riesgo residual POS ↔ repositorio: MEDIUM. No hay transacción distribuida: persiste una ventana entre la última lectura autoritativa y el commit POS. La invalidación entre pestañas es de mejor esfuerzo; aislamiento del navegador, pestaña cerrada o un mensaje enviado antes de cargar el receptor puede impedir su entrega. No cancela una creación ya confirmada/en curso. La transacción del repositorio evita duplicados por IMEI, pero no elimina estas ventanas entre aplicaciones. Verificar entrega real antes de certificar la integración; no afirmar que todos los navegadores la soportan por haber pasado mocks.

El origen público de boletas deriva del endpoint configurado que devuelve POS en NOT_FOUND; existe fallback al sitio de boletas conocido. Debe comprobarse que API y UI comparten origen en el despliegue real. No se modificaron autenticación, roles, secretos ni alcance de la clave de integración de lectura.

## Checklist manual pendiente (repetir a 375, 390 y 430 px)

MANUAL VISUAL TEST REQUIRED: el navegador del entorno devolvió ERR_BLOCKED_BY_CLIENT al abrir la vista local aislada. No se modificó código para superar ese bloqueo. Teclado móvil: NO VERIFICADO; necesita dispositivo/navegador móvil real.

1. Abrir fixtures locales aislados: no conectar servicios productivos; comprobar inputs de cliente/IMEI visibles y ausencia de scroll horizontal.
2. Introducir IMEI incompleto y luego válido: esperar debounce y revisar loader, estado y una sola llamada simulada.
3. Probar ACTIVA válida: mensaje encontrado, asociación visible y ninguna preparación de boleta.
4. Probar ANULADA/LEGACY: mensajes claros, sin creación ni continuación inválida.
5. Probar NOT_FOUND explícito: borrador legible, cliente/equipo correctos y botones cómodos (objetivo mínimo 44 px).
6. Abrir receptor local simulado: AUTO conservados, venta/fecha/formato manuales; revisar login y eliminación del fragmento, sin emisión al abrir.
7. Confirmar con backend simulado: checkbox obligatorio; doble tap y creación concurrente no duplican, reutilización informa al usuario.
8. Cambiar IMEI/datos en POS con receptor abierto y durante login: comprobar invalidación recibida, bloqueo del borrador anterior y descarte de respuestas viejas.
9. Simular timeout/500/429/red/409: errores legibles, reintento explícito, sin preparar ausencia ni mostrar detalles técnicos.
10. Regresar y comprobar sin cache; simular edición/hash cambiado y guardado. En móvil real revisar teclado, foco y scroll vertical sin tapar acciones.

La prueba productiva sigue pendiente de autorización expresa y presupuesto de lecturas recuperado. No ejecutarla como parte de este checklist local. La fixture del entorno actual bloquea escrituras y apertura real de boletas; para pasos entre apps se necesita un receptor y backend local simulados. No convertir esa fixture en conexión productiva.

## Archivos de esta tarea

POS modificados: `src/features/registros/RegistroForm.jsx`, `src/features/registros/appleReceiptLookup.js`, `netlify/functions/_appleReceiptsApi.mjs`, `netlify/functions/comprobanteApple.mjs`, `netlify/tests/appleReceiptMaintenance.test.mjs`, `package.json`.

POS creados: `src/features/registros/appleReceiptAutomation.js`, `src/features/registros/appleReceiptDraft.js`, `netlify/tests/appleReceiptAutomation.test.mjs`, este documento.

Boletas modificados: `src/App.jsx`, `src/features/boletas/BoletaExtranjera.jsx`, `netlify/functions/boletas.mjs`, `netlify/tests/boletas.test.mjs`.

Boletas creados: `src/features/boletas/posReceiptDraft.js`, `netlify/tests/posReceiptDraft.test.mjs`.

Los cambios anteriores de mantenimiento Apple/DNI/configuración temporal permanecen en los árboles de trabajo; no forman parte nueva de esta tarea y no se descartaron.

## Validaciones finales

| Verificación local | POS | Boletas |
| --- | --- | --- |
| npm test | PASS: 307/307 | PASS: 54/54 |
| npm run lint | PASS: 0 errores, 5 advertencias preexistentes | PASS: 0 errores/advertencias |
| npm run build | PASS | PASS |
| git diff --check | PASS | PASS |

Las suites específicas Apple, automatización, comprobantes, registros y POS están incluidas en `npm test`; el repositorio incluye boletas, contrato y confirmación del borrador mediante su glob de tests. Cobertura nueva: 24 casos de automatización POS, 9 de receptor/confirmación y 5 de creación concurrente/reutilización en el repositorio. Los tres comandos finalizaron con código 0 en ambos proyectos.

Estado funcional: implementación local PASS; móvil 375/390/430 MANUAL REQUIRED; prueba real pendiente YES; meta PARTIAL hasta las verificaciones visuales y entre aplicaciones. No se hizo push/deploy.

### Cierre Git autorizado

Se seleccionaron commits separados de POS y boletas con la automatización, sus dependencias Apple de estado/fingerprint/validación final, pruebas y documentación. Fotos DNI, configuración temporal Firebase, cambios de autenticación de integración y presentación de URL en PDF quedan fuera. En `functionsClient.js` y `package.json` se seleccionó únicamente la parte Apple; los demás cambios permanecen en el árbol de trabajo.

Se exportó el índice de cada repositorio a una carpeta temporal sin configuración `.env` y se verificó el contenido que se commiteará: POS 291/291 y boletas 53/53, lint y build PASS en ambos; POS conserva 5 advertencias preexistentes. El test de anulación seleccionado comprueba el 401 de la autenticación Firebase existente ante una API key sin usuario; la versión del árbol de trabajo conserva el 403 correspondiente al cambio previo de integración que no entra en este commit. La primera ejecución aislada detectó esa diferencia de fixture; la repetición con el contrato correcto pasó. No se alteró lógica de autenticación.

Estas cantidades son distintas de las suites del árbol completo (307 POS y 54 boletas) porque estas últimas incluyen tareas previas que no se commitean aquí. La validación aislada evita depender accidentalmente de esos cambios pendientes. Se conservan las limitaciones móviles y productivas anteriores; cerrar Git no certifica un despliegue ni una prueba real.

Reducción de pasos: se elimina la acción manual inicial de lookup y la reintroducción de datos confiables conocidos. Se mantienen revisión, completar precio/fecha/formato faltantes, confirmación y comprobación al regresar; puede ser necesario login en boletas. No se midió un número universal de taps ni una prueba E2E real.
