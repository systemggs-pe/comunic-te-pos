const {setGlobalOptions} = require("firebase-functions");
const admin = require("firebase-admin");
const {handleHttp} = require("./src/http/handleHttp");
const {consultarReniecHandler} = require("./src/services/reniec");
const {analizarCajaGeminiHandler} = require("./src/services/gemini");

admin.initializeApp();
setGlobalOptions({maxInstances: 10});

exports.consultarReniec = handleHttp("consultarReniec", consultarReniecHandler, {
  rateLimit: {max: 60, windowMs: 60 * 1000},
});

exports.analizarCajaGemini = handleHttp("analizarCajaGemini", analizarCajaGeminiHandler, {
  rateLimit: {max: 15, windowMs: 60 * 1000},
});
