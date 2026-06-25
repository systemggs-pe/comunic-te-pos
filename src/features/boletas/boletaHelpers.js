import {toLocalDatetimeValueBoleta} from '../../utils/dates.js';

const clean = value => String(value || '').trim();

export const normalizarImeiBoleta = value => {
  const imei = String(value || '').replace(/\D/g, '').slice(0, 15);
  return /^\d{15}$/.test(imei) ? imei : '';
};

export const obtenerImeisBoletaData = boletaData => {
  const ventas = Array.isArray(boletaData?.ventas) ? boletaData.ventas : [];
  const keysFromVentas = new Set();
  ventas.forEach(venta => {
    const imei1 = normalizarImeiBoleta(venta?.imeiEquipo);
    const imei2 = normalizarImeiBoleta(venta?.imei2Equipo);
    if (imei1) keysFromVentas.add(imei1);
    if (imei2) keysFromVentas.add(imei2);

    const equipo = imei1 ? boletaData?.equiposMap?.[imei1] : null;
    const imei2Equipo = normalizarImeiBoleta(equipo?.imei2);
    if (imei2Equipo) keysFromVentas.add(imei2Equipo);
  });

  if (keysFromVentas.size) return Array.from(keysFromVentas);

  const keysFromMap = new Set();
  if (boletaData?.equiposMap && typeof boletaData.equiposMap === 'object' && !Array.isArray(boletaData.equiposMap)) {
    Object.entries(boletaData.equiposMap).forEach(([key, equipo]) => {
      const imei1 = normalizarImeiBoleta(key);
      const imei2 = normalizarImeiBoleta(equipo?.imei2);
      if (imei1) keysFromMap.add(imei1);
      if (imei2) keysFromMap.add(imei2);
    });
  }
  return Array.from(keysFromMap);
};

export const obtenerImeisBoletaGuardada = boleta => {
  const dataKeys = obtenerImeisBoletaData(boleta?.boletaData);
  if (dataKeys.length) return dataKeys;

  const stored = Array.isArray(boleta?.boletaEquipoKeys)
    ? boleta.boletaEquipoKeys.map(normalizarImeiBoleta).filter(Boolean)
    : [];
  return Array.from(new Set([
    ...stored,
    normalizarImeiBoleta(boleta?.boletaEquipoKey),
  ].filter(Boolean)));
};

export const resumirImeisBoleta = boleta => {
  const imeis = obtenerImeisBoletaGuardada(boleta);
  if (imeis.length <= 2) return imeis.join(' / ');
  return `${imeis.slice(0, 2).join(' / ')} / +${imeis.length - 2}`;
};

export const crearEquiposMapDesdeVentas = (ventasSeleccionadas, equipos) => {
  const equiposPorImei = new Map(equipos.map(equipo => [equipo.idEquipo, equipo]));
  return ventasSeleccionadas.reduce((map, venta) => {
    const imei = normalizarImeiBoleta(venta?.imeiEquipo);
    if (!imei) return map;

    const equipo = equiposPorImei.get(imei) || {};
    map[imei] = {
      ...equipo,
      imei2: equipo.imei2 || venta.imei2Equipo || '',
      sn: equipo.sn || venta.sn || '',
      marca: equipo.marca || venta.marcaEquipo || '',
      modelo: equipo.modelo || venta.modeloEquipo || '',
      nombreComercial: equipo.nombreComercial || venta.nombreComercial || '',
      memoria: equipo.memoria || venta.memoria || '',
      ram: equipo.ram || venta.ram || '',
      color: equipo.color || venta.color || '',
    };
    return map;
  }, {});
};

export const normalizarTextoBoleta = value => clean(value).replace(/\s+/g, ' ');

export const formatearMemoriaBoleta = value => {
  const memoria = normalizarTextoBoleta(value).toUpperCase();
  if (!memoria) return '';
  return /\b(GB|TB|MB)\b/.test(memoria) ? memoria : `${memoria}GB`;
};

