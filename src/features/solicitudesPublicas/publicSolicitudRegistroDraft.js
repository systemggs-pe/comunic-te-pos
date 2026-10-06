export function publicSolicitudToRegistroDraft(solicitud, operacion) {
  const data = solicitud?.submission || {};
  const selectedImei = operacion?.imeiRegistrado || data.imeiRegistrado || data.imei1 || '';
  const estado = operacion?.tramite === 'DESBLOQUEO' ? 'BLOQUEADO' : 'NO BLOQUEADO';

  return {
    solicitudPublicaId: solicitud.id,
    solicitudPublicaOperacion: {
      tramite: operacion?.tramite || 'REGISTRO',
      tipo: operacion?.tipo || 'TIENDA',
      operador: operacion?.operador || 'BITEL',
      precio: operacion?.precio ?? '0',
      imeiRegistrado: selectedImei,
    },
    tipoDocumentoCliente: 'DNI',
    dniCliente: data.dni || solicitud.dni || '',
    nombreCliente: data.nombres || solicitud.nombreCliente || '',
    celularCliente: data.celular || '',
    celularRef: data.celular || '',
    correoCliente: data.correo || '',
    direccionCliente: data.direccion || '',
    departamentoCliente: data.provincia || '',
    imeiEquipo: data.imei1 || selectedImei,
    imeiRegistrado: selectedImei,
    imei2Equipo: data.imei2 || '',
    modeloEquipo: data.modelo || '',
    marcaEquipo: data.marca || '',
    nombreComercialEquipo: data.nombreEquipo || '',
    colorEquipo: data.color || '',
    memoriaEquipo: data.memoria || '',
    ramEquipo: data.ram || '',
    estado,
    estadoSolicitud: estado === 'NO BLOQUEADO' ? 'PENDIENTE' : '',
    operador: operacion?.operador || 'BITEL',
    tipo: operacion?.tipo || 'TIENDA',
    tieneCaja: Boolean(data.tieneCaja),
    precio: operacion?.precio ?? '0',
    fecha: new Date().toISOString(),
  };
}
