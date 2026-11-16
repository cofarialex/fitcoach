// Táplálkozási motor: napi célok kiszámítása és étrend összeállítása
// a felhasználó céljai és ténylegesen elérhető alapanyagai alapján.
const { FOODS, BY_KEY, normalize, matchFood } = require('../data/foods');
const { ACTIVITY } = require('./profile');

// ── 1. Napi kalória- és makrocélok ────────────────────────────────────
const GOAL_RULES = {
  muscle_gain: { kcal: 1.1, proteinPerKg: 1.8, fatPct: 0.27 },
  fat_loss: { kcal: 0.8, proteinPerKg: 2.0, fatPct: 0.28 },
  recomp: { kcal: 0.92, proteinPerKg: 2.1, fatPct: 0.27 },
  cut: { kcal: 0.85, proteinPerKg: 2.3, fatPct: 0.25 },
  strength: { kcal: 1.05, proteinPerKg: 1.8, fatPct: 0.28 },
  endurance: { kcal: 1.0, proteinPerKg: 1.5, fatPct: 0.25 },
  health: { kcal: 1.0, proteinPerKg: 1.4, fatPct: 0.3 },
};

function calcTargets(profile, weightKg) {
  const w = weightKg || profile.weight_kg || 75;
  const h = profile.height_cm || 175;
  const age = profile.age || 30;
  const male = profile.sex !== 'female';

  // Ha ismert a testzsír, a pontosabb Katch–McArdle képletet használjuk, különben Mifflin–St Jeor
  let bmr;
  const bf = profile.body_fat;
  if (bf && bf > 3 && bf < 60) {
    const lbm = w * (1 - bf / 100);
    bmr = 370 + 21.6 * lbm;
  } else {
    bmr = 10 * w + 6.25 * h - 5 * age + (male ? 5 : -161);
  }
  const factor = (ACTIVITY[profile.activity_level] || ACTIVITY.moderate).factor;
  const tdee = bmr * factor;
  const rule = GOAL_RULES[profile.goal] || GOAL_RULES.health;

  let kcal = Math.round((tdee * rule.kcal + (profile.kcal_adjust || 0)) / 10) * 10;
  kcal = Math.max(kcal, male ? 1500 : 1200); // biztonsági alsó határ

  // Magas testzsírnál a fehérjét a "célsúlyhoz" igazítjuk, nem a teljes testsúlyhoz
  let proteinBase = w;
  if (bf && bf > (male ? 25 : 32)) proteinBase = (w * (1 - bf / 100)) / (male ? 0.85 : 0.78);
  const protein = Math.round(proteinBase * rule.proteinPerKg);
  const fat = Math.max(Math.round((kcal * rule.fatPct) / 9), Math.round(w * 0.6));
  const carbs = Math.max(Math.round((kcal - protein * 4 - fat * 9) / 4), 50);
  const water = Math.round((w * 35 + 400) / 250) * 250;

  return { kcal, protein, carbs, fat, water, bmr: Math.round(bmr), tdee: Math.round(tdee) };
}

// ── 2. Étkezések felosztása ───────────────────────────────────────────
const SLOT_LAYOUTS = {
  3: [['breakfast', 0.3], ['lunch', 0.4], ['dinner', 0.3]],
  4: [['breakfast', 0.25], ['lunch', 0.35], ['snack2', 0.12], ['dinner', 0.28]],
  5: [['breakfast', 0.23], ['snack1', 0.1], ['lunch', 0.32], ['snack2', 0.1], ['dinner', 0.25]],
};
const SLOT_INFO = {
  breakfast: { name: 'Reggeli', type: 'b' },
  snack1: { name: 'Tízórai', type: 's' },
  lunch: { name: 'Ebéd', type: 'm' },
  snack2: { name: 'Uzsonna', type: 's' },
  dinner: { name: 'Vacsora', type: 'm' },
};

function slotLayout(mealsPerDay) {
  return SLOT_LAYOUTS[Math.min(5, Math.max(3, mealsPerDay || 4))];
}

// ── 3. Segédfüggvények ───────────────────────────────────────────────
// Determinisztikus véletlengenerátor: ugyanaz a seed ugyanazt a tervet adja
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (x) => Math.round(x * 10) / 10;
const shortName = (name) => name.replace(/\s*\(.*?\)\s*/g, ' ').trim();

