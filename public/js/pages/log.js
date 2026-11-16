// Edzésnapló: edzések rögzítése, szerkesztése, törlése, fotó, összehasonlítás az előző alkalommal
import { api, get, del } from '../api.js';
import { esc, icon, fmt, toast, toastError, withLoading, modal, confirmDialog, emptyState, relDay, today } from '../ui.js';

export async function render(el, { store, params, navigate }) {
  const [{ logs }, { plan }] = await Promise.all([get('/logs?limit=200'), get('/workout-plan')]);

  el.innerHTML = `<div class="page">
    <div class="page-head"><div><h1>Edzésnapló</h1><p>Minden edzésed egy helyen — ebből tanul a terved.</p></div>
      <div class="actions"><button class="btn btn-primary" id="newLog">${icon('plus')} Új edzés</button></div></div>
    <div class="card">
      ${logs.length ? `<div class="list">${logs.map((l) => `<div class="list-item">
        <div class="ex-num">${icon('dumbbell')}</div>
        <div class="grow"><b>${esc(l.title)}</b> ${l.photo ? `<span class="badge">${icon('camera')} fotó</span>` : ''}
          <div class="tiny">${esc(relDay(l.date))} · ${l.exercise_count} gyakorlat · ${l.set_count} sorozat${l.duration_min ? ` · ${l.duration_min} perc` : ''}${l.volume ? ` · ${fmt(l.volume)} kg volumen` : ''}${l.cardio_min ? ` · ${esc(l.cardio_type || 'kardió')} ${fmt(l.cardio_min)} perc` : ''}</div></div>
        <button class="btn btn-sm" data-view="${l.id}">Részletek</button>
      </div>`).join('')}</div>`
        : emptyState('notebook', 'Még nincs rögzített edzésed', 'Rögzítsd az első edzésedet — a terved ez alapján alkalmazkodik.')}
    </div></div>`;

  el.querySelector('#newLog').onclick = () => openEditor(null);
  el.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => openView(+b.dataset.view)));
  if (params.new) openEditor(null, params.day !== undefined ? +params.day : null);

  // ── Részletek + összehasonlítás ──────────────────────────────────────
  async function openView(id) {
    try {
      const { log, compare } = await get(`/logs/${id}/compare`);
      const diff = (a, b) => {
        if (a == null || b == null) return '';
        const d = Math.round((a - b) * 10) / 10;
        return d === 0 ? '<span class="tiny">=</span>' : `<span class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${fmt(d, 1)}</span>`;
      };
      const m = modal({
        title: log.title, wide: true,
        body: `<p class="muted">${esc(relDay(log.date))}${log.duration_min ? ` · ${log.duration_min} perc` : ''}</p>
          ${log.photo ? `<img class="photo-thumb" src="/api/uploads/${encodeURIComponent(log.photo)}" alt="Edzésfotó" style="margin-bottom:14px">` : ''}
          ${compare.length ? `<h3>Összehasonlítás az előző alkalommal</h3><div class="table-wrap"><table><thead><tr><th>Gyakorlat</th><th class="num">Max súly</th><th class="num">Becsült 1RM</th><th class="num">Volumen</th><th>Előző</th></tr></thead><tbody>
            ${compare.map((c) => `<tr><td><b>${esc(c.exercise)}</b><div class="tiny">${c.current.sets} sorozat, ${c.current.reps} ismétlés</div></td>
              <td class="num">${fmt(c.current.top, 1)} kg ${c.previous ? diff(c.current.top, c.previous.top) : ''}</td>
              <td class="num">${fmt(c.current.e1rm, 1)} kg ${c.previous ? diff(c.current.e1rm, c.previous.e1rm) : ''}</td>
              <td class="num">${fmt(c.current.volume)} kg ${c.previous ? diff(c.current.volume, c.previous.volume) : ''}</td>
              <td class="tiny">${c.previous ? esc(relDay(c.previousDate)) : 'első alkalom'}</td></tr>`).join('')}</tbody></table></div>` : ''}
          <h3 style="margin-top:16px">Sorozatok</h3>
          <div class="table-wrap"><table><thead><tr><th>Gyakorlat</th><th class="num">#</th><th class="num">Súly</th><th class="num">Ismétlés</th></tr></thead><tbody>
          ${log.sets.map((s) => `<tr><td>${esc(s.exercise)}</td><td class="num">${s.set_no}</td><td class="num">${s.weight_kg != null ? `${fmt(s.weight_kg, 1)} kg` : '–'}</td><td class="num">${s.reps ?? '–'}</td></tr>`).join('')}</tbody></table></div>
          ${log.cardio_min || log.cardio_km ? `<p style="margin-top:12px"><b>Kardió:</b> ${esc(log.cardio_type || '')} ${log.cardio_min ? `${fmt(log.cardio_min)} perc` : ''} ${log.cardio_km ? `· ${fmt(log.cardio_km, 1)} km` : ''} ${log.cardio_kcal ? `· ${fmt(log.cardio_kcal)} kcal` : ''}</p>` : ''}
          ${log.notes ? `<p><b>Megjegyzés:</b> ${esc(log.notes)}</p>` : ''}`,
        foot: `<button class="btn btn-danger" id="delLog">${icon('trash')} Törlés</button><button class="btn" id="editLog">${icon('edit')} Szerkesztés</button>`,
      });
      m.el.querySelector('#delLog').onclick = async () => {
        if (!(await confirmDialog('Biztosan törlöd ezt az edzést?', { okText: 'Törlés', danger: true }))) return;
        try {
          await del(`/logs/${id}`);
          m.close();
          toast('Edzés törölve');
          navigate('log');
        } catch (e) {
          toastError(e);
        }
      };
      m.el.querySelector('#editLog').onclick = () => {
        m.close();
        openEditor(log);
      };
    } catch (e) {
      toastError(e);
    }
  }

  // ── Új / szerkesztett edzés ─────────────────────────────────────────
  function openEditor(log, dayIndex = null) {
    // Gyakorlatok csoportosítva: { name, sets: [{weight, reps}] }
    let exercises = [];
    if (log) {
      for (const s of log.sets) {
        let g = exercises.find((x) => x.name === s.exercise);
        if (!g) exercises.push((g = { name: s.exercise, sets: [] }));
        g.sets.push({ weight: s.weight_kg ?? '', reps: s.reps ?? '' });
      }
    } else if (plan && dayIndex !== null && plan.data.days[dayIndex]) {
      exercises = plan.data.days[dayIndex].exercises.map((e) => ({ name: e.name, sets: Array.from({ length: e.sets }, () => ({ weight: e.weight ?? '', reps: '' })), target: `${e.repsMin}–${e.repsMax}` }));
    }
    const planDays = plan ? plan.data.days : [];
    const exNames = store.meta.exercises.map((e) => e.name);

    const m = modal({
      title: log ? 'Edzés szerkesztése' : 'Új edzés rögzítése', wide: true,
      body: `<form id="logForm">
        <div class="form-grid">
          <div class="field"><label>Dátum</label><input name="date" type="date" value="${esc(log ? log.date : today())}" required></div>
          <div class="field"><label>Tervezett nap</label><select name="plan_day"><option value="">— szabad edzés —</option>${planDays.map((d, i) => `<option value="${i}" ${(log ? log.plan_day : dayIndex) === i ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>
          <div class="field"><label>Megnevezés</label><input name="title" value="${esc(log ? log.title : dayIndex !== null && planDays[dayIndex] ? planDays[dayIndex].name : '')}" placeholder="pl. Felsőtest A"></div>
          <div class="field"><label>Időtartam (perc)</label><input name="duration_min" type="number" min="0" value="${esc(log ? log.duration_min ?? '' : '')}"></div>
        </div>
        <div class="row between" style="margin:6px 0 10px"><h3 style="margin:0">Gyakorlatok</h3><button type="button" class="btn btn-sm" id="addEx">${icon('plus')} Gyakorlat</button></div>
        <datalist id="exNames">${exNames.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
        <div id="exBox"></div>
        <details class="more" ${log && (log.cardio_min || log.cardio_km) ? 'open' : ''}><summary>Kardió adatok</summary>
          <div class="form-grid" style="margin-top:10px">
            <div class="field"><label>Típus</label><input name="cardio_type" value="${esc(log ? log.cardio_type || '' : '')}" placeholder="futás, bicikli…"></div>
            <div class="field"><label>Idő (perc)</label><input name="cardio_min" type="number" min="0" step="1" value="${esc(log ? log.cardio_min ?? '' : '')}"></div>
            <div class="field"><label>Táv (km)</label><input name="cardio_km" type="number" min="0" step="0.1" value="${esc(log ? log.cardio_km ?? '' : '')}"></div>
            <div class="field"><label>Kalória</label><input name="cardio_kcal" type="number" min="0" value="${esc(log ? log.cardio_kcal ?? '' : '')}"></div>
          </div></details>
        <div class="field" style="margin-top:12px"><label>Megjegyzés</label><textarea name="notes" placeholder="Hogy érezted magad? Fájt valami?">${esc(log ? log.notes || '' : '')}</textarea></div>
        <div class="field"><label>Edzésfotó</label><input type="file" name="photo" accept="image/*">
          ${log && log.photo ? `<label class="row" style="margin-top:6px;font-weight:500"><input type="checkbox" name="removePhoto"> Meglévő fotó törlése</label>` : ''}</div>
      </form>`,
      foot: `<button class="btn" data-close>Mégse</button><button class="btn btn-primary" id="saveLog">Mentés</button>`,
    });
    const box = m.el.querySelector('#exBox');
    const form = m.el.querySelector('#logForm');

    const drawEx = () => {
      box.innerHTML = exercises.length ? exercises.map((ex, i) => `<div class="log-ex" data-i="${i}">
        <div class="row" style="margin-bottom:8px;flex-wrap:nowrap"><input list="exNames" data-name value="${esc(ex.name)}" placeholder="Gyakorlat neve" style="flex:1">
          <button type="button" class="btn btn-ghost btn-icon btn-sm" data-rmex aria-label="Gyakorlat törlése">${icon('trash')}</button></div>
        ${ex.target ? `<div class="tiny" style="margin-bottom:6px">Cél: ${esc(ex.target)} ismétlés</div>` : ''}
        <div class="set-row tiny"><span>#</span><span>Súly (kg)</span><span>Ismétlés</span><span></span></div>
        ${ex.sets.map((s, j) => `<div class="set-row" data-j="${j}"><span class="tiny">${j + 1}.</span>
          <input type="number" step="0.5" min="0" data-w value="${esc(s.weight)}" inputmode="decimal"><input type="number" min="0" data-r value="${esc(s.reps)}" inputmode="numeric">
          <button type="button" class="btn btn-ghost btn-icon btn-sm" data-rmset aria-label="Sorozat törlése">${icon('x')}</button></div>`).join('')}
        <button type="button" class="btn btn-sm btn-ghost" data-addset>${icon('plus')} Sorozat</button>
      </div>`).join('') : '<p class="muted">Adj hozzá gyakorlatot, vagy válassz tervezett napot a kitöltéshez.</p>';
    };
    // A beírt értékeket a DOM-ból visszaolvassuk az állapotba
    const sync = () => box.querySelectorAll('.log-ex').forEach((exEl) => {
      const ex = exercises[+exEl.dataset.i];
      ex.name = exEl.querySelector('[data-name]').value;
      exEl.querySelectorAll('.set-row[data-j]').forEach((r) => {
        ex.sets[+r.dataset.j] = { weight: r.querySelector('[data-w]').value, reps: r.querySelector('[data-r]').value };
      });
    });
    box.addEventListener('click', (e) => {
      const exEl = e.target.closest('.log-ex');
      if (!exEl) return;
      sync();
      const ex = exercises[+exEl.dataset.i];
      if (e.target.closest('[data-addset]')) {
        const last = ex.sets[ex.sets.length - 1];
        ex.sets.push({ weight: last ? last.weight : '', reps: last ? last.reps : '' });
      } else if (e.target.closest('[data-rmset]')) ex.sets.splice(+e.target.closest('.set-row').dataset.j, 1);
      else if (e.target.closest('[data-rmex]')) exercises.splice(+exEl.dataset.i, 1);
      else return;
      drawEx();
    });
    m.el.querySelector('#addEx').onclick = () => {
      sync();
      exercises.push({ name: '', sets: [{ weight: '', reps: '' }] });
      drawEx();
      box.querySelector('.log-ex:last-child [data-name]').focus();
    };
    form.querySelector('[name=plan_day]').addEventListener('change', (e) => {
      const d = planDays[+e.target.value];
      if (e.target.value === '' || !d) return;
      sync();
      if (!exercises.some((x) => x.name)) {
        exercises = d.exercises.map((x) => ({ name: x.name, sets: Array.from({ length: x.sets }, () => ({ weight: x.weight ?? '', reps: '' })), target: `${x.repsMin}–${x.repsMax}` }));
        drawEx();
      }
      const t = form.querySelector('[name=title]');
      if (!t.value) t.value = d.name;
    });
    drawEx();

    m.el.querySelector('#saveLog').onclick = (ev) => withLoading(ev.currentTarget, async () => {
      sync();
      const f = new FormData(form);
      const data = {
        date: f.get('date'), title: f.get('title') || 'Edzés', plan_day: f.get('plan_day'), duration_min: f.get('duration_min'),
        cardio_type: f.get('cardio_type'), cardio_min: f.get('cardio_min'), cardio_km: f.get('cardio_km'), cardio_kcal: f.get('cardio_kcal'),
        notes: f.get('notes'), removePhoto: f.get('removePhoto') === 'on',
        sets: exercises.filter((x) => x.name.trim()).flatMap((x) => x.sets.filter((s) => s.reps !== '' || s.weight !== '').map((s, j) => ({ exercise: x.name.trim(), set_no: j + 1, weight_kg: s.weight, reps: s.reps }))),
      };
      const body = new FormData();
      body.append('data', JSON.stringify(data));
      const photo = form.querySelector('[name=photo]').files[0];
      if (photo) body.append('photo', photo);
      try {
        await api(log ? `/logs/${log.id}` : '/logs', { method: log ? 'PUT' : 'POST', form: body });
        m.close();
        toast(log ? 'Edzés frissítve' : 'Edzés elmentve — a terved frissül a fejlődésed alapján');
        navigate('log');
      } catch (e) {
        toastError(e);
      }
    });
  }
}
