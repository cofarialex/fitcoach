// Étrend, étkezésnapló, víz, alapanyagok, bevásárlólista
const express = require('express');
const { all, get, run, transaction } = require('../db');
const { ah, HttpError, num, str, dateParam } = require('../util');
const { memoryUpload } = require('../upload');
const { getProfile } = require('../services/profile');
const nutrition = require('../services/nutrition');
const actions = require('../services/actions');
const ai = require('../services/ai');
const { addDays } = require('../services/insights');
const { BY_KEY: FOOD_BY_KEY, matchFood } = require('../data/foods');

const router = express.Router();

// A nap teljes állapota: terv + elfogyasztott + célok
function dayState(userId, date) {
  const plan = actions.getMealPlan(userId, date);
  const log = all('SELECT * FROM food_log WHERE user_id = ? AND date = ? ORDER BY id', userId, date);
  const water = get('SELECT COALESCE(SUM(ml),0) AS ml FROM water_log WHERE user_id = ? AND date = ?', userId, date).ml;
  return { date, plan, log, consumed: actions.consumedTotals(userId, date), targets: actions.getTargets(userId), water };
}

router.get('/meals/:date', (req, res) => res.json(dayState(req.userId, dateParam(req.params.date))));

router.post('/meals/:date/generate', ah(async (req, res) => {
  const date = dateParam(req.params.date);
  const r = await actions.createMealPlan(req.userId, date, {
    onlyAvailable: !!req.body.onlyAvailable, useAi: req.body.useAi !== false,
    kcalOffset: num(req.body.kcalOffset, { min: -800, max: 800, int: true }) || 0, note: str(req.body.note, 300),
  });
  res.json({ ...dayState(req.userId, date), aiError: r.aiError });
}));

// Heti étrend (7 nap) — a változatosság miatt a napok figyelembe veszik az előzőket
router.post('/meals/week', ah(async (req, res) => {
  const start = dateParam(req.body.start);
  const overwrite = !!req.body.overwrite;
  let created = 0;
  for (let i = 0; i < 7; i++) {
    const date = addDays(start, i);
    if (!overwrite && actions.getMealPlan(req.userId, date)) continue;
    await actions.createMealPlan(req.userId, date, { useAi: false, seed: Date.now() + i * 7919 });
    created++;
  }
  const list = actions.generateShoppingList(req.userId, start, 7);
  res.json({ created, shopping: list });
}));

router.get('/meals-range', (req, res) => {
  const start = dateParam(req.query.start);
  const rows = all('SELECT date, source, data FROM meal_plans WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date', req.userId, start, addDays(start, 6));
  res.json({ plans: rows.map((r) => ({ date: r.date, source: r.source, data: JSON.parse(r.data) })) });
});

function loadDayPlan(userId, date) {
  const p = actions.getMealPlan(userId, date);
  if (!p) throw new HttpError(404, 'Erre a napra még nincs étrend');
  return p;
}

// Étkezés állapota: megettem / kihagytam / tervezett
router.post('/meals/:date/meal/:i/status', (req, res) => {
  const date = dateParam(req.params.date);
  const plan = loadDayPlan(req.userId, date);
  const i = num(req.params.i, { int: true });
  const meal = plan.data.meals[i];
  if (!meal) throw new HttpError(404, 'Nincs ilyen étkezés');
  const status = req.body.status;
  if (!['eaten', 'skipped', 'planned'].includes(status)) throw new HttpError(400, 'Érvénytelen állapot');
  transaction(() => {
    run('DELETE FROM food_log WHERE user_id = ? AND date = ? AND plan_meal = ?', req.userId, date, i);
    if (status === 'eaten') {
      // Arányosan is jelölhető (pl. csak a felét etted meg)
      const portion = num(req.body.portion, { min: 0.1, max: 3 }) || 1;
      for (const it of meal.items) {
        run('INSERT INTO food_log (user_id, date, slot, name, grams, kcal, protein, carbs, fat, plan_meal) VALUES (?,?,?,?,?,?,?,?,?,?)',
          req.userId, date, meal.slot, it.name, Math.round(it.grams * portion), it.kcal * portion, it.protein * portion, it.carbs * portion, it.fat * portion, i);
      }
    }
    meal.status = status;
    actions.updateMealPlanData(req.userId, date, plan.data);
  });
  res.json(dayState(req.userId, date));
});

