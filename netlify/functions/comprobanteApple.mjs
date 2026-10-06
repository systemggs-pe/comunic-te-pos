import {handlePost} from './_shared.mjs';
import {findRemoteComprobanteAppleByImei, getAppleReceiptsApiConfig} from './_appleReceiptsApi.mjs';
import {luhnImeiApple, normalizarImeiApple} from './_comprobanteApple.mjs';

async function buscarComprobanteApple(body, options = {}) {
  const imei = normalizarImeiApple(body?.imei);
  if (!imei || !luhnImeiApple(imei)) {
    throw Object.assign(new Error('IMEI_INVALIDO'), {status: 400});
  }

  const boleta = await findRemoteComprobanteAppleByImei(imei, options);
  return boleta ? {found: true, boleta} : {found: false, boleta: null, receiptAppUrl: new URL(getAppleReceiptsApiConfig(options.env).apiUrl).origin};
}

export const handler = event => handlePost(event, body => buscarComprobanteApple(body, {
  authorization: event.headers?.authorization || event.headers?.Authorization || '',
}), {
  rateLimit: {name: 'comprobanteApple', max: 60, windowMs: 60 * 1000, distributed: true},
});

export const __test = {buscarComprobanteApple};
