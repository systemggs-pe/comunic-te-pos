# Estructura y conexiones de la base de datos

Revision del codigo: 2026-08-28. Este documento describe la implementacion del
repositorio, no un inventario obtenido de produccion. No se consultaron documentos,
cantidades, credenciales ni reglas desplegadas de la base real.

## 1. Motor y ubicacion

- Motor: Cloud Firestore, base predeterminada, con documentos y colecciones.
- Proyecto configurado en el frontend: `comunicate-tacna`.
- Identificador funcional de la aplicacion: `comunicate-pos`. No es el ID del
  proyecto Firebase ni el `appId` del registro de la aplicacion web de Firebase.
- Documento que agrupa los datos compartidos: `artifacts/comunicate-pos/users/shared`.
- Los operadores autorizados comparten ese espacio. No hay aislamiento por tienda,
  empresa o usuario, ni tablas SQL, Prisma o claves foraneas SQL.

Fuentes: `src/lib/firebase.js`, `src/repositories/firestoreRepository.js`,
`netlify/functions/_firebaseAdmin.mjs` y `firestore.rules`.

## 2. Arbol de colecciones

```text
Firestore (default)
├── artifacts/comunicate-pos/users/shared
│   ├── clientes/{numeroDocumento}
│   ├── equipos/{imeiPrincipal}
│   ├── ventas/{ventaId}
│   ├── registros/{registroId}
│   ├── imeiLocks/{imei}
│   ├── auditEvents/{eventId}
│   ├── legalConsents/{uid}_{versionLegal}
│   │   └── events/{eventId}
│   ├── problemasApp/{problemaId}
│   ├── changelogProblemas/{changelogId}
│   ├── configuracion/logoVentas
│   └── boletasExtranjeras/{boletaId}           [consulta de comprobantes existentes]
├── _counters/registros
├── _counters/ventas
└── _rateLimits/{hashDeVentana}
```

Las reglas tambien mencionan `configuracion/contadorBoletas` y
`configuracion/boletaExtranjeraEmisores`, pero bloquean su acceso desde el navegador.
No se encontro un escritor activo de esos documentos ni de `boletasExtranjeras` en
el codigo actual. No deben presentarse como funciones de creacion disponibles.
La existencia de documentos historicos solo puede confirmarse en la base real.

## 3. Campos principales

Los numeros de documento, IMEI, serie y telefonos se conservan como texto. Las fechas
de movimientos son cadenas ISO; los eventos y algunos controles usan Timestamp.
Firestore no tiene un esquema global obligatorio: el contrato de las escrituras
actuales se valida en el backend. Los documentos antiguos pueden diferir.

### clientes/{numeroDocumento}

| Campo | Tipo / uso |
|---|---|
| `dni` | Texto; identificador del documento, tambien para CE, pasaporte o RUC. |
| `tipoDocumento` | `DNI`, `CE`, `PASAPORTE`, `RUC`. |
| `nombre` | Nombre completo. |
| `celular`, `celularRef`, `correo`, `direccion` | Datos de contacto. |
| `celulares`, `correos` | Listas de contactos conservados. |
| `searchTerms` | Lista de terminos y prefijos para busquedas. |

Se actualiza mediante las Functions de clientes, ventas y registros. El documento
no contiene una subcoleccion de ventas: la conexion se hace mediante `dniCliente`.

### equipos/{imeiPrincipal}

| Campo | Tipo / uso |
|---|---|
| `idEquipo` | IMEI principal, igual al ID del documento. |
| `idDuenio` | Numero de documento del cliente asociado. |
| `imei2`, `sn` | Segundo IMEI y numero de serie. |
| `marca`, `modelo`, `nombreComercial` | Identificacion del equipo. |
| `ram`, `memoria`, `color` | Caracteristicas, guardadas como texto. |
| `isRegistrado`, `imei1Registrado`, `imei2Registrado`, `isVendido` | Indicadores booleanos operativos. |
| `searchTerms` | Indice de busqueda del equipo y datos asociados. |

Es un documento reutilizable y mutable. El propietario actual no reemplaza el
cliente historico guardado en cada venta o registro. Los indicadores no sustituyen
las comprobaciones de movimientos y bloqueos de IMEI del backend.

### ventas/{ventaId}

