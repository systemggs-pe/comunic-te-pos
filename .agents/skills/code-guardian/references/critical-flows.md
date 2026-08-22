# Flujos criticos y seguridad de dominio

Usa esta referencia al revisar Firebase, permisos, datos de equipos, ventas, inventario, portales publicos, archivos o PDFs.

## Firebase y Firestore

### Lecturas

Busca consultas repetidas, listeners sin cleanup, lecturas sin limites, paginacion ausente, documentos crecientes y patrones que eleven costo o latencia. Verifica que los filtros de la UI no sean el unico mecanismo de aislamiento.

### Escrituras

Detecta escrituras duplicadas, operaciones que requieren transaccion o batch, contadores no atomicos, condiciones de carrera y estados parciales. Prueba concurrencia e idempotencia con emuladores o datos desechables cuando sea posible.

### Reglas y autenticacion

Lee completamente las reglas relevantes de Firestore y Storage. Comprueba que validen identidad, pertenencia, campos permitidos, tipos, transiciones de estado y limites. Contrasta cada acceso del cliente con una regla concreta. Revisa configuracion de Authentication, allowlists o claims, revocacion y tratamiento de usuarios deshabilitados.

No declares Firebase **VERIFICADO** solo porque las reglas compilan. Ejecuta pruebas de acceso permitido y denegado cuando exista emulador o entorno seguro.

## Roles, permisos e IDOR

Crea una matriz por rol real, no por roles de ejemplo:

| Rol | Ver | Crear | Modificar | Eliminar | Descargar |
|---|---|---|---|---|---|

Para cada operacion critica verifica enforcement en backend, reglas o ambas. Prueba acceso directo por ID, cambio de propietario, manipulacion de requests, escalamiento de privilegios y acceso cruzado entre usuarios u organizaciones. Los controles visuales y guards del frontend no son autorizacion.

## IMEI y equipos

Trata el IMEI como dato critico. Comprueba:

- normalizacion y formato numerico de 15 digitos cuando corresponda;
- checksum Luhn cuando el dominio lo exija;
- duplicados, IMEI inexistente, IMEI2 y asociacion con otro equipo;
- unicidad bajo concurrencia, no solo una consulta previa;
- permisos y auditoria para cambios de IMEI;
- historial y referencias desde ventas, registros o comprobantes;
- validacion autoritativa que no pueda evitarse manipulando la UI.

No cambies la politica de IMEI sin confirmar las reglas reales del negocio y los datos heredados.

## Ventas

Rastrea el flujo completo:

`cliente -> equipo -> IMEI -> precio y descuento -> pago -> inventario -> comprobante -> historial -> resultado en UI`

Comprueba identidad de cliente y equipo, disponibilidad, calculos del servidor, moneda y redondeo, metodos de pago, doble click, doble submit, reintentos, ventas duplicadas y fallos intermedios. Determina si las operaciones relacionadas son atomicas o tienen compensacion segura.

Los campos sensibles como precio final, descuento autorizado, vendedor o estado de inventario no deben confiar ciegamente en el cliente.

## Inventario

Demuestra que una venta produce exactamente el movimiento esperado y que cancelacion o devolucion lo revierte solo cuando corresponde. Prueba stock cero, concurrencia, producto inexistente, equipo serializado duplicado, reintento y rollback. Impide stock negativo si el negocio no lo admite.

Concilia venta, movimiento e inventario persistido; no verifiques cada documento de forma aislada si pueden divergir.

## Portal publico

Revisa entropia y almacenamiento de tokens, expiracion, revocacion, reutilizacion, rate limiting y enumeracion. Manipula IDs y parametros solo en un entorno autorizado. Confirma que cada URL exponga exclusivamente la informacion necesaria y que fotografias, documentos y datos personales no puedan obtenerse por conocer o adivinar una ruta.

Evita colocar secretos o PII en query strings, logs, analytics o caches compartidos.

## Archivos y evidencias

Audita upload, descarga, eliminacion y reemplazo. Comprueba propietario, permisos, tamano, MIME declarado y detectado, extension, nombre, rutas, malware cuando exista capacidad, y reglas de Storage. Usa nombres generados y evita path traversal, contenido activo servido en origen confiable y sobrescrituras por colision.

No ejecutes payloads maliciosos ni subas contenido peligroso a produccion. Usa muestras inertes y entornos controlados.

## PDFs y comprobantes

Verifica que la generacion use datos correctos y autorizados, fechas y moneda coherentes, nombres seguros y manejo de campos largos o faltantes. Comprueba rendimiento, documentos incompletos, informacion sensible y permisos de descarga. Cuando el layout importe, renderiza y revisa visualmente una muestra representativa.

Un usuario no debe descargar un PDF de otra persona mediante cambio de ID, URL o parametro.

## Seguridad transversal

Usa OWASP Top 10, OWASP ASVS y las guias vigentes de la tecnologia como referencias, no como sustituto de pruebas. Revisa XSS, inyeccion, CSRF cuando aplique, control de acceso roto, IDOR, secretos, tokens y exposicion de PII. Prioriza caminos explotables y demuestra precondiciones e impacto sin exceder el alcance autorizado.
