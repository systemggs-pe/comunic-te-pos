import admin from 'firebase-admin';
import {handlePost} from './_shared.mjs';
import {getAdminDb} from './_firebaseAdmin.mjs';
import {queueAuditEvent} from './_observability.mjs';
import {LEGAL_DOCUMENT_VERSION, REQUIRED_LEGAL_DOCUMENTS} from '../../src/config/legal.js';

const APP_ID = 'comunicate-pos';
const SCOPE = 'shared';

function baseRef(db) {
  return db.collection('artifacts').doc(APP_ID).collection('users').doc(SCOPE);
}

function parseConsent(body) {
  const accepted = body?.accepted === true;
  const version = String(body?.documentVersion || '');
  const documents = Array.isArray(body?.documents) ? body.documents : [];
  const slugs = new Set(documents.map(doc => String(doc?.slug || '')));

  if (!accepted) throw Object.assign(new Error('LEGAL_CONSENT_REQUIRED'), {status: 400});
  if (version !== LEGAL_DOCUMENT_VERSION) throw Object.assign(new Error('LEGAL_VERSION_MISMATCH'), {status: 409});
  if (!REQUIRED_LEGAL_DOCUMENTS.every(slug => slugs.has(slug))) {
    throw Object.assign(new Error('LEGAL_DOCUMENTS_INCOMPLETE'), {status: 400});
  }

  return {
    documentVersion: version,
    acceptedAtClient: String(body?.acceptedAt || '').slice(0, 40),
    documents: documents.map(doc => ({
      slug: String(doc.slug || '').slice(0, 80),
      title: String(doc.title || '').slice(0, 180),
      version: String(doc.version || '').slice(0, 40),
      updatedAt: String(doc.updatedAt || '').slice(0, 40),
    })),
    cookiePreferences: typeof body?.cookiePreferences === 'object' && body.cookiePreferences
      ? {
          essential: body.cookiePreferences.essential === true,
          analytics: body.cookiePreferences.analytics === true,
          marketing: body.cookiePreferences.marketing === true,
        }
      : {essential: true, analytics: false, marketing: false},
    timezone: String(body?.timezone || '').slice(0, 80),
    locale: String(body?.locale || '').slice(0, 30),
    source: String(body?.source || 'pre-login-gate').slice(0, 60),
  };
}

async function recordConsent(body, user, context) {
  const db = getAdminDb();
  const consent = parseConsent(body);
  const base = baseRef(db);
  const ref = base.collection('legalConsents').doc(`${user.uid}_${LEGAL_DOCUMENT_VERSION}`);
  const historyRef = ref.collection('events').doc();

  const payload = {
    ...consent,
    uid: user.uid,
    email: user.email,
    ipAddress: String(context?.ipAddress || '').slice(0, 80),
    userAgent: String(context?.userAgent || '').slice(0, 500),
    acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await db.runTransaction(async transaction => {
    transaction.set(ref, payload, {merge: true});
    transaction.set(historyRef, {
      ...payload,
      eventType: 'LEGAL_CONSENT_ACCEPTED',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    queueAuditEvent(transaction, base, context, {
      entityType: 'legalConsent',
      entityId: ref.id,
      action: 'accept',
      metadata: {
        documentVersion: LEGAL_DOCUMENT_VERSION,
        documentCount: consent.documents.length,
        cookiePreferences: consent.cookiePreferences,
        source: consent.source,
      },
    });
  });

  return {
    ok: true,
    consentId: ref.id,
    documentVersion: LEGAL_DOCUMENT_VERSION,
  };
}

export const handler = event => handlePost(event, recordConsent, {
  rateLimit: {name: 'legalConsent', max: 20, windowMs: 60 * 1000},
});
