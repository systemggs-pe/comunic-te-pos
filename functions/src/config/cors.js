const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://comunicate-tacna.web.app",
  "https://comunicate-tacna.firebaseapp.com",
];

function isAllowedOrigin(origin) {
  if (allowedOrigins.includes(origin)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin || "");
}

function setCors(req, res) {
  const origin = req.get("origin");
  if (isAllowedOrigin(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
  }
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

module.exports = {setCors};
