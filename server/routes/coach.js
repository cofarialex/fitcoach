// Dashboard, adaptív javaslatok és AI Coach chat
const express = require('express');
const { all, get, run } = require('../db');
const { ah, HttpError, str, dateParam } = require('../util');
const { getProfile, currentWeight } = require('../services/profile');
const actions = require('../services/actions');
const workout = require('../services/workout');
const insights = require('../services/insights');
const coach = require('../services/coach');

const router = express.Router();

// A következő edzés: a legutóbb naplózott tervnap utáni nap (körkörösen)
function nextWorkout(userId, plan) {
  if (!plan) return null;
  const last = get('SELECT plan_day FROM workout_logs WHERE user_id = ? AND plan_day IS NOT NULL ORDER BY date DESC, id DESC LIMIT 1', userId);
  const idx = last ? (last.plan_day + 1) % plan.data.days.length : 0;
  const d = plan.data.days[idx];
  return { index: idx, name: d.name, focus: d.focus, weekday: d.weekday, exercises: d.exercises.length, estMinutes: d.estMinutes };
}

router.get('/dashboard', (req, res) => {
  const u = req.userId;
  const date = dateParam(req.query.date);
  const profile = getProfile(u);
  const targets = actions.getTargets(u, profile);
  const plan = actions.getActivePlan(u);
  const weekly = insights.weeklyStats(u, 8, date);
  const progress = plan ? workout.analyzeProgress(u, plan.data) : [];
  const meal = actions.getMealPlan(u, date);
  res.json({
    date,
    weight: currentWeight(u, profile),
    targets,
    consumed: actions.consumedTotals(u, date),
    water: get('SELECT COALESCE(SUM(ml),0) AS ml FROM water_log WHERE user_id = ? AND date = ?', u, date).ml,
    plan: plan ? { name: plan.data.name, days: plan.data.days.length, source: plan.source } : null,
    nextWorkout: nextWorkout(u, plan),
    thisWeek: weekly[weekly.length - 1],
    weekly,
    weightSeries: all('SELECT date, weight_kg FROM body_metrics WHERE user_id = ? AND weight_kg IS NOT NULL AND date >= ? ORDER BY date, id', u, insights.addDays(date, -90)),
    meals: meal ? meal.data.meals.map((m, i) => ({ i, slotName: m.slotName, title: m.title, kcal: m.totals.kcal, status: m.status })) : null,
    insights: insights.buildInsights(u, profile, { targets, plan, progress }, date),
  });
});

// Egy javaslat elfogadása (pl. kalóriacél módosítása, kevesebb edzésnap, új súlyok)
router.post('/insights/apply', ah(async (req, res) => {
  const a = req.body || {};
  const profile = getProfile(req.userId);
  if (a.type === 'kcal_adjust') {
    const delta = Math.max(-300, Math.min(300, parseInt(a.delta, 10) || 0));
    await actions.updateProfileFields(req.userId, { kcal_adjust: (profile.kcal_adjust || 0) + delta });
    return res.json({ ok: true, message: `Napi kalóriacél módosítva: ${delta > 0 ? '+' : ''}${delta} kcal`, targets: actions.getTargets(req.userId) });
  }
  if (a.type === 'set_days') {
    await actions.updateProfileFields(req.userId, { days_per_week: a.days });
    return res.json({ ok: true, message: `Új, heti ${a.days} napos edzésterv elkészült` });
  }
  if (a.type === 'apply_progression') {
    const plan = actions.getActivePlan(req.userId);
    if (!plan) throw new HttpError(404, 'Nincs aktív edzésterv');
    const n = workout.applyProgression(plan.data, workout.analyzeProgress(req.userId, plan.data));
    actions.updateActivePlan(req.userId, plan.id, plan.data);
    return res.json({ ok: true, message: `${n} gyakorlat célsúlya frissítve` });
  }
  throw new HttpError(400, 'Ismeretlen művelet');
}));

router.get('/coach/messages', (req, res) => {
  res.json({ messages: all('SELECT id, role, content, created_at FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT 100', req.userId).reverse() });
});

router.post('/coach', ah(async (req, res) => {
  const message = str(req.body.message, 2000);
  if (!message) throw new HttpError(400, 'Írj egy üzenetet');
  const r = await coach.chat(req.userId, message, dateParam(req.body.date));
  res.json(r);
}));

router.delete('/coach/messages', (req, res) => {
  run('DELETE FROM chat_messages WHERE user_id = ?', req.userId);
  res.json({ ok: true });
});

module.exports = router;
