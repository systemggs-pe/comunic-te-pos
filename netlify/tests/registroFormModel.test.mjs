import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createInitialRegistroForm,
  descomponerMarcaRegistro,
  marcaFinalRegistro,
  normalizarMarcaRegistro,
  validateCustomerStep,
  validateEquipmentStep,
  validateRegistroDraft,
} from '../../src/features/registros/registroFormModel.js';

const validForm = {
  ...createInitialRegistroForm(),
  dni: '01338158',
  nombre: 'PARI HUANCA CARMELO',
  celular: '916024574',
  correo: 'cliente@example.com',
  direccion: 'AV. TACNA 123',
  departamento: 'TACNA',
  imei1: '865716088094342',
  imei: '865716088094342',
  imei2: '865716088094359',
  nombreComercial: 'REDMI NOTE 15',
  marca: 'XIAOMI',
  tieneCaja: 'SI',
};

test('registro form model validates customer and equipment independently', () => {
  assert.equal(validateCustomerStep(validForm, 'AV. TACNA 123 - TACNA'), null);
  assert.equal(validateEquipmentStep(validForm, {imeiYaRegistrado: () => false}), null);
  assert.equal(validateEquipmentStep({...validForm, imei2: '', imei: validForm.imei1}, {imeiYaRegistrado: () => false}), null);
  assert.equal(validateEquipmentStep({...validForm, imei2: '865716088094358'}), 'El IMEI 2 no es valido; verifica los digitos');
  assert.equal(validateEquipmentStep({...validForm, imei2: validForm.imei1}), 'El IMEI 1 y el IMEI 2 deben ser diferentes');
  assert.equal(validateEquipmentStep({...validForm, marca: ''}), 'La marca del equipo es obligatoria');
});

test('registro form model accepts a complete draft without IMEI 2', () => {
  assert.equal(validateRegistroDraft({...validForm, imei2: '', imei: validForm.imei1}, {
    direccionFinalCliente: 'AV. TACNA 123 - TACNA',
    esRegistroSimple: true,
    isEditing: false,
    imeiYaRegistrado: () => false,
    permitePrecioCero: true,
  }), null);
});

test('registro form model blocks duplicate IMEI and invalid Apple evidence', () => {
  assert.match(validateRegistroDraft(validForm, {
    direccionFinalCliente: 'AV. TACNA 123 - TACNA',
    esRegistroSimple: true,
    isEditing: false,
    imeiYaRegistrado: () => true,
    permitePrecioCero: true,
  }), /ya tiene un registro activo/);
  assert.equal(normalizarMarcaRegistro('xiaomi'), 'XIAOMI');
  assert.equal(normalizarMarcaRegistro('marca desconocida'), '');
});

test('registro form model supports a custom brand and requires Samsung origin', () => {
  const custom = {...validForm, marca: 'OTROS', marcaOtra: 'FAIRPHONE'};
  assert.equal(validateEquipmentStep(custom), null);
  assert.equal(marcaFinalRegistro(custom), 'FAIRPHONE');
  assert.deepEqual(descomponerMarcaRegistro('Fairphone'), {marca: 'OTROS', marcaOtra: 'FAIRPHONE'});
  assert.equal(validateEquipmentStep({...custom, marcaOtra: ''}), 'Escribe la marca del equipo');
  assert.equal(
    validateEquipmentStep({...validForm, marca: 'SAMSUNG', tipo: 'PASE'}),
    'Indica si el equipo Samsung es de TIENDA o EXTERNO',
  );
  assert.equal(validateEquipmentStep({...validForm, marca: 'SAMSUNG', tipo: 'EXTERNO'}), null);
});