function macrosFor(food, grams) {
  const k = grams / 100;
  return { kcal: Math.round(food.kcal * k), protein: r1(food.protein * k), carbs: r1(food.carbs * k), fat: r1(food.fat * k) };
}

function sumMacros(list) {
  return list.reduce(
    (s, i) => ({ kcal: s.kcal + (i.kcal || 0), protein: r1(s.protein + (i.protein || 0)), carbs: r1(s.carbs + (i.carbs || 0)), fat: r1(s.fat + (i.fat || 0)) }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

// Allergia / intolerancia kulcsok (a beállítások oldalon ezek közül lehet választani)
function bannedAllergens(profile) {
  return new Set([...(profile.allergies || []), ...(profile.intolerances || [])]);
}

// Egyedi (nem adatbázisbeli) alapanyag kategóriájának becslése a makrók alapján
function guessCategory(f) {
  const kcal = f.kcal || 1;
  if (kcal < 60 && f.protein < 5) return 'veg';
  if ((f.protein * 4) / kcal >= 0.35) return 'protein';
  if ((f.fat * 9) / kcal >= 0.6) return 'fat';
  return 'carb';
}

// A felhasználónak elérhető és megengedett élelmiszerek listája
function buildFoodPool(profile, pantry) {
  const banned = bannedAllergens(profile);
  const dislikes = String(profile.dislikes || '').split(/[,;\n]/).map(normalize).filter(Boolean);
  const likes = String(profile.likes || '').split(/[,;\n]/).map(normalize).filter(Boolean);
  const isDisliked = (f) => dislikes.some((d) => [f.name, ...f.syn].some((n) => normalize(n).includes(d) || d.includes(normalize(n))));
  const isLiked = (f) => likes.some((d) => [f.name, ...f.syn].some((n) => normalize(n).includes(d) || d.includes(normalize(n))));

  const avail = {}; // food key -> { level: 'home' | 'buyable', qty }
  const custom = [];
  for (const item of pantry) {
    const key = item.food_key || (matchFood(item.name) || {}).key;
    if (key && BY_KEY[key]) {
      const prev = avail[key];
      if (!prev || item.availability === 'home') avail[key] = { level: item.availability, qty: item.quantity_g };
    } else if (item.kcal != null) {
      // Egyedi alapanyag saját tápértékkel
      const f = {
        key: `custom_${item.id}`, name: item.name, syn: [], kcal: item.kcal, protein: item.protein || 0, carbs: item.carbs || 0, fat: item.fat || 0,
        price: 2000, slots: 'bsm', allergens: [], cook: 10, max: 250, prep: 'Készítsd el a megszokott módon.', custom: true,
      };
      f.cat = guessCategory(f);
      custom.push(f);
      avail[f.key] = { level: item.availability, qty: item.quantity_g };
    }
  }

  const pool = [...FOODS, ...custom]
    .filter((f) => !f.allergens.some((a) => banned.has(a)))
    .filter((f) => !isDisliked(f))
    .map((f) => ({ ...f, avail: avail[f.key] ? avail[f.key].level : null, qty: avail[f.key] ? avail[f.key].qty : null, liked: isLiked(f) }));
  return pool;
}

// Melyik étkezési szerepre (fehérje / szénhidrát / zsír / zöldség) alkalmas egy étel?
function fitsRole(f, role, type) {
  if (role === 'P') return f.cat === 'protein';
  if (role === 'C') return type === 'm' ? f.cat === 'carb' : f.cat === 'carb' || f.cat === 'fruit';
  if (role === 'F') return f.cat === 'fat';
  if (role === 'V') return f.cat === 'veg';
  return false;
}

function priceWeight(profile) {
  const b = profile.daily_budget;
  if (!b) return 0.3;
  if (b < 2500) return 2.2;
  if (b < 4000) return 1.2;
  if (b < 6000) return 0.6;
  return 0.2;
}

function scoreFood(f, role, ctx) {
  let s = 0;
  if (f.avail === 'home') s += 4;
  else if (f.avail === 'buyable') s += 2;
  if (f.liked) s += 2.5;
  if (ctx.usedToday.has(f.key)) s -= 3.5;
  if (ctx.recent.has(f.key)) s -= 1.2;
  // Ár: Ft / gramm hasznos makrotápanyag
  const macro = role === 'P' ? f.protein : role === 'C' ? f.carbs : role === 'F' ? f.fat : 3;
  if (macro > 0 && role !== 'V') {
    const ftPerG = f.price / (macro * 10);
    const norm = role === 'P' ? ftPerG / 25 : role === 'C' ? ftPerG / 4 : ftPerG / 10;
    s -= ctx.priceWeight * Math.min(norm, 3);
  }
  const cookLimit = ctx.profile.cook_minutes || 30;
  if (f.cook > cookLimit) s -= 3;
  else if (cookLimit <= 15 && f.cook > 10) s -= 1.5;
  s += ctx.rand() * 1.6;
  return s;
}

// Kiválasztja egy szerep legjobb jelöltjét. Ha onlyAvailable igaz, előbb csak otthoni alapanyagokból próbál.
function pickFood(pool, role, type, ctx) {
  const slotOk = (f) => f.slots.includes(type);
  const optional = role === 'V' || role === 'F';
  let tiers;
  if (ctx.onlyAvailable) {
    // "Mit egyek ma?" mód: csak otthoni alapanyag; a fő szerepeknél végső esetben beszerzendőt javaslunk
    tiers = optional ? [(f) => f.avail === 'home' && slotOk(f), (f) => f.avail === 'home' && f.slots.includes('m')]
      : [(f) => f.avail === 'home' && slotOk(f), (f) => f.avail === 'home', (f) => f.avail && slotOk(f), slotOk];
  } else {
    tiers = [(f) => f.avail && slotOk(f), slotOk];
  }
  for (const tier of tiers) {
    const cands = pool.filter((f) => fitsRole(f, role, type) && tier(f) && !ctx.exclude.has(f.key));
    if (cands.length) {
      cands.sort((a, b) => scoreFood(b, role, ctx) - scoreFood(a, role, ctx));
      return cands[0];
    }
  }
  return null;
}

// ── 4. Grammok kiszámítása: a makrócélhoz legközelebbi mennyiségek ────
// Egyszerű koordináta-módszer korlátokkal (min/max gramm).
function solveGrams(items, target) {
  const vars = items.filter((i) => !i.fixed);
  const fixed = sumMacros(items.filter((i) => i.fixed).map((i) => macrosFor(i.food, i.grams)));
  const t = { p: target.protein - fixed.protein, c: target.carbs - fixed.carbs, f: target.fat - fixed.fat };
  const W = { p: 4, c: 4, f: 9 }; // hibákat kalóriában súlyozzuk
  const col = vars.map((v) => ({ p: v.food.protein / 100, c: v.food.carbs / 100, f: v.food.fat / 100 }));
  const x = vars.map((v) => v.grams || 50);
  for (let iter = 0; iter < 60; iter++) {
    for (let i = 0; i < vars.length; i++) {
      let num = 0;
      let den = 0;
      for (const m of ['p', 'c', 'f']) {
        const others = vars.reduce((s, _, j) => (j === i ? s : s + col[j][m] * x[j]), 0);
        const resid = t[m] - others;
        num += W[m] * W[m] * col[i][m] * resid;
        den += W[m] * W[m] * col[i][m] * col[i][m];
      }
      const opt = den > 0 ? num / den : x[i];
      x[i] = Math.min(Math.max(opt, vars[i].min || 0), vars[i].food.max || 300);
    }
  }
  vars.forEach((v, i) => (v.grams = x[i]));
  return items;
}

function roundGrams(food, g) {
  if (food.unit) return Math.max(1, Math.round(g / food.unit.g)) * food.unit.g;
  if (food.cat === 'fat' && food.max <= 20) return Math.max(5, Math.round(g / 5) * 5);
  return Math.max(5, Math.round(g / 5) * 5);
}

function unitText(food, grams) {
  if (food.unit) return `${Math.round(grams / food.unit.g)} ${food.unit.name} (~${grams} g)`;
  return `${grams} g`;
}

// Hasonló tápértékű helyettesítők keresése (azonos szerep, hasonló makró)
function findSubstitutes(pool, item, role, type) {
  const f = item.food;
  const main = role === 'P' ? 'protein' : role === 'C' ? 'carbs' : role === 'F' ? 'fat' : null;
  const cands = pool.filter((c) => c.key !== f.key && fitsRole(c, role, type) && c.slots.includes(type));
  const scored = cands.map((c) => {
    const grams = main && c[main] > 0 ? roundGrams(c, (item.grams * f[main]) / c[main]) : item.grams;
    const diff = Math.abs(macrosFor(c, grams).kcal - macrosFor(f, item.grams).kcal);
    return { c, grams, score: diff - (c.avail === 'home' ? 80 : c.avail ? 40 : 0) };
  });
  return scored
    .filter((s) => s.grams <= (s.c.max || 300) * 1.5)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map(({ c, grams }) => ({ key: c.key, name: c.name, grams, amount: unitText(c, grams), avail: c.avail, ...macrosFor(c, grams) }));
}

// ── 5. Egy étkezés összeállítása ──────────────────────────────────────
function buildMeal(pool, slotKey, share, targets, ctx, fixedFoods) {
  const info = SLOT_INFO[slotKey];
  const type = info.type;
  const mt = { kcal: targets.kcal * share, protein: targets.protein * share, carbs: targets.carbs * share, fat: targets.fat * share };
  const roles = type === 'm' ? ['P', 'C', 'V', 'F'] : type === 'b' ? ['P', 'C', 'F'] : ['P', 'C'];

  const items = [];
  for (const role of roles) {
    // Ha megadtunk rögzített ételeket (pl. újratervezésnél), azokat használjuk
    const food = fixedFoods ? fixedFoods.find((f) => fitsRole(f, role, type) && !items.some((i) => i.food.key === f.key)) : pickFood(pool, role, type, ctx);
    if (!food) continue;
    ctx.usedToday.add(food.key);
    if (role === 'V') items.push({ food, role, grams: Math.min(150, food.max), fixed: true });
    else items.push({ food, role, grams: role === 'F' ? 10 : 80, min: role === 'F' ? 0 : 20 });
  }
  solveGrams(items, mt);

  // Ha a maximális adagok miatt túl kevés jönne ki, kiegészítő szénhidrát- vagy fehérjeforrást adunk hozzá
  if (!fixedFoods) {
    for (const role of ['C', 'P']) {
      const cur = sumMacros(items.map((i) => macrosFor(i.food, i.grams)));
      const short = role === 'C' ? cur.carbs < mt.carbs * 0.8 : cur.protein < mt.protein * 0.8;
      if (!short || cur.kcal > mt.kcal * 0.95) continue;
      items.filter((i) => i.role === role).forEach((i) => ctx.exclude.add(i.food.key));
      const extra = pickFood(pool, role, type, ctx);
      items.filter((i) => i.role === role).forEach((i) => ctx.exclude.delete(i.food.key));
      if (!extra || (ctx.onlyAvailable && extra.avail !== 'home')) continue;
      ctx.usedToday.add(extra.key);
      items.push({ food: extra, role, grams: 40, min: 15 });
      solveGrams(items, mt);
    }
  }

  const final = items
    .map((i) => ({ ...i, grams: roundGrams(i.food, i.grams) }))
    // Elhanyagolható zsíradag (főleg ha nincs is otthon) helyett inkább kihagyjuk
    .filter((i) => !(i.role === 'F' && (i.grams < 5 || (!i.food.avail && i.grams < 10))) && i.grams > 0);

  return mealFromItems(pool, slotKey, final, type);
}

function mealFromItems(pool, slotKey, final, type) {
  const info = SLOT_INFO[slotKey];
  const outItems = final.map((i) => ({
    key: i.food.key, name: i.food.name, role: i.role, grams: i.grams, amount: unitText(i.food, i.grams), avail: i.food.avail || null,
    ...macrosFor(i.food, i.grams), price: Math.round((i.food.price * i.grams) / 1000),
  }));
  const names = final.map((i) => shortName(i.food.name).toLowerCase());
  let title = names.length > 1 ? `${names.slice(0, -1).join(', ')} és ${names[names.length - 1]}` : names[0] || 'Szabadon választott étkezés';
  title = title.charAt(0).toUpperCase() + title.slice(1);

  const prep = final.filter((i) => i.food.prep).map((i) => `${shortName(i.food.name)}: ${i.food.prep}`);
  prep.push(type === 'm' ? 'Tálald együtt; a zöldséget ízesítsd sóval, borssal, citrommal vagy fokhagymával.' : 'Tálald együtt, és jó étvágyat!');
  const prepMinutes = Math.max(5, ...final.map((i) => i.food.cook || 0)) + (type === 'm' ? 5 : 0);

  const substitutes = final
    .filter((i) => i.role !== 'V' || final.length > 1)
    .map((i) => ({ for: i.food.key, forName: i.food.name, options: findSubstitutes(pool, i, i.role, type) }))
    .filter((s) => s.options.length);

  return {
    slot: slotKey, slotName: info.name, title, items: outItems, totals: sumMacros(outItems), prep, prepMinutes,
    price: outItems.reduce((s, i) => s + i.price, 0), substitutes, status: 'planned',
    missing: outItems.filter((i) => !i.avail).map((i) => i.name),
  };
}

// ── 6. Teljes napi terv ───────────────────────────────────────────────
function generateDayPlan({ profile, targets, pantry, date, seed = Date.now(), recentKeys = [], onlyAvailable = false, kcalOffset = 0 }) {
  const pool = buildFoodPool(profile, pantry);
  const t = { ...targets };
  if (kcalOffset) {
    // A korrekciót szénhidrátból és zsírból vonjuk le / adjuk hozzá, a fehérje marad
    t.kcal += kcalOffset;
    t.carbs = Math.max(50, Math.round(t.carbs + (kcalOffset * 0.6) / 4));
    t.fat = Math.max(30, Math.round(t.fat + (kcalOffset * 0.4) / 9));
  }
  const ctx = {
    profile, rand: rng(seed), usedToday: new Set(), recent: new Set(recentKeys), exclude: new Set(), onlyAvailable, priceWeight: priceWeight(profile),
  };
  const meals = slotLayout(profile.meals_per_day).map(([slot, share]) => buildMeal(pool, slot, share, t, ctx));
  const totals = sumMacros(meals.map((m) => m.totals));
  return {
    date, targets: t, meals, totals, price: meals.reduce((s, m) => s + m.price, 0), onlyAvailable,
    missing: [...new Set(meals.flatMap((m) => m.missing))],
  };
}

// Egy étkezés újragenerálása (pl. "nem tetszik, kérek mást")
function regenerateMeal({ profile, pantry, plan, index, seed = Date.now() }) {
  const pool = buildFoodPool(profile, pantry);
  const meal = plan.meals[index];
  const share = (slotLayout(profile.meals_per_day).find(([s]) => s === meal.slot) || [null, meal.totals.kcal / plan.targets.kcal])[1];
  const ctx = {
    profile, rand: rng(seed), usedToday: new Set(plan.meals.flatMap((m, i) => (i === index ? [] : m.items.map((x) => x.key)))),
    recent: new Set(), exclude: new Set(meal.items.filter((x) => x.role !== 'V' && x.role !== 'F').map((x) => x.key)), onlyAvailable: plan.onlyAvailable, priceWeight: priceWeight(profile),
  };
  const fresh = buildMeal(pool, meal.slot, share, plan.targets, ctx);
  plan.meals[index] = fresh;
  return finalizePlan(plan);
}

// Egy összetevő cseréje egy helyettesítőre
function swapIngredient({ profile, pantry, plan, index, fromKey, toKey }) {
  const pool = buildFoodPool(profile, pantry);
  const meal = plan.meals[index];
  const sub = (meal.substitutes.find((s) => s.for === fromKey) || { options: [] }).options.find((o) => o.key === toKey);
  const food = pool.find((f) => f.key === toKey);
  if (!sub || !food) throw new Error('Ismeretlen helyettesítő');
  const type = SLOT_INFO[meal.slot].type;
  const final = meal.items.map((it) => {
    if (it.key === fromKey) return { food, role: it.role, grams: sub.grams };
    const f = pool.find((p) => p.key === it.key) || BY_KEY[it.key];
    return f ? { food: f, role: it.role, grams: it.grams } : null;
  }).filter(Boolean);
  const status = meal.status;
  plan.meals[index] = { ...mealFromItems(pool, meal.slot, final, type), status };
  return finalizePlan(plan);
}

// A még el nem fogyasztott étkezések mennyiségeit a maradék napi kerethez igazítja
function rebalanceRemaining({ profile, pantry, plan, consumed }) {
  const pool = buildFoodPool(profile, pantry);
  const planned = plan.meals.map((m, i) => ({ m, i })).filter(({ m }) => m.status === 'planned');
  if (!planned.length) return { plan, changed: false };
  const remaining = {
    kcal: Math.max(0, plan.targets.kcal - consumed.kcal), protein: Math.max(0, plan.targets.protein - consumed.protein),
    carbs: Math.max(0, plan.targets.carbs - consumed.carbs), fat: Math.max(0, plan.targets.fat - consumed.fat),
  };
  const shares = Object.fromEntries(slotLayout(profile.meals_per_day));
  const totalShare = planned.reduce((s, { m }) => s + (shares[m.slot] || 0.2), 0);
  for (const { m, i } of planned) {
    const share = (shares[m.slot] || 0.2) / totalShare;
    const type = SLOT_INFO[m.slot].type;
    const items = m.items.map((it) => {
      const food = pool.find((p) => p.key === it.key) || BY_KEY[it.key];
      if (!food) return null;
      return it.role === 'V' ? { food, role: 'V', grams: it.grams, fixed: true } : { food, role: it.role, grams: it.grams, min: it.role === 'F' ? 0 : 10 };
    }).filter(Boolean);
    solveGrams(items, { protein: remaining.protein * share, carbs: remaining.carbs * share, fat: remaining.fat * share });
    const final = items.map((x) => ({ ...x, grams: roundGrams(x.food, x.grams) })).filter((x) => x.grams >= 5);
    plan.meals[i] = { ...mealFromItems(pool, m.slot, final, type), status: 'planned', rebalanced: true };
  }
  return { plan: finalizePlan(plan), changed: true };
}

// A kihagyott / lecserélt étkezések nem számítanak bele a terv összesítésébe
function finalizePlan(plan) {
  plan.totals = sumMacros(plan.meals.filter((m) => m.status !== 'skipped' && m.status !== 'replaced').map((m) => m.totals));
  plan.price = plan.meals.reduce((s, m) => s + (m.price || 0), 0);
  plan.missing = [...new Set(plan.meals.flatMap((m) => m.missing || []))];
  return plan;
}

// Az AI által összeállított étkezéseket a saját adatbázisunkból számoljuk újra (pontos makrók, árak, helyettesítők)
function planFromAi({ profile, pantry, targets, aiMeals, date, onlyAvailable }) {
  const pool = buildFoodPool(profile, pantry);
  const layout = slotLayout(profile.meals_per_day);
  const roleOf = (f) => (f.cat === 'protein' ? 'P' : f.cat === 'fat' ? 'F' : f.cat === 'veg' ? 'V' : 'C');
  const meals = layout.map(([slot]) => {
    const ai = (aiMeals || []).find((m) => m.slot === slot);
    if (!ai) throw new Error(`Hiányzó étkezés: ${slot}`);
    const final = (ai.items || []).map((it) => {
      const food = pool.find((f) => f.key === it.key);
      const g = Number(it.grams);
      return food && g > 0 && g < 1500 ? { food, role: roleOf(food), grams: roundGrams(food, g) } : null;
    }).filter(Boolean);
    if (!final.length) throw new Error(`Üres étkezés: ${slot}`);
    const meal = mealFromItems(pool, slot, final, SLOT_INFO[slot].type);
    if (ai.title) meal.title = String(ai.title).slice(0, 120);
    if (Array.isArray(ai.prep) && ai.prep.length) meal.prep = ai.prep.map((p) => String(p).slice(0, 400)).slice(0, 10);
    return meal;
  });
  return finalizePlan({ date, targets, meals, onlyAvailable });
}

module.exports = {
  planFromAi, calcTargets, generateDayPlan, regenerateMeal, swapIngredient, rebalanceRemaining, finalizePlan, buildFoodPool,
  sumMacros, macrosFor, slotLayout, SLOT_INFO, GOAL_RULES,
};
