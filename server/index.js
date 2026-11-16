// FitCoach szerver belépési pont
const path = require('path');
const fs = require('fs');

// .env fájl betöltése (ha van) — pl. ANTHROPIC_API_KEY, PORT
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile) && typeof process.loadEnvFile === 'function') process.loadEnvFile(envFile);

const express = require('express');
const cookieParser = require('cookie-parser');
const { requireAuth } = require('./auth');
const ai = require('./services/ai');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Alap biztonsági fejlécek
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'");
  next();
});

// API
app.use('/api', require('./routes/account')); // regisztráció/bejelentkezés + profil (a fájlon belül védett)
app.use('/api', requireAuth, require('./routes/training'));
app.use('/api', requireAuth, require('./routes/nutrition'));
app.use('/api', requireAuth, require('./routes/coach'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Ismeretlen API végpont' }));

// Frontend (statikus fájlok) + Chart.js a node_modules-ból
app.use('/vendor/chart.js', express.static(path.join(__dirname, '..', 'node_modules', 'chart.js', 'dist')));
app.use(express.static(path.join(__dirname, '..', 'public')));
// Egyoldalas alkalmazás: minden más útvonal az index.html-t kapja
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

// Központi hibakezelő: a kliens mindig { error: "..." } formátumot kap
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  let status = err.status || 500;
  if (err.code === 'LIMIT_FILE_SIZE') status = 413;
  if (err.type === 'entity.parse.failed') status = 400;
  if (status >= 500) console.error(err);
  const message = status === 413 ? 'A fájl túl nagy' : status >= 500 ? 'Szerverhiba történt' : err.message;
  res.status(status).json({ error: message });
});

const PORT = Number(process.env.PORT) || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`FitCoach fut: http://localhost:${PORT}`);
    console.log(ai.aiEnabled() ? `AI mód: bekapcsolva (${ai.MODEL})` : 'AI mód: kikapcsolva — beépített szabályalapú motor (ANTHROPIC_API_KEY megadásával kapcsolható be)');
  });
}

module.exports = app;
