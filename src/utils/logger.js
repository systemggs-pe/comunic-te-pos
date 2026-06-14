const MAX_STRING_LENGTH = 500;

function getSessionId() {
  if (typeof window === 'undefined') return 'server';
  const key = 'ggs_observability_session_id';
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const next = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  window.sessionStorage.setItem(key, next);
  return next;
}

function safeString(value, maxLength = MAX_STRING_LENGTH) {
  return String(value || '').slice(0, maxLength);
}

function serializeError(error) {
  if (!error) return {};
  return {
    name: safeString(error.name || 'Error', 120),
    message: safeString(error.message || String(error), 300),
    code: safeString(error.code || '', 120),
    status: error.status || error.statusCode || null,
    requestId: safeString(error.requestId || error.payload?.requestId || '', 120),
  };
}

function sanitize(value, depth = 0) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string') return safeString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return depth > 2 ? `[array:${value.length}]` : value.slice(0, 20).map(item => sanitize(item, depth + 1));
  if (typeof value === 'object') {
    if (depth > 2) return '[object]';
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 40)
        .map(([key, item]) => [safeString(key, 80), sanitize(item, depth + 1)])
        .filter(([, item]) => item !== undefined),
    );
  }
  return safeString(value);
}

function writeClientLog(level, event, fields = {}) {
  const entry = sanitize({
    timestamp: new Date().toISOString(),
    level,
    event,
    service: 'comunicate-web',
    sessionId: getSessionId(),
    path: typeof window === 'undefined' ? '' : window.location.pathname,
    ...fields,
  });
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const clientLogger = {
  info(event, fields) {
    writeClientLog('info', event, fields);
  },
  warn(event, fields) {
    writeClientLog('warn', event, fields);
  },
  error(event, error, fields = {}) {
    writeClientLog('error', event, {
      error: serializeError(error),
      ...fields,
    });
  },
};
