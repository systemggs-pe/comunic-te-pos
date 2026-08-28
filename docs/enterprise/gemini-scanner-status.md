# Escaner Gemini: cambio temporal y verificacion

> El comportamiento vigente esta descrito en la ultima actualizacion:
> autollenado directo y equipos por DNI. Los apartados anteriores documentan
> verificaciones historicas, no el estado actual de la clave o del despliegue.

Fecha: 2026-08-28. Estado: **FUNCIONA PARCIALMENTE**. El codigo esta integrado;
la extraccion real queda pendiente de una clave de Gemini valida y del despliegue.

## Cambio realizado

- `src/features/registros/EscanerCaja.jsx`: ventas y registros usan Gemini. Se mantienen
  captura/galeria, revision manual y validacion de IMEI. Se informa del envio antes de analizar.
- `src/services/geminiBoxScanner.js`: comprime una copia JPEG hasta 1.5 MiB y acota la espera.
- `netlify/functions/analizarCajaGemini.mjs`: autenticacion existente, rate limiting,
  imagen validada, salida estructurada, errores sanitizados y respuestas `no-store`.
- `src/services/functionsClient.js`, `scripts/local-api.mjs` y `netlify.toml`: cliente y rutas.
- Avisos de privacidad y configuracion actualizados. No se habilito Firebase Storage.

El escaner no importa el OCR/verificador local ni lee, entrena, exporta, borra o guarda
correcciones. La libreria `packages/local-field-verifier`, los modelos, los servicios
locales y los ejemplos ya guardados se conservan. Sus comandos independientes siguen
disponibles para reutilizacion; no se ejecutan durante un escaneo con Gemini.

## VERIFICADO

- `npm test`: 90 pruebas correctas, incluidas 19 nuevas de Gemini y regresiones existentes
  de OCR/aprendizaje, busquedas, registros, ventas y consultas DNI.
- `npm run lint`: 0 errores, 8 advertencias preexistentes en RegistroForm/VentaForm.
- `npm run build`: correcto. Empaquetado adicional de la Function con esbuild: correcto.
- `git diff --check`: correcto con la configuracion normal del repositorio.
- API local real: POST sin token a `/api/analizarCajaGemini` devuelve 401 y `no-store`.
- UI con foto sintetica y servidor simulado: carga de imagen, aviso previo, error de
  clave invalida, reintento, revision de nueve campos, bloqueo de IMEI invalido,
  correccion y entrega de los datos al callback. No se guardaron operaciones reales.
- La clave local no aparece en los archivos JavaScript generados. El bundle del
  navegador tampoco incluye el OCR o el aprendizaje local.

## NO VERIFICADO

- Extraccion real con Gemini: la consulta de metadatos del modelo con la clave local
  devolvio HTTP 400, `INVALID_ARGUMENT`, `API_KEY_INVALID`. No se envio ninguna foto
  a Google ni se modificaron las credenciales.
- Flujo completo con sesion real, Gemini y aplicacion publicada: no se desplego.
- Camara fisica y dispositivos moviles: la prueba de UI utilizo una imagen sintetica.
- Autorizacion positiva y rate limiting contra Firestore real: cubiertos parcialmente
  por pruebas locales/simuladas, sin escrituras de prueba en produccion.
- Typecheck: NO APLICA; el proyecto no define ese comando. No se modificaron reglas
  de Firestore/Storage ni se ejecuto una migracion de datos.

## Para habilitar el uso real

1. Reemplazar `GEMINI_API_KEY` local por una clave valida; no publicarla en GitHub ni
   usar el prefijo `VITE_`.
2. Verificar una clave valida en el entorno de Functions de Netlify.
3. Mantener `GEMINI_MODEL=gemini-2.5-flash` o configurar un modelo compatible habilitado.
4. Desplegar frontend, Function y redirect juntos; probar una etiqueta con una sesion
   autorizada y revisar los campos antes de aplicarlos.

No se hizo commit, push ni despliegue en esta tarea.

## Actualizacion: extraccion en segundo plano (2026-08-28)

Estado: **FUNCIONA PARCIALMENTE**, verificada en navegador con proveedor simulado;
no se volvio a comprobar la clave real ni se desplego esta actualizacion.

### Comportamiento

- Al pulsar `Analizar en segundo plano`, se oculta el escaner y se muestra el
  progreso dentro del formulario. El operador puede escribir y cambiar de paso.
- La compresion JPEG usa `toBlob` asincrono; el limite de 40 segundos tambien
  cubre la preparacion de imagen. Se mantiene el limite de 1.5 MiB y 2400 px.
- El escaner permanece montado fuera del contenido condicional de los pasos en
  `VentaForm` y `RegistroForm`. Cambiar de paso ya no aborta la solicitud.
- Una respuesta correcta queda pendiente de revision y no modifica campos.
  `Usar estos datos` aplica los valores revisados, sin guardar en la DB.
