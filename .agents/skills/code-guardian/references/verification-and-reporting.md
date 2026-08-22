# Verificacion y formato de informe

Usa esta referencia para informes formales y despues de cualquier modificacion.

## Escala de evidencia

Registra el nivel realmente alcanzado:

1. **Inspeccion estatica**: codigo, reglas o configuracion revisados.
2. **Control automatizado**: lint, typecheck, test o build ejecutado.
3. **Integracion**: API, Function, emulador, base de datos o servicio comprobado.
4. **Extremo a extremo**: flujo completo observado desde la UI hasta la respuesta final.

Los niveles no son intercambiables. Compilar no prueba permisos; una prueba de API no prueba la UI; un E2E feliz no cubre concurrencia ni acceso denegado.

## Verificacion posterior a cambios

Descubre los comandos en `AGENTS.md`, manifiestos y configuracion del repositorio. Ejecuta, cuando existan y sean relevantes:

1. lint;
2. typecheck;
3. pruebas unitarias e integracion;
4. prueba que reproduce el defecto o flujo cambiado;
5. build;
6. E2E, emuladores o smoke tests;
7. inspeccion del diff y regresiones relacionadas.

No ocultes fallos preexistentes. Diferencia: fallo causado por el cambio, fallo preexistente y control no ejecutado. No suavices un comando fallido porque otro comando paso.

## Checklist final

Marca cada elemento como **VERIFICADO**, **NO VERIFICADO** o **NO APLICA**, y adjunta evidencia:

- compila y build finaliza;
- TypeScript o typecheck finaliza, si existe;
- lint no contiene errores criticos;
- pruebas relevantes pasan;
- autenticacion y permisos funcionan;
- Firebase o persistencia funciona;
- Firestore y Storage Rules permiten y deniegan correctamente;
- APIs o Functions responden correctamente;
- formularios, loading y errores funcionan;
- el flujo critico afectado funciona de extremo a extremo;
- no se detectaron regresiones relacionadas;
- no se expusieron secretos ni vulnerabilidades criticas conocidas;
- rendimiento y UX permanecen aceptables para el escenario medido.

No marques un item solo por ausencia de evidencia contraria.

## Prioridad

- **P0 - Critico**: explotacion activa o inmediata, corrupcion o perdida de datos, secreto expuesto, control de acceso roto de alto impacto, caida o costo descontrolado.
- **P1 - Alto**: flujo principal roto, vulnerabilidad seria con precondiciones realistas, inconsistencia probable o regresion de gran alcance.
- **P2 - Medio**: impacto acotado, debilidad defensiva, rendimiento demostrado o deuda que eleva riesgo de cambios.
- **P3 - Bajo**: mantenibilidad, claridad, UX menor o mejora preventiva sin impacto inmediato.

La prioridad combina impacto, probabilidad, alcance y facilidad de explotacion. No uses P0 para conseguir atencion.

## Informe de auditoria

Orden recomendado:

### RESUMEN

- Estado general: Correcto, Requiere atencion o Critico.
- Alcance real revisado.
- Evidencia principal.
- Riesgo mas importante.

### MAPA E INVENTARIO

Resume arquitectura y funcionalidades con sus estados. En auditorias focalizadas, incluye solo el alcance acordado y declaralo.

### HALLAZGOS

Ordena por P0 a P3. Para cada hallazgo incluye:

- **Problema**
- **Archivo y funcion**
- **Severidad**
- **Impacto**
- **Causa raiz**
- **Evidencia**
- **Solucion minima**
- **Estado de correccion**, si hubo implementacion

Separa hechos, inferencias y recomendaciones. Usa referencias de archivo y linea tan estrechas como sea posible.

### PRUEBAS EJECUTADAS

Lista comando o procedimiento, resultado y capa cubierta. Incluye pruebas fallidas y limitaciones del entorno.

### NO VERIFICADO

Enumera explicitamente cada flujo o capa pendiente, el motivo y la evidencia necesaria para resolverlo. Esta seccion es obligatoria cuando algo queda sin probar.

### PRIORIDADES Y SIGUIENTES PASOS

Propone primero correcciones P0/P1, luego pruebas de regresion y finalmente mejoras P2/P3. No conviertas recomendaciones opcionales en trabajo ya autorizado.

## Informe de correccion puntual

Para una tarea pequena no fuerces un informe largo. Entrega:

1. causa raiz y cambio realizado;
2. archivos afectados;
3. comandos y pruebas con resultado;
4. regresiones revisadas;
5. elementos **NO VERIFICADOS**.

El cierre debe permitir que otra persona reproduzca la evidencia sin depender de "deberia funcionar".
