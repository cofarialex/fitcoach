// Edzésterv-generátor (szabályalapú) + fejlődéselemzés a naplózott edzésekből
const { EXERCISES, BY_KEY, GYM_EQUIPMENT, hasEquipment, equipmentLabel } = require('../data/exercises');
const { GOALS } = require('./profile');
const { all } = require('../db');

// ── Edzésfelosztások: minden nap mozgásminták listája (fontossági sorrendben) ──
const DAY_TEMPLATES = {
  fbA: { name: 'Teljes test A', focus: 'Teljes test', area: 'full', patterns: ['squat', 'hpush', 'hpull', 'hinge', 'shoulder_iso', 'core', 'biceps'] },
  fbB: { name: 'Teljes test B', focus: 'Teljes test', area: 'full', patterns: ['hinge', 'vpush', 'vpull', 'lunge', 'triceps', 'core', 'calves'] },
  fbC: { name: 'Teljes test C', focus: 'Teljes test', area: 'full', patterns: ['squat', 'hpush', 'vpull', 'glute', 'rear_delt', 'core', 'biceps'] },
  upA: { name: 'Felsőtest A', focus: 'Mell, hát, váll, kar', area: 'upper', patterns: ['hpush', 'hpull', 'vpush', 'vpull', 'shoulder_iso', 'biceps', 'triceps'] },
  loA: { name: 'Alsótest A', focus: 'Comb, far, vádli, törzs', area: 'lower', patterns: ['squat', 'hinge', 'lunge', 'ham_iso', 'calves', 'core'] },
  upB: { name: 'Felsőtest B', focus: 'Hát, mell, váll, kar', area: 'upper', patterns: ['vpull', 'hpush', 'hpull', 'vpush', 'rear_delt', 'triceps', 'biceps'] },
  loB: { name: 'Alsótest B', focus: 'Far, combhajlító, comb, törzs', area: 'lower', patterns: ['hinge', 'squat', 'glute', 'quad_iso', 'calves', 'core'] },
  push: { name: 'Toló nap', focus: 'Mell, váll, tricepsz', area: 'upper', patterns: ['hpush', 'vpush', 'hpush', 'shoulder_iso', 'triceps', 'chest_iso'] },
  pull: { name: 'Húzó nap', focus: 'Hát, hátsó váll, bicepsz', area: 'upper', patterns: ['vpull', 'hpull', 'hpull', 'rear_delt', 'biceps', 'core'] },
  legs: { name: 'Láb nap', focus: 'Comb, far, vádli', area: 'lower', patterns: ['squat', 'hinge', 'lunge', 'ham_iso', 'quad_iso', 'calves', 'core'] },
};

function chooseSplit(days, experience, goal) {
  const d = Math.min(6, Math.max(1, days || 3));
  const hypertrophyFocus = ['muscle_gain', 'strength', 'cut'].includes(goal);
  if (d === 1) return { key: 'full_body', label: 'Teljes test', days: ['fbA'] };
  if (d === 2) return { key: 'full_body', label: 'Teljes test', days: ['fbA', 'fbB'] };
  if (d === 3) {
    if (experience === 'advanced' && hypertrophyFocus) return { key: 'ppl', label: 'Toló–húzó–láb', days: ['push', 'pull', 'legs'] };
    return { key: 'full_body', label: 'Teljes test', days: ['fbA', 'fbB', 'fbC'] };
  }
  if (d === 4) return { key: 'upper_lower', label: 'Felső–alsó', days: ['upA', 'loA', 'upB', 'loB'] };
  if (d === 5) return { key: 'ul_ppl', label: 'Felső–alsó + toló–húzó–láb', days: ['upA', 'loA', 'push', 'pull', 'legs'] };
  return { key: 'ppl2', label: 'Toló–húzó–láb ×2', days: ['push', 'pull', 'legs', 'push', 'pull', 'legs'] };
}

const SCHEDULES = {
  1: ['Szerda'], 2: ['Hétfő', 'Csütörtök'], 3: ['Hétfő', 'Szerda', 'Péntek'], 4: ['Hétfő', 'Kedd', 'Csütörtök', 'Péntek'],
  5: ['Hétfő', 'Kedd', 'Szerda', 'Péntek', 'Szombat'], 6: ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat'],
};

