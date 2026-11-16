// AI Coach: természetes nyelvű chat. Claude-dal tool use segítségével ténylegesen módosítani is tud
// (edzésterv, étrend, alapanyagok), API-kulcs nélkül pedig szabályalapú válaszokat ad.
const { all, run } = require('../db');
const { getProfile, currentWeight, GOALS } = require('./profile');
const actions = require('./actions');
const workout = require('./workout');
const insights = require('./insights');
const ai = require('./ai');
const { normalize, matchFood } = require('../data/foods');
const { EXERCISES, BY_KEY: EX_BY_KEY } = require('../data/exercises');

// ── Kontextus: minden, amit az edző tud a felhasználóról ──────────────
function buildContext(userId, date) {
  const profile = getProfile(userId);
  const weight = currentWeight(userId, profile);
  const targets = actions.getTargets(userId, profile);
  const consumed = actions.consumedTotals(userId, date);
  const plan = actions.getActivePlan(userId);
  const meal = actions.getMealPlan(userId, date);
  const logs = all('SELECT id, date, title, duration_min FROM workout_logs WHERE user_id = ? ORDER BY date DESC, id DESC LIMIT 5', userId);
  const pantry = actions.pantryRows(userId);
  const progress = plan ? workout.analyzeProgress(userId, plan.data) : [];
  const tips = insights.buildInsights(userId, profile, { targets, plan, progress }, date);
  return { profile, weight, targets, consumed, plan, meal, logs, pantry, progress, tips };
}

function contextText(ctx, date) {
  const p = ctx.profile;
  const planText = ctx.plan
    ? ctx.plan.data.days.map((d, i) => `  [nap ${i}] ${d.name} (${d.weekday || '-'}): ${d.exercises.map((e, j) => `[${j}] ${e.name} ${e.sets}×${e.repsMin}-${e.repsMax}${e.weight ? ` @${e.weight}kg` : ''}`).join('; ')}`).join('\n')
    : '  nincs aktív terv';
  const mealText = ctx.meal ? ctx.meal.data.meals.map((m) => `  ${m.slotName} [${m.status}]: ${m.title} (${m.totals.kcal} kcal)`).join('\n') : '  nincs mai étrend';
  return `Mai dátum: ${date}
Profil: ${JSON.stringify(ai.profileSummary(p, ctx.weight))}
Cél: ${GOALS[p.goal] || p.goal}. Kedvelt ételek: ${p.likes || '-'}; nem kedvelt: ${p.dislikes || '-'}; napi keret: ${p.daily_budget || '-'} Ft.
Napi célok: ${ctx.targets.kcal} kcal, F ${ctx.targets.protein} g, Sz ${ctx.targets.carbs} g, Zs ${ctx.targets.fat} g, víz ${ctx.targets.water} ml.
Ma eddig elfogyasztva: ${ctx.consumed.kcal} kcal, F ${ctx.consumed.protein} g, Sz ${ctx.consumed.carbs} g, Zs ${ctx.consumed.fat} g.
Aktuális edzésterv: ${ctx.plan ? ctx.plan.data.name : '-'}
${planText}
Mai étrend:
${mealText}
Utolsó edzések: ${ctx.logs.map((l) => `${l.date} ${l.title}`).join('; ') || 'nincs'}
Otthon lévő alapanyagok: ${ctx.pantry.filter((x) => x.availability === 'home').map((x) => x.name).join(', ') || 'nincs megadva'}
Beszerezhető alapanyagok: ${ctx.pantry.filter((x) => x.availability === 'buyable').map((x) => x.name).join(', ') || 'nincs megadva'}
Fejlődési javaslatok: ${ctx.progress.filter((x) => x.type !== 'nodata').map((x) => `${x.name}: ${x.message}`).join(' | ') || 'nincs elég adat'}
Megfigyelések: ${ctx.tips.map((t) => t.title).join('; ')}`;
}

