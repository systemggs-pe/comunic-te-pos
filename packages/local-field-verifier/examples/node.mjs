import model from '../models/model.generated.js';
import {verifyFields} from '../src/index.js';

const result = verifyFields({
  extracted: {
    nombreComercial: 'REDMI NOTE 15 PRO + 5G GLACIAR BLUE',
    color: 'BLUE',
  },
  model,
  protectedFields: ['imei1', 'imei2'],
});

console.log(result);
