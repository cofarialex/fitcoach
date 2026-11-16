// Edzésterv, edzésnapló, testméretek, fejlődés
const express = require('express');
const path = require('path');
const fs = require('fs');
const { all, get, run, transaction } = require('../db');
const { ah, HttpError, num, str, dateParam } = require('../util');
const { diskUpload, userDir, removeUpload } = require('../upload');
const { getProfile, currentWeight } = require('../services/profile');
const workout = require('../services/workout');
const actions = require('../services/actions');
const insights = require('../services/insights');

const router = express.Router();

// ── Edzésterv ──────────────────────────────────────────────────────────
router.get('/workout-plan', (req, res) => {
  const plan = actions.getActivePlan(req.userId);
  if (!plan) return res.json({ plan: null });
  res.json({ plan, progress: workout.analyzeProgress(req.userId, plan.data) });
});

router.post('/workout-plan/generate', ah(async (req, res) => {
  const plan = await actions.regenerateWorkout(req.userId, { useAi: req.body.useAi !== false });
  res.json({ plan, progress: workout.analyzeProgress(req.userId, plan.data), aiError: plan.aiError });
}));

function loadPlan(userId) {
  const plan = actions.getActivePlan(userId);
  if (!plan) throw new HttpError(404, 'Nincs aktív edzésterv');
  return plan;
}

router.post('/workout-plan/swap', (req, res) => {
  const plan = loadPlan(req.userId);
  const profile = getProfile(req.userId);
  try {
    workout.swapExercise(plan.data, num(req.body.day, { int: true }), num(req.body.exercise, { int: true }), str(req.body.key, 40), profile, currentWeight(req.userId, profile));
  } catch (e) {
    throw new HttpError(400, e.message);
  }
  actions.updateActivePlan(req.userId, plan.id, plan.data);
  res.json({ plan, progress: workout.analyzeProgress(req.userId, plan.data) });
});

// Egy gyakorlat paramétereinek kézi módosítása
router.put('/workout-plan/exercise', (req, res) => {
  const plan = loadPlan(req.userId);
  const day = plan.data.days[num(req.body.day, { int: true })];
  const ex = day && day.exercises[num(req.body.exercise, { int: true })];
  if (!ex) throw new HttpError(404, 'Nincs ilyen gyakorlat');
  const b = req.body;
  if (b.sets !== undefined) ex.sets = num(b.sets, { min: 1, max: 10, int: true, field: 'sorozat' });
  if (b.repsMin !== undefined) ex.repsMin = num(b.repsMin, { min: 1, max: 200, int: true, field: 'ismétlés' });
  if (b.repsMax !== undefined) ex.repsMax = Math.max(ex.repsMin, num(b.repsMax, { min: 1, max: 200, int: true, field: 'ismétlés' }));
  if (b.rest !== undefined) ex.rest = num(b.rest, { min: 0, max: 600, int: true, field: 'pihenő' });
  if (b.weight !== undefined) ex.weight = num(b.weight, { min: 0, max: 600, field: 'súly' });
  actions.updateActivePlan(req.userId, plan.id, plan.data);
  res.json({ plan, progress: workout.analyzeProgress(req.userId, plan.data) });
});

router.post('/workout-plan/apply-progression', (req, res) => {
  const plan = loadPlan(req.userId);
  const changed = workout.applyProgression(plan.data, workout.analyzeProgress(req.userId, plan.data));
  actions.updateActivePlan(req.userId, plan.id, plan.data);
  res.json({ plan, changed, progress: workout.analyzeProgress(req.userId, plan.data) });
});

// ── Edzésnapló ─────────────────────────────────────────────────────────
function logWithSets(userId, id) {
  const log = get('SELECT * FROM workout_logs WHERE id = ? AND user_id = ?', id, userId);
  if (!log) throw new HttpError(404, 'Nincs ilyen edzés');
  log.sets = all('SELECT exercise, set_no, weight_kg, reps FROM workout_sets WHERE log_id = ? ORDER BY id', id);
  return log;
}

router.get('/logs', (req, res) => {
  const limit = num(req.query.limit, { min: 1, max: 500, int: true }) || 100;
  const logs = all(
    `SELECT l.*, (SELECT COUNT(*) FROM workout_sets s WHERE s.log_id = l.id) AS set_count,
       (SELECT COUNT(DISTINCT exercise) FROM workout_sets s WHERE s.log_id = l.id) AS exercise_count,
       (SELECT COALESCE(SUM(COALESCE(weight_kg,0)*COALESCE(reps,0)),0) FROM workout_sets s WHERE s.log_id = l.id) AS volume
     FROM workout_logs l WHERE l.user_id = ? ORDER BY l.date DESC, l.id DESC LIMIT ?`, req.userId, limit
  );
  res.json({ logs });
});

