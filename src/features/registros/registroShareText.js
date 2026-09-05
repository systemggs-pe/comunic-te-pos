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
  const esSamsung = String(registro?.marcaEquipo || '').toUpperCase() === 'SAMSUNG';

  if (registro?.registroDual === true && esSamsung) {
    const posicion = Number(registro.registroGrupoPosicion || 1);
    const celular1 = posicion === 2 ? (registro.celularRef || cliente?.celular || '') : celular;
    const celular2 = posicion === 2 ? celular : (registro.celularRef || '');
    const detalleSolicitud = registro?.estado === 'BLOQUEADO' ? 'DESBLOQUEO LISTA BLANCA' : 'REGISTRO';
    return `DETALLE DE SOLICITUD: ${detalleSolicitud}

IMEI 1: ${imei}
IMEI 2: ${imei2}
TIENE CAJA: ${etiquetaTieneCaja(registro?.tieneCaja)}
${docLabel}: ${registro?.dniCliente || ''}
CELULAR 1: ${celular1}
CELULAR 2: ${celular2}
NOMBRE CLIENTE: ${nombre}
DIRECCION: ${direccion}
CORREO ELECTRONICO: ${correo}

${registro?.tipo || '-'}`;
  }

  const tipoLine = esSamsung ? '' : `TIPO: ${registro?.tipo || '-'}\n`;

  return `${encabezado}

IMEI: ${imei}
IMEI2: ${imei2}
${tipoLine}TIENE CAJA: ${etiquetaTieneCaja(registro?.tieneCaja)}
${docLabel}: ${registro?.dniCliente || ''}
CELULAR: ${celular}
NOMBRE CLIENTE: ${nombre}
DIRECCION: ${direccion}
CORREO ELECTRONICO: ${correo}

IMEI A REGISTRAR: ${imeiRegistrar}`;
}
