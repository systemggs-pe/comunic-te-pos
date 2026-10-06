# Registro Apple: mantenimiento y mitigacion de riesgos

## Estado y alcance

Mitigaciones implementadas LOCALMENTE en POS y en el repositorio vecino
`comunicate-boletas-extranjeras`. No consultas remotas, migraciones, push,
deploy, cambios de secretos, autenticacion, roles ni reglas.
Cambios previos de Fotos DNI/Firebase conservados.

## Estado del comprobante

Nuevas boletas: `estado: ACTIVA`. Ediciones conservan ACTIVA, ANULADA o null;
nunca reactivan automaticamente. Documentos sin estado permanecen LEGACY /
DESCONOCIDA (`estado: null` en API) y siguen siendo legibles en el historial.
POS rechaza LEGACY con mensaje para actualizar/validar el repositorio; no se
inventa una validacion historica ni se ejecutan backfills. Una edicion ordinaria
no certifica como activa una boleta legacy: requerira confirmacion autorizada
especifica de su estado, fuera de esta tarea.

Operacion `annul` con `historialId`: transaccion local del repositorio marca
ANULADA y actualiza updatedAt con serverTimestamp; no borra la boleta ni libera
locks. Usa la autorizacion Google existente de usuarios permitidos. La clave de
integracion solo permite searchHistory y no puede anular. No se agrego UI nueva
para anulaciones ni se modificaron permisos.

## Contrato y fingerprint

safeBoleta devuelve estado, updatedAt y receiptFingerprint. updatedAt ya existia;
el adaptador POS ahora lo conserva junto a estado/fingerprint. SHA-256 generado
SOLO en servidor. El frontend recibe y conserva la huella, no la calcula.

`_receiptFingerprint.mjs` centraliza el contrato v1 para todos los endpoints de
cada proyecto. Ambos proyectos se despliegan por separado y empaquetan el mismo
modulo; un vector dorado identico en sus suites protege la compatibilidad. Se
comprobo tambien el paso safeBoleta del repositorio -> adaptador POS localmente.
No imports entre carpetas externas en los bundles desplegables.

Contenido normalizado: ID, estado, numero, fecha ISO, cliente, formato/origen,
ventas (IMEIs, producto, precio), mapa de equipos e importes PEN/CLP/USD. Orden
estable de claves, ventas y equipos; normalizacion Unicode NFC, espacios de
IMEI y representacion numerica. Excluye createdAt, updatedAt, IDs de filas y
propiedades ajenas al contrato. updatedAt es evidencia temporal, no la version.

El adaptador recomputa la huella sobre la respuesta autoritativa ANTES de
serializar y exige coincidencia con la emitida por el repositorio. Conserva esa
huella del documento original, aunque el DTO POS exponga menos campos.
Cambios de campos incluidos cambian la huella; cambios irrelevantes no.

## Consulta, cache y validacion final

UI lookup -> puede usar cache de una respuesta valida durante 30 segundos.
FINAL SAVE VALIDATION -> consulta remota nueva, sin cache ni retries.

Reglas compartidas: IMEI de 15 digitos y Luhn, ID valido, numero/fecha/cliente
consistentes, una unica venta del IMEI, precio positivo, marca APPLE y mapa
coherente, estado ACTIVA y huella hexadecimal SHA-256 valida. Respuesta ambigua,
incompleta, anulada o legacy se rechaza. Se conservan timeout servidor 10 segundos
(maximo 20), cliente 25 segundos y un intento total.

El formulario envia expectedReceiptFingerprint. create/update reconsultan antes
de la transaccion POS, comparan la huella y guardan receiptFingerprint y
receiptUpdatedAt observados junto a la referencia. Nunca se consulta dentro de
los reintentos de la transaccion. Los locks/transaccion POS existentes se conservan.
PDF usa boletaApple de esa validacion final, no una copia anterior de UI.