router.post('/meals/:date/meal/:i/regenerate', (req, res) => {
  const date = dateParam(req.params.date);
  const plan = loadDayPlan(req.userId, date);
  const i = num(req.params.i, { int: true });
  if (!plan.data.meals[i]) throw new HttpError(404, 'Nincs ilyen étkezés');
  nutrition.regenerateMeal({ profile: getProfile(req.userId), pantry: actions.pantryRows(req.userId), plan: plan.data, index: i });
  actions.updateMealPlanData(req.userId, date, plan.data);
  res.json(dayState(req.userId, date));
});

router.post('/meals/:date/meal/:i/swap', (req, res) => {
  const date = dateParam(req.params.date);
  const plan = loadDayPlan(req.userId, date);
  const i = num(req.params.i, { int: true });
  if (!plan.data.meals[i]) throw new HttpError(404, 'Nincs ilyen étkezés');
  try {
    nutrition.swapIngredient({ profile: getProfile(req.userId), pantry: actions.pantryRows(req.userId), plan: plan.data, index: i, fromKey: str(req.body.from, 60), toKey: str(req.body.to, 60) });
  } catch (e) {
    throw new HttpError(400, e.message);
  }
  actions.updateMealPlanData(req.userId, date, plan.data);
  res.json(dayState(req.userId, date));
});

// A hátralévő étkezéseket a maradék napi kerethez igazítja (pl. kihagyás vagy "mást ettem" után)
router.post('/meals/:date/rebalance', (req, res) => {
  const date = dateParam(req.params.date);
  const plan = loadDayPlan(req.userId, date);
  const r = nutrition.rebalanceRemaining({ profile: getProfile(req.userId), pantry: actions.pantryRows(req.userId), plan: plan.data, consumed: actions.consumedTotals(req.userId, date) });
  actions.updateMealPlanData(req.userId, date, plan.data);
  res.json({ ...dayState(req.userId, date), changed: r.changed });
});

router.delete('/meals/:date', (req, res) => {
  const date = dateParam(req.params.date);
  run('UPDATE food_log SET plan_meal = NULL WHERE user_id = ? AND date = ?', req.userId, date);
  run('DELETE FROM meal_plans WHERE user_id = ? AND date = ?', req.userId, date);
  res.json(dayState(req.userId, date));
});

// ── Étkezésnapló: "mást ettem" ─────────────────────────────────────────
function parseFoodEntry(b) {
  const e = { date: dateParam(b.date), slot: str(b.slot, 20) || null, name: str(b.name, 120), grams: num(b.grams, { min: 0, max: 5000, field: 'mennyiség' }) };
  const food = b.food_key ? FOOD_BY_KEY[b.food_key] : null;
  if (food && e.grams) {
    // Ismert élelmiszer: a tápértéket mi számoljuk
    Object.assign(e, nutrition.macrosFor(food, e.grams));
    if (!e.name) e.name = food.name;
  } else {
    e.kcal = num(b.kcal, { min: 0, max: 10000, field: 'kalória' }) || 0;
    e.protein = num(b.protein, { min: 0, max: 1000, field: 'fehérje' }) || 0;
    e.carbs = num(b.carbs, { min: 0, max: 1000, field: 'szénhidrát' }) || 0;
    e.fat = num(b.fat, { min: 0, max: 1000, field: 'zsír' }) || 0;
  }
  if (!e.name) throw new HttpError(400, 'Add meg az étel nevét');
  return e;
}

router.post('/food-log', (req, res) => {
  const e = parseFoodEntry(req.body);
  run('INSERT INTO food_log (user_id, date, slot, name, grams, kcal, protein, carbs, fat) VALUES (?,?,?,?,?,?,?,?,?)', req.userId, e.date, e.slot, e.name, e.grams, e.kcal, e.protein, e.carbs, e.fat);
  // Ha egy tervezett étkezés helyett ettél mást, azt az étkezést "lecseréltnek" jelöljük
  if (req.body.replaceMeal !== undefined && req.body.replaceMeal !== null) {
    const plan = actions.getMealPlan(req.userId, e.date);
    const i = num(req.body.replaceMeal, { int: true });
    if (plan && plan.data.meals[i]) {
      run('DELETE FROM food_log WHERE user_id = ? AND date = ? AND plan_meal = ?', req.userId, e.date, i);
      plan.data.meals[i].status = 'replaced';
      actions.updateMealPlanData(req.userId, e.date, plan.data);
    }
  }
  res.status(201).json(dayState(req.userId, e.date));
});

