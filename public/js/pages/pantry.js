// Alapanyagok: mi van otthon, mit tudok rendszeresen beszerezni (kézzel vagy fotóról)
import { api, get, post, put, del } from '../api.js';
import { esc, icon, fmt, toast, toastError, withLoading, modal, emptyState, today } from '../ui.js';

const CAT = { protein: 'Fehérje', carb: 'Szénhidrát', fruit: 'Gyümölcs', fat: 'Zsír', veg: 'Zöldség' };

export async function render(el, { store, navigate }) {
  const { items } = await get('/pantry');
  const home = items.filter((i) => i.availability === 'home');
  const buy = items.filter((i) => i.availability === 'buyable');
  const have = new Set(items.map((i) => i.food_key).filter(Boolean));
  const quick = store.meta.foods.filter((f) => !have.has(f.key)).slice(0, 60);

  const itemRow = (i) => `<div class="list-item">
    <div class="grow"><div style="font-weight:600">${esc(i.name)} ${i.food_key ? '' : '<span class="badge">egyedi</span>'}</div>
      <div class="tiny">${i.cat ? `${CAT[i.cat]} · ` : ''}${i.per100 ? `${fmt(i.per100.kcal)} kcal, F ${fmt(i.per100.protein, 1)} g / 100 g` : 'tápérték ismeretlen — nem kerül az étrendbe'}</div></div>
    <input type="number" min="0" step="50" value="${i.quantity_g ?? ''}" placeholder="g" data-qty="${i.id}" aria-label="Mennyiség grammban" style="width:84px;padding:6px 8px">
    <button class="btn btn-ghost btn-icon btn-sm" data-move="${i.id}" data-to="${i.availability === 'home' ? 'buyable' : 'home'}" title="${i.availability === 'home' ? 'Elfogyott — csak beszerezhető' : 'Otthon van'}" aria-label="Áthelyezés">${icon('swap')}</button>
    <button class="btn btn-ghost btn-icon btn-sm" data-del="${i.id}" aria-label="Törlés">${icon('trash')}</button>
  </div>`;

  el.innerHTML = `<div class="page">
    <div class="page-head"><div><h1>Alapanyagok</h1><p>Frissítsd naponta — az étrend mindig ehhez igazodik.</p></div>
      <div class="actions"><button class="btn" id="photo">${icon('camera')} Felismerés fotóról</button><button class="btn btn-primary" id="whatToEat">${icon('meal')} Mit egyek ma?</button></div></div>

    <div class="card" style="margin-bottom:16px">
      <form id="quickAdd" class="row" style="flex-wrap:nowrap;align-items:stretch">
        <input name="names" placeholder="Írd be vesszővel elválasztva: tojás, rizs, tonhal, banán…" style="flex:1" required>
        <select name="availability" style="width:auto"><option value="home">Otthon van</option><option value="buyable">Beszerezhető</option></select>
        <button class="btn btn-primary">${icon('plus')}<span class="hide-sm">Hozzáadás</span></button>
      </form>
      <details class="more"><summary>Gyors választás az adatbázisból</summary><div class="chips" style="margin-top:10px">${quick.map((f) => `<button class="btn btn-sm" data-quick="${f.key}">${esc(f.name)}</button>`).join('')}</div></details>
      <details class="more"><summary>Egyedi alapanyag saját tápértékkel</summary>
        <form id="customAdd" style="margin-top:10px"><div class="form-grid">
          <div class="field"><label>Név</label><input name="name" required placeholder="pl. Fehérjeszelet"></div>
          <div class="field"><label>kcal / 100 g</label><input name="kcal" type="number" min="0" required></div>
          <div class="field"><label>Fehérje / 100 g</label><input name="protein" type="number" min="0" step="0.1" required></div>
          <div class="field"><label>Szénhidrát / 100 g</label><input name="carbs" type="number" min="0" step="0.1" required></div>
          <div class="field"><label>Zsír / 100 g</label><input name="fat" type="number" min="0" step="0.1" required></div>
          <div class="field"><label>Elérhetőség</label><select name="availability"><option value="home">Otthon van</option><option value="buyable">Beszerezhető</option></select></div>
        </div><button class="btn">Mentés</button></form></details>
    </div>

    <div class="grid g2">
      <div class="card"><div class="card-head"><h2>Otthon van</h2><span class="badge green">${home.length}</span></div>
        ${home.length ? `<div class="list">${home.map(itemRow).join('')}</div>` : emptyState('basket', 'Nincs megadva', 'Add meg, mi van most otthon — a „Mit egyek ma?” ebből tervez.')}</div>
      <div class="card"><div class="card-head"><h2>Rendszeresen beszerezhető</h2><span class="badge">${buy.length}</span></div>
        ${buy.length ? `<div class="list">${buy.map(itemRow).join('')}</div>` : emptyState('cart', 'Nincs megadva', 'Amit általában meg tudsz venni — a heti étrend ezekből válogat.')}</div>
    </div>
    <p class="tiny" style="margin-top:12px">A mennyiség megadása nem kötelező; ha megadod, a bevásárlólista levonja az otthoni készletet.</p>
  </div>`;

  const reload = () => navigate('pantry');
  const add = async (list) => {
    try {
      const r = await post('/pantry', { items: list });
      const unknown = r.added.filter((a) => a.matched === false);
      toast(`${r.added.length} alapanyag mentve${unknown.length ? ` (${unknown.map((u) => u.name).join(', ')}: ismeretlen, adj meg tápértéket)` : ''}`);
      reload();
    } catch (e) {
      toastError(e);
    }
  };

  const qf = el.querySelector('#quickAdd');
  qf.onsubmit = (e) => {
    e.preventDefault();
    const names = qf.names.value.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    add(names.map((name) => ({ name, availability: qf.availability.value })));
  };
  const cf = el.querySelector('#customAdd');
  cf.onsubmit = (e) => {
    e.preventDefault();
    add([{ name: cf.elements.namedItem('name').value, kcal: cf.kcal.value, protein: cf.protein.value, carbs: cf.carbs.value, fat: cf.fat.value, availability: cf.availability.value }]);
  };
  el.querySelectorAll('[data-quick]').forEach((b) => b.addEventListener('click', () => {
    const f = store.meta.foods.find((x) => x.key === b.dataset.quick);
    add([{ name: f.name, food_key: f.key, availability: qf.availability.value }]);
  }));
  el.querySelectorAll('[data-qty]').forEach((inp) => inp.addEventListener('change', async () => {
    try {
      await put(`/pantry/${inp.dataset.qty}`, { quantity_g: inp.value });
      toast('Mennyiség mentve');
    } catch (e) {
      toastError(e);
    }
  }));
  el.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await put(`/pantry/${b.dataset.move}`, { availability: b.dataset.to });
      reload();
    } catch (e) {
      toastError(e);
    }
  }));
  el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await del(`/pantry/${b.dataset.del}`);
      reload();
    } catch (e) {
      toastError(e);
    }
  }));
  el.querySelector('#whatToEat').onclick = (e) => withLoading(e.currentTarget, async () => {
    try {
      await post(`/meals/${today()}/generate`, { onlyAvailable: true });
      navigate('meals');
    } catch (err) {
      toastError(err);
    }
  });

  // ── Fotó alapú felismerés ─────────────────────────────────────────────
  el.querySelector('#photo').onclick = () => {
    const m = modal({
      title: 'Alapanyagok felismerése fotóról',
      body: store.me.aiEnabled
        ? `<p class="muted">Fotózd le a hűtőt, a kamrát vagy a bevásárlást. Az AI felismeri az alapanyagokat, te pedig jóváhagyod őket.</p>
           <input type="file" accept="image/*" capture="environment" id="pic"><div id="recResult" style="margin-top:14px"></div>`
        : `<p>A képfelismeréshez Claude AI szükséges. Állítsd be az <span class="kbd">ANTHROPIC_API_KEY</span> környezeti változót a szerveren (lásd README), majd indítsd újra.</p><p class="muted">Addig a fenti mezőben gyorsan, vesszővel elválasztva is felviheted az alapanyagokat.</p>`,
    });
    const pic = m.el.querySelector('#pic');
    if (!pic) return;
    pic.onchange = async () => {
      const out = m.el.querySelector('#recResult');
      out.innerHTML = '<p class="muted">Elemzés folyamatban…</p>';
      const fd = new FormData();
      fd.append('photo', pic.files[0]);
      try {
        const r = await api('/pantry/recognize', { method: 'POST', form: fd });
        if (!r.items.length) {
          out.innerHTML = '<p class="muted">Nem találtam élelmiszert a képen.</p>';
          return;
        }
        out.innerHTML = `<div class="list">${r.items.map((it, i) => `<label class="list-item" style="margin:0;font-weight:500;color:var(--text)"><input type="checkbox" checked data-rec="${i}">
          <div class="grow"><b>${esc(it.name)}</b>${it.food_key ? '' : ' <span class="badge orange">ismeretlen</span>'}<div class="tiny">Felismerve: ${esc(it.detected)}</div></div>
          <input type="number" min="0" value="${it.quantity_g ?? ''}" placeholder="g" data-recq="${i}" style="width:84px;padding:6px 8px"></label>`).join('')}</div>
          <button class="btn btn-primary" id="saveRec" style="margin-top:12px;width:100%">Kijelöltek hozzáadása (otthon van)</button>`;
        out.querySelector('#saveRec').onclick = (e) => withLoading(e.currentTarget, async () => {
          const list = r.items.map((it, i) => ({ ...it, quantity_g: out.querySelector(`[data-recq="${i}"]`).value, availability: 'home' }))
            .filter((_, i) => out.querySelector(`[data-rec="${i}"]`).checked);
          m.close();
          await add(list);
        });
      } catch (e) {
        out.innerHTML = '';
        toastError(e);
      }
    };
  };
}
