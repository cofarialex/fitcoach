// Adaptív elemzés: a naplózott adatokból javaslatokat készít (ez teszi "tanuló" edzővé az appot)
const { all, get } = require('../db');

const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const today = () => fmt(new Date());
const addDays = (s, n) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return fmt(d);
};
// A hét hétfője
const weekStart = (s) => {
  const d = parse(s);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return fmt(d);
};
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

function weeklyStats(userId, weeks = 8, ref = today()) {
  const start = addDays(weekStart(ref), -7 * (weeks - 1));
  const logs = all(
    `SELECT l.id, l.date, l.duration_min, l.cardio_min,
       (SELECT COALESCE(SUM(COALESCE(s.weight_kg,0) * COALESCE(s.reps,0)),0) FROM workout_sets s WHERE s.log_id = l.id) AS volume,
       (SELECT COUNT(*) FROM workout_sets s WHERE s.log_id = l.id) AS sets
     FROM workout_logs l WHERE l.user_id = ? AND l.date >= ? ORDER BY l.date`,
    userId, start
  );
  const out = [];
  for (let i = 0; i < weeks; i++) {
    const ws = addDays(start, i * 7);
    const we = addDays(ws, 6);
    const w = logs.filter((l) => l.date >= ws && l.date <= we);
    out.push({
      week: ws, sessions: w.length, volume: Math.round(w.reduce((s, l) => s + l.volume, 0)),
      sets: w.reduce((s, l) => s + l.sets, 0), minutes: w.reduce((s, l) => s + (l.duration_min || 0), 0),
      cardio: w.reduce((s, l) => s + (l.cardio_min || 0), 0),
    });
  }
  return out;
}

function avgWeight(userId, from, to) {
  const r = get('SELECT AVG(weight_kg) AS w, COUNT(*) AS n FROM body_metrics WHERE user_id = ? AND weight_kg IS NOT NULL AND date >= ? AND date <= ?', userId, from, to);
  return r && r.n ? { w: r.w, n: r.n } : null;
}

function nutritionAverages(userId, days, ref = today()) {
  const from = addDays(ref, -days);
  const rows = all('SELECT date, SUM(kcal) AS kcal, SUM(protein) AS protein FROM food_log WHERE user_id = ? AND date >= ? AND date < ? GROUP BY date', userId, from, ref);
  if (!rows.length) return null;
  return { days: rows.length, kcal: Math.round(rows.reduce((s, r) => s + r.kcal, 0) / rows.length), protein: Math.round(rows.reduce((s, r) => s + r.protein, 0) / rows.length) };
}

// Elvárt heti testsúlyváltozás (kg) a cél szerint
const EXPECTED = {
  muscle_gain: [0.1, 0.4], fat_loss: [-1.0, -0.3], cut: [-0.8, -0.25], recomp: [-0.4, 0.15],
  strength: [-0.1, 0.3], endurance: [-0.4, 0.2], health: [-0.4, 0.2],
};

