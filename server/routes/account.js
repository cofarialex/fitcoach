// Regisztráció, bejelentkezés, profil, fiókkezelés
const express = require('express');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { all, get, run, DATA_DIR } = require('../db');
const { setAuthCookie, clearAuthCookie, requireAuth, loginLimiter } = require('../auth');
const { ah, HttpError, num, str } = require('../util');
const { getProfile, GOALS, ACTIVITY, EXPERIENCE } = require('../services/profile');
const { FOODS, ALLERGENS } = require('../data/foods');
const { EQUIPMENT, INJURIES } = require('../data/exercises');
const { exerciseCatalog } = require('../services/workout');
const actions = require('../services/actions');
const ai = require('../services/ai');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/auth/register', loginLimiter, ah(async (req, res) => {
  const email = str(req.body.email, 200).toLowerCase();
  const name = str(req.body.name, 80);
  const password = String(req.body.password || '');
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Érvénytelen e-mail cím');
  if (!name) throw new HttpError(400, 'Add meg a neved');
  if (password.length < 8) throw new HttpError(400, 'A jelszó legalább 8 karakter legyen');
  if (get('SELECT id FROM users WHERE email = ?', email)) throw new HttpError(409, 'Ezzel az e-mail címmel már regisztráltak');
  const hash = await bcrypt.hash(password, 11);
  const r = run('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)', email, hash, name);
  const id = Number(r.lastInsertRowid);
  run('INSERT INTO profiles (user_id) VALUES (?)', id);
  setAuthCookie(res, id);
  res.status(201).json({ ok: true });
}));

router.post('/auth/login', loginLimiter, ah(async (req, res) => {
  const email = str(req.body.email, 200).toLowerCase();
  const user = get('SELECT * FROM users WHERE email = ?', email);
  const ok = user && (await bcrypt.compare(String(req.body.password || ''), user.password_hash));
  if (!ok) throw new HttpError(401, 'Hibás e-mail cím vagy jelszó');
  setAuthCookie(res, user.id);
  res.json({ ok: true });
}));

