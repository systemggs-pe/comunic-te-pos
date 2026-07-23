import {handlePost} from './_shared.mjs';
import {getAdminDb} from './_firebaseAdmin.mjs';
import {
  findComprobanteAppleByImei,
  luhnImeiApple,
  normalizarImeiApple,
} from './_comprobanteApple.mjs';

const APP_ID = 'comunicate-pos';
const SCOPE = 'shared';

function boletasRef(db) {
  return db.collection('artifacts')
    .doc(APP_ID)
    .collection('users')
    .doc(SCOPE)
    .collection('boletasExtranjeras');
}

async function buscarComprobanteApple(db, body) {
  const imei = normalizarImeiApple(body?.imei);
  if (!imei || !luhnImeiApple(imei)) {
    throw Object.assign(new Error('IMEI_INVALIDO'), {status: 400});
  }

  const boleta = await findComprobanteAppleByImei(boletasRef(db), imei);
  return boleta ? {found: true, boleta} : {found: false, boleta: null};
}

async function dispatchComprobanteApple(body) {
  return buscarComprobanteApple(getAdminDb(), body);
}

export const handler = event => handlePost(event, dispatchComprobanteApple, {
  rateLimit: {name: 'comprobanteApple', max: 60, windowMs: 60 * 1000},
});

export const __test = {buscarComprobanteApple};
