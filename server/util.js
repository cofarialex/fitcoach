// Általános segédfüggvények a route-okhoz
const { isDate, today } = require('./services/insights');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// async route-ok hibáit továbbítja az Express hibakezelőnek
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Szám ellenőrzése: üres -> null, érvénytelen -> hiba
function num(v, { min = -Infinity, max = Infinity, int = false, field = 'érték' } = {}) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `Érvénytelen ${field}`);
  return int ? Math.round(n) : n;
}

function str(v, max = 500) {
  if (v === undefined || v === null) return '';
  return String(v).trim().slice(0, max);
}

function dateParam(v) {
  if (v === undefined || v === null || v === '') return today();
  if (!isDate(v)) throw new HttpError(400, 'Érvénytelen dátum');
  return v;
}

module.exports = { HttpError, ah, num, str, dateParam };
