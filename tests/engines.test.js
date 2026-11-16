// Automatikus tesztek a szabályalapú motorokhoz. Futtatás: npm test
process.env.DB_FILE = ':memory:';
const test = require('node:test');
const assert = require('node:assert');
const nutrition = require('../server/services/nutrition');
const workout = require('../server/services/workout');
const { matchFood } = require('../server/data/foods');

const profile = {
  sex: 'male', age: 25, height_cm: 180, weight_kg: 80, activity_level: 'moderate', goal: 'muscle_gain', experience: 'beginner',
  days_per_week: 4, session_minutes: 60, location: 'home', equipment: ['dumbbell'], injuries: ['knee'],
  meals_per_day: 4, cook_minutes: 30, allergies: ['fish'], intolerances: [], likes: '', dislikes: '',
};

test('a szöveges alapanyagnév a helyes élelmiszerre illeszkedik', () => {
  assert.equal(matchFood('tojás').key, 'eggs');
  assert.equal(matchFood('basmati rizs').key, 'rice');
  assert.equal(matchFood('krumpli').key, 'potato');
  assert.equal(matchFood('valami ismeretlen'), null);
});

test('a kalóriacél tömegnövelésnél a napi szükséglet fölött van', () => {
  const t = nutrition.calcTargets(profile, 80);
  assert.ok(t.kcal > t.tdee);
  assert.equal(t.protein, Math.round(80 * 1.8));
});

test('a napi étrend közelíti a célt és kerüli az allergéneket', () => {
  const t = nutrition.calcTargets(profile, 80);
  const plan = nutrition.generateDayPlan({ profile, targets: t, pantry: [], date: '2026-01-01', seed: 42 });
  assert.equal(plan.meals.length, 4);
  assert.ok(Math.abs(plan.totals.kcal - t.kcal) / t.kcal < 0.15, `kcal: ${plan.totals.kcal} vs ${t.kcal}`);
  const keys = plan.meals.flatMap((m) => m.items.map((i) => i.key));
  assert.ok(!keys.some((k) => ['salmon', 'tuna_can', 'hake'].includes(k)), 'halallergia esetén nincs hal');
});

test('"Mit egyek ma?" mód csak otthoni alapanyagot használ, ha elég van', () => {
  const t = nutrition.calcTargets(profile, 80);
  const pantry = ['tojás', 'rizs', 'zabpehely', 'csirkemell', 'banán'].map((name, i) => ({ id: i, name, availability: 'home' }));
  const plan = nutrition.generateDayPlan({ profile, targets: t, pantry, date: '2026-01-01', seed: 1, onlyAvailable: true });
  const main = plan.meals.flatMap((m) => m.items.filter((i) => i.role === 'P' || i.role === 'C'));
  assert.ok(main.every((i) => i.avail === 'home'), main.map((i) => i.name).join(', '));
});

test('az edzésterv a megadott napszámot, eszközöket és sérüléseket követi', () => {
  const plan = workout.generateWorkoutPlan(profile, 80);
  assert.equal(plan.days.length, 4);
  const { BY_KEY, hasEquipment } = require('../server/data/exercises');
  for (const d of plan.days) {
    assert.ok(d.exercises.length >= 3);
    for (const e of d.exercises) {
      const ex = BY_KEY[e.key];
      assert.ok(hasEquipment(ex, ['dumbbell']), `${e.name} eszközt igényel`);
      assert.ok(!ex.avoid.includes('knee'), `${e.name} térdterhelő`);
    }
  }
});
