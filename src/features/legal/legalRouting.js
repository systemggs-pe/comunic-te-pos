import {LEGAL_DOCUMENTS} from '../../config/legal.js';

export function isLegalPath(pathname) {
  return LEGAL_DOCUMENTS.some(doc => `/${doc.slug}` === pathname);
}

export function slugFromPath(pathname) {
  return pathname.replace(/^\//, '') || 'privacy-policy';
}
