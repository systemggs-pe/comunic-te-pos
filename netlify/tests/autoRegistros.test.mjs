import test from 'node:test';
import assert from 'node:assert/strict';
import {__test} from '../functions/autoRegistros.mjs';

const {hasPreviousOperations, hashToken, invitationState, luhn, parseSubmissionBody, publicInvitation, validateEvidence} = __test;
const future = new Date(Date.now() + 60_000).toISOString();
const past = new Date(Date.now() - 60_000).toISOString();

test('hashToken no conserva el token original y es estable', () => {
  const token = 'a'.repeat(43);
  assert.equal(hashToken(token), hashToken(token));
  assert.equal(hashToken(token).length, 64);
  assert.equal(hashToken(token).includes(token), false);
});

test('invitationState aplica vencimiento, revocación, bloqueo y cierre', () => {
  assert.equal(invitationState(null), 'NO_ENCONTRADA');
  assert.equal(invitationState({status: 'ACTIVA', expiresAt: future}), 'ACTIVA');
  assert.equal(invitationState({status: 'ACTIVA', expiresAt: past}), 'VENCIDA');
  assert.equal(invitationState({status: 'REVOCADA', expiresAt: future}), 'REVOCADA');
  assert.equal(invitationState({status: 'ELIMINADA', expiresAt: future}), 'ELIMINADA');
  assert.equal(invitationState({status: 'COMPLETADA', expiresAt: future}), 'COMPLETADA');
  assert.equal(invitationState({status: 'ACTIVA', expiresAt: future, failedAttempts: 2, maxAttempts: 2}), 'BLOQUEADA');
});

test('publicInvitation nunca expone el DNI y calcula intentos restantes', () => {
  const result = publicInvitation({
    dni: '12345678',
    status: 'ACTIVA',
    expiresAt: future,
    failedAttempts: 1,
    maxAttempts: 2,
    registrationStatus: 'EN_REVISION',
  });
  assert.equal(result.state, 'ACTIVA');
  assert.equal(result.attemptsRemaining, 1);
  assert.equal('dni' in result, false);
  assert.equal(result.registrationStatus, 'EN_REVISION');
});

test('hasPreviousOperations detecta registros o ventas exactas del DNI', () => {
  assert.equal(hasPreviousOperations({empty: true, size: 0}, {empty: true, size: 0}), false);
  assert.equal(hasPreviousOperations({empty: false, size: 1}, {empty: true, size: 0}), true);
  assert.equal(hasPreviousOperations({empty: true, size: 0}, {empty: false, size: 1}), true);
});

test('parseSubmissionBody separa la acción de enrutamiento antes de validar', () => {
  const parsed = parseSubmissionBody({
    action: 'submit',
    token: 'a'.repeat(43),
    dni: '60268334',
    nombres: 'PERSONA DE PRUEBA',
    celular: '999111222',
    correo: 'persona@example.com',
    direccion: 'Av. Principal 123',
    ciudad: 'Tacna',
    imei: '490154203237518',
    nombreEquipo: 'Equipo de prueba',
    fechaCompra: '2025-01-15',
    precioCompra: '800.00',
    color: 'Negro',
    memoria: '128 GB',
    ram: '8 GB',
    declaracionAceptada: true,
    evidencias: {},
  });

  assert.equal(parsed.dni, '60268334');
  assert.equal('action' in parsed, false);
});

test('luhn valida IMEI conocidos', () => {
  assert.equal(luhn('490154203237518'), true);
  assert.equal(luhn('490154203237519'), false);
});

test('validateEvidence exige ambas caras del DNI e IMEI lógico', () => {
  const image = {
    dataUrl: `data:image/jpeg;base64,${Buffer.from('imagen-prueba').toString('base64')}`,
    name: 'foto.jpg',
    width: 100,
    height: 100,
  };
  const clean = validateEvidence({dniFrente: image, dniReverso: image, imeiLogico: image});
  assert.deepEqual(Object.keys(clean).sort(), ['dniFrente', 'dniReverso', 'imeiLogico']);
  assert.throws(() => validateEvidence({dniFrente: image, imeiLogico: image}), /EVIDENCIA_REQUERIDA/);
});