// Sorozat / ismétlés / pihenő a cél szerint
const PRESCRIPTION = {
  strength: { c: [5, 3, 5, 180], i: [3, 8, 12, 90], intensity: 'RPE 8 — 1–2 ismétlés maradjon tartalékban', mult: 1.1 },
  muscle_gain: { c: [4, 6, 10, 120], i: [3, 10, 15, 75], intensity: 'RIR 1–2 — az utolsó ismétlések legyenek nehezek', mult: 1 },
  recomp: { c: [4, 8, 10, 90], i: [3, 10, 15, 60], intensity: 'RIR 1–2, kontrollált tempó', mult: 0.95 },
  cut: { c: [4, 8, 12, 90], i: [3, 12, 15, 60], intensity: 'RIR 1–2 — tartsd meg az erőt, a súly ne csökkenjen', mult: 0.95 },
  fat_loss: { c: [3, 10, 12, 75], i: [3, 12, 15, 45], intensity: 'RIR 2, rövid pihenőkkel — magas pulzus', mult: 0.85 },
  endurance: { c: [3, 12, 15, 60], i: [2, 15, 20, 45], intensity: 'Könnyű–közepes súly, folyamatos tempó', mult: 0.75 },
  health: { c: [3, 8, 12, 90], i: [2, 12, 15, 60], intensity: 'RIR 2–3 — kényelmesen nehéz', mult: 0.9 },
};

const CARDIO = {
  fat_loss: { minutes: 20, text: 'Intervallum: 30 mp gyors / 60 mp lassú tempó váltakozva (szobabicikli, evezőgép vagy kocogás).' },
  cut: { minutes: 20, text: 'Egyenletes, közepes intenzitású kardió (2-es pulzuszóna: még tudsz beszélni).' },
  recomp: { minutes: 12, text: 'Egyenletes kardió 2-es pulzuszónában vagy gyors séta emelkedőn.' },
  endurance: { minutes: 25, text: 'Folyamatos állóképességi kardió 2-es zónában (futás, bicikli, evezés).' },
  health: { minutes: 15, text: 'Könnyű–közepes kardió: gyors séta, bicikli vagy úszás.' },
  muscle_gain: null,
  strength: null,
};

const WARMUP = {
  upper: ['5 perc könnyű kardió (szobabicikli, evezőgép vagy helyben kocogás)', 'Karkörzés előre-hátra 2×10', 'Gumiszalagos széthúzás vagy lapockazárás 2×15', '10 könnyű fekvőtámasz vagy falnál nyomás', 'Az első gyakorlatból 2 felvezető sorozat (kb. 50% és 70% súllyal)'],
  lower: ['5 perc könnyű kardió (szobabicikli vagy gyors séta)', 'Csípőkörzés és lendítések előre-oldalra 2×10', 'Saját testsúlyos guggolás 2×10', 'Farizomhíd 2×12', 'Az első gyakorlatból 2 felvezető sorozat (kb. 50% és 70% súllyal)'],
  full: ['5 perc könnyű kardió', 'Kar- és csípőkörzés 2×10', 'Saját testsúlyos guggolás 10× + 8 fekvőtámasz', 'Világ legjobb nyújtása (kitörés + törzsfordítás) 5/oldal', 'Az első gyakorlatból 2 felvezető sorozat'],
};
const COOLDOWN = {
  upper: ['Mellnyújtás ajtókeretben 2×30 mp', 'Széles hátizom nyújtás (függeszkedés vagy térdelve előrenyúlás) 2×30 mp', 'Tricepsz és vállnyújtás 30 mp/oldal', '1–2 perc nyugodt, mély hasi légzés'],
  lower: ['Négyfejű combizom nyújtása állva 30 mp/oldal', 'Combhajlító nyújtás ülve 30 mp/oldal', 'Csípőhajlító nyújtás kitörésben 30 mp/oldal', 'Galamb póz (farizom) 30 mp/oldal', '1–2 perc nyugodt légzés'],
  full: ['Csípőhajlító nyújtás 30 mp/oldal', 'Combhajlító nyújtás 30 mp/oldal', 'Mellnyújtás ajtókeretben 30 mp', 'Gyermekpóz 45 mp', '1–2 perc nyugodt légzés'],
};

