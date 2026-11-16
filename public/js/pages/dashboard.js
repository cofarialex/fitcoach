// Főoldal: napi és heti áttekintés
import { get, post } from '../api.js';
import { esc, icon, fmt, ring, macroBar, toast, toastError, withLoading, today, huDate, emptyState } from '../ui.js';
import { lineChart, barChart, palette } from '../charts.js';

const STATUS = { eaten: ['Megevett', 'green'], skipped: ['Kihagyva', 'orange'], replaced: ['Mást evett', 'blue'], planned: ['Tervezett', ''] };

export async function render(el, { store, navigate }) {
  const date = today();
  const d = await get(`/dashboard?date=${date}`);
  const t = d.targets;
  const c = d.consumed;
  const name = store.me.user.name;
  const hour = new Date().getHours();
  const greet = hour < 10 ? 'Jó reggelt' : hour < 18 ? 'Szia' : 'Jó estét';
  const weekTarget = store.me.profile.days_per_week;
  const prevWeeks = d.weekly.slice(-5, -1).filter((w) => w.sessions > 0);
  const prevAvgVol = prevWeeks.length ? prevWeeks.reduce((s, w) => s + w.volume, 0) / prevWeeks.length : 0;
  const volDiff = prevAvgVol ? Math.round(((d.thisWeek.volume - prevAvgVol) / prevAvgVol) * 100) : null;
  const ws = d.weightSeries;
  const wDiff = ws.length > 1 ? ws[ws.length - 1].weight_kg - ws[0].weight_kg : null;
  const glasses = Math.round(t.water / 250);
  const drank = Math.round(d.water / 250);

  el.innerHTML = `<div class="page">
    <div class="page-head">
      <div><h1>${greet}, ${esc(name)}!</h1><p>${esc(huDate(date, { weekday: true }))} · ${esc(d.plan ? d.plan.name : 'Nincs aktív edzésterv')}</p></div>
      <div class="actions"><a class="btn" href="#/log?new=1">${icon('plus')} Edzés rögzítése</a><a class="btn btn-primary" href="#/coach">${icon('sparkle')} AI Coach</a></div>
    </div>

    <div class="grid g4" style="margin-bottom:16px">
      <div class="card stat"><span class="stat-label">${icon('scale')} Testsúly</span><span class="stat-value">${fmt(d.weight, 1)} <small>kg</small></span>
        <span class="stat-sub">${wDiff == null ? 'Rögzíts méréseket a trendhez' : `${wDiff > 0 ? '+' : ''}${fmt(wDiff, 1)} kg az elmúlt 90 napban`}</span></div>
      <div class="card stat"><span class="stat-label">${icon('flame')} Napi kalóriacél</span><span class="stat-value">${fmt(t.kcal)} <small>kcal</small></span>
        <span class="stat-sub">Eddig: ${fmt(c.kcal)} kcal · maradt ${fmt(Math.max(0, t.kcal - c.kcal))}</span></div>
      <div class="card stat"><span class="stat-label">${icon('dumbbell')} Heti edzések</span><span class="stat-value">${d.thisWeek.sessions} <small>/ ${weekTarget}</small></span>
        <span class="stat-sub">${fmt(d.thisWeek.minutes)} perc ezen a héten</span></div>
      <div class="card stat"><span class="stat-label">${icon('trend')} Edzésvolumen</span><span class="stat-value">${fmt(d.thisWeek.volume / 1000, 1)} <small>t</small></span>
        <span class="stat-sub">${volDiff == null ? 'Az előző hetekhez mérjük' : `<span class="${volDiff >= 0 ? 'up' : 'down'}">${volDiff >= 0 ? '+' : ''}${volDiff}%</span> az előző hetek átlagához`}</span></div>
    </div>

    <div class="grid g3">
      <div class="card">
        <div class="card-head"><h2>Mai táplálkozás</h2><a class="btn btn-sm" href="#/meals">Étrend</a></div>
        <div class="row" style="gap:20px;align-items:center;flex-wrap:nowrap">
          ${ring(c.kcal, t.kcal, { label: fmt(c.kcal), sub: `/ ${fmt(t.kcal)} kcal` })}
          <div style="flex:1;min-width:0">
            ${macroBar('Fehérje', c.protein, t.protein, 'var(--c-protein)')}
            ${macroBar('Szénhidrát', c.carbs, t.carbs, 'var(--c-carbs)')}
            ${macroBar('Zsír', c.fat, t.fat, 'var(--c-fat)')}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Vízfogyasztás</h2><span class="badge blue">${fmt(d.water / 1000, 2)} / ${fmt(t.water / 1000, 2)} l</span></div>
        <div class="water-glasses">${Array.from({ length: glasses }, (_, i) => `<i class="${i < drank ? 'full' : ''}"></i>`).join('')}</div>
        <div class="bar" style="margin-bottom:14px"><i style="width:${Math.min(100, (d.water / t.water) * 100)}%;background:var(--blue)"></i></div>
        <div class="row">
          <button class="btn btn-sm" data-water="250">${icon('water')} +250 ml</button>
          <button class="btn btn-sm" data-water="500">+500 ml</button>
          <button class="btn btn-sm btn-ghost" data-water="-1" title="Utolsó visszavonása">Visszavonás</button>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Következő edzés</h2><a class="btn btn-sm" href="#/plan">Terv</a></div>
        ${d.nextWorkout ? `<h3 style="font-size:1.25rem">${esc(d.nextWorkout.name)}</h3>
          <p class="muted">${esc(d.nextWorkout.focus)}${d.nextWorkout.weekday ? ` · ajánlott nap: ${esc(d.nextWorkout.weekday)}` : ''}</p>
          <div class="ex-meta"><span><em>Gyakorlat</em>${d.nextWorkout.exercises}</span><span><em>Idő</em>~${d.nextWorkout.estMinutes} perc</span></div>
          <div class="row" style="margin-top:16px"><a class="btn btn-accent" href="#/plan?day=${d.nextWorkout.index}">Megnézem</a><a class="btn" href="#/log?new=1&day=${d.nextWorkout.index}">Elvégeztem</a></div>`
          : emptyState('dumbbell', 'Nincs edzésterv', '', '<a class="btn btn-primary" href="#/plan">Terv készítése</a>')}
      </div>
    </div>

    <div class="grid g2" style="margin-top:16px">
      <div class="card">
        <div class="card-head"><h2>Mai étkezések</h2><a class="btn btn-sm" href="#/meals">Részletek</a></div>
        ${d.meals ? `<div class="list">${d.meals.map((m) => `<div class="list-item"><div class="grow"><div class="tiny">${esc(m.slotName)}</div><div class="ellipsis" style="font-weight:600">${esc(m.title)}</div></div>
          <span class="tiny">${fmt(m.kcal)} kcal</span>${STATUS[m.status] && STATUS[m.status][1] ? `<span class="badge ${STATUS[m.status][1]}">${STATUS[m.status][0]}</span>` : ''}</div>`).join('')}</div>`
          : emptyState('meal', 'Még nincs mai étrended', 'Készíts egyet a céljaid és az otthoni alapanyagaid alapján.', '<button class="btn btn-primary" id="genMeals">Mai étrend készítése</button>')}
      </div>
      <div class="card">
        <div class="card-head"><h2>Edződ észrevételei</h2><span class="badge">${icon('sparkle')} adaptív</span></div>
        ${d.insights.map((x) => `<div class="insight ${x.level}"><i class="dot"></i><div style="flex:1"><b>${esc(x.title)}</b><p>${esc(x.text)}</p>
          ${x.action ? `<button class="btn btn-sm" style="margin-top:8px" data-action='${esc(JSON.stringify(x.action))}'>${esc(x.action.label)}</button>` : ''}</div></div>`).join('')}
      </div>
    </div>

    <div class="grid g2" style="margin-top:16px">
      <div class="card"><div class="card-head"><h2>Heti edzések</h2><span class="tiny">utolsó 8 hét</span></div><div class="chart-box sm"><canvas id="weekChart"></canvas></div></div>
      <div class="card"><div class="card-head"><h2>Testsúly</h2><a class="btn btn-sm" href="#/progress">Fejlődésem</a></div>
        ${ws.length > 1 ? '<div class="chart-box sm"><canvas id="weightChart"></canvas></div>' : emptyState('scale', 'Kevés adat', 'Rögzíts legalább két mérést a Fejlődésem oldalon.')}</div>
    </div>
  </div>`;

  const p = palette();
  barChart(el.querySelector('#weekChart'), d.weekly.map((w) => huDate(w.week)), [{ label: 'Edzések', data: d.weekly.map((w) => w.sessions), color: p.accent }], { y: { ticks: { stepSize: 1, color: p.text } } });
  if (ws.length > 1) lineChart(el.querySelector('#weightChart'), ws.map((w) => huDate(w.date)), [{ label: 'Testsúly (kg)', data: ws.map((w) => w.weight_kg), color: p.blue }]);

  el.querySelectorAll('[data-water]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await post('/water', { date, ml: +b.dataset.water });
      navigate('dashboard');
    } catch (e) {
      toastError(e);
    }
  }));
  el.querySelectorAll('[data-action]').forEach((b) => b.addEventListener('click', () => withLoading(b, async () => {
    try {
      const r = await post('/insights/apply', JSON.parse(b.dataset.action));
      toast(r.message);
      navigate('dashboard');
    } catch (e) {
      toastError(e);
    }
  })));
  const gen = el.querySelector('#genMeals');
  if (gen) gen.onclick = () => withLoading(gen, async () => {
    try {
      await post(`/meals/${date}/generate`, {});
      navigate('meals');
    } catch (e) {
      toastError(e);
    }
  });
}