// ── Claude eszközök (tool use) ─────────────────────────────────────────
const TOOLS = [
  {
    name: 'update_training_preferences',
    description: 'Frissíti a felhasználó edzési beállításait (heti napok, edzésidő, cél, helyszín), majd automatikusan új edzéstervet készít. Használd, ha a felhasználó azt kéri, hogy igazítsd a tervet a lehetőségeihez.',
    input_schema: {
      type: 'object',
      properties: {
        days_per_week: { type: 'integer', minimum: 1, maximum: 6 },
        session_minutes: { type: 'integer', minimum: 15, maximum: 180 },
        goal: { type: 'string', enum: Object.keys(GOALS) },
        location: { type: 'string', enum: ['gym', 'home'] },
      },
    },
  },
  {
    name: 'regenerate_workout_plan',
    description: 'Teljesen új edzéstervet készít a jelenlegi profil alapján.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'swap_exercise',
    description: 'Az aktív edzéstervben lecserél egy gyakorlatot egy másikra (pl. sérülés, eszközhiány vagy stagnálás miatt). A day_index és exercise_index a kontextusban [nap i] és [j] jelöléssel szerepel.',
    input_schema: {
      type: 'object',
      properties: {
        day_index: { type: 'integer' },
        exercise_index: { type: 'integer' },
        new_exercise_key: { type: 'string', description: `Az új gyakorlat kulcsa. Lehetséges értékek: ${EXERCISES.map((e) => `${e.key} (${e.name})`).join(', ')}` },
      },
      required: ['day_index', 'exercise_index', 'new_exercise_key'],
    },
  },
  {
    name: 'create_meal_plan',
    description: 'Új napi étrendet készít és elment a megadott napra, a felhasználó alapanyagai alapján. Ha only_available igaz, csak az otthon lévő alapanyagokból tervez. A kcal_offset a napi célhoz képesti eltérés (pl. -300 egy túlevés utáni napon).',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD' },
        only_available: { type: 'boolean' },
        kcal_offset: { type: 'integer', minimum: -800, maximum: 800 },
      },
      required: ['date'],
    },
  },
  {
    name: 'add_pantry_items',
    description: 'Alapanyagokat ad a felhasználó listájához (pl. ha elmondja, mi van otthon).',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: { type: 'object', properties: { name: { type: 'string' }, availability: { type: 'string', enum: ['home', 'buyable'] }, quantity_g: { type: 'number' } }, required: ['name'] },
        },
      },
      required: ['items'],
    },
  },
  {
    name: 'adjust_daily_calories',
    description: 'Tartósan módosítja a napi kalóriacélt (delta kcal, összesen legfeljebb ±800). Csak indokolt esetben használd, pl. ha a testsúly nem a cél szerint változik.',
    input_schema: { type: 'object', properties: { delta: { type: 'integer', minimum: -300, maximum: 300 } }, required: ['delta'] },
  },
];

async function runTool(userId, name, input) {
  switch (name) {
    case 'update_training_preferences': {
      const r = await actions.updateProfileFields(userId, input || {}, { regenerate: false });
      const plan = await actions.regenerateWorkout(userId, { useAi: false });
      return { updated: r.changed, new_plan: summarizePlan(plan.data) };
    }
    case 'regenerate_workout_plan': {
      const plan = await actions.regenerateWorkout(userId, { useAi: false });
      return { new_plan: summarizePlan(plan.data) };
    }
    case 'swap_exercise': {
      const plan = actions.getActivePlan(userId);
      if (!plan) return { error: 'Nincs aktív edzésterv' };
      if (!EX_BY_KEY[input.new_exercise_key]) return { error: 'Ismeretlen gyakorlat' };
      const profile = getProfile(userId);
      workout.swapExercise(plan.data, input.day_index, input.exercise_index, input.new_exercise_key, profile, currentWeight(userId, profile));
      actions.updateActivePlan(userId, plan.id, plan.data);
      return { ok: true, day: plan.data.days[input.day_index].name, exercise: plan.data.days[input.day_index].exercises[input.exercise_index].name };
    }
    case 'create_meal_plan': {
      if (!insights.isDate(input.date)) return { error: 'Érvénytelen dátum' };
      const r = await actions.createMealPlan(userId, input.date, { onlyAvailable: !!input.only_available, kcalOffset: input.kcal_offset || 0, useAi: false });
      return summarizeMeals(r.data);
    }
    case 'add_pantry_items':
      return { added: actions.addPantryItems(userId, (input.items || []).slice(0, 40)) };
    case 'adjust_daily_calories': {
      const p = getProfile(userId);
      const delta = Math.max(-300, Math.min(300, parseInt(input.delta, 10) || 0));
      await actions.updateProfileFields(userId, { kcal_adjust: (p.kcal_adjust || 0) + delta });
      return { new_targets: actions.getTargets(userId) };
    }
    default:
      return { error: 'Ismeretlen eszköz' };
  }
}

