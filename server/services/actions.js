// Közös műveletek. Ezeket a REST végpontok, az AI Coach (tool use) és a szabályalapú chat is használja,
// így a modulok (profil, edzés, étrend, alapanyagok, bevásárlólista) egymásra épülnek.
const { all, get, run, transaction } = require('../db');
const { getProfile, currentWeight } = require('./profile');
const nutrition = require('./nutrition');
const workout = require('./workout');
const ai = require('./ai');
const { BY_KEY: FOOD_BY_KEY, matchFood } = require('../data/foods');
const { addDays } = require('./insights');

// ── Edzésterv ──────────────────────────────────────────────────────────
function getActivePlan(userId) {
  const row = get('SELECT * FROM workout_plans WHERE user_id = ? AND active = 1 ORDER BY id DESC LIMIT 1', userId);
  return row ? { id: row.id, source: row.source, created_at: row.created_at, data: JSON.parse(row.data) } : null;
}

function saveWorkoutPlan(userId, plan, source) {
  return transaction(() => {
    run('UPDATE workout_plans SET active = 0 WHERE user_id = ?', userId);
    const r = run('INSERT INTO workout_plans (user_id, active, source, data) VALUES (?, 1, ?, ?)', userId, source, JSON.stringify(plan));
    return Number(r.lastInsertRowid);
  });
}

function updateActivePlan(userId, planId, data) {
  run('UPDATE workout_plans SET data = ? WHERE id = ? AND user_id = ?', JSON.stringify(data), planId, userId);
}

// Rövid összefoglaló a naplóból az AI számára
function trainingHistorySummary(userId) {
  const rows = all(
    `SELECT s.exercise, s.weight_kg, s.reps, l.date FROM workout_sets s JOIN workout_logs l ON l.id = s.log_id
     WHERE l.user_id = ? AND l.date >= ? ORDER BY l.date DESC`, userId, addDays(new Date().toISOString().slice(0, 10), -42)
  );
  const seen = new Map();
  for (const r of rows) if (!seen.has(r.exercise)) seen.set(r.exercise, `${r.exercise}: ${r.weight_kg || 0} kg × ${r.reps || 0} (${r.date})`);
  return [...seen.values()].slice(0, 30).join('\n');
}

async function regenerateWorkout(userId, { useAi = true } = {}) {
  const profile = getProfile(userId);
  const weight = currentWeight(userId, profile);
  let plan = null;
  let source = 'rules';
  let aiError = null;
  if (useAi && ai.aiEnabled()) {
    try {
      const raw = await ai.aiWorkoutPlan({ profile, weightKg: weight, catalog: workout.exerciseCatalog(profile), history: trainingHistorySummary(userId) });
      plan = workout.enrichAiPlan(raw, profile, weight);
      source = 'ai';
    } catch (e) {
      aiError = e.message;
    }
  }
  if (!plan) plan = workout.generateWorkoutPlan(profile, weight);
  // A már naplózott súlyokból azonnal beállítjuk a következő célsúlyokat
  workout.applyProgression(plan, workout.analyzeProgress(userId, plan));
  const id = saveWorkoutPlan(userId, plan, source);
  return { id, source, data: plan, aiError };
}

// ── Táplálkozás ───────────────────────────────────────────────────────
function getTargets(userId, profile = getProfile(userId)) {
  return nutrition.calcTargets(profile, currentWeight(userId, profile));
}

const pantryRows = (userId) => all('SELECT * FROM pantry_items WHERE user_id = ? ORDER BY name', userId);

function getMealPlan(userId, date) {
  const row = get('SELECT * FROM meal_plans WHERE user_id = ? AND date = ?', userId, date);
  return row ? { id: row.id, source: row.source, data: JSON.parse(row.data) } : null;
}

function saveMealPlan(userId, date, plan, source) {
  transaction(() => {
    // A korábbi tervből "megevett" bejegyzések megmaradnak, csak leválnak a régi tervről
    run('UPDATE food_log SET plan_meal = NULL WHERE user_id = ? AND date = ?', userId, date);
    run(
      `INSERT INTO meal_plans (user_id, date, source, data) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, date) DO UPDATE SET source = excluded.source, data = excluded.data, created_at = datetime('now')`,
      userId, date, source, JSON.stringify(plan)
    );
  });
}

function updateMealPlanData(userId, date, data) {
  nutrition.finalizePlan(data); // összesítések frissítése
  run('UPDATE meal_plans SET data = ? WHERE user_id = ? AND date = ?', JSON.stringify(data), userId, date);
}