| Campo | Tipo / uso |
|---|---|
| `nVenta` | Correlativo, por ejemplo `VEN-0001`; distinto del ID de Firestore. |
| `dniCliente`, `tipoDocumentoCliente`, `nombreCliente`, `celularCliente` | Cliente y copia de los datos del movimiento. |
| `imeiEquipo`, `imei2Equipo`, `sn` | Identificadores del equipo vendido. |
| `marcaEquipo`, `modeloEquipo`, `nombreComercial`, `ram`, `memoria`, `color` | Copia de caracteristicas del equipo. |
| `precioEquipo`, `precio` | Importe del equipo y total, como texto decimal. |
| `itemsAdicionales` | Lista de `{nombre, cantidad, precio}`; valores de cantidad/precio como texto. |
| `medioPago` | `EFECTIVO`, `TRANSFERENCIA`, `TARJETA`. |
| `origenEquipo`, `proveedorPase` | `TIENDA`/`PASE` y proveedor interno cuando corresponde. |
| `fecha`, `searchTerms` | Fecha ISO e indice de busqueda. |

La creacion usa un ID automatico. El servidor valida los importes y las relaciones
cliente/equipo/movimiento, y actualiza el correlativo dentro de una transaccion.

### registros/{registroId}

| Campo | Tipo / uso |
|---|---|
| `nRegistro` | Correlativo, por ejemplo `RECO-00001`. |
| `dniCliente`, `tipoDocumentoCliente`, `nombreCliente` | Cliente asociado y nombre copiado. |
| `celularCliente`, `celularRef`, `correoCliente`, `direccionCliente` | Contacto del movimiento. |
| `imeiEquipo` | IMEI principal del documento de equipo asociado. |
| `imeiRegistrado` | IMEI exacto seleccionado para registrar, principal o secundario. |
| `imei2Equipo` | Segundo IMEI del equipo, cuando existe. |
| `marcaEquipo`, `modeloEquipo`, `nombreComercialEquipo` | Datos de identificacion copiados. |
| `estado` | `NO BLOQUEADO`, `BLOQUEADO`. |
| `estadoSolicitud` | `PENDIENTE`/`REALIZADO` para no bloqueados; vacio para bloqueados. |
| `operador` | `CLARO`, `MOVISTAR`, `ENTEL`, `BITEL`. |
| `tipo` | `TIENDA`, `EXTERNO`, `PASE`. |
| `tieneCaja` | Booleano. |
| `precio`, `fecha` | Importe como texto decimal y fecha ISO. |
| `boletaExtranjeraId`, `boletaExtranjeraNro` | Referencia al comprobante validado para equipos Apple. |
| `pdfDniUrl`, `pdfCajaUrl`, `pdfReciboUrl` | Campos opcionales; no implican un upload activo a Storage. |
| `searchTerms` | Indice de busqueda del movimiento. |

En el contrato actual, `sn`, RAM, memoria y color se escriben en `equipos`; no son
campos propios del payload de `registro`. Algunas vistas tienen compatibilidad con
copias historicas. No asumir que todos los registros contienen esos campos.

### Colecciones de control y soporte

| Coleccion/documento | Campos y finalidad |
|---|---|
| `imeiLocks/{imei}` | `imei`, `registroId`, `registrado`, `ventaId`, `vendido`, `updatedAt`. Reserva atomica de cada IMEI. |
| `_counters/registros`, `_counters/ventas` | `last`, `updatedAt`. Correlativos de negocio, no contadores de consultas DNI. |
| `_rateLimits/{hash}` | `endpoint`, `count`, `limit`, `windowMs`, `bucket`, `bucketStartAt`, `expiresAt`, `uidHash`, `ipHash`, `requestId`, `updatedAt`. Limite tecnico de solicitudes. La coleccion puede configurarse con `RATE_LIMIT_COLLECTION`. |
| `auditEvents/{id}` | `requestId`, `functionName`, `actorUid`, `actorEmail`, `entityType`, `entityId`, `action`, `eventType`, `status`, `metadata`, `createdAt`, `createdAtIso`. Trazabilidad de acciones del servidor. |
| `legalConsents/{uid}_{version}` | Identidad, version/documentos aceptados, preferencias de cookies, fechas, idioma, zona horaria, origen, IP y navegador. Subcoleccion `events` conserva eventos de aceptacion. |
| `problemasApp/{id}` | `titulo`, `descripcion`, `archivos`, `severidad`, `solucion`, `resuelto`, `createdAt`, `updatedAt`, `resolvedAt`, `resolvedBy`. |
| `changelogProblemas/{id}` | `problemaId`, `titulo`, `archivos`, `severidad`, `solucion`, `resumen`, `createdAt`, `createdBy`. |
| `configuracion/logoVentas` | `dataUrl`, imagen del logo guardada en el documento; regla limita a 900000 caracteres. |