function summarizePlan(plan) {
  return { name: plan.name, days: plan.days.map((d) => `${d.weekday || ''} ${d.name}: ${d.exercises.map((e) => `${e.name} ${e.sets}×${e.repsMin}-${e.repsMax}${e.weight ? ` ${e.weight}kg` : ''}`).join(', ')}`) };
}
function summarizeMeals(plan) {
  return {
    date: plan.date, totals: plan.totals, targets: { kcal: plan.targets.kcal, protein: plan.targets.protein },
    meals: plan.meals.map((m) => `${m.slotName}: ${m.title} — ${m.items.map((i) => `${i.amount} ${i.name}`).join(', ')} (${m.totals.kcal} kcal, F ${m.totals.protein} g)`),
    missing_ingredients: plan.missing,
  };
}

const SYSTEM_PROMPT = `Te a FitCoach AI vagy: a felhasználó személyi edzője és táplálkozási tanácsadója egyben. Magyarul, tegeződve, barátságosan és tömören válaszolsz.
Mindig a felhasználó aktuális adataiból indulj ki (profil, célok, napló, alapanyagok) — ezeket a rendszerüzenet "Felhasználói adatok" része tartalmazza.
Ha a kérés változtatást igényel (edzésterv, étrend, alapanyagok, kalóriacél), használd az eszközöket, ne csak leírd a teendőt; utána röviden foglald össze, mi változott.
Gyakorlatias, megvalósítható tanácsokat adj, konkrét számokkal (súly, ismétlés, gramm, kcal). Kerüld az orvosi diagnózist; fájdalom vagy egészségügyi probléma esetén javasold szakember felkeresését.
Formázás: rövid bekezdések és felsorolások, legfeljebb kb. 200 szó, hacsak a felhasználó nem kér részletesebbet.`;

async function aiChat(userId, message, date) {
  const ctx = buildContext(userId, date);
  const history = all('SELECT role, content FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT 16', userId).reverse();
  const messages = history.map((m) => ({ role: m.role, content: m.content }));
  messages.push({ role: 'user', content: message });
  // Az első üzenetnek felhasználóinak kell lennie
  while (messages.length && messages[0].role !== 'user') messages.shift();

  const system = [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }, { type: 'text', text: `Felhasználói adatok:\n${contextText(ctx, date)}` }];
  const performed = [];
  for (let i = 0; i < 6; i++) {
    const res = await ai.callClaude({ system, messages, tools: TOOLS, maxTokens: 8000, effort: 'medium' });
    if (res.stop_reason !== 'tool_use') return { reply: ai.textOf(res) || 'Rendben!', actions: performed };
    messages.push({ role: 'assistant', content: res.content });
    const results = [];
    for (const block of res.content) {
      if (block.type !== 'tool_use') continue;
      let result;
      try {
        result = await runTool(userId, block.name, block.input);
        performed.push(block.name);
      } catch (e) {
        result = { error: e.message };
      }
      results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result), is_error: !!result.error });
    }
    messages.push({ role: 'user', content: results });
  }
  return { reply: 'Elvégeztem a módosításokat — nézd meg az érintett oldalakat!', actions: performed };
}

