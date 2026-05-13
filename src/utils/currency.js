export function penToClp(pen) {
  const raw = parseFloat(pen || 0) * 266.67; // tasa aproximada
  // Redondear al múltiplo de 5000 más cercano
  return Math.round(raw / 5000) * 5000;
}
export function formatClp(clp) {
  return clp.toLocaleString('es-CL');
}