router.get('/logs/:id', (req, res) => res.json({ log: logWithSets(req.userId, req.params.id) }));

// Az ügyfél multipart/form-data-ban küldi: "data" mező (JSON) + opcionális "photo" fájl
function parseLogBody(req) {
  let b;
  try {
    b = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body;
  } catch {
    throw new HttpError(400, 'Hibás adat');
  }
  const log = {
    date: dateParam(b.date), title: str(b.title, 100) || 'Edzés', plan_day: num(b.plan_day, { min: 0, max: 10, int: true }),
    duration_min: num(b.duration_min, { min: 0, max: 600, int: true, field: 'időtartam' }), cardio_type: str(b.cardio_type, 60) || null,
    cardio_min: num(b.cardio_min, { min: 0, max: 600, field: 'kardió idő' }), cardio_km: num(b.cardio_km, { min: 0, max: 500, field: 'táv' }),
    cardio_kcal: num(b.cardio_kcal, { min: 0, max: 5000, field: 'kalória' }), notes: str(b.notes, 2000),
  };
  const sets = (Array.isArray(b.sets) ? b.sets : []).slice(0, 200).map((s, i) => ({
    exercise: str(s.exercise, 100), set_no: num(s.set_no, { min: 1, max: 50, int: true }) || i + 1,
    weight_kg: num(s.weight_kg, { min: 0, max: 600, field: 'súly' }), reps: num(s.reps, { min: 0, max: 500, int: true, field: 'ismétlés' }),
  })).filter((s) => s.exercise);
  return { log, sets, removePhoto: !!b.removePhoto };
}

function insertSets(logId, sets) {
  for (const s of sets) run('INSERT INTO workout_sets (log_id, exercise, set_no, weight_kg, reps) VALUES (?,?,?,?,?)', logId, s.exercise, s.set_no, s.weight_kg, s.reps);
}

router.post('/logs', diskUpload.single('photo'), (req, res) => {
  const { log, sets } = parseLogBody(req);
  const id = transaction(() => {
    const r = run(
      'INSERT INTO workout_logs (user_id, date, title, plan_day, duration_min, cardio_type, cardio_min, cardio_km, cardio_kcal, notes, photo) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      req.userId, log.date, log.title, log.plan_day, log.duration_min, log.cardio_type, log.cardio_min, log.cardio_km, log.cardio_kcal, log.notes, req.file ? req.file.filename : null
    );
    insertSets(r.lastInsertRowid, sets);
    return Number(r.lastInsertRowid);
  });
  res.status(201).json({ log: logWithSets(req.userId, id) });
});

router.put('/logs/:id', diskUpload.single('photo'), (req, res) => {
  const old = logWithSets(req.userId, req.params.id);
  const { log, sets, removePhoto } = parseLogBody(req);
  let photo = old.photo;
  if (req.file || removePhoto) {
    removeUpload(req.userId, old.photo);
    photo = req.file ? req.file.filename : null;
  }
  transaction(() => {
    run(
      'UPDATE workout_logs SET date=?, title=?, plan_day=?, duration_min=?, cardio_type=?, cardio_min=?, cardio_km=?, cardio_kcal=?, notes=?, photo=? WHERE id=? AND user_id=?',
      log.date, log.title, log.plan_day, log.duration_min, log.cardio_type, log.cardio_min, log.cardio_km, log.cardio_kcal, log.notes, photo, old.id, req.userId
    );
    run('DELETE FROM workout_sets WHERE log_id = ?', old.id);
    insertSets(old.id, sets);
  });
  res.json({ log: logWithSets(req.userId, old.id) });
});

router.delete('/logs/:id', (req, res) => {
  const old = logWithSets(req.userId, req.params.id);
  run('DELETE FROM workout_logs WHERE id = ? AND user_id = ?', old.id, req.userId);
  removeUpload(req.userId, old.photo);
  res.json({ ok: true });
});

// Összehasonlítás: az edzés minden gyakorlatánál az előző alkalom eredménye
router.get('/logs/:id/compare', (req, res) => {
  const log = logWithSets(req.userId, req.params.id);
  const names = [...new Set(log.sets.map((s) => s.exercise))];
  const rows = names.map((name) => {
    const sessions = all(
      `SELECT l.id, l.date, s.weight_kg, s.reps FROM workout_sets s JOIN workout_logs l ON l.id = s.log_id
       WHERE l.user_id = ? AND lower(s.exercise) = lower(?) AND (l.date < ? OR (l.date = ? AND l.id < ?)) ORDER BY l.date DESC, l.id DESC`,
      req.userId, name, log.date, log.date, log.id
    );
    const prevId = sessions.length ? sessions[0].id : null;
    const prev = sessions.filter((s) => s.id === prevId);
    const cur = log.sets.filter((s) => s.exercise === name);
    const stat = (sets) => (sets.length ? {
      top: Math.max(...sets.map((s) => s.weight_kg || 0)), reps: sets.reduce((a, s) => a + (s.reps || 0), 0),
      volume: Math.round(sets.reduce((a, s) => a + (s.weight_kg || 0) * (s.reps || 0), 0)),
      e1rm: Math.round(Math.max(...sets.map((s) => (s.weight_kg || 0) * (1 + (s.reps || 0) / 30))) * 10) / 10, sets: sets.length,
    } : null);
    return { exercise: name, current: stat(cur), previous: stat(prev), previousDate: prev.length ? prev[0].date : null };
  });
  res.json({ log, compare: rows });
});

