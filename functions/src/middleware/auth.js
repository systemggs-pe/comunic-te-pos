const admin = require("firebase-admin");

async function requireAuth(req) {
  const header = req.get("authorization") || "";
  const match = header.match(/^Bearer (.+)$/);
  if (!match) throw Object.assign(new Error("No autorizado"), {status: 401});
  return admin.auth().verifyIdToken(match[1]);
}

module.exports = {requireAuth};
