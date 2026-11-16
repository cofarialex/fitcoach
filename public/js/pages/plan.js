// Edzésterv: napi bontás, gyakorlatok, alternatívák, automatikus terhelésnövelés
import { get, post, put } from '../api.js';
import { esc, icon, fmt, toast, toastError, withLoading, modal, confirmDialog, emptyState, formData } from '../ui.js';

const PROGRESS_BADGE = { increase: ['Emelés', 'green'], decrease: ['Csökkentés', 'orange'], stall: ['Stagnálás', 'red'], keep: ['Tartsd', 'blue'], nodata: ['Nincs adat', ''] };

const reps = (e) => (e.unit === 'sec' ? `${e.repsMin}–${e.repsMax} mp` : e.repsMin === e.repsMax ? `${e.repsMin}` : `${e.repsMin}–${e.repsMax}`);
const restText = (s) => (s >= 60 ? `${fmt(s / 60, 1)} perc` : `${s} mp`);

export async function render(el, { store, params }) {
  let { plan, progress } = await get('/workout-plan');
  let dayIdx = Math.max(0, Math.min(+(params.day || 0), plan ? plan.data.days.length - 1 : 0));

  const draw = () => {
    if (!plan) {
      el.innerHTML = `<div class="page"><div class="card">${emptyState('dumbbell', 'Még nincs edzésterved', 'Elkészítjük a profilod alapján.', '<button class="btn btn-primary" id="gen">Edzésterv készítése</button>')}</div></div>`;
      el.querySelector('#gen').onclick = (e) => regenerate(e.currentTarget, true);
      return;
    }
    const P = plan.data;
    const day = P.days[dayIdx];
    const progByName = new Map(progress.map((x) => [x.name, x]));
    const actionable = progress.filter((x) => x.suggestedWeight != null && ['increase', 'decrease'].includes(x.type));

    el.innerHTML = `<div class="page">
      <div class="page-head">
        <div><h1>${esc(P.name)}</h1>
          <p>${P.daysPerWeek} edzés/hét · ~${P.sessionMinutes} perc · ${P.location === 'gym' ? 'edzőterem' : 'otthon'} ·
          <span class="badge ${plan.source === 'ai' ? 'green' : ''}">${plan.source === 'ai' ? 'AI által készítve' : 'Szabályalapú motor'}</span></p></div>
        <div class="actions">
          ${store.me.aiEnabled ? `<button class="btn btn-primary" id="regenAi">${icon('sparkle')} Új terv AI-jal</button>` : ''}
          <button class="btn ${store.me.aiEnabled ? '' : 'btn-primary'}" id="regen">${icon('refresh')} Új terv</button>
        </div>
      </div>

      <div class="day-tabs" role="tablist">${P.days.map((d, i) => `<button class="day-tab ${i === dayIdx ? 'active' : ''}" data-day="${i}" role="tab"><small>${esc(d.weekday || `${i + 1}. nap`)}</small>${esc(d.name)}</button>`).join('')}</div>

      <div class="grid" style="grid-template-columns:minmax(0,1fr) 340px;align-items:start" id="planGrid">
        <div>
          <div class="card" style="margin-bottom:14px">
            <div class="row between"><div><h2 style="margin:0">${esc(day.name)}</h2><span class="muted">${esc(day.focus)}</span></div>
              <div class="row"><span class="badge">~${day.estMinutes} perc</span><a class="btn btn-accent btn-sm" href="#/log?new=1&day=${dayIdx}">${icon('check')} Edzés rögzítése</a></div></div>
            <details class="more"><summary>Bemelegítés (8–10 perc)</summary><ol class="steps">${day.warmup.map((w) => `<li>${esc(w)}</li>`).join('')}</ol></details>
          </div>

          ${day.exercises.map((e, i) => {
            const pr = progByName.get(e.name);
            const badge = pr && PROGRESS_BADGE[pr.type];
            return `<div class="exercise">
              <div class="exercise-head">
                <div class="ex-num">${i + 1}</div>
                <div style="flex:1;min-width:0">
                  <div class="row between" style="align-items:flex-start"><h3 style="margin:0">${esc(e.name)}</h3>
                    <div class="row" style="gap:4px">
                      <button class="btn btn-ghost btn-icon btn-sm" data-edit="${i}" title="Szerkesztés" aria-label="Szerkesztés">${icon('edit')}</button>
                      <button class="btn btn-ghost btn-icon btn-sm" data-swap="${i}" title="Csere" aria-label="Csere">${icon('swap')}</button>
                    </div></div>
                  <div class="tiny">${esc(e.equipment)}</div>
                  <div class="ex-meta">
                    <span><em>Sorozat</em>${e.sets}</span><span><em>Ismétlés</em>${reps(e)}</span>
                    <span><em>Súly</em>${e.weight != null ? `${fmt(e.weight, 1)} kg` : 'testsúly'}</span><span><em>Pihenő</em>${restText(e.rest)}</span>
                  </div>
                  ${pr && pr.type !== 'nodata' ? `<div class="insight ${pr.type === 'increase' ? 'success' : pr.type === 'keep' ? '' : 'warn'}" style="margin:10px 0 0;padding:8px 12px"><i class="dot"></i><p style="margin:0">${badge ? `<span class="badge ${badge[1]}">${badge[0]}</span> ` : ''}${esc(pr.message)}</p></div>` : ''}
                  <details class="more"><summary>Helyes végrehajtás és alternatívák</summary>
                    <p style="margin:8px 0;font-size:.9rem">${esc(e.tips)}</p>
                    <p class="tiny" style="margin:0 0 6px">Intenzitás: ${esc(e.intensity)}${e.note ? ` · ${esc(e.note)}` : ''}</p>
                    ${e.alternatives.length ? `<div class="tiny" style="margin-bottom:6px">Ha nincs meg az eszköz, válaszd ezek egyikét:</div><div class="chips">${e.alternatives.map((a) => `<button class="btn btn-sm" data-alt="${i}" data-key="${esc(a.key)}" title="${esc(a.equipment)}">${esc(a.name)}</button>`).join('')}</div>` : ''}
                  </details>
                </div>
              </div>
            </div>`;
          }).join('')}

          ${day.cardio ? `<div class="card" style="margin-bottom:12px"><h3>${icon('flame')} Kardió · ${day.cardio.minutes} perc</h3><p class="muted" style="margin:0">${esc(day.cardio.description)}</p></div>` : ''}
          <div class="card"><h3>Levezetés és nyújtás</h3><ol class="steps">${day.cooldown.map((w) => `<li>${esc(w)}</li>`).join('')}</ol></div>
        </div>

        <div class="stack">
          <div class="card">
            <div class="card-head"><h2>Fejlődés</h2>${actionable.length ? `<button class="btn btn-sm btn-accent" id="applyProg">Súlyok frissítése</button>` : ''}</div>
            ${progress.filter((x) => x.type !== 'nodata').length
              ? progress.filter((x) => x.type !== 'nodata').map((x) => `<div class="list-item" style="align-items:flex-start"><div class="grow"><b style="font-size:.9rem">${esc(x.name)}</b><div class="tiny">${esc(x.message)}</div></div><span class="badge ${PROGRESS_BADGE[x.type][1]}">${PROGRESS_BADGE[x.type][0]}</span></div>`).join('')
              : '<p class="muted" style="margin:0">Amint rögzítesz edzéseket a naplóban, itt gyakorlatonként megjelenik, mikor és mennyit emelj a súlyon.</p>'}
          </div>
          <div class="card"><h2>Alapelvek</h2><p class="tiny" style="margin-bottom:8px">Intenzitás: ${esc(P.intensity || '')}</p><ul class="steps">${P.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>
        </div>
      </div>
    </div>`;

    // Mobilon egy oszlop
    const grid = el.querySelector('#planGrid');
    if (window.innerWidth < 980) grid.style.gridTemplateColumns = 'minmax(0,1fr)';

    el.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => {
      dayIdx = +b.dataset.day;
      draw();
    }));
    el.querySelector('#regen').onclick = (e) => regenerate(e.currentTarget, false);
    const ai = el.querySelector('#regenAi');
    if (ai) ai.onclick = (e) => regenerate(e.currentTarget, true);
    const ap = el.querySelector('#applyProg');
    if (ap) ap.onclick = () => withLoading(ap, async () => {
      try {
        const r = await post('/workout-plan/apply-progression');
        ({ plan, progress } = r);
        toast(`${r.changed} célsúly frissítve`);
        draw();
      } catch (err) {
        toastError(err);
      }
    });
    el.querySelectorAll('[data-alt]').forEach((b) => b.addEventListener('click', () => swap(+b.dataset.alt, b.dataset.key)));
    el.querySelectorAll('[data-swap]').forEach((b) => b.addEventListener('click', () => openSwap(+b.dataset.swap)));
    el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openEdit(+b.dataset.edit)));
  };

  async function regenerate(btn, useAi) {
    if (plan && !(await confirmDialog('Új edzéstervet készítsek? A mostani terv archiválódik (a naplózott edzéseid megmaradnak).', { okText: 'Új terv' }))) return;
    await withLoading(btn, async () => {
      try {
        const r = await post('/workout-plan/generate', { useAi });
        ({ plan, progress } = r);
        dayIdx = 0;
        if (r.aiError) toast(`AI hiba, a beépített motor készítette: ${r.aiError}`, 'error');
        else toast('Új edzésterv elkészült');
        draw();
      } catch (err) {
        toastError(err);
      }
    });
  }

  async function swap(exIdx, key) {
    try {
      ({ plan, progress } = await post('/workout-plan/swap', { day: dayIdx, exercise: exIdx, key }));
      toast('Gyakorlat lecserélve');
      draw();
    } catch (err) {
      toastError(err);
    }
  }

  function openSwap(exIdx) {
    const ex = plan.data.days[dayIdx].exercises[exIdx];
    const list = store.meta.exercises.filter((c) => c.key !== ex.key && c.safe);
    const render = (q) => {
      const qq = q.toLowerCase();
      const items = list.filter((c) => (qq ? c.name.toLowerCase().includes(qq) : c.pattern === ex.pattern))
        .sort((a, b) => (b.pattern === ex.pattern) - (a.pattern === ex.pattern) || b.available - a.available);
      return items.length ? items.slice(0, 40).map((c) => `<div class="list-item"><div class="grow"><b>${esc(c.name)}</b><div class="tiny">${esc(c.equipment)}${c.available ? '' : ' · nincs meg az eszköz'}</div></div><button class="btn btn-sm" data-pick="${esc(c.key)}">Választ</button></div>`).join('') : '<p class="muted">Nincs találat.</p>';
    };
    const m = modal({
      title: `Csere: ${ex.name}`,
      body: `<input id="exSearch" placeholder="Keresés az összes gyakorlat között…"><div class="list" id="exList" style="margin-top:10px">${render('')}</div>`,
    });
    const listEl = m.el.querySelector('#exList');
    m.el.querySelector('#exSearch').addEventListener('input', (e) => (listEl.innerHTML = render(e.target.value)));
    listEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick]');
      if (!b) return;
      m.close();
      swap(exIdx, b.dataset.pick);
    });
  }

  function openEdit(exIdx) {
    const e = plan.data.days[dayIdx].exercises[exIdx];
    const m = modal({
      title: e.name,
      body: `<form id="exForm" class="form-grid">
        <div class="field"><label>Sorozat</label><input name="sets" type="number" min="1" max="10" value="${e.sets}"></div>
        <div class="field"><label>Ismétlés (min)</label><input name="repsMin" type="number" min="1" max="200" value="${e.repsMin}"></div>
        <div class="field"><label>Ismétlés (max)</label><input name="repsMax" type="number" min="1" max="200" value="${e.repsMax}"></div>
        <div class="field"><label>Súly (kg)</label><input name="weight" type="number" step="0.5" min="0" value="${e.weight ?? ''}" placeholder="testsúly"></div>
        <div class="field"><label>Pihenő (mp)</label><input name="rest" type="number" min="0" max="600" step="15" value="${e.rest}"></div>
      </form>`,
      foot: '<button class="btn" data-close>Mégse</button><button class="btn btn-primary" id="saveEx">Mentés</button>',
    });
    m.el.querySelector('#saveEx').onclick = (ev) => withLoading(ev.currentTarget, async () => {
      try {
        ({ plan, progress } = await put('/workout-plan/exercise', { day: dayIdx, exercise: exIdx, ...formData(m.el.querySelector('#exForm')) }));
        m.close();
        draw();
      } catch (err) {
        toastError(err);
      }
    });
  }

  draw();
}
