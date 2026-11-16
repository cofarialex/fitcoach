// Étrend: napi terv, "Mit egyek ma?", étkezések jelölése, heti terv és bevásárlólista
import { get, post, put, del } from '../api.js';
import { esc, icon, fmt, ft, toast, toastError, withLoading, modal, confirmDialog, emptyState, relDay, huDate, today, addDays, weekStart, macroBar, ring } from '../ui.js';

const STATUS = { eaten: ['Megettem', 'green'], skipped: ['Kihagyva', 'orange'], replaced: ['Mást ettem', 'blue'] };

export async function render(el, { store, params }) {
  let tab = params.tab || 'day';
  let date = params.date || today();
  let state = null;

  const shell = () => {
    el.innerHTML = `<div class="page">
      <div class="page-head"><div><h1>Étrend</h1><p>Mindig a céljaidhoz és a ténylegesen elérhető alapanyagaidhoz igazítva.</p></div>
        <div class="tabs" role="tablist"><button data-tab="day" class="${tab === 'day' ? 'active' : ''}">Napi terv</button><button data-tab="week" class="${tab === 'week' ? 'active' : ''}">Heti terv</button><button data-tab="shop" class="${tab === 'shop' ? 'active' : ''}">Bevásárlólista</button></div></div>
      <div id="tabBody"><div class="spinner-page">Betöltés…</div></div></div>`;
    el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
      tab = b.dataset.tab;
      shell();
    }));
    const body = el.querySelector('#tabBody');
    (tab === 'day' ? loadDay : tab === 'week' ? drawWeek : drawShop)(body).catch(toastError);
  };

  // ═══ NAPI NÉZET ═══════════════════════════════════════════════════════
  async function loadDay(body) {
    state = await get(`/meals/${date}`);
    drawDay(body);
  }

  function drawDay(body) {
    const { plan, consumed: c, targets: t, log } = state;
    const P = plan && plan.data;
    const pt = P ? P.targets : t;
    body.innerHTML = `
      <div class="row between" style="margin-bottom:16px">
        <div class="row"><button class="btn btn-icon" id="prev" aria-label="Előző nap">${icon('arrowLeft')}</button>
          <b style="min-width:150px;text-align:center">${esc(relDay(date))}${date === today() ? '' : ''}<div class="tiny">${esc(huDate(date, { weekday: true }))}</div></b>
          <button class="btn btn-icon" id="next" aria-label="Következő nap">${icon('arrowRight')}</button>
          ${date !== today() ? '<button class="btn btn-sm btn-ghost" id="todayBtn">Ma</button>' : ''}</div>
        <div class="actions">
          <button class="btn" id="whatToEat" title="Csak az otthon lévő alapanyagokból">${icon('basket')} Mit egyek ma?</button>
          <button class="btn btn-primary" id="gen">${icon(store.me.aiEnabled ? 'sparkle' : 'refresh')} ${P ? 'Új étrend' : 'Étrend készítése'}</button>
        </div>
      </div>

      <div class="grid" style="grid-template-columns:minmax(0,1fr) 330px;align-items:start" id="mealGrid">
        <div>
          ${P ? `${P.missing && P.missing.length ? `<div class="insight warn" style="margin-bottom:14px"><i class="dot"></i><div><b>Beszerzendő alapanyagok</b><p>${esc(P.missing.join(', '))} — nincs a listádon. Cseréld le őket a helyettesítők közül, vagy add hozzá a bevásárlólistához.</p></div></div>` : ''}
            ${P.meals.map((m, i) => mealCard(m, i)).join('')}`
            : `<div class="card">${emptyState('meal', 'Erre a napra még nincs étrend', 'Az étrend a napi célodhoz és az alapanyagaidhoz igazodik. A „Mit egyek ma?” csak az otthon lévő alapanyagokból tervez.')}</div>`}
        </div>
        <div class="stack">
          <div class="card">
            <h2>Napi összesítő</h2>
            <div class="row" style="justify-content:center;margin:6px 0 14px">${ring(c.kcal, pt.kcal, { label: fmt(c.kcal), sub: `/ ${fmt(pt.kcal)} kcal` })}</div>
            ${macroBar('Fehérje', c.protein, pt.protein, 'var(--c-protein)')}
            ${macroBar('Szénhidrát', c.carbs, pt.carbs, 'var(--c-carbs)')}
            ${macroBar('Zsír', c.fat, pt.fat, 'var(--c-fat)')}
            ${P ? `<p class="tiny" style="margin:6px 0 0">Tervezett összesen: ${fmt(P.totals.kcal)} kcal · F ${fmt(P.totals.protein)} g · Sz ${fmt(P.totals.carbs)} g · Zs ${fmt(P.totals.fat)} g · kb. ${ft(P.price)}</p>
              ${P.meals.some((m) => m.status !== 'planned') && P.meals.some((m) => m.status === 'planned') ? `<button class="btn btn-sm btn-accent" style="margin-top:12px;width:100%" id="rebalance">${icon('refresh')} Hátralévő étkezések igazítása</button><p class="tiny" style="margin:6px 0 0">A még el nem fogyasztott étkezések adagjait a maradék napi kerethez igazítja.</p>` : ''}` : ''}
          </div>
          <div class="card">
            <div class="card-head"><h2>Elfogyasztott</h2><button class="btn btn-sm" id="addFood">${icon('plus')} Étel</button></div>
            ${log.length ? `<div class="list">${log.map((f) => `<div class="list-item"><div class="grow"><div class="ellipsis" style="font-weight:600;font-size:.9rem">${esc(f.name)}</div>
              <div class="tiny">${f.grams ? `${fmt(f.grams)} g · ` : ''}${fmt(f.kcal)} kcal · F ${fmt(f.protein)} g</div></div>
              <button class="btn btn-ghost btn-icon btn-sm" data-delfood="${f.id}" aria-label="Törlés">${icon('trash')}</button></div>`).join('')}</div>`
              : '<p class="muted" style="margin:0">Jelöld meg az étkezéseket „Megettem”-ként, vagy adj hozzá bármit, amit ettél.</p>'}
          </div>
        </div>
      </div>`;

    if (window.innerWidth < 980) body.querySelector('#mealGrid').style.gridTemplateColumns = 'minmax(0,1fr)';
    const go = (d) => {
      date = d;
      loadDay(body).catch(toastError);
    };
    body.querySelector('#prev').onclick = () => go(addDays(date, -1));
    body.querySelector('#next').onclick = () => go(addDays(date, 1));
    const tb = body.querySelector('#todayBtn');
    if (tb) tb.onclick = () => go(today());
    body.querySelector('#gen').onclick = (e) => generate(e.currentTarget, false, body);
    body.querySelector('#whatToEat').onclick = (e) => generate(e.currentTarget, true, body);
    body.querySelector('#addFood').onclick = () => openFoodEntry(null, body);
    const rb = body.querySelector('#rebalance');
    if (rb) rb.onclick = () => withLoading(rb, async () => {
      try {
        state = await post(`/meals/${date}/rebalance`);
        toast('A hátralévő étkezések az új kerethez igazítva');
        drawDay(body);
      } catch (e) {
        toastError(e);
      }
    });
    body.querySelectorAll('[data-delfood]').forEach((b) => b.addEventListener('click', async () => {
      try {
        state = await del(`/food-log/${b.dataset.delfood}`);
        drawDay(body);
      } catch (e) {
        toastError(e);
      }
    }));
    body.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', () => withLoading(b, async () => {
      try {
        state = await post(`/meals/${date}/meal/${b.dataset.i}/status`, { status: b.dataset.status });
        drawDay(body);
      } catch (e) {
        toastError(e);
      }
    })));
    body.querySelectorAll('[data-other]').forEach((b) => b.addEventListener('click', () => openFoodEntry(+b.dataset.other, body)));
    body.querySelectorAll('[data-regen]').forEach((b) => b.addEventListener('click', () => withLoading(b, async () => {
      try {
        state = await post(`/meals/${date}/meal/${b.dataset.regen}/regenerate`);
        drawDay(body);
      } catch (e) {
        toastError(e);
      }
    })));
    body.querySelectorAll('[data-sub]').forEach((b) => b.addEventListener('click', () => withLoading(b, async () => {
      try {
        state = await post(`/meals/${date}/meal/${b.dataset.i}/swap`, { from: b.dataset.from, to: b.dataset.sub });
        toast('Alapanyag lecserélve');
        drawDay(body);
      } catch (e) {
        toastError(e);
      }
    })));
  }

  function mealCard(m, i) {
    const st = STATUS[m.status];
    const done = m.status !== 'planned';
    return `<div class="meal ${esc(m.status)}">
      <div class="meal-head">
        <div style="min-width:0;flex:1"><div class="meal-slot">${esc(m.slotName)} ${st ? `<span class="badge ${st[1]}">${st[0]}</span>` : ''} ${m.rebalanced ? '<span class="badge">igazítva</span>' : ''}</div>
          <div class="meal-title">${esc(m.title)}</div></div>
        <div class="macro-pills"><span>${fmt(m.totals.kcal)} kcal</span><span class="p">F ${fmt(m.totals.protein)}</span><span class="c">Sz ${fmt(m.totals.carbs)}</span><span class="f">Zs ${fmt(m.totals.fat)}</span></div>
      </div>
      <ul class="ingredients">${m.items.map((it) => `<li><span>${esc(it.name)} ${it.avail === 'home' ? '<span class="badge green">otthon</span>' : it.avail === 'buyable' ? '<span class="badge">beszerezhető</span>' : '<span class="badge orange">beszerzendő</span>'}</span>
        <span style="white-space:nowrap;font-weight:600">${esc(it.amount)} <span class="tiny">· ${fmt(it.kcal)} kcal</span></span></li>`).join('')}</ul>
      <details class="more"><summary>Elkészítés (~${m.prepMinutes} perc) · kb. ${ft(m.price)}</summary><ol class="steps" style="margin-top:8px">${m.prep.map((p) => `<li>${esc(p)}</li>`).join('')}</ol></details>
      ${m.substitutes && m.substitutes.length ? `<details class="more"><summary>Helyettesítő alapanyagok</summary>${m.substitutes.map((s) => `<div style="margin-top:10px"><div class="tiny" style="margin-bottom:5px">${esc(s.forName)} helyett:</div><div class="chips">${s.options.map((o) => `<button class="btn btn-sm" data-i="${i}" data-from="${esc(s.for)}" data-sub="${esc(o.key)}">${esc(o.name)} · ${esc(o.amount)}${o.avail === 'home' ? ' ✓' : ''}</button>`).join('')}</div></div>`).join('')}</details>` : ''}
      <div class="row" style="margin-top:14px">
        ${done ? `<button class="btn btn-sm" data-status="planned" data-i="${i}">Visszaállítás</button>` : `
          <button class="btn btn-sm btn-accent" data-status="eaten" data-i="${i}">${icon('check')} Megettem</button>
          <button class="btn btn-sm" data-other="${i}">Mást ettem</button>
          <button class="btn btn-sm" data-status="skipped" data-i="${i}">Kihagytam</button>
          <button class="btn btn-sm btn-ghost" data-regen="${i}">${icon('refresh')} Másik étel</button>`}
      </div>
    </div>`;
  }

  async function generate(btn, onlyAvailable, body) {
    if (state.plan && state.plan.data.meals.some((m) => m.status !== 'planned') && !(await confirmDialog('Már jelöltél meg étkezést erre a napra. Új tervet készítsek? (Az elfogyasztott ételek megmaradnak a naplóban.)', { okText: 'Új terv' }))) return;
    await withLoading(btn, async () => {
      try {
        state = await post(`/meals/${date}/generate`, { onlyAvailable });
        if (state.aiError) toast(`AI hiba, a beépített motor tervezett: ${state.aiError}`, 'error');
        else toast(onlyAvailable ? 'Terv az otthoni alapanyagaidból' : 'Új étrend elkészült');
        drawDay(body);
      } catch (e) {
        toastError(e);
      }
    });
  }

  // "Mást ettem" / étel hozzáadása: adatbázisból grammal, vagy egyedi tápértékkel
  function openFoodEntry(replaceMeal, body) {
    const foods = store.meta.foods;
    const meal = replaceMeal !== null && state.plan ? state.plan.data.meals[replaceMeal] : null;
    const m = modal({
      title: meal ? `${meal.slotName}: mást ettem` : 'Elfogyasztott étel hozzáadása',
      body: `<form id="foodForm">
        <div class="tabs" style="margin-bottom:14px"><button type="button" class="active" data-mode="db">Adatbázisból</button><button type="button" data-mode="custom">Saját érték</button></div>
        <div data-pane="db"><div class="form-grid">
          <div class="field"><label>Élelmiszer</label><select name="food_key">${foods.map((f) => `<option value="${f.key}">${esc(f.name)}</option>`).join('')}</select></div>
          <div class="field"><label>Mennyiség (g)</label><input name="grams" type="number" min="1" value="100"></div></div>
          <p class="tiny" id="preview"></p></div>
        <div data-pane="custom" hidden><div class="field"><label>Megnevezés</label><input name="name" placeholder="pl. Gyros tál"></div>
          <div class="form-grid"><div class="field"><label>Kalória (kcal)</label><input name="kcal" type="number" min="0"></div>
          <div class="field"><label>Fehérje (g)</label><input name="protein" type="number" min="0"></div>
          <div class="field"><label>Szénhidrát (g)</label><input name="carbs" type="number" min="0"></div>
          <div class="field"><label>Zsír (g)</label><input name="fat" type="number" min="0"></div></div>
          <p class="tiny">Tipp: ha nem tudod pontosan, becsülj — a terv így is jól igazodik.</p></div>
      </form>`,
      foot: '<button class="btn" data-close>Mégse</button><button class="btn btn-primary" id="saveFood">Hozzáadás</button>',
    });
    let mode = 'db';
    const form = m.el.querySelector('#foodForm');
    const preview = () => {
      const f = foods.find((x) => x.key === form.food_key.value);
      const g = +form.grams.value || 0;
      m.el.querySelector('#preview').textContent = f ? `${fmt((f.kcal * g) / 100)} kcal · F ${fmt((f.protein * g) / 100, 1)} g · Sz ${fmt((f.carbs * g) / 100, 1)} g · Zs ${fmt((f.fat * g) / 100, 1)} g` : '';
    };
    form.food_key.onchange = preview;
    form.grams.oninput = preview;
    preview();
    m.el.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      mode = b.dataset.mode;
      m.el.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('active', x === b));
      m.el.querySelectorAll('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== mode));
    }));
    m.el.querySelector('#saveFood').onclick = (ev) => withLoading(ev.currentTarget, async () => {
      const payload = mode === 'db'
        ? { food_key: form.food_key.value, grams: form.grams.value }
        : { name: form.elements.namedItem('name').value, kcal: form.kcal.value, protein: form.protein.value, carbs: form.carbs.value, fat: form.fat.value };
      try {
        state = await post('/food-log', { ...payload, date, slot: meal ? meal.slot : null, replaceMeal: meal ? replaceMeal : null });
        m.close();
        toast(meal ? 'Rögzítve — igazítsd a hátralévő étkezéseket, ha szeretnéd' : 'Hozzáadva');
        drawDay(body);
      } catch (e) {
        toastError(e);
      }
    });
  }

  // ═══ HETI NÉZET ═══════════════════════════════════════════════════════
  async function drawWeek(body) {
    const start = weekStart(date);
    const { plans } = await get(`/meals-range?start=${start}`);
    const byDate = new Map(plans.map((p) => [p.date, p.data]));
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    body.innerHTML = `
      <div class="row between" style="margin-bottom:16px">
        <div class="row"><button class="btn btn-icon" id="wprev" aria-label="Előző hét">${icon('arrowLeft')}</button><b>${esc(huDate(start))} – ${esc(huDate(addDays(start, 6)))}</b><button class="btn btn-icon" id="wnext" aria-label="Következő hét">${icon('arrowRight')}</button></div>
        <div class="actions"><button class="btn" id="weekOver">${icon('refresh')} Teljes hét újratervezése</button><button class="btn btn-primary" id="weekGen">${icon('calendar')} Hiányzó napok + bevásárlólista</button></div>
      </div>
      <div class="grid g3">${days.map((d) => {
        const p = byDate.get(d);
        return `<div class="card"><div class="card-head"><div><h3 style="margin:0">${esc(relDay(d))}</h3><span class="tiny">${esc(huDate(d))}</span></div>
          ${p ? `<span class="badge green">${fmt(p.totals.kcal)} kcal</span>` : '<span class="badge">nincs terv</span>'}</div>
          ${p ? `<ul class="steps" style="padding-left:16px">${p.meals.map((m) => `<li><b>${esc(m.slotName)}:</b> ${esc(m.title)}</li>`).join('')}</ul>` : '<p class="muted">—</p>'}
          <button class="btn btn-sm" data-open="${d}" style="margin-top:8px">Megnyitás</button></div>`;
      }).join('')}</div>`;
    const move = (n) => {
      date = addDays(start, n);
      drawWeek(body).catch(toastError);
    };
    body.querySelector('#wprev').onclick = () => move(-7);
    body.querySelector('#wnext').onclick = () => move(7);
    body.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => {
      date = b.dataset.open;
      tab = 'day';
      shell();
    }));
    const weekGen = async (btn, overwrite) => {
      if (overwrite && !(await confirmDialog('A hét összes napjára új étrendet készítek. Folytatod?', { okText: 'Újratervezés' }))) return;
      await withLoading(btn, async () => {
        try {
          const r = await post('/meals/week', { start, overwrite });
          toast(`${r.created} nap megtervezve · bevásárlólista: ${r.shopping.count} tétel`);
          drawWeek(body).catch(toastError);
        } catch (e) {
          toastError(e);
        }
      });
    };
    body.querySelector('#weekGen').onclick = (e) => weekGen(e.currentTarget, false);
    body.querySelector('#weekOver').onclick = (e) => weekGen(e.currentTarget, true);
  }

  // ═══ BEVÁSÁRLÓLISTA ═══════════════════════════════════════════════════
  async function drawShop(body) {
    const { items } = await get('/shopping');
    const total = items.filter((i) => !i.checked).reduce((s, i) => s + (i.est_price || 0), 0);
    const checked = items.filter((i) => i.checked).length;
    body.innerHTML = `
      <div class="grid" style="grid-template-columns:minmax(0,1fr) 320px;align-items:start" id="shopGrid">
        <div class="card">
          <div class="card-head"><h2>Bevásárlólista</h2><span class="badge">${items.length - checked} tétel · kb. ${ft(total)}</span></div>
          ${items.length ? `<div class="list">${items.map((i) => `<div class="list-item" style="${i.checked ? 'opacity:.55' : ''}">
            <input type="checkbox" data-check="${i.id}" ${i.checked ? 'checked' : ''} aria-label="Megvettem" style="width:20px;height:20px">
            <div class="grow"><div style="font-weight:600;${i.checked ? 'text-decoration:line-through' : ''}">${esc(i.name)}</div>
              <div class="tiny ellipsis">${i.for_meals ? esc(i.for_meals) : i.custom ? 'saját tétel' : ''}</div></div>
            <div style="text-align:right;white-space:nowrap"><b>${i.quantity_g ? `${fmt(i.quantity_g)} g` : ''}</b><div class="tiny">${i.est_price != null ? `~${ft(i.est_price)}` : ''}</div></div>
            <button class="btn btn-ghost btn-icon btn-sm" data-delshop="${i.id}" aria-label="Törlés">${icon('x')}</button></div>`).join('')}</div>`
            : emptyState('cart', 'A lista üres', 'Készíts heti étrendet, és a hiányzó alapanyagok automatikusan ide kerülnek.')}
        </div>
        <div class="stack">
          <div class="card"><h3>Lista frissítése</h3><p class="tiny">A következő 7 nap étrendjéből számolja ki, mit kell megvenni — figyelembe véve, mi van otthon.</p>
            <button class="btn btn-primary" style="width:100%" id="regenShop">${icon('refresh')} Generálás az étrendből</button></div>
          <div class="card"><h3>Saját tétel</h3><form id="addShop"><div class="field"><input name="name" placeholder="pl. mosogatószer, kávé" required></div>
            <div class="form-grid"><div class="field"><input name="quantity_g" type="number" min="0" placeholder="gramm"></div><div class="field"><input name="est_price" type="number" min="0" placeholder="ár (Ft)"></div></div>
            <button class="btn" style="width:100%">${icon('plus')} Hozzáadás</button></form></div>
          ${checked ? `<div class="card"><h3>Megvásárolva: ${checked} tétel</h3><p class="tiny">Tedd át őket az otthoni alapanyagok közé, hogy a következő étrend már ezekkel számoljon.</p>
            <button class="btn btn-accent" style="width:100%" id="toPantry">${icon('basket')} Áthelyezés az alapanyagokhoz</button></div>` : ''}
        </div>
      </div>`;
    if (window.innerWidth < 980) body.querySelector('#shopGrid').style.gridTemplateColumns = 'minmax(0,1fr)';
    const reload = () => drawShop(body).catch(toastError);
    body.querySelectorAll('[data-check]').forEach((c) => c.addEventListener('change', async () => {
      try {
        await put(`/shopping/${c.dataset.check}`, { checked: c.checked });
        reload();
      } catch (e) {
        toastError(e);
      }
    }));
    body.querySelectorAll('[data-delshop]').forEach((b) => b.addEventListener('click', async () => {
      await del(`/shopping/${b.dataset.delshop}`).catch(toastError);
      reload();
    }));
    body.querySelector('#regenShop').onclick = (e) => withLoading(e.currentTarget, async () => {
      try {
        const r = await post('/shopping/generate', { start: today(), days: 7 });
        toast(r.days ? `${r.days} nap étrendjéből ${r.count} tétel` : 'Nincs étrend a következő 7 napra — készíts heti tervet!', r.days ? 'ok' : 'error');
        reload();
      } catch (err) {
        toastError(err);
      }
    });
    const f = body.querySelector('#addShop');
    f.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await post('/shopping', { name: f.elements.namedItem('name').value, quantity_g: f.quantity_g.value, est_price: f.est_price.value });
        reload();
      } catch (err) {
        toastError(err);
      }
    };
    const tp = body.querySelector('#toPantry');
    if (tp) tp.onclick = () => withLoading(tp, async () => {
      try {
        const r = await post('/shopping/checked-to-pantry');
        toast(`${r.moved} tétel az alapanyagok közé került`);
        reload();
      } catch (err) {
        toastError(err);
      }
    });
  }

  shell();
}
