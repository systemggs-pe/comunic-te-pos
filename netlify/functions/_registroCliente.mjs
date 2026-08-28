import {FieldPath} from 'firebase-admin/firestore';
import {validarDocumento} from '../../src/utils/documentos.js';
import {equipoDesdeMovimiento, mergeClienteEquipos} from '../../src/utils/clienteEquipos.js';

const PAGE_SIZE = 20;
const STATUS_LIMIT = 120;
const SOURCES = {equipos: 'idDuenio', ventas: 'dniCliente', registros: 'dniCliente'};
const clean = value => String(value || '').trim();
const badRequest = message => Object.assign(new Error(message), {status: 400});

// Exact-document lookup, independent of the small reference lists loaded by the app.
export async function buscarClienteParaRegistro(db, payload = {}) {
  const dni = clean(payload.dni).toUpperCase();
  const tipoDocumento = clean(payload.tipoDocumento || 'DNI');
  if (!validarDocumento(tipoDocumento, dni)) throw badRequest('DOCUMENTO_INVALIDO');
  const cursor = payload.cursor;
  if (cursor != null && (typeof cursor !== 'object' || Array.isArray(cursor) || cursor.dni !== dni)) {
    throw badRequest('CURSOR_INVALIDO');
  }
  for (const name of Object.keys(SOURCES)) {
    const value = cursor?.[name];
    if (value !== undefined && value !== false && (typeof value !== 'string' || !value || value.length > 160 || /[\/\\]/.test(value))) {
      throw badRequest('CURSOR_INVALIDO');
    }
  }
  const base = db.collection('artifacts').doc('comunicate-pos').collection('users').doc('shared');
  const pages = await Promise.all(Object.entries(SOURCES).map(async ([name, field]) => {
    if (cursor?.[name] === false) return {name, docs: [], next: false};
    let query = base.collection(name).where(field, '==', dni).orderBy(FieldPath.documentId());
    if (cursor?.[name]) query = query.startAfter(cursor[name]);
    const snapshot = await query.limit(PAGE_SIZE + 1).get();
    const docs = snapshot.docs.slice(0, PAGE_SIZE);
    return {name, docs, next: snapshot.size > PAGE_SIZE ? docs.at(-1).id : false};
  }));
  const byName = Object.fromEntries(pages.map(page => [page.name, page.docs]));
  const clienteDoc = await base.collection('clientes').doc(dni).get();
  const history = [...byName.ventas, ...byName.registros].map(doc => doc.data());
  const fallback = history.find(item => clean(item.nombreCliente));
  const cliente = clienteDoc.exists ? {...clienteDoc.data(), dni} : fallback ? {
    dni, tipoDocumento,
    nombre: fallback.nombreCliente,
    celular: fallback.celularCliente || '', celularRef: fallback.celularRef || '',
    correo: fallback.correoCliente || '', direccion: fallback.direccionCliente || '',
  } : null;
  const equipos = mergeClienteEquipos(
    byName.equipos.map(doc => ({...doc.data(), idEquipo: doc.data().idEquipo || doc.id})),
    byName.ventas.map(doc => equipoDesdeMovimiento(doc.data(), dni, 'venta')),
    byName.registros.map(doc => equipoDesdeMovimiento(doc.data(), dni, 'registro')),
  );
  const imeis = [...new Set(equipos.flatMap(eq => [eq.idEquipo, eq.imei2]).filter(Boolean))];
  const activeImeis = new Set();
  let registrationStatusComplete = true;
  // Locks cover modern writes; exact IMEI queries also cover older unbackfilled records.
  await Promise.all(imeis.map(async imei => {
    const lock = await base.collection('imeiLocks').doc(imei).get();
    if (lock.exists && clean(lock.data().registroId)) activeImeis.add(imei);
  }));
  const checks = [];
  for (let index = 0; index < imeis.length; index += 30) {
    const chunk = imeis.slice(index, index + 30);
    for (const field of ['imeiRegistrado', 'imeiEquipo']) {
      checks.push(base.collection('registros').where(field, 'in', chunk).limit(STATUS_LIMIT + 1).get().then(snapshot => {
        if (snapshot.size > STATUS_LIMIT) registrationStatusComplete = false;
        for (const doc of snapshot.docs) {
          const data = doc.data();
          const selected = clean(data.imeiRegistrado || data.imeiEquipo);
          if (imeis.includes(selected)) activeImeis.add(selected);
        }
      }));
    }
  }
  await Promise.all(checks);
  const next = Object.fromEntries(pages.map(page => [page.name, page.next]));
  return {
    dni, cliente, equipos, activeImeis: [...activeImeis], registrationStatusComplete,
    nextCursor: pages.some(page => page.next !== false) ? {dni, ...next} : null,
  };
}
