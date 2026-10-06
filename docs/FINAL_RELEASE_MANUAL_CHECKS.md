# Comprobaciones manuales de release

Estado: MANUAL REQUIRED. No autoriza push, deploy, cambios de secretos, usuarios ni roles. La presencia de variables en `.env` y las pruebas locales no certifican la configuración de Netlify ni el popup de Google.

## 1. Netlify: variables y versión efectiva

Sitio: `comunicate-registros-v2.netlify.app`. No se encontró una credencial API/CLI de Netlify ni un conector disponible para consultar su configuración privada. El estado remoto de cada nombre siguiente es **PENDIENTE**, no «ausente». El operador debe registrar YES/NO por nombre en el contexto Production y scope indicado, sin copiar valores.

| Nombre exacto | Obligatorio / uso | Scope que comprobar | Remoto |
| --- | --- | --- | --- |
| FIREBASE_SERVICE_ACCOUNT | Certificado Admin JSON; alternativa a los tres siguientes | Functions | PENDIENTE |
| FIREBASE_PROJECT_ID | Obligatorio si no se usa certificado JSON | Functions | PENDIENTE |
| FIREBASE_CLIENT_EMAIL | Obligatorio si no se usa certificado JSON | Functions | PENDIENTE |
| FIREBASE_PRIVATE_KEY | Obligatorio si no se usa certificado JSON | Functions | PENDIENTE |
| RENIEC_TOKEN | Consulta RENIEC y fallback de DNI Fotos | Functions | PENDIENTE |
| RENIEC_TIMEOUT_MS | Opcional, timeout RENIEC | Functions | PENDIENTE |
| CODART_TOKEN | Opcional si RENIEC_TOKEN sirve para DNI Fotos | Functions | PENDIENTE |
| CODART_TIMEOUT_MS | Opcional, timeout DNI Fotos | Functions | PENDIENTE |
| CODART_MAX_IMAGE_BYTES | Opcional, límite de imagen | Functions | PENDIENTE |
| GEMINI_API_KEY | Obligatorio para análisis Gemini | Functions | PENDIENTE |
| GEMINI_MODEL | Opcional, fallback configurado en código | Functions | PENDIENTE |
| GEMINI_TIMEOUT_MS | Opcional, timeout Gemini | Functions | PENDIENTE |
| APPLE_RECEIPTS_API_URL | Obligatorio para comprobante Apple | Functions | PENDIENTE |
| APPLE_RECEIPTS_API_KEY | Obligatorio para comprobante Apple | Functions | PENDIENTE |
| APPLE_RECEIPTS_TIMEOUT_MS | Opcional; nombre exacto usado en código | Functions | PENDIENTE |
| ALLOWED_ORIGINS | Orígenes adicionales, separados por comas; comprobar dominio efectivo | Functions | PENDIENTE |
| URL / DEPLOY_PRIME_URL | Inyectadas por plataforma; comprobar origen permitido | Functions | PENDIENTE |
| RATE_LIMIT_COLLECTION | Opcional, colección de límite de peticiones | Functions | PENDIENTE |
| VITE_BACKEND_BASE_URL | Opcional; vacío usa API del mismo origen; otro host requiere CORS verificado | Build | PENDIENTE |
| VITE_APP_VERSION | Opcional, identificador visible de versión | Build | PENDIENTE |

`FIREBASE_API_KEY` de `.env` no sustituye credenciales Admin y no es requisito de las Functions actuales. Google OAuth no requiere un `GOOGLE_CLIENT_SECRET` nuevo en este proyecto. Revisar proveedor Google y dominios autorizados en Firebase Console, sin cambiar su configuración en esta fase. Comprobar Node de build/runtime (artefacto local dirigido a Node 22) y commit/deploy ID publicado. Variables nuevas o correcciones requieren ejecución separada autorizada.

