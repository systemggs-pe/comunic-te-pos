import admin from 'firebase-admin';

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
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccountFromEnv()),
    });
  }
  return admin.firestore();
}

