# Cambio temporal a comunicate-aafcd

## Alcance confirmado

Destino: `comunicate-aafcd`. Base operativa vacia; sin copiar registros, ventas,
clientes o equipos desde `comunicate-tacna`. Los mismos correos de Google inician
sesion en Authentication del proyecto temporal; no se conserva la sesion Firebase
del proyecto original. No consultar el proyecto original mientras exista la
prohibicion de lecturas. No ejecutar backups ni migraciones de produccion.

Preparacion local no equivale a despliegue o verificacion de produccion.
La configuracion, los roles y las reglas remotas siguientes quedan pendientes;
este documento no autoriza escrituras o deploys automaticamente.

## Variables de Netlify

Configurar SOLO el contexto Production para conservar el entorno local.
Las seis variables publicas del frontend deben pertenecer a la misma app web del
proyecto temporal y estar disponibles en el scope Builds:

| Variable | Valor |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | apiKey de la app web temporal |
| `VITE_FIREBASE_AUTH_DOMAIN` | authDomain de la app web temporal |
| `VITE_FIREBASE_PROJECT_ID` | `comunicate-aafcd` |
| `VITE_FIREBASE_STORAGE_BUCKET` | storageBucket de la app web temporal |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | messagingSenderId de la app web temporal |
| `VITE_FIREBASE_APP_ID` | appId de la app web temporal |

El backend requiere `FIREBASE_SERVICE_ACCOUNT` con el JSON completo de una cuenta
de servicio del proyecto `comunicate-aafcd`, scope Functions. Es un secreto:
introducirlo directamente en Netlify; nunca en Git, chat o variables `VITE_`.
Esta variable tiene prioridad sobre las tres credenciales individuales
`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.
`FIREBASE_API_KEY` no reemplaza la configuracion del frontend actual.

Configuracion web publica proporcionada por el usuario (2026-10-06), lista para
introducir en Netlify, scope Builds y contexto Production:

```dotenv
VITE_FIREBASE_API_KEY=AIzaSyAHMYkEpa1NMvUiQA7wXBV3pTGY0aMhICE
VITE_FIREBASE_AUTH_DOMAIN=comunicate-aafcd.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=comunicate-aafcd
VITE_FIREBASE_STORAGE_BUCKET=comunicate-aafcd.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=362502368262
VITE_FIREBASE_APP_ID=1:362502368262:web:cb928ec9d43957a448e787
```

Estos identificadores no son la cuenta de servicio y no autentican al backend.
No se han aplicado a Netlify ni a los archivos privados `.env` o `.env.local`.

No modificar tokens CODART, RENIEC, Gemini o boletas para este cambio.
Revisar `ALLOWED_ORIGINS` para conservar el dominio publico existente.

## Preparacion necesaria del proyecto temporal

1. Crear la base Firestore `(default)` y registrar una app web. Obtener su
   configuracion publica completa, sin inventar apiKey o appId.
2. Habilitar el proveedor Google en Authentication y autorizar el dominio
   `comunicate-registros-v2.netlify.app`. La URL publica de la aplicacion no cambia.
3. Preparar las reglas e indices del repositorio (`firestore.rules` y
   `firestore.indexes.json`) exclusivamente para `comunicate-aafcd`. No usar reglas
   abiertas de prueba, ni modificar las reglas del proyecto original. Su publicacion
   requiere autorizacion explicita; no se ha ejecutado.
4. Crear solo los roles necesarios en
   `artifacts/comunicate-pos/users/shared/userRoles/{correo_normalizado}`:
   U-003: `role: superadmin`, `status: active`; U-006: `role: admin`,
   `status: active`. Campo `email`: el mismo correo exacto que identifica el
   documento. Usar los correos previamente confirmados; no IDs U-003/U-006 como
   nombres de documento. No copiar UIDs de Authentication del proyecto original:
   los usuarios del destino tendran sus propias identidades.
5. Configurar las variables en Production. Conservar de forma privada los valores
   anteriores para volver al proyecto original; no exportarlos al repositorio.
6. Publicar el codigo preparado y hacer un deploy solo con autorizacion explicita.
   Un cambio de variables no actualiza el bundle/frontend o Functions ya publicados.

## Verificacion y presupuesto propuesto

No se realizaron consultas remotas. Tras autorizacion explicita, proponer un
presupuesto inicial maximo de 20 lecturas dirigidas del proyecto temporal para
comprobar los dos roles y las colecciones iniciales necesarias, sin recorridos o
backups masivos. Si se prueba la UI, sus listeners y las verificaciones de reglas
tambien consumen lecturas; su costo se presupuesta aparte antes de iniciar.

La prueba de login registra consentimiento legal y la prueba de alta crea datos:
necesitan autorizacion para esas escrituras temporales. No basta con comprobar
un build para declarar el acceso o persistencia verificados en produccion.

## Retorno

Restaurar las variables anteriores de Production y realizar un nuevo deploy
autorizado cuando el proyecto principal este disponible. Si el frontend original
usaba los valores del codigo, retirar las seis variables publicas para recuperar
esos valores. No eliminar datos temporales automaticamente.
Los datos escritos en el destino NO se sincronizan ni se trasladan al original:
el eventual traspaso requiere plan y autorizacion aparte. No usar los scripts de
migracion de autorizaciones o backup existentes contra el proyecto temporal.