export const nombreEquipoBoleta = (venta, data) => {
  const imei = normalizarImeiBoleta(venta?.imeiEquipo);
  const equipo = imei ? data?.equiposMap?.[imei] || {} : {};
  const marca = venta?.marcaEquipo || equipo.marca || '';
  const nombre = equipo.nombreComercial || venta?.nombreComercial || venta?.modeloEquipo || equipo.modelo || '';
  const memoria = formatearMemoriaBoleta(venta?.memoria || equipo.memoria);
  return normalizarTextoBoleta([marca, nombre, memoria].filter(Boolean).join(' '));
};

export const obtenerResumenEquipoBoleta = boleta => {
  const data = boleta?.boletaData || {};
  const ventas = Array.isArray(data.ventas) ? data.ventas : [];
  const nombres = ventas.map(venta => nombreEquipoBoleta(venta, data)).filter(Boolean);

  if (!nombres.length && data.equiposMap && typeof data.equiposMap === 'object' && !Array.isArray(data.equiposMap)) {
    Object.entries(data.equiposMap).forEach(([imei, equipo]) => {
      const nombre = normalizarTextoBoleta([
        equipo?.marca,
        equipo?.nombreComercial || equipo?.modelo,
        formatearMemoriaBoleta(equipo?.memoria),
      ].filter(Boolean).join(' '));
      if (nombre || normalizarImeiBoleta(imei)) nombres.push(nombre || `IMEI ${normalizarImeiBoleta(imei)}`);
    });
  }

  const unicos = Array.from(new Set(nombres));
  if (unicos.length <= 1) return unicos[0] || '';
  return `${unicos[0]} +${unicos.length - 1} equipos`;
};

export const crearBoletaDataDesdeVentas = ({cliente, ventasSeleccionadas, equipos, totalClp, fechaHora}) => ({
  cliente,
  ventas: ventasSeleccionadas,
  equiposMap: crearEquiposMapDesdeVentas(ventasSeleccionadas, equipos),
  totalClp,
  fechaHora,
});

export const fechaBoletaDesdeVentas = (ventasSeleccionadas, fallback = new Date()) => {
  const fechas = (Array.isArray(ventasSeleccionadas) ? ventasSeleccionadas : [ventasSeleccionadas])
    .map(venta => new Date(venta?.fecha || 0))
    .filter(date => !Number.isNaN(date.getTime()))
    .sort((a, b) => b - a);
  const fecha = fechas.length ? new Date(fechas[0]) : new Date(fallback);
  fecha.setDate(fecha.getDate() - 1);
  return toLocalDatetimeValueBoleta(fecha);
};

const boletaTime = value => {
  if (!value) return 0;
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : 0;
};

export const buscarUltimaBoletaPorImeis = (boletas, imeis) => {
  const set = new Set((Array.isArray(imeis) ? imeis : [imeis]).map(normalizarImeiBoleta).filter(Boolean));
  if (!set.size) return null;

  return (Array.isArray(boletas) ? boletas : [])
    .filter(boleta => obtenerImeisBoletaGuardada(boleta).some(imei => set.has(imei)))
    .sort((a, b) => (
      (boletaTime(b.updatedAt) || boletaTime(b.createdAt) || boletaTime(b.fechaHora)) -
      (boletaTime(a.updatedAt) || boletaTime(a.createdAt) || boletaTime(a.fechaHora))
    ))[0] || null;
};

export const buscarBoletaPorVenta = (boletas, venta, equipo = {}) => {
  const imeis = [
    venta?.imeiEquipo,
    venta?.imei2Equipo,
    equipo?.idEquipo,
    equipo?.imei2,
  ];
  return buscarUltimaBoletaPorImeis(boletas, imeis);
};

export const formatearChipBoleta = boleta => (
  boleta ? `BE F${boleta.formato || '-'} N°${boleta.nBoleta || '-'}` : 'Sin BE'
);