// ── Szabályalapú válaszok (API-kulcs nélkül) ──────────────────────────
async function ruleChat(userId, message, date) {
  const n = normalize(message);
  const ctx = buildContext(userId, date);
  const p = ctx.profile;

  // 1) Heti edzésnapok módosítása
  const days = n.match(/(\d)\s*(nap|alkalom|szor|szer|edzes)/);
  if (days && /(heti|hetente|napom|nap van|modosits|edzestervem|csak)/.test(n)) {
    const d = Math.min(6, Math.max(1, +days[1]));
    await actions.updateProfileFields(userId, { days_per_week: d }, { regenerate: false });
    const plan = await actions.regenerateWorkout(userId, { useAi: false });
    return {
      reply: `Rendben, átállítottam az edzéstervedet heti **${d} edzésre**. Az új felosztás: **${plan.data.name}**.\n\n${plan.data.days.map((x) => `- **${x.weekday || ''} – ${x.name}**: ${x.exercises.map((e) => e.name).join(', ')}`).join('\n')}\n\nA részleteket az *Edzésterv* oldalon találod.`,
      actions: ['update_training_preferences'],
    };
  }

  // 2) "Nincs kedvem lábazni"
  if (/(labaz|lab nap|labnap|labedzes)/.test(n)) {
    const upper = ctx.plan && ctx.plan.data.days.find((d) => !/Alsó|Láb/i.test(d.name));
    return {
      reply: `Semmi gond, egy nap csere belefér! Két lehetőség:\n\n1. **Cseréld fel a napokat**: csináld ma a${upper ? `(z) *${upper.name}* edzést (${upper.exercises.slice(0, 4).map((e) => e.name).join(', ')}…)` : ' felsőtestes edzést'}, a lábnapot pedig told holnapra.\n2. **Könnyített lábnap (25–30 perc)**: 3 kör — 12 serleg guggolás, 10 román felhúzás kézisúlyzóval, 12 farizomhíd, 45 mp falnál ülés; utána 10 perc séta vagy bicikli.\n\nTipp: sokszor a bemelegítés után megjön a kedv — kezdd el 10 percre, és ha akkor sem megy, válts az 1. opcióra.`,
      actions: [],
    };
  }

  // 3) "Ma csak tojás, rizs és tonhal van otthon. Mit egyek?"
  // Az üzenetet darabokra bontjuk (vessző, "és", "meg" mentén), és minden darabban élelmiszert keresünk
  const STOP = new Set(['ma', 'csak', 'van', 'otthon', 'itthon', 'mit', 'egyek', 'nekem', 'is', 'meg', 'a', 'az', 'egy', 'kis', 'maradt']);
  const mentioned = message.toLowerCase().split(/,|\s+és\s+|\s+es\s+|\s+meg\s+|\s+valamint\s+|\n|;|\+|\.|\?|!/)
    .map((chunk) => chunk.split(/\s+/).filter((w) => w && !STOP.has(normalize(w))).join(' '))
    .map((chunk) => matchFood(chunk)).filter(Boolean);
  if (/(mit egyek|mit egyel|mit fozzek|ehetnek|egyek ma|van otthon|van itthon)/.test(n)) {
    const unique = [...new Map(mentioned.map((f) => [f.key, f])).values()];
    let pantryOverride = null;
    if (unique.length) {
      actions.addPantryItems(userId, unique.map((f) => ({ name: f.name, food_key: f.key, availability: 'home' })));
      pantryOverride = unique.map((f, i) => ({ id: -i, name: f.name, food_key: f.key, availability: 'home', quantity_g: null }));
    }
    const eaten = ctx.meal && ctx.meal.data.meals.some((m) => m.status !== 'planned');
    const r = await actions.createMealPlan(userId, date, { onlyAvailable: true, useAi: false, pantryOverride, save: !eaten });
    const s = summarizeMeals(r.data);
    return {
      reply: `${unique.length ? `Felvettem az alapanyagaid közé: ${unique.map((f) => f.name).join(', ')}.\n\n` : ''}Ebből ezt javaslom ma:\n\n${s.meals.map((m) => `- ${m}`).join('\n')}\n\n**Összesen:** ${s.totals.kcal} kcal, fehérje ${s.totals.protein} g (cél: ${s.targets.kcal} kcal / ${s.targets.protein} g).${s.missing_ingredients.length ? `\n\nHa be tudod szerezni, ezek javítanák a tervet: ${s.missing_ingredients.join(', ')}.` : ''}${eaten ? '\n\n(A mai tervedet nem írtam felül, mert már jelöltél meg étkezést.)' : '\n\nElmentettem mai étrendként — az *Étrend* oldalon látod a grammokat és az elkészítést is.'}`,
      actions: eaten ? [] : ['create_meal_plan'],
    };
  }

  // 4) Túlevés -> holnapi étrend igazítása
  if (/(tul sok|tulettem|tobbet ettem|sokat ettem|tullottem|tullepte)/.test(n)) {
    const surplus = ctx.consumed.kcal - ctx.targets.kcal;
    const offset = surplus > 0 ? -Math.min(400, Math.round((surplus * 0.5) / 50) * 50) : -150;
    const tomorrow = insights.addDays(date, 1);
    const r = await actions.createMealPlan(userId, tomorrow, { kcalOffset: offset, useAi: false });
    return {
      reply: `Ma eddig ${ctx.consumed.kcal} kcal-t ettél (cél: ${ctx.targets.kcal} kcal${surplus > 0 ? `, +${surplus} kcal` : ''}). Nem kell kompenzálni drasztikusan — egyetlen nap nem rontja el a fejlődést.\n\nElkészítettem a **holnapi (${tomorrow})** étrendet **${offset} kcal** korrekcióval (${r.data.targets.kcal} kcal), a fehérjét változatlanul hagytam:\n\n${summarizeMeals(r.data).meals.map((m) => `- ${m}`).join('\n')}\n\nTipp: igyál ma még 0,5–1 liter vizet, és holnap az edzésed maradjon a terv szerinti.`,
      actions: ['create_meal_plan'],
    };
  }

  // 5) Stagnálás egy gyakorlatban
  if (/(nem fejlod|stagnal|plato|elakadtam|nem megy feljebb|nem no)/.test(n) || /fekvenyom/.test(n)) {
    const ex = ctx.plan && ctx.plan.data.days.flatMap((d) => d.exercises).find((e) => n.includes(normalize(e.name).split(' ')[0]));
    const hist = ex ? workout.sessionsFor(userId, ex.name, 4) : [];
    const histText = hist.length ? `Utolsó edzéseid: ${hist.map((h) => `${h.date}: ${h.top} kg (becsült 1RM ${h.e1rm} kg)`).join('; ')}.\n\n` : '';
    return {
      reply: `${histText}A stagnálás gyakori okai és a megoldások:\n\n1. **Ismétlés-tartomány váltás**: 3–4 hétig dolgozz 4×4–6-tal nehezebb súllyal, majd térj vissza a 6–10-es tartományra.\n2. **Kiegészítő gyakorlatok**: ferde nyomás kézisúlyzóval, szűk fogású fekvenyomás, tricepsz letolás — az ezekben elért erő átvihető.\n3. **Technika**: lapockák hátra-le, talp a földön, kontrollált leengedés (2–3 mp), rövid szünet a mellkason.\n4. **Regeneráció és étkezés**: legalább 7 óra alvás, fehérje ≥ ${Math.round(ctx.targets.protein)} g/nap; kalóriadeficitben nehezebb erősödni.\n5. **Könnyített hét**: ha 3+ hete nem nő a súly, egy hétig csak 60% volumennel eddz.\n\nAz *Edzésterv* oldalon a *Fejlődés* panelen gyakorlatonként látod a konkrét javasolt súlyt.`,
      actions: [],
    };
  }

  // 6) Víz
  if (/\bviz/.test(n)) {
    return { reply: `A napi vízcélod **${ctx.targets.water} ml** (35 ml/testsúlykg + edzés). Edzésnapokon igyál +500 ml-t. A *Dashboard* oldalon egy kattintással rögzítheted a pohár vizet.`, actions: [] };
  }

  // Alapértelmezett: összefoglaló
  const nextDay = ctx.plan && ctx.plan.data.days[0];
  return {
    reply: `Itt egy gyors állapotjelentés:\n\n- **Cél:** ${GOALS[p.goal] || '-'}; napi ${ctx.targets.kcal} kcal / ${ctx.targets.protein} g fehérje\n- **Ma eddig:** ${ctx.consumed.kcal} kcal, ${ctx.consumed.protein} g fehérje\n- **Edzésterv:** ${ctx.plan ? ctx.plan.data.name : 'még nincs'}${nextDay ? ` (pl. ${nextDay.name})` : ''}\n${ctx.tips.slice(0, 3).map((t) => `- ${t.title}: ${t.text}`).join('\n')}\n\nKérdezhetsz például:\n- „Ma csak tojás, rizs és tonhal van otthon. Mit egyek?”\n- „Módosítsd az edzéstervem, mert csak heti 3 napom van.”\n- „Túl sok kalóriát ettem ma.”\n- „Nem fejlődök fekvenyomásban.”\n\n_(Az AI Coach jelenleg beépített szabályokkal működik. Anthropic API-kulccsal szabad, természetes nyelvű beszélgetésre is képes.)_`,
    actions: [],
  };
}

async function chat(userId, message, date) {
  run('INSERT INTO chat_messages (user_id, role, content) VALUES (?, ?, ?)', userId, 'user', message);
  let result;
  if (ai.aiEnabled()) {
    try {
      result = await aiChat(userId, message, date);
    } catch (e) {
      result = await ruleChat(userId, message, date);
      result.reply += `\n\n_(Az AI nem volt elérhető: ${e.message} — beépített válasz.)_`;
    }
  } else {
    result = await ruleChat(userId, message, date);
  }
  run('INSERT INTO chat_messages (user_id, role, content) VALUES (?, ?, ?)', userId, 'assistant', result.reply);
  return result;
}

module.exports = { chat, buildContext };
