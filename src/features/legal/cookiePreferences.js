import {LEGAL_DOCUMENT_VERSION} from '../../config/legal.js';

export const COOKIE_PREFS_STORAGE_KEY = `comunicate_cookie_preferences_${LEGAL_DOCUMENT_VERSION}`;

export const DEFAULT_COOKIE_PREFS = {
  essential: true,
  analytics: false,
  marketing: false,
};

export function readStoredCookiePrefs() {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(COOKIE_PREFS_STORAGE_KEY) || 'null');
    return parsed?.version === LEGAL_DOCUMENT_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

export function getCookiePreferences() {
  return readStoredCookiePrefs()?.preferences || DEFAULT_COOKIE_PREFS;
}
