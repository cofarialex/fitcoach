// Fejlődésem: testsúly, testméretek, erőszint, edzésmennyiség, heti aktivitás
import { get, post, put, del } from '../api.js';
import { esc, icon, fmt, toast, toastError, withLoading, modal, confirmDialog, emptyState, huDate, today, formData } from '../ui.js';
import { lineChart, barChart, palette } from '../charts.js';

const MEASURES = { waist_cm: 'Derék', chest_cm: 'Mellkas', arm_cm: 'Kar', hip_cm: 'Csípő', thigh_cm: 'Comb' };

export async function render(el, { navigate }) {
  const data = await get(`/progress?date=${today()}`);
  const m = data.metrics;
  const withW = m.filter((x) => x.weight_kg != null);
  const withMeasure = m.filter((x) => Object.keys(MEASURES).some((k) => x[k] != null));
  const first = withW[0];
  const last = withW[withW.length - 1];

  el.innerHTML = `<div class="page">
    <div class="page-head"><div><h1>Fejlődésem</h1><p>Minden számod egy helyen — a terv ezekből tanul.</p></div>
      <div class="actions"><button class="btn btn-primary" id="addMetric">${icon('plus')} Mérés rögzítése</button></div></div>

    <div class="grid g4" style="margin-bottom:16px">
      <div class="card stat"><span class="stat-label">Jelenlegi testsúly</span><span class="stat-value">${last ? fmt(last.weight_kg, 1) : '–'} <small>kg</small></span><span class="stat-sub">${last ? esc(huDate(last.date)) : ''}</span></div>
      <div class="card stat"><span class="stat-label">Változás kezdés óta</span><span class="stat-value">${first && last ? `${last.weight_kg - first.weight_kg > 0 ? '+' : ''}${fmt(last.weight_kg - first.weight_kg, 1)}` : '–'} <small>kg</small></span><span class="stat-sub">${first ? `${esc(huDate(first.date))} óta` : ''}</span></div>
      <div class="card stat"><span class="stat-label">Edzések (12 hét)</span><span class="stat-value">${data.weekly.reduce((s, w) => s + w.sessions, 0)}</span><span class="stat-sub">${fmt(data.weekly.reduce((s, w) => s + w.minutes, 0))} perc összesen</span></div>
      <div class="card stat"><span class="stat-label">Megmozgatott súly (12 hét)</span><span class="stat-value">${fmt(data.weekly.reduce((s, w) => s + w.volume, 0) / 1000, 1)} <small>t</small></span><span class="stat-sub">${data.weekly.reduce((s, w) => s + w.sets, 0)} sorozat</span></div>
    </div>

    <div class="grid g2">
      <div class="card"><div class="card-head"><h2>Erőszint változása</h2>
        ${data.exercises.length ? `<select id="exSel" style="width:auto;max-width:60%">${data.exercises.map((e) => `<option>${esc(e.name)}</option>`).join('')}</select>` : ''}</div>
        ${data.exercises.length ? '<div class="chart-box"><canvas id="strength"></canvas></div><p class="tiny" style="margin:8px 0 0">Becsült 1RM (Epley képlet): súly × (1 + ismétlés / 30)</p>' : emptyState('dumbbell', 'Még nincs súlyos edzés a naplóban')}</div>
      <div class="card"><div class="card-head"><h2>Testsúly</h2></div>
        ${withW.length > 1 ? '<div class="chart-box"><canvas id="weight"></canvas></div>' : emptyState('scale', 'Legalább két mérés kell', 'Mérd magad hetente többször, reggel, éhgyomorra.')}</div>
      <div class="card"><div class="card-head"><h2>Edzésmennyiség</h2><span class="tiny">heti volumen (kg)</span></div><div class="chart-box"><canvas id="volume"></canvas></div></div>
      <div class="card"><div class="card-head"><h2>Heti aktivitás</h2><span class="tiny">edzés + kardió perc</span></div><div class="chart-box"><canvas id="activity"></canvas></div></div>
      <div class="card span2"><div class="card-head"><h2>Testméretek</h2></div>
        ${withMeasure.length > 1 ? '<div class="chart-box"><canvas id="measures"></canvas></div>' : emptyState('chart', 'Kevés adat', 'Rögzítsd a derék-, mell-, kar-, csípő- és combkörfogatot 2–4 hetente.')}</div>
    </div>

    <div class="card" style="margin-top:16px"><div class="card-head"><h2>Mérések</h2></div>
      ${m.length ? `<div class="table-wrap"><table><thead><tr><th>Dátum</th><th class="num">Súly</th><th class="num">Testzsír</th>${Object.values(MEASURES).map((l) => `<th class="num">${l}</th>`).join('')}<th></th></tr></thead><tbody>
        ${[...m].reverse().map((x) => `<tr><td>${esc(huDate(x.date))}</td><td class="num">${x.weight_kg != null ? `${fmt(x.weight_kg, 1)} kg` : '–'}</td><td class="num">${x.body_fat != null ? `${fmt(x.body_fat, 1)}%` : '–'}</td>
          ${Object.keys(MEASURES).map((k) => `<td class="num">${x[k] != null ? fmt(x[k], 1) : '–'}</td>`).join('')}
          <td class="num" style="white-space:nowrap"><button class="btn btn-ghost btn-icon btn-sm" data-edit="${x.id}" aria-label="Szerkesztés">${icon('edit')}</button><button class="btn btn-ghost btn-icon btn-sm" data-del="${x.id}" aria-label="Törlés">${icon('trash')}</button></td></tr>`).join('')}
      </tbody></table></div>` : emptyState('scale', 'Még nincs mérésed')}
    </div>
  </div>`;

  const p = palette();
  const labels = data.weekly.map((w) => huDate(w.week));
  barChart(el.querySelector('#volume'), labels, [{ label: 'Volumen (kg)', data: data.weekly.map((w) => w.volume), color: p.accent }]);
  barChart(el.querySelector('#activity'), labels, [
    { label: 'Edzés (perc)', data: data.weekly.map((w) => w.minutes), color: p.accent },
    { label: 'Kardió (perc)', data: data.weekly.map((w) => w.cardio), color: p.orange },
  ], { x: { stacked: true } });
  if (withW.length > 1) lineChart(el.querySelector('#weight'), withW.map((x) => huDate(x.date)), [{ label: 'Testsúly (kg)', data: withW.map((x) => x.weight_kg), color: p.blue }]);
  if (withMeasure.length > 1) {
    const colors = [p.accent, p.orange, p.blue, p.violet, p.danger];
    lineChart(el.querySelector('#measures'), withMeasure.map((x) => huDate(x.date)), Object.entries(MEASURES).map(([k, l], i) => ({ label: `${l} (cm)`, data: withMeasure.map((x) => x[k]), color: colors[i] })).filter((d) => d.data.some((v) => v != null)));
  }

  const sel = el.querySelector('#exSel');
  const drawStrength = async () => {
    const r = await get(`/progress/exercise?name=${encodeURIComponent(sel.value)}`);
    lineChart(el.querySelector('#strength'), r.series.map((s) => huDate(s.date)), [
      { label: 'Becsült 1RM (kg)', data: r.series.map((s) => s.e1rm), color: p.accent },
      { label: 'Legnagyobb súly (kg)', data: r.series.map((s) => s.top), color: p.orange },
    ]);
  };
  if (sel) {
    sel.onchange = () => drawStrength().catch(toastError);
    drawStrength().catch(toastError);
  }

  const openForm = (x) => {
    const v = (k) => (x && x[k] != null ? x[k] : '');
    const md = modal({
      title: x ? 'Mérés szerkesztése' : 'Új mérés',
      body: `<form id="mForm"><div class="form-grid">
        <div class="field"><label>Dátum</label><input type="date" name="date" value="${esc(x ? x.date : today())}"></div>
        <div class="field"><label>Testsúly (kg)</label><input type="number" step="0.1" name="weight_kg" value="${v('weight_kg')}"></div>
        <div class="field"><label>Testzsír (%)</label><input type="number" step="0.1" name="body_fat" value="${v('body_fat')}"></div>
        ${Object.entries(MEASURES).map(([k, l]) => `<div class="field"><label>${l} (cm)</label><input type="number" step="0.1" name="${k}" value="${v(k)}"></div>`).join('')}
      </div><p class="tiny">Csak azt töltsd ki, amit mértél.</p></form>`,
      foot: '<button class="btn" data-close>Mégse</button><button class="btn btn-primary" id="saveM">Mentés</button>',
    });
    md.el.querySelector('#saveM').onclick = (e) => withLoading(e.currentTarget, async () => {
      try {
        const body = formData(md.el.querySelector('#mForm'));
        if (x) await put(`/metrics/${x.id}`, body);
        else await post('/metrics', body);
        md.close();
        toast('Mérés elmentve');
        navigate('progress');
      } catch (err) {
        toastError(err);
      }
    });
  };
  el.querySelector('#addMetric').onclick = () => openForm(null);
  el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openForm(m.find((x) => x.id === +b.dataset.edit))));
  el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog('Törlöd ezt a mérést?', { okText: 'Törlés', danger: true }))) return;
    try {
      await del(`/metrics/${b.dataset.del}`);
      navigate('progress');
    } catch (err) {
      toastError(err);
    }
  }));
}
