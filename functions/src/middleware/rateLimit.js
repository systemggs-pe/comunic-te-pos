const admin = require("firebase-admin");

const defaultRateLimit = {
  max: 60,
  windowMs: 60 * 1000,
};

function cleanKey(value) {
  return String(value || "anon").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
}

async function enforceRateLimit({res, user, name, rateLimit = defaultRateLimit}) {
  const db = admin.firestore();
  const now = Date.now();
  const windowMs = rateLimit.windowMs || defaultRateLimit.windowMs;
  const max = rateLimit.max || defaultRateLimit.max;
  const bucket = Math.floor(now / windowMs);
  const key = cleanKey(`${name}_${user.uid}_${bucket}`);
  const ref = db.collection("_rateLimits").doc(key);

  const result = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const current = snap.exists ? snap.data().count || 0 : 0;
    if (current >= max) {
      return {allowed: false, count: current};
    }

    transaction.set(ref, {
      name,
      uid: user.uid,
      count: current + 1,
      bucket,
      expiresAt: admin.firestore.Timestamp.fromMillis((bucket + 2) * windowMs),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, {merge: true});

    return {allowed: true, count: current + 1};
  });

  const resetSeconds = Math.ceil(((bucket + 1) * windowMs - now) / 1000);
  res.set("X-RateLimit-Limit", String(max));
  res.set("X-RateLimit-Remaining", String(Math.max(max - result.count, 0)));
  res.set("X-RateLimit-Reset", String(resetSeconds));

  if (!result.allowed) {
    throw Object.assign(new Error("Demasiadas solicitudes. Intenta de nuevo en unos segundos."), {status: 429});
  }
}

module.exports = {enforceRateLimit};