function recentMealKeys(userId, date, days = 3) {
  const rows = all('SELECT data FROM meal_plans WHERE user_id = ? AND date < ? AND date >= ?', userId, date, addDays(date, -days));
  return rows.flatMap((r) => JSON.parse(r.data).meals.flatMap((m) => m.items.map((i) => i.key)));
}

function consumedTotals(userId, date) {
  const r = get('SELECT COALESCE(SUM(kcal),0) kcal, COALESCE(SUM(protein),0) protein, COALESCE(SUM(carbs),0) carbs, COALESCE(SUM(fat),0) fat FROM food_log WHERE user_id = ? AND date = ?', userId, date);
  return { kcal: Math.round(r.kcal), protein: Math.round(r.protein), carbs: Math.round(r.carbs), fat: Math.round(r.fat) };
}

async function createMealPlan(userId, date, { onlyAvailable = false, kcalOffset = 0, useAi = true, note = '', pantryOverride = null, seed, save = true } = {}) {
  const profile = getProfile(userId);
  const targets = getTargets(userId, profile);
  const pantry = pantryOverride || pantryRows(userId);
  let plan = null;
  let source = 'rules';
  let aiError = null;
  if (useAi && ai.aiEnabled()) {
    try {
      const t = { ...targets };
      if (kcalOffset) {
        t.kcal += kcalOffset;
        t.carbs = Math.max(50, Math.round(t.carbs + (kcalOffset * 0.6) / 4));
        t.fat = Math.max(30, Math.round(t.fat + (kcalOffset * 0.4) / 9));
      }
      const pool = nutrition.buildFoodPool(profile, pantry).filter((f) => !onlyAvailable || f.avail === 'home' || f.cat === 'fat');
      const slots = nutrition.slotLayout(profile.meals_per_day);
      const raw = await ai.aiMealPlan({ profile, targets: t, pool, slots, onlyAvailable, note });
      plan = nutrition.planFromAi({ profile, pantry, targets: t, aiMeals: raw.meals, date, onlyAvailable });
      source = 'ai';
    } catch (e) {
      aiError = e.message;
    }
  }
  if (!plan) {
    plan = nutrition.generateDayPlan({
      profile, targets, pantry, date, onlyAvailable, kcalOffset, recentKeys: recentMealKeys(userId, date), seed: seed || Date.now(),
    });
  }
  if (save) saveMealPlan(userId, date, plan, source);
  return { source, data: plan, aiError };
}

// ── Profil frissítése (pl. a chatből: "csak heti 3 napom van") ─────────
const PROFILE_FIELDS = {
  days_per_week: (v) => Math.min(6, Math.max(1, parseInt(v, 10))),
  session_minutes: (v) => Math.min(180, Math.max(15, parseInt(v, 10))),
  goal: (v) => (['muscle_gain', 'fat_loss', 'recomp', 'cut', 'strength', 'endurance', 'health'].includes(v) ? v : undefined),
  location: (v) => (['gym', 'home'].includes(v) ? v : undefined),
  meals_per_day: (v) => Math.min(5, Math.max(3, parseInt(v, 10))),
  daily_budget: (v) => (v === null || v === '' ? null : Math.max(0, parseInt(v, 10))),
  cook_minutes: (v) => Math.min(120, Math.max(5, parseInt(v, 10))),
  experience: (v) => (['beginner', 'intermediate', 'advanced'].includes(v) ? v : undefined),
  kcal_adjust: (v) => Math.min(800, Math.max(-800, parseInt(v, 10))),
};
const TRAINING_FIELDS = ['days_per_week', 'session_minutes', 'goal', 'location', 'experience'];

async function updateProfileFields(userId, fields, { regenerate = true } = {}) {
  const sets = [];
  const vals = [];
  for (const [k, conv] of Object.entries(PROFILE_FIELDS)) {
    if (fields[k] === undefined) continue;
    const v = conv(fields[k]);
    if (v === undefined || Number.isNaN(v)) continue;
    sets.push(`${k} = ?`);
    vals.push(v);
  }
  if (!sets.length) return { changed: [] };
  run(`UPDATE profiles SET ${sets.join(', ')}, updated_at = datetime('now') WHERE user_id = ?`, ...vals, userId);
  const changed = sets.map((s) => s.split(' ')[0]);
  let plan = null;
  if (regenerate && changed.some((c) => TRAINING_FIELDS.includes(c))) plan = await regenerateWorkout(userId);
  return { changed, plan };
}

