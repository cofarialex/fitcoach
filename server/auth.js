// Hitelesítés: jelszó hash (bcrypt) + JWT egy httpOnly sütiben
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./db');

// A titkos kulcs: környezeti változóból, vagy első indításkor generálva és elmentve
function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(DATA_DIR, '.jwt_secret');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const s = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(file, s, { mode: 0o600 });
  return s;
}
const SECRET = loadSecret();
const COOKIE = 'fc_token';
const MAX_AGE_DAYS = 30;

function setAuthCookie(res, userId) {
  const token = jwt.sign({ sub: userId }, SECRET, { expiresIn: `${MAX_AGE_DAYS}d` });
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: MAX_AGE_DAYS * 864e5,
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE);
}

// Middleware: csak bejelentkezett felhasználó érheti el az útvonalat; req.userId-t beállítja
function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE];
  if (!token) return res.status(401).json({ error: 'Bejelentkezés szükséges' });
  try {
    req.userId = jwt.verify(token, SECRET).sub;
    return next();
  } catch {
    return res.status(401).json({ error: 'A munkamenet lejárt, jelentkezz be újra' });
  }
}

// Egyszerű, memóriában tárolt korlátozás a jelszópróbálgatás ellen
const attempts = new Map();
function loginLimiter(req, res, next) {
  const key = req.ip;
  const now = Date.now();
  const rec = (attempts.get(key) || []).filter((t) => now - t < 15 * 60e3);
  if (rec.length >= 10) return res.status(429).json({ error: 'Túl sok próbálkozás, várj 15 percet.' });
  rec.push(now);
  attempts.set(key, rec);
  return next();
}

module.exports = { setAuthCookie, clearAuthCookie, requireAuth, loginLimiter };
