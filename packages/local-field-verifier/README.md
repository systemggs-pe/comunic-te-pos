# Local Field Verifier

Motor JavaScript local para aprender correcciones de campos estructurados y reutilizarlas sin consultar servicios de IA externos. No depende de React, Firebase ni APIs remotas.

## Uso

```js
import model from './models/model.generated.js';
import {verifyFields} from './src/index.js';

const result = verifyFields({
  extracted: {nombreComercial: 'REDMI NOTE 15 PRO + 5G GLACIAR BLUE', color: 'BLUE'},
  model,
  protectedFields: ['imei1', 'imei2', 'sn'],
});
```

El motor aprende dos tipos de patrones:

- reemplazos repetidos de un valor por otro;
- transferencias de una frase desde un campo hacia otro, por ejemplo separar un color del nombre comercial.

Los campos protegidos nunca son alterados por el modelo. Las validaciones críticas del programa anfitrión deben ejecutarse después de la inferencia.

## Dataset

Acepta JSON, un objeto `{ "examples": [] }` o JSONL. Cada ejemplo usa esta forma:

```json
{
  "before": {"nombreComercial": "EQUIPO GLACIAR BLUE", "color": "BLUE"},
  "after": {"nombreComercial": "EQUIPO", "color": "GLACIAR BLUE"},
  "meta": {"source": "LOCAL"}
}
```

El sanitizador excluye por defecto DNI, IMEI, serie, teléfono, correo, dirección y nombre del cliente. También descarta valores que contengan una secuencia de 15 dígitos.

## Entrenamiento

```powershell
node packages/local-field-verifier/training/train.mjs --input correcciones.json --min-count 2 --version 1.0.0
```

El comando actualiza `models/model.json` y `models/model.generated.js`. El archivo JavaScript permite importar el modelo tanto en Node.js como en el navegador sin cargadores especiales para JSON.

## Evaluación

Use un conjunto distinto del utilizado para entrenar:

```powershell
node packages/local-field-verifier/training/evaluate.mjs --input evaluacion.json
```

La evaluación informa coincidencia exacta total y por campo. No publique una versión que reduzca precisión o que intente aprender identificadores sensibles.

`training/seed-examples.json` contiene únicamente ejemplos sintéticos no sensibles para el modelo inicial. `training/evaluation-examples.json` usa nombres distintos para comprobar que las transferencias aprendidas se generalicen.

## Integración en otro proyecto

Copie la carpeta completa o publíquela en un registro npm privado. La API funciona en Node.js, navegadores, Electron y aplicaciones construidas con React, Vue u otros frameworks.

En COMUNIC@TE, las correcciones sanitizadas se guardan en IndexedDB y se entrenan automáticamente antes del siguiente escaneo. Se exigen al menos dos correcciones coincidentes y el modelo incluido en el build permanece como respaldo. La exportación JSON es opcional y sirve para respaldo o para publicar un modelo compartido entre dispositivos.
