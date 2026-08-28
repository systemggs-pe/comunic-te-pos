const text = value => String(value || '').trim();
const DEVICE_FIELDS = ['sn', 'marca', 'modelo', 'nombreComercial', 'ram', 'memoria', 'color'];

// Se agrupa por IMEI, nunca solo por modelo o serie: dos cajas pueden compartirlos.
export function mergeClienteEquipos(...groups) {
  const result = [];
  for (const source of groups.flat()) {
    if (!source) continue;
    const idEquipo = text(source.idEquipo);
    const imei2 = text(source.imei2);
    if (!/^\d{15}$/.test(idEquipo)) continue;
    const incoming = {...source, idEquipo, imei2: /^\d{15}$/.test(imei2) && imei2 !== idEquipo ? imei2 : ''};
    const existing = result.find(equipo => [equipo.idEquipo, equipo.imei2].filter(Boolean)
      .some(imei => imei === incoming.idEquipo || imei === incoming.imei2));
    if (!existing) {
      result.push(incoming);
      continue;
    }
    if (!existing.imei2) existing.imei2 = incoming.idEquipo !== existing.idEquipo ? incoming.idEquipo : incoming.imei2;
    for (const key of DEVICE_FIELDS) if (!text(existing[key])) existing[key] = text(incoming[key]);
    existing.fromSale = Boolean(existing.fromSale || incoming.fromSale);
    existing.fromRegistration = Boolean(existing.fromRegistration || incoming.fromRegistration);
  }
  return result;
}

export function equipoDesdeMovimiento(movimiento, dni, kind) {
  return {
    idDuenio: dni,
    idEquipo: text(movimiento.imeiEquipo || movimiento.imeiRegistrado),
    imei2: text(movimiento.imei2Equipo),
    sn: text(movimiento.sn),
    marca: text(movimiento.marcaEquipo),
    modelo: text(movimiento.modeloEquipo),
    nombreComercial: text(movimiento.nombreComercial || movimiento.nombreComercialEquipo),
    ram: text(movimiento.ram || movimiento.ramEquipo),
    memoria: text(movimiento.memoria || movimiento.memoriaEquipo),
    color: text(movimiento.color || movimiento.colorEquipo),
    fromSale: kind === 'venta',
    fromRegistration: kind === 'registro',
  };
}
