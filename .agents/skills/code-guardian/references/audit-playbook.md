# Playbook de auditoria

Usa esta referencia para auditorias integrales o revisiones de frontend, backend, datos, errores, rendimiento, dependencias y pruebas.

## Descubrimiento del sistema

Construye un mapa breve y comprobable antes de modificar codigo:

- estructura, lenguaje, framework, runtime y sistema de build;
- rutas, modulos, componentes y limites entre capas;
- autenticacion, sesiones, roles y autorizacion;
- APIs, Functions, servicios, colas o tareas programadas;
- base de datos, colecciones o tablas, Storage y reglas;
- integraciones externas y variables de entorno por nombre;
- comandos de lint, typecheck, test, build, E2E y emuladores;
- flujos de negocio principales y datos sensibles.

Consulta `AGENTS.md`, manifiestos, configuraciones y documentacion vigente. Contrasta la documentacion con el codigo; no asumas que siguen sincronizados.

## Inventario de funcionalidades

Para cada funcionalidad dentro del alcance registra:

| Campo | Contenido |
|---|---|
| Nombre y estado | FUNCIONA, FUNCIONA PARCIALMENTE, ROTA, NO VERIFICADA o NO IMPLEMENTADA |
| Entrada y salida | Datos recibidos, respuesta y efecto observable |
| Superficies | Rutas, componentes, hooks, servicios, endpoints o Functions |
| Persistencia | Colecciones, tablas, archivos, transacciones o listeners |
| Acceso | Actor, autenticacion, autorizacion y reglas aplicables |
| Riesgos | Errores esperables, concurrencia, duplicados y datos extremos |
| Evidencia | Prueba, comando, request, log, captura o referencia de codigo |

No presentes como inventario completo una muestra parcial. Si el alcance o el tiempo no permiten cubrir todo, declara el subconjunto revisado.

## Frontend

Revisa:

- componentes, hooks, props, estado local y global;
- formularios, validacion, normalizacion y doble envio;
- navegacion, rutas, guards y retorno despues de autenticar;
- loading, empty, success y error states;
- modales, tablas, filtros, busqueda y paginacion;
- comportamiento responsive, teclado, foco, etiquetas y nombres accesibles;
- efectos, cleanup, dependencias, abortado de requests y condiciones de carrera;
- renders innecesarios, estado duplicado, componentes gigantes y logica de negocio acoplada a la UI.

Prueba escenarios felices, validaciones, errores de red, respuestas vacias, permisos denegados, datos largos y acciones repetidas. Una validacion del cliente nunca reemplaza la del servidor.

## Backend, APIs y Functions

Para cada entrada publica comprueba:

- metodos permitidos, autenticacion y autorizacion;
- validacion y normalizacion de parametros, body, archivos y headers;
- limites de tamano, timeout y consumo de recursos;
- codigos HTTP, forma estable de respuestas y mensajes seguros;
- manejo de errores, logging sin secretos o PII y promesas esperadas;
- idempotencia, reintentos, doble submit, concurrencia y rollback;
- operaciones parciales, duplicadas o fuera de una transaccion necesaria.

Rastrea como se obtiene la identidad. No aceptes del cliente un `userId`, rol, precio, propietario o permiso que deba derivarse de una sesion o fuente confiable.

## Validacion de datos

Comprueba en la frontera autoritativa:

- obligatoriedad, tipo, longitud, formato y rango;
- espacios, mayusculas, Unicode, caracteres especiales y valores extremos;
- duplicados, claves de idempotencia y normalizacion coherente;
- identificadores, telefonos, documentos, seriales, codigos, fechas, precios, cantidades, URLs y archivos;
- compatibilidad entre validacion del cliente, servidor y reglas de persistencia.

Prueba valores cero, negativos, maximos, vacios, nulos, repetidos y malformados cuando tengan sentido para el dominio.

## Errores y consistencia

Busca `catch` vacios, errores ignorados, promesas sin esperar, mensajes tecnicos al usuario, datos sensibles en logs y estados de UI que quedan bloqueados. Cada fallo importante debe detectarse, registrarse de forma segura, comunicarse con una accion util y dejar el sistema consistente.

Para procesos de varios pasos, identifica el punto de confirmacion y que ocurre ante un fallo intermedio. Exige transaccion, compensacion o idempotencia cuando la ausencia pueda corromper datos.

## Rendimiento

Mide o aporta evidencia antes de optimizar. Examina latencia, numero de requests, lecturas y escrituras, listeners, renders, tamano de bundle, imagenes y funciones lentas. Usa cache, paginacion, debounce, lazy loading, code splitting o memoizacion solo para un cuello de botella demostrado o un riesgo claro de escala.

No confundas una preferencia estilistica con un problema de rendimiento. Reporta metrica, escenario y efecto esperado de la propuesta.

## Dependencias

Revisa manifiesto y lockfile, paquetes directos y transitivos, versiones, advisories, paquetes abandonados, duplicados y dependencias sin uso. Ejecuta el auditor disponible cuando sea seguro. No actualices automaticamente dependencias criticas; analiza breaking changes, runtime soportado, lockfile y pruebas necesarias.

## Estrategia de pruebas

Asigna el nivel adecuado:

- unitarias para validadores y logica determinista;
- integracion para API, Functions, reglas, persistencia y servicios;
- E2E para autenticacion, permisos y flujos de negocio completos;
- regresion para cada defecto corregido.

Prioriza autenticacion, autorizacion, ventas, IMEI, inventario, clientes, portales publicos y PDFs. Un test que solo replica la implementacion sin observar el comportamiento no aporta evidencia suficiente.