// ── Alapanyagok ───────────────────────────────────────────────────────
function addPantryItems(userId, items) {
  const added = [];
  transaction(() => {
    for (const it of items) {
      const name = String(it.name || '').trim().slice(0, 80);
      if (!name) continue;
      // Ha a felhasználó saját tápértéket adott meg, egyedi alapanyagként kezeljük (nem keresünk egyezést)
      const hasOwnMacros = it.kcal !== undefined && it.kcal !== null && it.kcal !== '';
      const food = it.food_key && FOOD_BY_KEY[it.food_key] ? FOOD_BY_KEY[it.food_key] : hasOwnMacros ? null : matchFood(name);
      const availability = it.availability === 'buyable' ? 'buyable' : 'home';
      const qty = it.quantity_g != null && it.quantity_g !== '' ? Math.max(0, Number(it.quantity_g)) : null;
      const key = food ? food.key : null;
      const existing = key ? get('SELECT id FROM pantry_items WHERE user_id = ? AND food_key = ? AND availability = ?', userId, key, availability) : null;
      if (existing) {
        // accumulate: pl. vásárlás után a meglévő mennyiséghez adjuk hozzá
        if (it.accumulate && qty != null) run("UPDATE pantry_items SET quantity_g = CASE WHEN quantity_g IS NULL THEN NULL ELSE quantity_g + ? END, updated_at = datetime('now') WHERE id = ?", qty, existing.id);
        else run("UPDATE pantry_items SET quantity_g = COALESCE(?, quantity_g), updated_at = datetime('now') WHERE id = ?", qty, existing.id);
        added.push({ id: existing.id, name: food.name, updated: true });
        continue;
      }
      const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
      const r = run(
        'INSERT INTO pantry_items (user_id, name, food_key, availability, quantity_g, kcal, protein, carbs, fat) VALUES (?,?,?,?,?,?,?,?,?)',
        userId, food ? food.name : name, key, availability, qty, num(it.kcal), num(it.protein), num(it.carbs), num(it.fat)
      );
      added.push({ id: Number(r.lastInsertRowid), name: food ? food.name : name, matched: !!food });
    }
  });
  return added;
}

// ── Bevásárlólista az étrendből ───────────────────────────────────────
function generateShoppingList(userId, startDate, days = 7) {
  const plans = all('SELECT date, data FROM meal_plans WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date', userId, startDate, addDays(startDate, days - 1));
  const pantry = pantryRows(userId);
  const home = new Map();
  for (const p of pantry) if (p.availability === 'home' && p.food_key) home.set(p.food_key, p.quantity_g);

  const need = new Map();
  for (const p of plans) {
    const data = JSON.parse(p.data);
    for (const m of data.meals) {
      if (m.status === 'eaten' || m.status === 'skipped') continue;
      for (const it of m.items) {
        const cur = need.get(it.key) || { key: it.key, name: it.name, grams: 0, meals: new Set() };
        cur.grams += it.grams;
        cur.meals.add(m.title);
        need.set(it.key, cur);
      }
    }
  }
  const prevChecked = new Set(all('SELECT food_key FROM shopping_items WHERE user_id = ? AND checked = 1 AND custom = 0', userId).map((r) => r.food_key));
  const items = [];
  for (const n of need.values()) {
    if (home.has(n.key)) {
      const qty = home.get(n.key);
      if (qty == null) continue; // otthon van, mennyiség nem ismert -> feltételezzük, hogy elég
      n.grams -= qty;
      if (n.grams <= 0) continue;
    }
    const food = FOOD_BY_KEY[n.key];
    const grams = Math.ceil(n.grams / 10) * 10;
    items.push({ key: n.key, name: n.name, grams, price: food ? Math.round((food.price * grams) / 1000) : null, meals: [...n.meals].slice(0, 6).join(' · ') });
  }
  transaction(() => {
    run('DELETE FROM shopping_items WHERE user_id = ? AND custom = 0', userId);
    for (const it of items) {
      run('INSERT INTO shopping_items (user_id, name, food_key, quantity_g, est_price, for_meals, checked, custom) VALUES (?,?,?,?,?,?,?,0)',
        userId, it.name, it.key, it.grams, it.price, it.meals, prevChecked.has(it.key) ? 1 : 0);
    }
  });
  return { days: plans.length, count: items.length };
}

module.exports = {
  getActivePlan, saveWorkoutPlan, updateActivePlan, regenerateWorkout, trainingHistorySummary,
  getTargets, pantryRows, getMealPlan, saveMealPlan, updateMealPlanData, consumedTotals, createMealPlan, recentMealKeys,
  updateProfileFields, addPantryItems, generateShoppingList, PROFILE_FIELDS,
};