`boletasExtranjeras` se consulta mediante `comprobanteApple`: lee `nBoleta`,
`clienteDni`, `clienteNombre`, `totalPen`, `totalClp`, `fechaHora`, `formato` y
`boletaData`. Resuelve equipos por `boletaEquipoKeys`, campo legado
`boletaEquipoKey` o ID igual al IMEI. En `boletaData` se leen `cliente`, `ventas`,
`equiposMap`, `emisor`, `totalClp`, `fechaHora` y `nBoleta`.

## 4. Conexiones entre documentos

| Desde | Campo que enlaza | Destino |
|---|---|---|
| `equipos` | `idDuenio` | ID / `dni` de `clientes`. |
| `ventas` | `dniCliente` | ID / `dni` de `clientes`. |
| `registros` | `dniCliente` | ID / `dni` de `clientes`. |
| `ventas` y `registros` | `imeiEquipo` | ID / `idEquipo` de `equipos`. |
| `registros` | `imeiRegistrado` | IMEI concreto, principal o secundario; su entrada en `imeiLocks`. |
| `imeiLocks` | `registroId`, `ventaId` | ID del movimiento que mantiene cada bloqueo. |
| `registros` | `boletaExtranjeraId` | ID de `boletasExtranjeras`; el servidor comprueba que incluya el IMEI. |
| `changelogProblemas` | `problemaId` | ID de `problemasApp`. |
| `legalConsents`, `auditEvents` | `uid` / `actorUid` | Usuario de Firebase Authentication, fuera de Firestore. |

Un cliente puede tener muchos equipos y movimientos. Un equipo tiene uno o dos
IMEI. Cada registro bloquea solo el IMEI seleccionado; la venta reserva los IMEI
vendidos. Un IMEI puede tener un bloqueo de venta y otro de registro a la vez,
pero no dos propietarios distintos para el mismo tipo de bloqueo.

Estas relaciones son valores de texto, no objetos DocumentReference ni claves
foraneas automaticas. Las Functions comprueban referencias y duplicados. Las
transacciones de venta/registro agrupan cliente, equipo, movimiento, correlativo,
bloqueos y evento de auditoria. La app evita borrar clientes que aun tengan
referencias; no existe una cascada SQL.

## 5. Conexion de la web con los servicios

```text
Web React
  ├─ Firebase Authentication: inicio de sesion con Google → ID token
  ├─ SDK Firestore + reglas
  │    ├─ lectura: clientes, equipos, ventas, registros
  │    └─ lectura/escritura limitada: logo, problemas y changelog
  └─ /api/*: ID token en Authorization
       └─ Netlify Functions (local: scripts/local-api.mjs)
            ├─ validar sesion, correo permitido, payload y limites
            ├─ Firebase Admin → Firestore (lecturas/transacciones)
            ├─ analizarCajaGemini → Google Gemini
            ├─ reniec → proveedor de consulta DNI
            └─ dniFotos → proveedor de fotos DNI
```

| Conexion | Archivo / configuracion |
|---|---|
| Inicializar Firebase del navegador | `src/lib/firebase.js`: `initializeApp`, `getAuth`, `getFirestore`. |
| Rutas de colecciones y consultas | `src/repositories/firestoreRepository.js`; `src/app/App.jsx` administra listeners y caches. |
| Llamar al backend con token | `src/services/functionsClient.js`; `VITE_BACKEND_BASE_URL` opcional, por defecto `/api`. |
| Validar token y correo permitido | `netlify/functions/_shared.mjs`; `ALLOWED_EMAILS`, `ALLOWED_ORIGINS`. |
| Conectar Admin con Firebase | `netlify/functions/_firebaseAdmin.mjs`; `FIREBASE_SERVICE_ACCOUNT` **o** `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`. |
| Gemini, solo servidor | `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_TIMEOUT_MS`. |

Las credenciales Admin deben apuntar al mismo proyecto que el frontend. Esto no se
confirmo contra el entorno desplegado en esta revision. No colocar claves privadas
ni la clave Gemini en variables `VITE_`, en el repositorio o en el JavaScript publico.

