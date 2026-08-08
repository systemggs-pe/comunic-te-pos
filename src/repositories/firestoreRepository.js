import {
  collection,
  doc,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from 'firebase/firestore';

const SHARED_SCOPE = ['artifacts', 'users', 'shared'];

function movementCollection(db, appId, name) {
  return collection(db, ...SHARED_SCOPE.slice(0, 1), appId, ...SHARED_SCOPE.slice(1), name);
}

export function createFirestoreRepository(db, appId) {
  const refs = {
    clientes: movementCollection(db, appId, 'clientes'),
    equipos: movementCollection(db, appId, 'equipos'),
    registros: movementCollection(db, appId, 'registros'),
    ventas: movementCollection(db, appId, 'ventas'),
  };
  const logo = doc(db, ...SHARED_SCOPE.slice(0, 1), appId, ...SHARED_SCOPE.slice(1), 'configuracion', 'logoVentas');

  return {
    refs,
    logo,
    referenceQuery(name, pageSize) {
      return query(refs[name], limit(pageSize));
    },
    recentQuery(name, pageSize) {
      return query(refs[name], orderBy('fecha', 'desc'), limit(pageSize));
    },
    pageQuery(name, pageSize, cursor = null) {
      const constraints = [orderBy('fecha', 'desc')];
      if (cursor) constraints.push(startAfter(cursor));
      constraints.push(limit(pageSize));
      return query(refs[name], ...constraints);
    },
    exactClientsQuery(dnis) {
      return query(refs.clientes, where('dni', 'in', dnis));
    },
    async counts() {
      const [registros, ventas, clientes] = await Promise.all([
        getCountFromServer(refs.registros),
        getCountFromServer(refs.ventas),
        getCountFromServer(refs.clientes),
      ]);
      return {
        registros: registros.data().count,
        ventas: ventas.data().count,
        clientes: clientes.data().count,
      };
    },
    async fetchAllOrdered(name, pageSize = 500) {
      const items = [];
      let cursor = null;
      for (;;) {
        const snapshot = await getDocs(this.pageQuery(name, pageSize, cursor));
        items.push(...snapshot.docs.map(document => ({id: document.id, ...document.data()})));
        if (snapshot.size < pageSize) break;
        cursor = snapshot.docs.at(-1);
      }
      return items;
    },
  };
}

export function mapSnapshotDocs(snapshot) {
  return snapshot.docs.map(document => ({id: document.id, ...document.data()}));
}