// Feltöltött fotó kiszolgálása — csak a tulajdonosnak
router.get('/uploads/:file', (req, res) => {
  const file = path.basename(req.params.file);
  const owns = get('SELECT id FROM workout_logs WHERE user_id = ? AND photo = ?', req.userId, file);
  const full = path.join(userDir(req.userId), file);
  if (!owns || !fs.existsSync(full)) throw new HttpError(404, 'Nem található');
  res.sendFile(full);
});

// ── Testméretek ─────────────────────────────────────────────────────────
const METRIC_FIELDS = { weight_kg: [20, 400], body_fat: [3, 70], waist_cm: [30, 250], chest_cm: [40, 250], arm_cm: [10, 100], hip_cm: [40, 250], thigh_cm: [20, 150] };
function parseMetric(b) {
  const m = { date: dateParam(b.date) };
  for (const [k, [min, max]] of Object.entries(METRIC_FIELDS)) m[k] = num(b[k], { min, max, field: k });
  if (Object.keys(METRIC_FIELDS).every((k) => m[k] == null)) throw new HttpError(400, 'Adj meg legalább egy értéket');
  return m;
}

router.get('/metrics', (req, res) => res.json({ metrics: all('SELECT * FROM body_metrics WHERE user_id = ? ORDER BY date DESC, id DESC', req.userId) }));

router.post('/metrics', (req, res) => {
  const m = parseMetric(req.body);
  const cols = Object.keys(m);
  const r = run(`INSERT INTO body_metrics (user_id, ${cols.join(',')}) VALUES (?, ${cols.map(() => '?').join(',')})`, req.userId, ...cols.map((c) => m[c]));
  res.status(201).json({ metric: get('SELECT * FROM body_metrics WHERE id = ?', r.lastInsertRowid) });
});

router.put('/metrics/:id', (req, res) => {
  const m = parseMetric(req.body);
  const cols = Object.keys(m);
  const r = run(`UPDATE body_metrics SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ? AND user_id = ?`, ...cols.map((c) => m[c]), req.params.id, req.userId);
  if (!r.changes) throw new HttpError(404, 'Nincs ilyen mérés');
  res.json({ metric: get('SELECT * FROM body_metrics WHERE id = ?', req.params.id) });
});

router.delete('/metrics/:id', (req, res) => {
  run('DELETE FROM body_metrics WHERE id = ? AND user_id = ?', req.params.id, req.userId);
  res.json({ ok: true });
});

// ── Fejlődés (grafikonokhoz) ───────────────────────────────────────────
router.get('/progress', (req, res) => {
  const u = req.userId;
  const metrics = all('SELECT * FROM body_metrics WHERE user_id = ? ORDER BY date ASC, id ASC', u);
  const exercises = all(
    `SELECT s.exercise AS name, COUNT(DISTINCT l.id) AS sessions FROM workout_sets s JOIN workout_logs l ON l.id = s.log_id
     WHERE l.user_id = ? AND COALESCE(s.weight_kg, 0) > 0 GROUP BY lower(s.exercise) ORDER BY sessions DESC LIMIT 30`, u
  );
  res.json({ metrics, weekly: insights.weeklyStats(u, 12, dateParam(req.query.date)), exercises });
});

router.get('/progress/exercise', (req, res) => {
  const name = str(req.query.name, 100);
  const rows = all(
    `SELECT l.date, MAX(COALESCE(s.weight_kg,0)) AS top, MAX(COALESCE(s.weight_kg,0) * (1 + COALESCE(s.reps,0) / 30.0)) AS e1rm,
       SUM(COALESCE(s.weight_kg,0) * COALESCE(s.reps,0)) AS volume
     FROM workout_sets s JOIN workout_logs l ON l.id = s.log_id
     WHERE l.user_id = ? AND lower(s.exercise) = lower(?) GROUP BY l.id ORDER BY l.date ASC, l.id ASC`, req.userId, name
  );
  res.json({ name, series: rows.map((r) => ({ date: r.date, top: r.top, e1rm: Math.round(r.e1rm * 10) / 10, volume: Math.round(r.volume) })) });
});

module.exports = router;
