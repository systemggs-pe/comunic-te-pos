import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRequestContext,
  getHeader,
  queueAuditEvent,
  sanitizeMetadata,
} from '../functions/_observability.mjs';

test('getHeader reads headers case-insensitively', () => {
  assert.equal(getHeader({'X-Request-Id': 'abc'}, 'x-request-id'), 'abc');
  assert.equal(getHeader({'content-type': 'application/json'}, 'Content-Type'), 'application/json');
});

test('createRequestContext reuses incoming request id', () => {
  const context = createRequestContext({
    httpMethod: 'POST',
    path: '/api/registros',
    headers: {
      'x-request-id': 'req-123',
      origin: 'http://localhost:5173',
      'x-forwarded-for': '10.0.0.1, 10.0.0.2',
      'user-agent': 'test-agent',
    },
  }, {name: 'registros'});

  assert.equal(context.requestId, 'req-123');
  assert.equal(context.functionName, 'registros');
  assert.equal(context.ipAddress, '10.0.0.1');
  assert.equal(context.userAgent, 'test-agent');
});

test('sanitizeMetadata removes sensitive fields', () => {
  assert.deepEqual(sanitizeMetadata({
    token: 'secret',
    Authorization: 'bearer secret',
    ok: 'value',
    nested: {imageBase64: 'large', kept: true},
  }), {
    ok: 'value',
    nested: {kept: true},
  });
});

test('queueAuditEvent writes structured audit document', () => {
  const writes = [];
  const transaction = {
    set(ref, data) {
      writes.push({ref, data});
    },
  };
  const baseRef = {
    collection(name) {
      assert.equal(name, 'auditEvents');
      return {
        doc() {
          return {id: 'audit-1', path: 'auditEvents/audit-1'};
        },
      };
    },
  };

  const auditId = queueAuditEvent(transaction, baseRef, {
    requestId: 'req-1',
    functionName: 'ventas',
    user: {uid: 'uid-1', email: 'user@example.com'},
  }, {
    entityType: 'venta',
    entityId: 'venta-1',
    action: 'create',
    metadata: {nVenta: 'VEN-0001'},
  });

  assert.equal(auditId, 'audit-1');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].data.requestId, 'req-1');
  assert.equal(writes[0].data.eventType, 'venta.create');
  assert.deepEqual(writes[0].data.metadata, {nVenta: 'VEN-0001'});
});