router.put('/food-log/:id', (req, res) => {
  const old = get('SELECT * FROM food_log WHERE id = ? AND user_id = ?', req.params.id, req.userId);
  if (!old) throw new HttpError(404, 'Nincs ilyen bejegyzés');
  const e = parseFoodEntry({ ...req.body, date: old.date });
  run('UPDATE food_log SET name=?, grams=?, kcal=?, protein=?, carbs=?, fat=?, slot=? WHERE id=?', e.name, e.grams, e.kcal, e.protein, e.carbs, e.fat, e.slot || old.slot, old.id);
  res.json(dayState(req.userId, old.date));
});

router.delete('/food-log/:id', (req, res) => {
  const old = get('SELECT * FROM food_log WHERE id = ? AND user_id = ?', req.params.id, req.userId);
  if (!old) throw new HttpError(404, 'Nincs ilyen bejegyzés');
  run('DELETE FROM food_log WHERE id = ?', old.id);
  // Ha egy tervezett étkezés utolsó tételét törölték, az étkezés újra "tervezett" lesz
  if (old.plan_meal != null && !get('SELECT id FROM food_log WHERE user_id = ? AND date = ? AND plan_meal = ?', req.userId, old.date, old.plan_meal)) {
    const plan = actions.getMealPlan(req.userId, old.date);
    if (plan && plan.data.meals[old.plan_meal]) {
      plan.data.meals[old.plan_meal].status = 'planned';
      actions.updateMealPlanData(req.userId, old.date, plan.data);
    }
  }
  res.json(dayState(req.userId, old.date));
});

// ── Víz ────────────────────────────────────────────────────────────────
router.post('/water', (req, res) => {
  const date = dateParam(req.body.date);
  const ml = num(req.body.ml, { min: -2000, max: 3000, int: true, field: 'mennyiség' });
  if (!ml) throw new HttpError(400, 'Add meg a mennyiséget');
  if (ml < 0) {
    // Visszavonás: a legutóbbi bejegyzés törlése
    const last = get('SELECT id FROM water_log WHERE user_id = ? AND date = ? ORDER BY id DESC LIMIT 1', req.userId, date);
    if (last) run('DELETE FROM water_log WHERE id = ?', last.id);
  } else {
    run('INSERT INTO water_log (user_id, date, ml) VALUES (?,?,?)', req.userId, date, ml);
  }
  res.json({ water: get('SELECT COALESCE(SUM(ml),0) AS ml FROM water_log WHERE user_id = ? AND date = ?', req.userId, date).ml });
});

// ── Alapanyagok ────────────────────────────────────────────────────────
router.get('/pantry', (req, res) => {
  const items = actions.pantryRows(req.userId).map((p) => {
    const f = p.food_key ? FOOD_BY_KEY[p.food_key] : null;
    return { ...p, cat: f ? f.cat : null, per100: f ? { kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat } : p.kcal != null ? { kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat } : null };
  });
  res.json({ items });
});

router.post('/pantry', (req, res) => {
  const list = Array.isArray(req.body.items) ? req.body.items : [req.body];
  if (!list.length || list.length > 100) throw new HttpError(400, 'Érvénytelen lista');
  for (const it of list) {
    for (const k of ['kcal', 'protein', 'carbs', 'fat']) num(it[k], { min: 0, max: 1000, field: k });
    num(it.quantity_g, { min: 0, max: 100000, field: 'mennyiség' });
  }
  res.status(201).json({ added: actions.addPantryItems(req.userId, list) });
});

