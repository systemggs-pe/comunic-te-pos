# AGENTS.md

## Tests
run: npm test

## Lint
run: npm run lint

## Build
run: npm run build

## Guidelines
- No modificar archivos sensibles sin aprobación
- Priorizar seguridad y performance
- Mantener estilo existente

## Firestore: presupuesto de lecturas y cuota
- Una operación de solo lectura también consume cuota y puede afectar la disponibilidad de producción.
- Antes de backups, auditorías o recorridos masivos, estimar documentos, páginas, consultas de metadatos y verificaciones adicionales. Definir un presupuesto máximo; si no se conoce el consumo disponible, no iniciar un recorrido masivo sin informar la estimación y obtener autorización explícita para ese alcance.
- Preferir consultas mínimas y dirigidas. No recorrer toda la base ni consultar subcolecciones por cada documento salvo necesidad explícita y presupuesto aprobado.
- No repetir backups completos, auditorías ni prechecks que consulten producción por timeout o fallo parcial. Detenerse, informar las lecturas realizadas o estimadas y revisar el presupuesto antes de solicitar un nuevo intento.
- Aumentar concurrencia no reduce el consumo. No aumentarla para resolver timeouts sin revisar primero cuota y volumen de consultas.
- Ante `RESOURCE_EXHAUSTED` / `Quota exceeded`, detener inmediatamente las lecturas remotas pendientes. No ejecutar más consultas, backups ni prechecks remotos; reportar el bloqueo. No modificar cuotas, facturación ni configuración por cuenta propia.
- Si el usuario autoriza una comprobación de recuperación, realizar primero una única lectura mínima. Si vuelve a fallar por cuota, detenerse inmediatamente sin más lecturas ni cambios.
- Una instrucción de no consultar Firestore permanece vigente hasta que el usuario autorice expresamente nuevas lecturas. Las pruebas locales deben usar mocks o aislamiento local y no acceder a Firestore remoto.
