import admin from 'firebase-admin';

function getAdminApp() {
  if (!admin.apps.length) {
    const serviceAccount = serviceAccountFromEnv();
    const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.STORAGE_BUCKET || 'comunicate-tacna.firebasestorage.app';
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket,
    });
  }
  return admin.app();
}

function serviceAccountFromEnv() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      if (parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      return parsed;
    } catch {
      throw Object.assign(new Error('FIREBASE_SERVICE_ACCOUNT_INVALID'), {status: 500});
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) {
    throw Object.assign(new Error('FIREBASE_ADMIN_CONFIG_MISSING'), {status: 500});
  }
  return {projectId, clientEmail, privateKey};
}

export function getAdminDb() {
  return admin.firestore(getAdminApp());
}

export function getAdminAuth() {
  return admin.auth(getAdminApp());
}

export function getAdminStorageBucket() {
  return admin.storage(getAdminApp()).bucket();
}
