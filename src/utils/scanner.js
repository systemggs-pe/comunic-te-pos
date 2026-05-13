export function normalizarEscaneo(datos = {}) {
  const texto = (valor) => String(valor ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  const imei = (valor) => String(valor ?? '').replace(/\D/g, '').slice(0, 15);
  const gb = (valor) => {
    const match = String(valor ?? '').match(/\d{1,4}/);
    return match ? match[0] : '';
  };

  return {
    imei1: imei(datos.imei1),
    imei2: imei(datos.imei2),
    sn: texto(datos.sn),
    marca: texto(datos.marca),
    modelo: texto(datos.modelo),
    nombreComercial: texto(datos.nombreComercial),
    ram: gb(datos.ram),
    memoria: gb(datos.memoria),
    color: texto(datos.color),
  };
}