const LEVEL = { beginner: 1, intermediate: 2, advanced: 3 };

function availableEquipment(profile) {
  if (profile.location === 'gym') return GYM_EQUIPMENT;
  return profile.equipment || [];
}

// Kiinduló munkasúly becslése (ha még nincs naplózott adat)
function suggestWeight(ex, profile, weightKg, presc) {
  if (!ex.ratio) return null;
  const sexMult = profile.sex === 'female' ? 0.65 : 1;
  const expMult = { beginner: 1, intermediate: 1.45, advanced: 1.85 }[profile.experience] || 1;
  let w = ex.ratio * weightKg * sexMult * expMult * presc.mult;
  if (ex.eq.startsWith('barbell')) w = Math.max(20, Math.round(w / 2.5) * 2.5);
  else if (ex.eq.startsWith('dumbbell') || ex.eq.startsWith('kettlebell')) w = Math.max(2, Math.round(w));
  else w = Math.max(5, Math.round(w / 5) * 5);
  return w;
}

function exerciseScore(ex, ctx) {
  let s = 0;
  const lvl = LEVEL[ctx.profile.experience] || 1;
  if (ex.lvl > lvl) return -Infinity;
  if (ctx.usedThisWeek.get(ex.key)) s -= 3 * ctx.usedThisWeek.get(ex.key);
  if (ctx.usedToday.has(ex.key)) return -Infinity;
  const gym = ctx.profile.location === 'gym';
  const pref = gym
    ? (ctx.profile.goal === 'strength' || lvl >= 2 ? ['barbell', 'dumbbell', 'machine', 'cable', 'pullup_bar', 'none', 'band'] : ['machine', 'dumbbell', 'cable', 'barbell', 'pullup_bar', 'none', 'band'])
    : ['barbell', 'dumbbell', 'kettlebell', 'pullup_bar', 'band', 'none'];
  const first = ex.eq.split(/[+|]/)[0];
  const idx = pref.indexOf(first);
  s += idx === -1 ? 0 : (pref.length - idx) * 0.6;
  if (ex.compound) s += 1;
  if (lvl === 3 && ex.lvl === 1 && ex.compound) s -= 0.8;
  if (lvl === 1 && ex.lvl === 1) s += 0.5;
  return s;
}

function alternativesFor(ex, injuries, excludeKey) {
  return EXERCISES.filter((e) => e.pattern === ex.pattern && e.key !== excludeKey && !e.avoid.some((a) => injuries.includes(a)))
    .slice(0, 4)
    .map((e) => ({ key: e.key, name: e.name, equipment: equipmentLabel(e) }));
}

function buildExercise(ex, isCompound, ctx) {
  const presc = PRESCRIPTION[ctx.profile.goal] || PRESCRIPTION.health;
  let [sets, repsMin, repsMax, rest] = isCompound ? presc.c : presc.i;
  if (ctx.profile.experience === 'beginner') sets = Math.max(2, sets - 1);
  const unit = ex.unit;
  if (unit === 'sec') {
    repsMin = 30;
    repsMax = 45;
  }
  return {
    key: ex.key, name: ex.name, pattern: ex.pattern, sets, repsMin, repsMax, unit, rest,
    weight: suggestWeight(ex, ctx.profile, ctx.weightKg, presc),
    intensity: presc.intensity, tips: ex.tips, equipment: equipmentLabel(ex), lower: ex.lower,
    alternatives: alternativesFor(ex, ctx.injuries, ex.key),
  };
}