preverifiedAppleReceipt sirve, como maximo, como huella esperada: nunca evita la
consulta final. El flujo de completar solicitudes publicas, que no tiene consulta
visual previa de boleta, descubre/valida el comprobante una sola vez en el limite
final de createRegistro. Su marcador interno de entrada es reemplazado por el ID
autoritativo antes de cualquier escritura; no se persiste una referencia inventada.

## HTTP 409 y mensajes

- ANULADA: "El comprobante asociado a este IMEI esta anulado."
- LEGACY: "Este comprobante necesita ser actualizado antes de poder utilizarse."
- Huella distinta: "El comprobante cambio desde la ultima validacion. Vuelve a
  consultarlo antes de guardar."
- Huella ausente: volver a consultar antes de guardar.
- Boleta desaparecida o IMEI cambiado: 409, sin escritura POS.

Errores del transporte conservan su clasificacion (503/504/429, etc.); ningun
fallo habilita guardar. Los mensajes de usuario no exponen detalles del proveedor.
Logs solo incluyen evento/endpoint/codigo/HTTP/duracion/intento/resultado, nunca
IMEI, cliente, cuerpo, claves ni huellas vinculadas a datos personales.

## Edicion

Registros legacy sin fingerprint requieren nueva consulta antes de guardar, incluso
con referencia precargada. No se inventa huella historica. Referencias almacenadas
con huella pueden diferir la comprobacion hasta el guardado si no cambian campos
criticos; el guardado sigue comparando esa huella con el repositorio actual.
Cambio de IMEI/comprobante/marca invalida huella, updatedAt, cache y validacion.
Se mantienen bloqueos de doble pulsacion y descarte de respuestas antiguas.

## Riesgo residual y publicacion pendiente

Control de concurrencia OPTIMISTA, sin transaccion distribuida. Existe la ventana
ultima lectura -> commit POS. Un cambio durante esa ventana o despues del commit
no se propaga automaticamente al POS. RIESGO POS-REPO: MEDIUM.
RIESGO ANULACIONES: LOW cuando el estado es explicito y las anulaciones usan la
operacion controlada. Legacy se bloquea, sin asumir ACTIVA.

Los contratos nuevos requieren publicacion coordinada posterior. POS nuevo contra
repositorio viejo rechaza comprobantes sin estado/huella. No se publico ningun cambio.
Integracion desplegada y revision movil no certificadas.

## Prueba real preparada, NO AUTORIZADA

Una sola llamada server-side a APPLE_RECEIPTS_API_URL, action searchHistory,
searchType imei, query/imei: IMEI Apple real de 15 digitos de una boleta conocida.
Faltan confirmar URL efectiva, IMEI, ID/numero/datos esperados y recuperacion de
cuota. No usar un IMEI ficticio como evidencia de produccion ni exponer la clave.

La busqueda del repositorio tiene dos consultas limitadas a 50 documentos cada
una (hasta 100 documentos devueltos/leidos, posibles cargos/cuota adicionales
segun infraestructura). Sin recorridos, metadatos, backups ni reintentos.
La ruta POS ademas escribe su contador de rate limit: NO es solo lectura.
No ejecutar ningun camino hasta autorizacion explicita del alcance y presupuesto.
La prueba de busqueda validaria contrato/estado/huella/identidad y logs seguros;
no certificaria persistencia POS real. Esa persistencia solo se verifico con mocks.

## Verificacion local

Suites cubren estado ACTIVA/ANULADA/LEGACY, creacion/edicion/anulacion sin borrado,
actualizacion de timestamp, autorizacion de anulacion, determinismo/sensibilidad
de hash y vector de contrato, final sin cache, cambios/anulacion/desaparicion/IMEI,
rechazo 409 sin escrituras, guardado de huella/timestamp, preverified y edicion.
Firestore en memoria y fetch mockeado; variables Firebase dirigidas a 127.0.0.1:1.
Resultados finales locales (2026-10-06): POS npm test 283/283 PASS; repositorio
npm test 40/40 PASS. npm run lint PASS en ambos (POS: 0 errores, 6 advertencias
previas; repositorio: sin advertencias). npm run build PASS en ambos (POS 17.04 s,
repositorio 12.88 s). git diff --check PASS en ambos; modulos de fingerprint
identicos y contrato safeBoleta -> adaptador POS verificado con fixture local.
META: PARTIAL para cierre QA completo: prueba real y visual movil pendientes.
Mitigaciones solicitadas implementadas y verificadas localmente.

