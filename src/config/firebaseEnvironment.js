const WEB_FIELDS = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'VITE_FIREBASE_APP_ID',
};

// Use a complete configuration so an override never combines two projects.
export function resolveFirebaseWebConfig(env, defaultConfig) {
  const entries = Object.entries(WEB_FIELDS);
  const configured = entries.some(([, key]) => String(env[key] || '').trim());
  if (!configured) return {...defaultConfig};
  const missing = entries.filter(([, key]) => !String(env[key] || '').trim()).map(([, key]) => key);
  if (missing.length) throw new Error(`FIREBASE_WEB_CONFIG_INCOMPLETE: ${missing.join(', ')}`);
  return Object.fromEntries(entries.map(([field, key]) => [field, String(env[key]).trim()]));
}