function generateWorkoutPlan(profile, weightKg) {
  const injuries = profile.injuries || [];
  const equipment = availableEquipment(profile);
  const split = chooseSplit(profile.days_per_week, profile.experience, profile.goal);
  const cardio = CARDIO[profile.goal] || null;
  const minutes = profile.session_minutes || 60;
  const presc = PRESCRIPTION[profile.goal] || PRESCRIPTION.health;
  const usedThisWeek = new Map();

  const days = split.days.map((tplKey, index) => {
    const tpl = DAY_TEMPLATES[tplKey];
    const ctx = { profile, weightKg, injuries, usedThisWeek, usedToday: new Set() };
    let budget = minutes - 8 - 6 - (cardio ? Math.min(cardio.minutes, Math.round(minutes * 0.25)) : 0);
    const minExercises = minutes >= 40 ? 4 : 3;
    const exercises = [];
    for (const pattern of tpl.patterns) {
      const cands = EXERCISES.filter((e) => e.pattern === pattern && hasEquipment(e, equipment) && !e.avoid.some((a) => injuries.includes(a)));
      if (!cands.length) continue;
      cands.sort((a, b) => exerciseScore(b, ctx) - exerciseScore(a, ctx));
      const ex = cands[0];
      if (exerciseScore(ex, ctx) === -Infinity) continue;
      const isCompound = ex.compound && exercises.filter((e) => e.compoundSlot).length < 3;
      const item = buildExercise(ex, isCompound, ctx);
      item.compoundSlot = isCompound;
      const cost = (item.sets * (item.rest + 45)) / 60 + 1;
      if (exercises.length >= minExercises && budget - cost < 0) break;
      budget -= cost;
      exercises.push(item);
      ctx.usedToday.add(ex.key);
      usedThisWeek.set(ex.key, (usedThisWeek.get(ex.key) || 0) + 1);
    }
    const cardioBlock = cardio ? { minutes: Math.min(cardio.minutes, Math.round(minutes * 0.25)), description: cardio.text } : null;
    const est = Math.round(8 + 6 + exercises.reduce((s, e) => s + (e.sets * (e.rest + 45)) / 60 + 1, 0) + (cardioBlock ? cardioBlock.minutes : 0));
    return {
      index, key: tplKey, name: tpl.name, focus: tpl.focus, weekday: (SCHEDULES[split.days.length] || [])[index] || null,
      warmup: WARMUP[tpl.area], exercises, cardio: cardioBlock, cooldown: COOLDOWN[tpl.area], estMinutes: est,
    };
  });

  return {
    name: `${split.label} — ${GOALS[profile.goal] || 'Általános fittség'}`,
    goal: profile.goal, split: split.key, daysPerWeek: days.length, sessionMinutes: minutes, location: profile.location,
    intensity: presc.intensity,
    notes: [
      'Progresszív terhelés: ha minden sorozatban eléred a felső ismétlésszámot, a következő edzésen emelj a súlyon (felsőtest +2,5 kg, alsótest +5 kg; kézisúlyzónál +1–2 kg).',
      'Ha két egymást követő edzésen sem éred el az alsó ismétlésszámot, csökkentsd a súlyt kb. 10%-kal.',
      'Minden 6–8. héten iktass be egy könnyített hetet (feleannyi sorozat).',
      injuries.length ? 'A megadott sérüléseid miatt bizonyos gyakorlatokat kihagytunk vagy kíméletesebbre cseréltünk. Fájdalom esetén azonnal állj le.' : null,
    ].filter(Boolean),
    days,
  };
}

// Egy gyakorlat lecserélése a tervben (pl. foglalt a gép, vagy nincs eszköz)
function swapExercise(plan, dayIndex, exIndex, newKey, profile, weightKg) {
  const ex = BY_KEY[newKey];
  const day = plan.days[dayIndex];
  if (!ex || !day || !day.exercises[exIndex]) throw new Error('Érvénytelen csere');
  const old = day.exercises[exIndex];
  const ctx = { profile, weightKg, injuries: profile.injuries || [] };
  const item = buildExercise(ex, old.compoundSlot, ctx);
  item.compoundSlot = old.compoundSlot;
  item.sets = old.sets;
  item.rest = old.rest;
  if (ex.unit === old.unit) {
    item.repsMin = old.repsMin;
    item.repsMax = old.repsMax;
  }
  day.exercises[exIndex] = item;
  return plan;
}