## Revision movil: MANUAL VISUAL TEST REQUIRED

Intento local aislado con el RegistroForm real, datos ficticios y transporte
reemplazado por mocks, puerto 4181. El navegador del agente devolvio
net::ERR_BLOCKED_BY_CLIENT al abrir localhost. Sin modificaciones para evadirlo.
375, 390 y 430 px: MANUAL REQUIRED. Teclado fisico movil: NO VERIFICADO.
El fixture visual anterior no certifica este contrato nuevo; sus respuestas necesitan
estado y huellas precalculadas en servidor antes de usarlo como evidencia de mitigacion.

Checklist manual (usar solo fixture aislado; no la app conectada a Firestore):

1. Abrir http://127.0.0.1:4181/ en un navegador propio mientras este servidor local
   siga disponible; confirmar PRUEBA AISLADA y Consultas ficticias. El fixture esta
   fuera de Git en la carpeta temporal comunicate-apple-maintenance-ui.
2. Repetir a 375, 390 y 430 px: IMEI, acciones, mensajes y modal dentro de pantalla,
   sin scroll horizontal; guardar capturas. Revisar controles de consulta de 44 px.
3. Avanzar a equipo y comprobar que un comprobante precargado aparece pendiente
   de validar al guardar, no verificado. Legacy sin huella exige consultar; una referencia
   con huella conservada puede diferir la validacion final.
   Corregir IMEI vacio, corto, largo o con letras sin llamadas nuevas.
4. Caso Lento: doble tap en Volver a validar comprobante, un incremento de contador y loader visible.
   Cambiar IMEI durante espera: la respuesta anterior no debe avanzar el formulario.
5. Casos Inexistente/Incompleto/Timeout: consultar explicitamente y revisar mensaje humano, IMEI conservado, sin avanzar;
   volver a intentar solo cuando se cambie el caso ficticio correspondiente.
6. Caso Valido: ver numero/fecha/cliente. Dentro de 30 s, volver y avanzar sin
   cambios criticos no debe incrementar consultas. Esperar TTL debe exigir revalidar.
7. Cambiar IMEI o pulsar Volver a validar comprobante: validacion previa invalidada
   y una consulta nueva. Revisar que las respuestas antiguas nunca prevalezcan.
8. Revisar botones de guardar y modal de confirmacion a las tres anchuras. El fixture
   bloquea las mutaciones con LIVE_TRANSPORT_FORBIDDEN: no certifica guardado visual.
   La persistencia/duplicados se comprobaron solo con el Firestore de memoria.
9. Teclado y area util con teclado abierto requieren un dispositivo movil real y
   acceso autorizado al fixture aislado; no considerar DevTools prueba de teclado.


## Archivos de esta mitigacion

POS modificados: netlify/functions/_appleReceiptsApi.mjs,
netlify/functions/_comprobanteApple.mjs, netlify/functions/_validators.mjs,
netlify/functions/registros.mjs, netlify/functions/solicitudesPublicas.mjs,
src/features/registros/appleReceiptValidation.js,
src/features/registros/appleReceiptLookup.js, src/features/registros/RegistroForm.jsx,
netlify/tests/appleReceiptMaintenance.test.mjs, netlify/tests/appleReceiptsApi.test.mjs,
netlify/tests/solicitudesPublicas.test.mjs y docs/APPLE_RECEIPT_MAINTENANCE.md.
POS creado: netlify/functions/_receiptFingerprint.mjs.
Repositorio modificados: netlify/functions/boletas.mjs, netlify/tests/boletas.test.mjs.
Repositorio creado: netlify/functions/_receiptFingerprint.mjs.
No atribuir otros cambios previos de Git a esta mitigacion.