function buildInsights(userId, profile, { targets, plan, progress = [] }, ref = today()) {
  const out = [];
  // 1) Testsúly trend: utolsó 7 nap átlaga vs. az azt megelőző 14 nap átlaga
  const recent = avgWeight(userId, addDays(ref, -6), ref);
  const before = avgWeight(userId, addDays(ref, -20), addDays(ref, -7));
  if (recent && before) {
    const perWeek = (recent.w - before.w) / 1.5;
    const [lo, hi] = EXPECTED[profile.goal] || EXPECTED.health;
    const delta = Math.round(perWeek * 100) / 100;
    if (perWeek < lo) {
      const bump = profile.goal === 'muscle_gain' ? 150 : 100;
      out.push({ id: 'weight_low', level: 'warn', title: 'A testsúlyod a vártnál lassabban változik', text: `Heti változás: ${delta} kg (cél: ${lo} – ${hi} kg/hét). Javaslat: napi +${bump} kcal.`, action: { type: 'kcal_adjust', delta: bump, label: `+${bump} kcal/nap` } });
    } else if (perWeek > hi) {
      const cut = profile.goal === 'muscle_gain' ? 100 : 150;
      out.push({ id: 'weight_high', level: 'warn', title: profile.goal === 'muscle_gain' ? 'Túl gyorsan nő a testsúlyod' : 'A testsúlyod nem a célod irányába változik', text: `Heti változás: +${delta} kg (cél: ${lo} – ${hi} kg/hét). Javaslat: napi −${cut} kcal.`, action: { type: 'kcal_adjust', delta: -cut, label: `−${cut} kcal/nap` } });
    } else {
      out.push({ id: 'weight_ok', level: 'success', title: 'A testsúlyod a terv szerint alakul', text: `Heti változás: ${delta > 0 ? '+' : ''}${delta} kg — maradj a jelenlegi kalóriacélnál.` });
    }
  } else {
    out.push({ id: 'weight_need', level: 'info', title: 'Mérd magad rendszeresen', text: 'Heti 3–4 reggeli mérés után az alkalmazás automatikusan finomhangolja a kalóriacélodat.' });
  }

  // 2) Edzés rendszeresség az utolsó 2 hétben
  const weeks = weeklyStats(userId, 3, ref);
  const planned = (profile.days_per_week || 3) * 2;
  const done = weeks[0].sessions + weeks[1].sessions;
  if (done > 0 && done < planned * 0.6 && (profile.days_per_week || 3) > 2) {
    out.push({ id: 'adherence', level: 'warn', title: 'Kevesebb edzés, mint tervezted', text: `Az elmúlt 2 hétben ${done}/${planned} edzés valósult meg. Egy rövidebb, ${profile.days_per_week - 1} napos terv jobban illeszkedhet a hetedhez.`, action: { type: 'set_days', days: profile.days_per_week - 1, label: `Váltás ${profile.days_per_week - 1} napos tervre` } });
  } else if (done >= planned) {
    out.push({ id: 'adherence_ok', level: 'success', title: 'Kiváló rendszeresség!', text: `Az elmúlt 2 hétben mind a ${planned} tervezett edzést elvégezted.` });
  }

  // 3) Edzésmennyiség változása
  const [w0, w1, w2] = [weeks[2], weeks[1], weeks[0]];
  if (w0.volume > 0 && w1.volume > 0 && w0.volume < w1.volume * 0.7 && w2.volume > 0) {
    out.push({ id: 'volume_drop', level: 'info', title: 'Csökkent az edzésmennyiség', text: 'Ezen a héten jelentősen kevesebb volumen gyűlt össze, mint a múlt héten. Ha fáradt vagy, ez lehet egy tudatos könnyített hét is.' });
  }

  // 4) Progressziós javaslatok összesítése
  const inc = progress.filter((p) => p.type === 'increase' && p.suggestedWeight != null);
  const stall = progress.filter((p) => p.type === 'stall');
  if (inc.length) out.push({ id: 'progress_up', level: 'success', title: `${inc.length} gyakorlatnál emelhetsz súlyt`, text: inc.slice(0, 3).map((p) => `${p.name}: ${p.suggestedWeight} kg`).join(' · '), action: { type: 'apply_progression', label: 'Új súlyok beírása a tervbe' } });
  if (stall.length) out.push({ id: 'progress_stall', level: 'warn', title: 'Stagnálás', text: `${stall.map((p) => p.name).join(', ')} — érdemes egy alternatív gyakorlatra váltani vagy könnyített hetet tartani.` });

  // 5) Táplálkozási következetesség
  const nut = nutritionAverages(userId, 7, ref);
  if (nut && targets && nut.days >= 3) {
    const diff = nut.kcal - targets.kcal;
    if (Math.abs(diff) > targets.kcal * 0.12) {
      out.push({ id: 'kcal_adherence', level: 'info', title: diff > 0 ? 'Átlagosan többet eszel a célnál' : 'Átlagosan kevesebbet eszel a célnál', text: `Az utolsó ${nut.days} naplózott nap átlaga ${nut.kcal} kcal (cél: ${targets.kcal} kcal).` });
    }
    if (nut.protein < targets.protein * 0.8) {
      out.push({ id: 'protein_low', level: 'warn', title: 'Kevés a fehérje', text: `Átlagosan ${nut.protein} g fehérjét eszel naponta (cél: ${targets.protein} g). Tegyél minden étkezéshez fehérjeforrást.` });
    }
  }
  return out;
}

module.exports = { weeklyStats, buildInsights, nutritionAverages, today, addDays, weekStart, isDate, fmt };