// Gyakorlatkatalógusból bővítés: a kliens pl. kereséshez használja
function exerciseCatalog(profile) {
  const eq = availableEquipment(profile || {});
  const inj = (profile && profile.injuries) || [];
  return EXERCISES.map((e) => ({ key: e.key, name: e.name, pattern: e.pattern, equipment: equipmentLabel(e), available: hasEquipment(e, eq), safe: !e.avoid.some((a) => inj.includes(a)), tips: e.tips, unit: e.unit }));
}

// ── Fejlődéselemzés: automatikus terhelésnövelési javaslatok ─────────
function sessionsFor(userId, exerciseName, limit = 4) {
  const rows = all(
    `SELECT l.id, l.date, s.weight_kg, s.reps FROM workout_sets s JOIN workout_logs l ON l.id = s.log_id
     WHERE l.user_id = ? AND lower(s.exercise) = lower(?) ORDER BY l.date DESC, l.id DESC, s.set_no ASC`,
    userId, exerciseName
  );
  const byLog = new Map();
  for (const r of rows) {
    if (!byLog.has(r.id)) byLog.set(r.id, { date: r.date, sets: [] });
    byLog.get(r.id).sets.push({ weight: r.weight_kg || 0, reps: r.reps || 0 });
  }
  return [...byLog.values()].slice(0, limit).map((s) => {
    const top = Math.max(...s.sets.map((x) => x.weight));
    const work = s.sets.filter((x) => x.weight === top);
    const e1rm = Math.max(...s.sets.map((x) => x.weight * (1 + x.reps / 30)));
    return { date: s.date, top, work, totalReps: s.sets.reduce((a, x) => a + x.reps, 0), e1rm: Math.round(e1rm * 10) / 10 };
  });
}

function increment(ex) {
  if (/kézisúlyzó|Kettlebell/i.test(ex.equipment)) return 2;
  return ex.lower ? 5 : 2.5;
}

function analyzeProgress(userId, plan) {
  const out = [];
  const seen = new Set();
  plan.days.forEach((day, dayIndex) => day.exercises.forEach((ex, exIndex) => {
    if (seen.has(ex.name) || ex.unit === 'sec') return;
    seen.add(ex.name);
    const sessions = sessionsFor(userId, ex.name);
    const base = { dayIndex, exIndex, key: ex.key, name: ex.name, currentWeight: ex.weight, repRange: `${ex.repsMin}–${ex.repsMax}` };
    if (!sessions.length) return out.push({ ...base, type: 'nodata', message: 'Még nincs naplózott adat ehhez a gyakorlathoz.' });
    const last = sessions[0];
    const bodyweight = last.top === 0;
    const allTop = last.work.length > 0 && last.work.every((s) => s.reps >= ex.repsMax);
    const missedLast = last.work.some((s) => s.reps < ex.repsMin);
    const missedPrev = sessions[1] && sessions[1].work.some((s) => s.reps < ex.repsMin);
    const stalled = sessions.length >= 3 && sessions.slice(0, 3).every((s) => s.top === last.top) && sessions[0].totalReps <= sessions[2].totalReps;

    if (bodyweight) {
      if (allTop) out.push({ ...base, type: 'increase', suggestedWeight: null, message: `Minden sorozatban elérted a ${ex.repsMax} ismétlést — válts nehezebb változatra, vagy adj hozzá külső súlyt (pl. hátizsák).` });
      else out.push({ ...base, type: 'keep', message: 'Próbálj minden sorozatban 1 ismétléssel többet.' });
    } else if (allTop) {
      const next = last.top + increment(ex);
      out.push({ ...base, type: 'increase', suggestedWeight: next, message: `Legutóbb minden sorozatban megvolt a ${ex.repsMax} ismétlés ${last.top} kg-mal. Következő edzésen: ${next} kg.` });
    } else if (missedLast && missedPrev) {
      const next = Math.max(0, Math.round((last.top * 0.9) / 2.5) * 2.5);
      out.push({ ...base, type: 'decrease', suggestedWeight: next, message: `Két edzésen át nem jött ki a ${ex.repsMin} ismétlés. Csökkentsd ${next} kg-ra, és építsd vissza tökéletes technikával.` });
    } else if (stalled) {
      out.push({ ...base, type: 'stall', suggestedWeight: last.top, message: `3 edzés óta stagnálsz ${last.top} kg-on. Javaslat: cseréld egy alternatív gyakorlatra 4–6 hétre, vagy tarts könnyített hetet.` });
    } else {
      out.push({ ...base, type: 'keep', suggestedWeight: last.top, message: `Maradj ${last.top} kg-nál, és próbálj sorozatonként 1 ismétléssel többet (cél: ${ex.repsMax}).` });
    }
  }));
  return out;
}