Referencia: [scopes y contextos de variables Netlify](https://docs.netlify.com/build/environment-variables/overview/).

## 2. Google Auth: navegador y sesiones

Registrar navegador, fecha UTC, revisión frontend/API/Rules, resultado y evidencia privada sin tokens, emails ni datos de clientes. Ejecutar primero en un entorno controlado que sirva esta revisión; el sitio publicado anterior carecía de `/api/usuarios`, por lo que no certifica el código nuevo. Pruebas que crean consentimiento legal u otros datos requieren fixtures y entorno aislado. No modificar identidades ni los dos roles productivos para probar desactivación/recuperación.

| Caso | Pasos y resultado esperado | Estado |
| --- | --- | --- |
| Login permitido | Abrir sesión limpia, popup Google con cuenta autorizada existente; `me` devuelve rol esperado y UI concede acceso | MANUAL TEST REQUIRED |
| Login no autorizado | Cuenta existente sin asignación: API y datos protegidos denegados, sin crear rol automáticamente | MANUAL TEST REQUIRED |
| Persistencia | Recargar y cerrar/reabrir navegador; sesión conserva identidad correcta y vuelve a validar permisos | MANUAL TEST REQUIRED |
| Logout | Cerrar sesión, atrás/recarga y petición protegida: sin acceso ni contenido de otra sesión | MANUAL TEST REQUIRED |
| Cambio rápido de cuenta | Login/logout/login durante carga de `me`; respuesta antigua no debe restaurar acceso ni perfil de otra cuenta | MANUAL TEST REQUIRED |
| Expiración / refresh | Sesión abierta; observar renovación del SDK y API autenticada con token vigente; token expirado no renovable denegado | MANUAL TEST REQUIRED |
| Identidad disabled | Solo fixture aislado: desactivar identidad/revocar tokens y comprobar API; revisar ventana de tokens ya emitidos en Rules | MANUAL TEST REQUIRED |
| Rol disabled | Solo fixture aislado: cambiar rol a disabled con sesión abierta; nuevas operaciones API/Rules denegadas; UI debe reflejarlo al revalidar | MANUAL TEST REQUIRED |
| Recuperación | Solo fixture aislado: administrador de recuperación habilita asignación explícita; nueva sesión recupera acceso; comprobar que queda otro admin válido | MANUAL TEST REQUIRED |

Los tests de autorización y Rules cubren permisos/denegaciones con fixtures; no reproducen el popup Google ni persistencia real del navegador. El frontend consulta el perfil en eventos Auth; un cambio de rol no garantiza actualización instantánea de UI y debe verificarse. El token del SDK se renueva, pero un token ya emitido puede conservar validez en Rules hasta expirar si solo se deshabilita Auth; la API comprueba revocación. No declarar revocación inmediata universal ni E2E PASS sin la prueba real. Un fallo confirmado en estos casos bloquea release y debe registrarse como FAIL, sin corrección productiva automática.

## 3. Recuperación productiva

Completar `ROLLBACK_PLAN.md`: confirmar deploy Netlify activo y anterior probado, acceso del operador, copia exacta de Rules, checksum y retención de backup, y ensayo aislado de restauración. No inferir el commit desplegado a partir del baseline Git. No borrar los roles creados: hoy son los dos administradores válidos. Mantener el backup de clientes solo en almacenamiento privado.

## Constancia y códigos del precheck

`npm run release:precheck` devuelve 0 = YES, 1 = NO por fallo técnico/seguridad o fallo manual confirmado, 2 = CONDITIONAL cuando solo quedan verificaciones manuales. CONDITIONAL no autoriza despliegue.

Después de comprobaciones reales, el operador puede registrar `.netlify/release-gates.json` (ignorado por Git): `checkedAt` ISO UTC menor de 24 horas; `packageSha256` SHA256 de `package-lock.json`; `rulesSha256` SHA256 de `firestore.rules`. Cada propiedad `productionEnvironment`, `googleAuth`, `productionRollback` requiere `verified: true` y `evidence` con referencia privada al resultado real. Un resultado confirmado negativo lleva `result: "FAIL"`. No generar constancias a partir de esta lista ni de resultados simulados. El backup se verifica automáticamente en `.netlify/release-backup/evidence.json`, no mediante una declaración manual.