- No se permite guardar un movimiento con un escaneo pendiente: primero se debe
  aplicar o descartar. El inicio del analisis marca el formulario como modificado.
- Se puede cancelar durante la espera y volver a la foto despues de un error.
  Las respuestas tardias no se aplican despues de cancelar o desmontar el escaner.
- Salir del formulario, recargar o cerrar la pagina descarta el trabajo local.
  No es una cola durable de servidor y no se agregaron colecciones ni Storage.
  Cancelar la peticion local no garantiza cancelar un trabajo ya recibido por Google.
- Impeccable guio el aviso en linea, la revision no intrusiva, las acciones
  accesibles y el retorno del foco; Code Guardian guio las pruebas y limites.

### Verificacion ejecutada

- `npm test`: **93/93**. Incluye cancelacion durante compresion, limite de espera
  durante preparacion, respuesta tardia y nuevo escaneo despues de cancelar.
- `npm run lint`: **0 errores, 8 advertencias existentes** en formularios.
- `npm run build`: correcto.
- `git diff --check`: correcto; Git advierte conversion de LF a CRLF en Windows.
- Navegador, formularios reales con respuestas simuladas y foto sintetica:
  edicion y cambio de paso durante espera; revision sin sobrescribir datos;
  bloqueo de guardado pendiente en ventas; validacion de IMEI y aplicacion de los
  nueve campos; error y reintento en registros; cancelacion desde otro paso sin
  aplicar la respuesta posterior; cierre de registro seguido de una respuesta
  tardia sin afectar una venta nueva. No se guardaron ventas ni registros.

### No verificado en esta actualizacion

- Gemini real, estado actual de la clave y extraccion de fotografias reales.
- Produccion, reglas/indices desplegados, credenciales de Netlify y DB real.
- Camara fisica y dispositivos moviles reales. No hay comando de typecheck.

El mapa actualizado de colecciones, relaciones y accesos esta en
[Estructura y conexiones de la DB](estructura-db.md). No se modificaron credenciales,
reglas, indices ni documentos de produccion. No se realizo commit, push o despliegue.

## Actualizacion: autollenado directo y equipos por DNI (2026-08-28)

Estado: **VERIFICADO LOCALMENTE** con respuestas simuladas; **PRODUCCION NO VERIFICADA**.

### Cambios vigentes

- Eliminada la pantalla de revision de los nueve campos extraidos. Gemini rellena
  directamente ventas/registros al terminar el trabajo en segundo plano. Se conserva
  la confirmacion de la foto antes de enviarla y el guardado manual del movimiento.
- El autollenado comprueba IMEI exactos de 15 digitos y Luhn, descarta duplicados,
  respeta cambios manuales durante la espera y no mezcla identificadores de otra caja.
  Si cambia el DNI o se selecciona otro equipo, se cancela el escaneo pendiente.
- Registros consulta el documento exacto en la Function `clientes`, accion
  `forRegistration`: incluye equipos, ventas y registros antiguos y pagina las tres
  fuentes. No depende de las referencias limitadas a 200 en el navegador.
- El selector aparece desde el paso del cliente, muestra el modelo y ambos IMEI,
  permite elegir cual registrar y completa los demas datos disponibles del equipo.
  Marca y deshabilita IMEI con registro activo, incluidos pendientes y registros
  antiguos. El otro IMEI sigue elegible si esta libre.
- Cambiar de documento elimina los equipos y la seleccion del cliente anterior.
  Las respuestas tardias se ignoran; una consulta fallida muestra error y reintento.
- No se habilita Storage, no se reactiva aprendizaje local ni se cambian credenciales,
  reglas, indices, colecciones o documentos de produccion.

### Evidencia

- `npm test`: **104/104** correctas.
- `npm run lint`: **0 errores, 6 advertencias** en efectos de formularios existentes.
- `npm run build`: correcto; Functions de clientes y Gemini empaquetadas con esbuild.
- Navegador con formularios reales y backend simulado: autollenado directo en ventas
  y registros, conservacion de cambios manuales, A56 vinculado al DNI pese a listas
  locales vacias, IMEI 1 deshabilitado y eleccion de IMEI 2, datos completos del equipo,
  cambio de documento sin conservar equipos ni identificadores del cliente previo.
- Pruebas de servidor: 500 clientes, documentos antiguos sin indices de busqueda,
  paginacion de 45 equipos, snapshots de ventas/registros sin equipo/cliente canonico,
  IMEI pendientes, locks, registros legacy, entradas invalidas y limites de lectura.
- Code Guardian guio las comprobaciones de pertenencia, duplicados y concurrencia;
  Impeccable guio el selector accesible y la eliminacion del paso intermedio.

El push solicitado incluye frontend y Function. Su despliegue conjunto en Netlify
es necesario. No se ha comprobado Gemini real ni el funcionamiento en produccion;
no se realizaron ventas o registros de prueba en la DB real. No existe comando
de typecheck en este proyecto.
