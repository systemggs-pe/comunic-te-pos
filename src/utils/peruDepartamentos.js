export const PERU_DEPARTAMENTOS = [
  'AMAZONAS',
  'ANCASH',
  'APURIMAC',
  'AREQUIPA',
  'AYACUCHO',
  'CAJAMARCA',
  'CALLAO',
  'CUSCO',
  'HUANCAVELICA',
  'HUANUCO',
  'ICA',
  'JUNIN',
  'LA LIBERTAD',
  'LAMBAYEQUE',
  'LIMA',
  'LORETO',
  'MADRE DE DIOS',
  'MOQUEGUA',
  'PASCO',
  'PIURA',
  'PUNO',
  'SAN MARTIN',
  'TACNA',
  'TUMBES',
  'UCAYALI',
];

const DEPARTAMENTOS_POR_NORMALIZADO = new Map(
  PERU_DEPARTAMENTOS.map(departamento => [normalizarDepartamento(departamento), departamento]),
);

export function normalizarDepartamento(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function separarDireccionDepartamento(value) {
  const texto = String(value || '').trim();
  if (!texto) return {direccion: '', departamento: ''};

  const partes = texto.split(/\s+-\s+/);
  if (partes.length < 2) return {direccion: texto, departamento: ''};

  const posibleDepartamento = partes.at(-1);
  const departamento = DEPARTAMENTOS_POR_NORMALIZADO.get(normalizarDepartamento(posibleDepartamento)) || '';
  if (!departamento) return {direccion: texto, departamento: ''};

  return {
    direccion: partes.slice(0, -1).join(' - ').trim(),
    departamento,
  };
}

export function unirDireccionDepartamento(direccion, departamento) {
  const base = String(direccion || '').trim();
  const departamentoNormalizado = DEPARTAMENTOS_POR_NORMALIZADO.get(normalizarDepartamento(departamento)) || '';
  return [base, departamentoNormalizado].filter(Boolean).join(' - ');
}
