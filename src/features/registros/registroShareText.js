export const etiquetaTieneCaja = value => value === true || value === 'SI' ? 'SI' : 'NO';

export function construirTextoRegistro(registro, {cliente = {}, equipo = {}, encabezado = 'REGISTRO'} = {}) {
  const imei = registro?.imeiEquipo || registro?.imeiRegistrado || '';
  const imei2 = registro?.imei2Equipo || equipo?.imei2 || '';
  const imeiRegistrar = registro?.imeiRegistrado || imei;
  const docLabel = registro?.tipoDocumentoCliente || cliente?.tipoDocumento || 'DNI';
  const celular = registro?.celularCliente || cliente?.celular || '';
  const nombre = registro?.nombreCliente || cliente?.nombre || '';
  const direccion = registro?.direccionCliente || cliente?.direccion || '';
  const correo = registro?.correoCliente || cliente?.correo || '';
  const tipoLabel = String(registro?.marcaEquipo || '').toUpperCase() === 'SAMSUNG'
    ? 'ORIGEN DEL EQUIPO SAMSUNG'
    : 'TIPO';

  return `${encabezado}

IMEI: ${imei}
IMEI2: ${imei2}
${tipoLabel}: ${registro?.tipo || '-'}
TIENE CAJA: ${etiquetaTieneCaja(registro?.tieneCaja)}
${docLabel}: ${registro?.dniCliente || ''}
CELULAR: ${celular}
NOMBRE CLIENTE: ${nombre}
DIRECCION: ${direccion}
CORREO ELECTRONICO: ${correo}

IMEI A REGISTRAR: ${imeiRegistrar}`;
}
