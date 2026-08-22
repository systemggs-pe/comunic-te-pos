import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildClienteSearchTerms,
  buildEquipoSearchTerms,
  buildMovimientoSearchTerms,
  normalizeIndexedTerm,
} from '../functions/_searchIndex.mjs';
import {withContactHistory} from '../functions/_clientesShared.mjs';

test('search indexes normalize accents and include useful name prefixes', () => {
  const terms = buildClienteSearchTerms({
    dni: '70358761',
    nombre: 'Lucero Rodríguez Quisberth',
    celular: '999111222',
  });

  assert.equal(normalizeIndexedTerm('  Rodríguez  '), 'rodriguez');
  assert.ok(terms.includes('luc'));
  assert.ok(terms.includes('lucero rod'));
  assert.ok(terms.includes('rodriguez'));
  assert.ok(terms.includes('703587'));
});

test('equipment and movement indexes include IMEI, document number and client name', () => {
  const equipo = {
    idEquipo: '865716088094342',
    imei2: '865716088094359',
    idDuenio: '70358761',
    marca: 'Apple',
    modelo: 'iPhone 15',
  };
  const venta = {
    nVenta: 'VEN-2401',
    dniCliente: '70358761',
    imeiEquipo: equipo.idEquipo,
    marcaEquipo: equipo.marca,
    modeloEquipo: equipo.modelo,
  };

  const equipoTerms = buildEquipoSearchTerms(equipo, 'Lucero Rodríguez');
  const ventaTerms = buildMovimientoSearchTerms(venta, 'Lucero Rodríguez');

  assert.ok(equipoTerms.includes('865716088094342'));
  assert.ok(equipoTerms.includes('rodri'));
  assert.ok(ventaTerms.includes('ven-2401'));
  assert.ok(ventaTerms.includes('865716088094'));
  assert.ok(ventaTerms.includes('lucero rod'));
});

test('updating a client always refreshes its search index', () => {
  const result = withContactHistory(
    {dni: '70358761', nombre: 'Nombre Antiguo'},
    {dni: '70358761', nombre: 'Nombre Actualizado'},
  );

  assert.ok(result.searchTerms.includes('nombre act'));
  assert.ok(!result.searchTerms.includes('nombre antiguo'));
});