router.put('/pantry/:id', (req, res) => {
  const old = get('SELECT * FROM pantry_items WHERE id = ? AND user_id = ?', req.params.id, req.userId);
  if (!old) throw new HttpError(404, 'Nincs ilyen alapanyag');
  const b = req.body;
  const availability = b.availability === undefined ? old.availability : b.availability === 'buyable' ? 'buyable' : 'home';
  const qty = b.quantity_g === undefined ? old.quantity_g : num(b.quantity_g, { min: 0, max: 100000, field: 'mennyiség' });
  const name = b.name === undefined ? old.name : str(b.name, 80) || old.name;
  run("UPDATE pantry_items SET name = ?, availability = ?, quantity_g = ?, updated_at = datetime('now') WHERE id = ?", name, availability, qty, old.id);
  res.json({ item: get('SELECT * FROM pantry_items WHERE id = ?', old.id) });
});

router.delete('/pantry/:id', (req, res) => {
  run('DELETE FROM pantry_items WHERE id = ? AND user_id = ?', req.params.id, req.userId);
  res.json({ ok: true });
});

// Fotó alapján alapanyag-felismerés (Claude vision). Csak javaslatot ad vissza, a felhasználó hagyja jóvá.
router.post('/pantry/recognize', memoryUpload.single('photo'), ah(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Tölts fel egy képet');
  if (!ai.aiEnabled()) throw new HttpError(501, 'A képfelismeréshez AI (Anthropic API-kulcs) szükséges. Addig add hozzá az alapanyagokat kézzel.');
  let items;
  try {
    items = await ai.recognizeIngredients(req.file.buffer, req.file.mimetype);
  } catch (e) {
    throw new HttpError(502, e.message);
  }
  res.json({
    items: items.slice(0, 30).map((it) => {
      const f = matchFood(it.name);
      return { name: f ? f.name : str(it.name, 80), food_key: f ? f.key : null, quantity_g: Number(it.grams) > 0 ? Math.round(it.grams) : null, detected: str(it.name, 80) };
    }),
  });
}));

// ── Bevásárlólista ─────────────────────────────────────────────────────
router.get('/shopping', (req, res) => {
  res.json({ items: all('SELECT * FROM shopping_items WHERE user_id = ? ORDER BY checked ASC, custom ASC, name ASC', req.userId) });
});

router.post('/shopping/generate', (req, res) => {
  const start = dateParam(req.body.start);
  const days = num(req.body.days, { min: 1, max: 14, int: true }) || 7;
  const r = actions.generateShoppingList(req.userId, start, days);
  res.json({ ...r, items: all('SELECT * FROM shopping_items WHERE user_id = ? ORDER BY checked ASC, custom ASC, name ASC', req.userId) });
});

router.post('/shopping', (req, res) => {
  const name = str(req.body.name, 100);
  if (!name) throw new HttpError(400, 'Add meg a tétel nevét');
  const f = matchFood(name);
  const grams = num(req.body.quantity_g, { min: 0, max: 100000, field: 'mennyiség' });
  const price = num(req.body.est_price, { min: 0, max: 1000000, int: true, field: 'ár' }) ?? (f && grams ? Math.round((f.price * grams) / 1000) : null);
  run('INSERT INTO shopping_items (user_id, name, food_key, quantity_g, est_price, for_meals, custom) VALUES (?,?,?,?,?,?,1)', req.userId, name, f ? f.key : null, grams, price, str(req.body.for_meals, 200));
  res.status(201).json({ ok: true });
});

router.put('/shopping/:id', (req, res) => {
  const r = run('UPDATE shopping_items SET checked = ? WHERE id = ? AND user_id = ?', req.body.checked ? 1 : 0, req.params.id, req.userId);
  if (!r.changes) throw new HttpError(404, 'Nincs ilyen tétel');
  res.json({ ok: true });
});

router.delete('/shopping/:id', (req, res) => {
  run('DELETE FROM shopping_items WHERE id = ? AND user_id = ?', req.params.id, req.userId);
  res.json({ ok: true });
});

// A megvásárolt (kipipált) tételek átkerülnek az otthoni alapanyagok közé
router.post('/shopping/checked-to-pantry', (req, res) => {
  const items = all('SELECT * FROM shopping_items WHERE user_id = ? AND checked = 1', req.userId);
  const added = actions.addPantryItems(req.userId, items.map((i) => ({ name: i.name, food_key: i.food_key, availability: 'home', quantity_g: i.quantity_g, accumulate: true })));
  run('DELETE FROM shopping_items WHERE user_id = ? AND checked = 1', req.userId);
  res.json({ moved: added.length });
});

module.exports = router;
