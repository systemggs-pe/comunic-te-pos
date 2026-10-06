export const DNI_PHOTO_MESSAGES = {
  DNI_INVALIDO: 'Ingresa un DNI válido de 8 dígitos.',
  DNI_FOTO_TIPO_INVALIDO: 'Selecciona un tipo de DNI válido.',
  DNI_FOTOS_NOT_FOUND: 'No encontramos información para este DNI.',
  DNI_FOTOS_TIMEOUT: 'La consulta está tardando más de lo esperado. Intenta nuevamente.',
  DNI_FOTOS_UNAVAILABLE: 'El servicio de consulta de DNI no está disponible temporalmente.',
  DNI_FOTOS_UPSTREAM_ERROR: 'El servicio de consulta de DNI no está disponible temporalmente.',
  CODART_RATE_LIMIT: 'Se alcanzó el límite de consultas. Espera un momento antes de intentar nuevamente.',
  RATE_LIMIT_EXCEEDED: 'Se alcanzó el límite de consultas. Espera un momento antes de intentar nuevamente.',
  CODART_TOKEN_INVALID: 'El servicio de consulta necesita atención del administrador.',
  CODART_TOKEN_MISSING: 'El servicio de consulta necesita atención del administrador.',
  CODART_CREDITOS_INSUFICIENTES: 'El servicio de consulta no tiene consultas disponibles. Contacta al administrador.',
  DNI_FOTOS_INVALID_RESPONSE: 'El servicio devolvió información que no pudimos utilizar. Intenta más tarde.',
  DNI_FOTOS_INTERNAL_ERROR: 'No pudimos completar la consulta. Intenta nuevamente más tarde.',
  DNI_FOTOS_IN_PROGRESS: 'Ya hay una consulta de este DNI en curso. Espera un momento.',
  BACKEND_NOT_DEPLOYED: 'El servicio de consulta no está disponible temporalmente.',
  AUTH_REQUIRED: 'Inicia sesión nuevamente para consultar.',
  AUTH_INVALID: 'Inicia sesión nuevamente para consultar.',
  FORBIDDEN: 'Tu cuenta no tiene permiso para consultar fotos DNI.',
};

export function dniPhotoErrorMessage(error) {
  if (error instanceof TypeError || ['NETWORK_ERROR', 'Failed to fetch', 'fetch failed', 'Load failed'].includes(error?.message)) {
    return 'Revisa tu conexión a internet e intenta nuevamente.';
  }
  return DNI_PHOTO_MESSAGES[error?.message] || (error?.status === 429 ? DNI_PHOTO_MESSAGES.CODART_RATE_LIMIT
    : error?.status === 403 ? DNI_PHOTO_MESSAGES.FORBIDDEN : DNI_PHOTO_MESSAGES.DNI_FOTOS_INTERNAL_ERROR);
}

// Per mounted page only: no localStorage, IndexedDB or cross-account cache.
export function createDniPhotoLookup(request, {now = Date.now, ttlMs = 120_000} = {}) {
  let generation = 0;
  let busy = false;
  let cached;
  return {
    get busy() {return busy;},
    invalidate() {generation += 1;},
    dispose() {generation += 1; cached = undefined;},
    async lookup(dni, tipo, {refresh = false} = {}) {
      if (busy) return {current: false, duplicate: true};
      const version = ++generation;
      if (!/^\d{8}$/.test(dni)) return {current: true, error: new Error('DNI_INVALIDO')};
      const key = `${tipo}:${dni}`;
      const expired = cached?.key === key && cached.expiresAt <= now();
      if (cached && cached.expiresAt <= now()) cached = undefined;
      if (!refresh && cached?.key === key) return {current: true, json: cached.json, cache: 'HIT'};
      busy = true;
      try {
        const json = await request(dni, tipo, {refresh});
        if (!json?.success || !json.data || json.data.dni !== dni) throw new Error('DNI_FOTOS_INVALID_RESPONSE');
        if (version !== generation) return {current: false};
        // Retain only one recent result; large image payloads remain in UI only.
        if (JSON.stringify(json).length <= 2 * 1024 * 1024) cached = {key, json, expiresAt: now() + ttlMs};
        else cached = undefined;
        return {current: true, json, cache: expired ? 'EXPIRED' : 'MISS'};
      } catch (error) {
        return {current: version === generation, error};
      } finally {busy = false;}
    },
  };
}
