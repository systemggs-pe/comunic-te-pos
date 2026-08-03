import test from 'node:test';
import assert from 'node:assert/strict';
import {withContactHistory} from '../functions/_clientesShared.mjs';
import {parseVentaPayload} from '../functions/_validators.mjs';
import {sanitizarVentaParaTicket} from '../../src/features/ventas/ventaPdf.js';

test('una operación nueva conserva el celular principal y agrega el número usado al historial', () => {
  const result = withContactHistory(
    {celular: '999111222', celulares: ['999111222']},
    {celular: '988777666'},
  );

  assert.equal(result.celular, '999111222');
  assert.deepEqual(result.celulares, ['999111222', '988777666']);
});

test('la edición explícita del cliente cambia el principal sin perder números anteriores', () => {
  const result = withContactHistory(
    {celular: '999111222', celulares: ['999111222', '988777666']},
    {celular: '977555444', celulares: ['977555444']},
    {preservePrimary: false},
  );

  assert.equal(result.celular, '977555444');
  assert.deepEqual(result.celulares, ['999111222', '988777666', '977555444']);
});

test('la venta guarda el celular usado como dato propio de la operación', () => {
  const parsed = parseVentaPayload({
    cliente: {
      tipoDocumento: 'DNI',
      dni: '12345678',
      nombre: 'CLIENTE PRUEBA',
      celular: '988777666',
      correo: '',
      celulares: ['999111222', '988777666'],
      correos: [],
    },
    equipo: {
      idEquipo: '490154203237518',
      idDuenio: '12345678',
      imei2: '',
      sn: '',
      nombreComercial: 'EQUIPO PRUEBA',
      marca: 'PRUEBA',
      modelo: 'MODELO',
      ram: '',
      memoria: '',
      color: '',
      isVendido: true,
    },
    venta: {
      tipoDocumentoCliente: 'DNI',
      dniCliente: '12345678',
      celularCliente: '988777666',
      imeiEquipo: '490154203237518',
      imei2Equipo: '',
      sn: '',
      modeloEquipo: 'MODELO',
      marcaEquipo: 'PRUEBA',
      nombreComercial: 'EQUIPO PRUEBA',
      ram: '',
      memoria: '',
      color: '',
      precio: '100.00',
      medioPago: 'EFECTIVO',
      origenEquipo: 'PASE',
      proveedorPase: 'SOCIO INTERNO',
      precioEquipo: '100.00',
      itemsAdicionales: [],
      fecha: '2026-07-23T12:00:00.000Z',
    },
  });

  assert.equal(parsed.venta.celularCliente, '988777666');
  assert.equal(parsed.venta.origenEquipo, 'PASE');
  assert.equal(parsed.venta.proveedorPase, 'SOCIO INTERNO');
  assert.throws(
    () => parseVentaPayload({
      cliente: parsed.cliente,
      equipo: parsed.equipo,
      venta: {...parsed.venta, proveedorPase: ''},
    }),
    error => error.payload?.issues?.some(issue => issue.message === 'PROVEEDOR_PASE_REQUERIDO'),
  );
});

test('el origen y proveedor del pase no se incluyen en el ticket del cliente', () => {
  const ticket = sanitizarVentaParaTicket({
    nVenta: 'VEN-0001',
    origenEquipo: 'PASE',
    proveedorPase: 'SOCIO INTERNO',
  });

  assert.deepEqual(ticket, {nVenta: 'VEN-0001'});
});

test('un correo valido reemplaza datos antiguos invalidos de RENIEC', () => {
  const result = withContactHistory(
    {correo: 'a*****@dominio.com', correos: ['a*****@dominio.com', 'SIN CORREO']},
    {correo: 'cliente.nuevo@ejemplo.com', correos: ['cliente.nuevo@ejemplo.com']},
  );

  assert.equal(result.correo, 'cliente.nuevo@ejemplo.com');
  assert.deepEqual(result.correos, ['cliente.nuevo@ejemplo.com']);
});

test('editar el correo lo convierte en actual y conserva el anterior en el historial', () => {
  const result = withContactHistory(
    {correo: 'anterior@ejemplo.com', correos: ['anterior@ejemplo.com']},
    {correo: 'nuevo@ejemplo.com', correos: ['nuevo@ejemplo.com']},
  );

  assert.equal(result.correo, 'nuevo@ejemplo.com');
  assert.deepEqual(result.correos, ['anterior@ejemplo.com', 'nuevo@ejemplo.com']);
});
