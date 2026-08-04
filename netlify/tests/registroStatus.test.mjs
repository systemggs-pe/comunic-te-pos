import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEstadoSolicitudPayload, parseRegistroPayload} from '../functions/_validators.mjs';
import {__test as registrosTest} from '../functions/registros.mjs';
import {registroMatchesStatus} from '../../src/utils/searchRecords.js';
import {emptyRegistroEvidencias, missingRegistroEvidencias} from '../../src/features/registros/registroEvidencias.js';

function payloadRegistro(overrides = {}) {
  return {
    cliente: {
      tipoDocumento: 'DNI', dni: '12345678', nombre: 'CLIENTE PRUEBA',
      celular: '999111222', celularRef: '', correo: 'cliente@ejemplo.com',
      direccion: 'TACNA, TACNA', celulares: ['999111222'], correos: ['cliente@ejemplo.com'],
    },
    equipo: {
      idEquipo: '490154203237518', idDuenio: '12345678', imei2: '', sn: '',
      marca: 'PRUEBA', modelo: 'MODELO', nombreComercial: 'EQUIPO PRUEBA',
      ram: '', memoria: '', color: '', isRegistrado: true,
      imei1Registrado: true, imei2Registrado: false,
    },
    registro: {
      tipoDocumentoCliente: 'DNI', dniCliente: '12345678', celularCliente: '999111222',
      celularRef: '', imeiEquipo: '490154203237518', imeiRegistrado: '490154203237518',
      imei2Equipo: '', modeloEquipo: 'MODELO', marcaEquipo: 'PRUEBA',
      nombreComercialEquipo: 'EQUIPO PRUEBA', estado: 'NO BLOQUEADO',
      estadoSolicitud: 'PENDIENTE', operador: 'BITEL', tipo: 'TIENDA', tieneCaja: false,
      precio: '20.00', fecha: '2026-07-23T12:00:00.000Z', boletaExtranjeraId: '',
      boletaExtranjeraNro: '', pdfDniUrl: '', pdfCajaUrl: '', pdfReciboUrl: '',
      ...overrides,
    },
  };
}

test('ninguna evidencia fotografica es obligatoria', () => {
  assert.deepEqual(missingRegistroEvidencias(emptyRegistroEvidencias()), []);
});

test('un registro no bloqueado inicia con solicitud pendiente', () => {
  const parsed = parseRegistroPayload(payloadRegistro());
  assert.equal(parsed.registro.estadoSolicitud, 'PENDIENTE');
});

test('el registro conserva la solicitud de autoservicio que lo originó', () => {
  const payload = payloadRegistro();
  payload.autoRegistroSubmissionId = 'solicitud_cliente_1';
  const parsed = parseRegistroPayload(payload);
  assert.equal(parsed.autoRegistroSubmissionId, 'solicitud_cliente_1');
});

test('tienda y pase no bloqueados aceptan precio cero con solo IMEI y nombre comercial obligatorios', () => {
  const payload = payloadRegistro({precio: '0', marcaEquipo: '', modeloEquipo: ''});
  payload.equipo.marca = '';
  payload.equipo.modelo = '';

  const parsed = parseRegistroPayload(payload);

  assert.equal(parsed.registro.precio, '0');
  assert.equal(parsed.equipo.nombreComercial, 'EQUIPO PRUEBA');
  assert.equal(parsed.equipo.idEquipo, '490154203237518');

  const pase = parseRegistroPayload(payloadRegistro({tipo: 'PASE', precio: '0'}));
  assert.equal(pase.registro.tipo, 'PASE');
  assert.equal(pase.registro.precio, '0');
});

test('precio cero sigue rechazado fuera de tienda no bloqueada', () => {
  assert.throws(
    () => parseRegistroPayload(payloadRegistro({tipo: 'EXTERNO', precio: '0'})),
    error => error.payload?.issues?.some(issue => issue.message === 'PRECIO_DEBE_SER_MAYOR_A_CERO'),
  );
});

test('un registro bloqueado no acepta estado de solicitud', () => {
  assert.throws(
    () => parseRegistroPayload(payloadRegistro({estado: 'BLOQUEADO', estadoSolicitud: 'PENDIENTE', precio: '50.00'})),
    error => error.payload?.issues?.some(issue => issue.message === 'ESTADO_SOLICITUD_NO_APLICA'),
  );
});

test('un equipo bloqueado pasa a realizado cuando se desbloquea', () => {
  assert.equal(
    registrosTest.resolveEstadoSolicitud(
      {estado: 'BLOQUEADO'},
      {estado: 'NO BLOQUEADO', estadoSolicitud: 'PENDIENTE'},
    ),
    'REALIZADO',
  );
  assert.equal(
    registrosTest.resolveEstadoSolicitud(
      {estado: 'NO BLOQUEADO'},
      {estado: 'NO BLOQUEADO', estadoSolicitud: 'PENDIENTE'},
    ),
    'PENDIENTE',
  );
});

test('los filtros separan registrados, pendientes y bloqueados', () => {
  assert.equal(registroMatchesStatus({estado: 'NO BLOQUEADO', estadoSolicitud: 'REALIZADO'}, 'REGISTRADOS'), true);
  assert.equal(registroMatchesStatus({estado: 'NO BLOQUEADO', estadoSolicitud: 'PENDIENTE'}, 'PENDIENTES'), true);
  assert.equal(registroMatchesStatus({estado: 'NO BLOQUEADO'}, 'PENDIENTES'), true);
  assert.equal(registroMatchesStatus({estado: 'BLOQUEADO'}, 'BLOQUEADOS'), true);
  assert.equal(registroMatchesStatus({estado: 'BLOQUEADO'}, 'REGISTRADOS'), false);
});

test('la accion masiva incluye pendientes y registros antiguos, pero excluye bloqueados y realizados', () => {
  assert.equal(registrosTest.shouldCompleteRequestStatus({estado: 'NO BLOQUEADO', estadoSolicitud: 'PENDIENTE'}), true);
  assert.equal(registrosTest.shouldCompleteRequestStatus({estado: 'NO BLOQUEADO'}), true);
  assert.equal(registrosTest.shouldCompleteRequestStatus({estado: 'NO BLOQUEADO', estadoSolicitud: 'REALIZADO'}), false);
  assert.equal(registrosTest.shouldCompleteRequestStatus({estado: 'BLOQUEADO', estadoSolicitud: 'PENDIENTE'}), false);
});

test('la accion rapida solo acepta PENDIENTE o REALIZADO', () => {
  assert.deepEqual(
    parseEstadoSolicitudPayload({id: 'registro_1', estadoSolicitud: 'REALIZADO'}),
    {id: 'registro_1', estadoSolicitud: 'REALIZADO'},
  );
  assert.throws(() => parseEstadoSolicitudPayload({id: 'registro_1', estadoSolicitud: 'OTRO'}));
});