// A javasolt súlyok beírása a tervbe
function applyProgression(plan, suggestions) {
  let changed = 0;
  for (const s of suggestions) {
    if ((s.type === 'increase' || s.type === 'decrease' || s.type === 'keep') && s.suggestedWeight != null) {
      for (const day of plan.days) for (const ex of day.exercises) {
        if (ex.name === s.name && ex.weight !== s.suggestedWeight) {
          ex.weight = s.suggestedWeight;
          changed++;
        }
      }
    }
  }
  return changed;
}

// Az AI által javasolt tervet kiegészítjük az adatbázisból (leírás, eszköz, alternatívák, bemelegítés)
function enrichAiPlan(ai, profile, weightKg) {
  const injuries = profile.injuries || [];
  const equipment = availableEquipment(profile);
  const days = (ai.days || []).slice(0, 7).map((d, index) => {
    const ctx = { profile, weightKg, injuries };
    const exercises = (d.exercises || []).map((e) => {
      const ex = BY_KEY[e.key];
      if (!ex || !hasEquipment(ex, equipment) || ex.avoid.some((a) => injuries.includes(a))) return null;
      const item = buildExercise(ex, ex.compound, ctx);
      const num = (v, lo, hi) => (Number.isFinite(+v) && +v >= lo && +v <= hi ? +v : null);
      item.sets = num(e.sets, 1, 8) || item.sets;
      item.repsMin = num(e.repsMin, 1, 120) || item.repsMin;
      item.repsMax = Math.max(item.repsMin, num(e.repsMax, 1, 120) || item.repsMax);
      item.rest = num(e.rest, 15, 420) || item.rest;
      if (e.weight === null || num(e.weight, 0, 500) !== null) item.weight = e.weight === null ? item.weight : +e.weight;
      if (e.note) item.note = String(e.note).slice(0, 300);
      item.compoundSlot = ex.compound;
      return item;
    }).filter(Boolean);
    const lowerCount = exercises.filter((e) => e.lower).length;
    const area = lowerCount === 0 ? 'upper' : lowerCount === exercises.length ? 'lower' : 'full';
    const cardio = d.cardio && d.cardio.minutes ? { minutes: Math.min(60, +d.cardio.minutes || 15), description: String(d.cardio.description || '').slice(0, 300) } : null;
    const est = Math.round(14 + exercises.reduce((s, e) => s + (e.sets * (e.rest + 45)) / 60 + 1, 0) + (cardio ? cardio.minutes : 0));
    return {
      index, key: `ai${index}`, name: String(d.name || `${index + 1}. nap`).slice(0, 60), focus: String(d.focus || '').slice(0, 80),
      weekday: d.weekday || (SCHEDULES[(ai.days || []).length] || [])[index] || null,
      warmup: WARMUP[area], exercises, cardio, cooldown: COOLDOWN[area], estMinutes: est,
    };
  }).filter((d) => d.exercises.length);
  if (!days.length) throw new Error('Az AI terv nem tartalmazott érvényes gyakorlatot');
  return {
    name: String(ai.name || 'Személyre szabott edzésterv').slice(0, 100), goal: profile.goal, split: 'ai', daysPerWeek: days.length,
    sessionMinutes: profile.session_minutes, location: profile.location, intensity: (PRESCRIPTION[profile.goal] || PRESCRIPTION.health).intensity,
    notes: (ai.notes || []).map((n) => String(n).slice(0, 400)).slice(0, 6), days,
  };
}

module.exports = {
  generateWorkoutPlan, swapExercise, analyzeProgress, applyProgression, exerciseCatalog, sessionsFor, enrichAiPlan, availableEquipment,
  DAY_TEMPLATES, chooseSplit, PRESCRIPTION,
};
