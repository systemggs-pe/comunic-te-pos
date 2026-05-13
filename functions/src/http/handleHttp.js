const {onRequest} = require("firebase-functions/https");
const logger = require("firebase-functions/logger");
const {setCors} = require("../config/cors");
const {requireAuth} = require("../middleware/auth");
const {enforceRateLimit} = require("../middleware/rateLimit");

function onlyPost(req) {
  if (req.method !== "POST") {
    throw Object.assign(new Error("Metodo no permitido"), {status: 405});
  }
}

function handleHttp(name, handler, options = {}) {
  return onRequest(async (req, res) => {
    setCors(req, res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    try {
      onlyPost(req);
      const user = await requireAuth(req);
      await enforceRateLimit({res, user, name, rateLimit: options.rateLimit});
      await handler(req, res, user);
    } catch (error) {
      logger.error(error);
      res.status(error.status || 500).json({
        error: error.message || "Error interno",
      });
    }
  });
}

module.exports = {handleHttp};
