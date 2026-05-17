import {jsPDF} from 'jspdf';
import JsBarcode from 'jsbarcode';

let pdf417LoadPromise = null;

export function getPdfTools() {
  return {jsPDF, JsBarcode};
}

export async function getPdf417Generator() {
  if (typeof window.__pdf417gen === 'function') return window.__pdf417gen;
  if (!pdf417LoadPromise) {
    pdf417LoadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-pdf417]');
      if (existing) {
        existing.addEventListener('load', resolve, {once: true});
        existing.addEventListener('error', reject, {once: true});
        return;
      }
      const script = document.createElement('script');
      script.setAttribute('data-pdf417', '1');
      script.src = '/pdf417.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('PDF417_LOCAL_LOAD_FAILED'));
      document.head.appendChild(script);
    });
  }
  await pdf417LoadPromise;
  if (!window.__pdf417gen && window.pdf417) {
    window.__pdf417gen = window.pdf417.default || window.pdf417;
  }
  if (typeof window.__pdf417gen !== 'function') {
    throw new Error('PDF417_NOT_AVAILABLE');
  }
  return window.__pdf417gen;
}
