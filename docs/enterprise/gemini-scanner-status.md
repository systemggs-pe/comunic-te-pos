# Escaner Gemini: cambio temporal y verificacion

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