router.post('/auth/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

// Minden további útvonal bejelentkezést igényel
router.use(requireAuth);

router.get('/me', (req, res) => {
  const user = get('SELECT id, email, name, created_at FROM users WHERE id = ?', req.userId);
  if (!user) {
    clearAuthCookie(res);
    throw new HttpError(401, 'A felhasználó nem létezik');
  }
  res.json({ user, profile: getProfile(req.userId), aiEnabled: ai.aiEnabled(), aiModel: ai.aiEnabled() ? ai.MODEL : null });
});

// Statikus adatok a kliensnek (legördülő listák, élelmiszer-adatbázis, gyakorlatok)
router.get('/meta', (req, res) => {
  res.json({
    goals: GOALS, experience: EXPERIENCE, equipment: EQUIPMENT, injuries: INJURIES, allergens: ALLERGENS,
    activity: Object.fromEntries(Object.entries(ACTIVITY).map(([k, v]) => [k, v.label])),
    foods: FOODS.map((f) => ({ key: f.key, name: f.name, cat: f.cat, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat, price: f.price })),
    exercises: exerciseCatalog(getProfile(req.userId)),
  });
});

const ENUMS = {
  sex: ['male', 'female'], activity_level: Object.keys(ACTIVITY), experience: Object.keys(EXPERIENCE),
  location: ['gym', 'home'], goal: Object.keys(GOALS),
};
const listOf = (v, allowed) => (Array.isArray(v) ? v.filter((x) => allowed.includes(x)) : []);

router.put('/profile', ah(async (req, res) => {
  const b = req.body;
  const before = getProfile(req.userId);
  for (const [k, allowed] of Object.entries(ENUMS)) {
    if (!allowed.includes(b[k])) throw new HttpError(400, `Hiányzó vagy érvénytelen mező: ${k}`);
  }
  const p = {
    sex: b.sex, age: num(b.age, { min: 13, max: 100, int: true, field: 'életkor' }), height_cm: num(b.height_cm, { min: 120, max: 230, field: 'magasság' }),
    weight_kg: num(b.weight_kg, { min: 30, max: 300, field: 'testsúly' }), body_fat: num(b.body_fat, { min: 3, max: 60, field: 'testzsír' }),
    activity_level: b.activity_level, experience: b.experience,
    days_per_week: num(b.days_per_week, { min: 1, max: 6, int: true, field: 'heti edzésszám' }),
    session_minutes: num(b.session_minutes, { min: 15, max: 180, int: true, field: 'edzésidő' }),
    location: b.location, equipment: JSON.stringify(listOf(b.equipment, Object.keys(EQUIPMENT))), goal: b.goal,
    injuries: JSON.stringify(listOf(b.injuries, Object.keys(INJURIES))), health_notes: str(b.health_notes, 1000),
    allergies: JSON.stringify(listOf(b.allergies, Object.keys(ALLERGENS))), intolerances: JSON.stringify(listOf(b.intolerances, Object.keys(ALLERGENS))),
    likes: str(b.likes, 500), dislikes: str(b.dislikes, 500),
    daily_budget: num(b.daily_budget, { min: 0, max: 100000, int: true, field: 'költségkeret' }),
    meals_per_day: num(b.meals_per_day, { min: 3, max: 5, int: true, field: 'étkezésszám' }) || 4,
    cook_minutes: num(b.cook_minutes, { min: 5, max: 120, int: true, field: 'főzési idő' }) || 30,
  };
  for (const k of ['age', 'height_cm', 'weight_kg', 'days_per_week', 'session_minutes']) {
    if (p[k] == null) throw new HttpError(400, `Hiányzó mező: ${k}`);
  }
  const cols = Object.keys(p);
  run(`UPDATE profiles SET ${cols.map((c) => `${c} = ?`).join(', ')}, onboarded = 1, updated_at = datetime('now') WHERE user_id = ?`, ...cols.map((c) => p[c]), req.userId);

  // Ha első kitöltés, vagy változott valami, ami az edzéstervet érinti -> új terv
  const trainingKeys = ['sex', 'experience', 'days_per_week', 'session_minutes', 'location', 'equipment', 'goal', 'injuries'];
  const changed = !before.onboarded || trainingKeys.some((k) => JSON.stringify(before[k]) !== JSON.stringify(k === 'equipment' || k === 'injuries' ? JSON.parse(p[k]) : p[k]));
  let plan = null;
  if (changed || !actions.getActivePlan(req.userId)) plan = await actions.regenerateWorkout(req.userId, { useAi: b.useAi !== false });
  // Első kitöltéskor a testsúlyt mérésként is elmentjük, hogy a grafikon azonnal induljon
  if (!before.onboarded) run('INSERT INTO body_metrics (user_id, date, weight_kg, body_fat) VALUES (?, date(\'now\', \'localtime\'), ?, ?)', req.userId, p.weight_kg, p.body_fat);
  res.json({ profile: getProfile(req.userId), targets: actions.getTargets(req.userId), planRegenerated: !!plan, aiError: plan && plan.aiError });
}));

router.put('/account/password', ah(async (req, res) => {
  const user = get('SELECT * FROM users WHERE id = ?', req.userId);
  if (!(await bcrypt.compare(String(req.body.current || ''), user.password_hash))) throw new HttpError(400, 'A jelenlegi jelszó hibás');
  const next = String(req.body.next || '');
  if (next.length < 8) throw new HttpError(400, 'Az új jelszó legalább 8 karakter legyen');
  run('UPDATE users SET password_hash = ? WHERE id = ?', await bcrypt.hash(next, 11), req.userId);
  res.json({ ok: true });
}));

router.put('/account/name', ah(async (req, res) => {
  const name = str(req.body.name, 80);
  if (!name) throw new HttpError(400, 'A név nem lehet üres');
  run('UPDATE users SET name = ? WHERE id = ?', name, req.userId);
  res.json({ ok: true });
}));

// Minden saját adat letöltése JSON-ban (adathordozhatóság)
router.get('/account/export', (req, res) => {
  const u = req.userId;
  const tables = ['profiles', 'pantry_items', 'workout_plans', 'workout_logs', 'body_metrics', 'meal_plans', 'food_log', 'water_log', 'shopping_items', 'chat_messages'];
  const data = { user: get('SELECT id, email, name, created_at FROM users WHERE id = ?', u) };
  for (const t of tables) data[t] = all(`SELECT * FROM ${t} WHERE user_id = ?`, u);
  data.workout_sets = all('SELECT s.* FROM workout_sets s JOIN workout_logs l ON l.id = s.log_id WHERE l.user_id = ?', u);
  res.setHeader('Content-Disposition', 'attachment; filename="fitcoach-export.json"');
  res.json(data);
});

router.delete('/account', ah(async (req, res) => {
  const user = get('SELECT * FROM users WHERE id = ?', req.userId);
  if (!(await bcrypt.compare(String(req.body.password || ''), user.password_hash))) throw new HttpError(400, 'Hibás jelszó');
  const dir = path.join(DATA_DIR, 'uploads', String(req.userId));
  run('DELETE FROM users WHERE id = ?', req.userId); // a többi tábla ON DELETE CASCADE-del törlődik
  fs.rmSync(dir, { recursive: true, force: true });
  clearAuthCookie(res);
  res.json({ ok: true });
}));

module.exports = router;