El servidor usa Admin SDK, por lo que su autorizacion se implementa en Functions;
las reglas no reemplazan esas comprobaciones. En las reglas actuales, el cliente
autorizado puede leer las cuatro colecciones de negocio, pero no escribirlas
directamente. `imeiLocks`, auditoria, consentimientos, contadores, rate limits y
boletas quedan sin acceso directo desde el navegador.

## 6. Busquedas e indices

- Ventas y registros: orden por `fecha`, paginas de 40 en la app y cursor `startAfter`.
- Datos de referencia iniciales: limite de 200; no representan todos los clientes/equipos.
- Nombres de clientes: hidratacion por documentos exactos y copia `nombreCliente`
  en los movimientos, para no depender solo de la primera pagina de clientes.
- Busqueda historica: Function `clientes`, con consultas exactas y
  `searchTerms array-contains`; no se limita a la lista visible.
- `searchTerms`: normalizacion de mayusculas/acentos, prefijos desde 3 caracteres,
  hasta 400 terminos. Lo construye `_searchIndex.mjs`.
- `firestore.indexes.json`: indices de `fecha` en registros/ventas y TTL declarado
  para `_rateLimits.expiresAt`; no declara indices compuestos. TTL e indices
  desplegados en produccion no se verificaron aqui.
- El script `scripts/backfill-search-index.mjs` sirve para documentos historicos;
  esta tarea no lo ejecuto ni modifico datos existentes.

## 7. Fotos, extraccion y aprendizaje local

- No se habilita Firebase Storage. La configuracion de un bucket no demuestra su uso.
- La foto de caja permanece temporalmente en memoria; se comprime y se envia al
  backend/Gemini al pulsar analizar. No se crea una coleccion de trabajos de escaneo.
- La extraccion en segundo plano pertenece al formulario abierto y sobrevive a
  cambios de paso. Al recibir la respuesta rellena directamente el formulario,
  sin pantalla intermedia de revision. Conserva cambios manuales hechos durante la espera.
- El guardado de la venta/registro sigue siendo una accion manual separada.
- Descartar, salir del formulario o recargar descarta el trabajo local. Cancelar
  la espera no garantiza que Google deje de procesar una peticion ya recibida.
- La consulta de fotos DNI no guarda fotos, contador de consultas ni historial de
  consultas en la app. El rate limit tecnico no es un historial de consultas.
- Las evidencias del formulario se procesan para PDF local; no se agrego un upload.
- El programa entrenable sigue pausado. Su almacenamiento anterior es IndexedDB
  del navegador, `comunicate-local-learning`, almacen `boxCorrections`; no Firestore.
  Los modelos reutilizables siguen en `packages/local-field-verifier`.

## 8. Alcance de verificacion

### Consulta de equipos para un registro

`POST /api/clientes`, accion `forRegistration`, recibe `dni`, `tipoDocumento`
y un cursor opcional vinculado al mismo documento. Requiere la autenticacion y
allowlist existentes. No crea colecciones ni escribe documentos.

- Lee `clientes/{dni}` y consulta por igualdad exacta `equipos.idDuenio`,
  `ventas.dniCliente` y `registros.dniCliente`.
- Pagina 20 documentos de cada fuente, ordenados por ID, con una lectura adicional
  para detectar mas resultados. No depende de las 200 referencias cargadas en la app
  ni de `searchTerms` o de ejecutar un backfill.
- Combina equipos por IMEI, recuperando atributos de las ventas/registros cuando
  falta el documento de equipo. No agrupa solo por modelo o numero de serie.
- Verifica `imeiLocks/{imei}.registroId` y los campos exactos `imeiRegistrado`/
  `imeiEquipo` de registros historicos. Un pendiente tambien reserva su IMEI;
  un registro del IMEI 2 no bloquea automaticamente el IMEI 1.
- Devuelve `cliente`, `equipos`, `activeImeis`, `registrationStatusComplete` y
  `nextCursor`. Si la consulta acotada de estado no es completa, la UI no permite
  seleccionar equipos con disponibilidad incierta. El guardado mantiene la
  validacion transaccional para evitar duplicados concurrentes.

**VERIFICADO POR INSPECCION:** rutas, campos del contrato, relaciones, escritores,
lectores, reglas en el repositorio y configuracion de indices descritos arriba.

**NO VERIFICADO:** contenido o conteos reales, reglas/indices desplegados,
coincidencia de credenciales locales/Netlify, permisos efectivos en produccion,
existencia de documentos historicos ni disponibilidad de proveedores externos.
