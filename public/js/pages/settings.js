// Beállítások: profil, téma, fiók, adatexport, fióktörlés
import { put, post, del } from '../api.js';
import { esc, icon, fmt, toast, toastError, withLoading, formData, modal } from '../ui.js';
import { setTheme, getTheme } from '../main.js';
import { basicsSection, trainingSection, goalSection, nutritionSection, bindProfileForm, profilePayload } from './profile-form.js';

export async function render(el, { store, refreshMe, refreshMeta, navigate }) {
  const p = store.me.profile;
  const theme = getTheme();
  el.innerHTML = `<div class="page">
    <div class="page-head"><div><h1>Beállítások</h1><p>Ha módosítod az edzési adataidat, a terv automatikusan frissül.</p></div></div>
    <div class="grid" style="grid-template-columns:minmax(0,1fr) 320px;align-items:start" id="setGrid">
      <form id="profileForm" class="stack">
        <div class="card"><h2>Személyes adatok</h2>${basicsSection(p)}</div>
        <div class="card"><h2>Cél</h2>${goalSection(p, store.meta)}</div>
        <div class="card"><h2>Edzés</h2>${trainingSection(p, store.meta)}</div>
        <div class="card"><h2>Táplálkozás</h2>${nutritionSection(p, store.meta)}
          ${p.kcal_adjust ? `<p class="tiny">Az adaptív motor által elfogadott korrekció: ${p.kcal_adjust > 0 ? '+' : ''}${fmt(p.kcal_adjust)} kcal/nap. <a href="#" id="resetAdj">Visszaállítás</a></p>` : ''}</div>
        <div class="row" style="justify-content:flex-end"><button class="btn btn-primary" id="saveProfile">Profil mentése</button></div>
      </form>
      <div class="stack">
        <div class="card"><h2>Megjelenés</h2><div class="chips">
          ${[['light', 'Világos', 'sun'], ['dark', 'Sötét', 'moon'], ['system', 'Rendszer', 'settings']].map(([k, l, ic]) => `<label class="chip"><input type="radio" name="theme" value="${k}" ${theme === k ? 'checked' : ''}><span>${icon(ic)} ${l}</span></label>`).join('')}
        </div></div>
        <div class="card"><h2>AI</h2><p class="muted" style="margin:0">${store.me.aiEnabled ? `Bekapcsolva — modell: <span class="kbd">${esc(store.me.aiModel)}</span>` : 'Kikapcsolva: a beépített, szabályalapú motor működik. Az <span class="kbd">ANTHROPIC_API_KEY</span> beállításával kapcsolható be (lásd README).'}</p></div>
        <div class="card"><h2>Fiók</h2>
          <form id="nameForm" class="field"><label>Név</label><div class="row" style="flex-wrap:nowrap"><input name="name" value="${esc(store.me.user.name)}"><button class="btn">Mentés</button></div></form>
          <p class="tiny">E-mail: ${esc(store.me.user.email)}</p>
          <form id="pwForm"><div class="field"><label>Jelenlegi jelszó</label><input type="password" name="current" autocomplete="current-password"></div>
            <div class="field"><label>Új jelszó</label><input type="password" name="next" minlength="8" autocomplete="new-password"></div>
            <button class="btn" style="width:100%">Jelszó módosítása</button></form>
          <hr>
          <a class="btn" style="width:100%" href="/api/account/export" download>${icon('download')} Adataim letöltése (JSON)</a>
          <button class="btn btn-danger" style="width:100%;margin-top:8px" id="delAccount">${icon('trash')} Fiók törlése</button>
        </div>
      </div>
    </div></div>`;
  if (window.innerWidth < 980) el.querySelector('#setGrid').style.gridTemplateColumns = 'minmax(0,1fr)';

  const form = el.querySelector('#profileForm');
  bindProfileForm(form);
  form.onsubmit = (e) => {
    e.preventDefault();
    withLoading(el.querySelector('#saveProfile'), async () => {
      try {
        const r = await put('/profile', profilePayload(formData(form)));
        await refreshMe();
        await refreshMeta();
        toast(r.planRegenerated ? `Profil mentve — új edzésterv készült. Napi cél: ${fmt(r.targets.kcal)} kcal` : `Profil mentve. Napi cél: ${fmt(r.targets.kcal)} kcal`);
        if (r.aiError) toast(`AI hiba: ${r.aiError}`, 'error');
      } catch (err) {
        toastError(err);
      }
    });
  };
  const resetAdj = el.querySelector('#resetAdj');
  if (resetAdj) resetAdj.onclick = async (e) => {
    e.preventDefault();
    try {
      await post('/insights/apply', { type: 'kcal_adjust', delta: -p.kcal_adjust });
      await refreshMe();
      navigate('settings');
    } catch (err) {
      toastError(err);
    }
  };
  el.querySelectorAll('input[name=theme]').forEach((r) => r.addEventListener('change', () => setTheme(r.value)));

  const nf = el.querySelector('#nameForm');
  nf.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await put('/account/name', { name: nf.elements.namedItem('name').value });
      await refreshMe();
      toast('Név frissítve');
      navigate('settings');
    } catch (err) {
      toastError(err);
    }
  };
  const pw = el.querySelector('#pwForm');
  pw.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await put('/account/password', formData(pw));
      pw.reset();
      toast('Jelszó módosítva');
    } catch (err) {
      toastError(err);
    }
  };
  el.querySelector('#delAccount').onclick = () => {
    const m = modal({
      title: 'Fiók végleges törlése',
      body: '<p>Minden adatod (profil, edzések, étrendek, fotók) véglegesen törlődik. Ez nem vonható vissza.</p><div class="field"><label>Jelszó a megerősítéshez</label><input type="password" id="delPw"></div>',
      foot: '<button class="btn" data-close>Mégse</button><button class="btn btn-danger" id="doDel">Végleges törlés</button>',
    });
    m.el.querySelector('#doDel').onclick = (e) => withLoading(e.currentTarget, async () => {
      try {
        await del('/account', { password: m.el.querySelector('#delPw').value });
        m.close();
        location.hash = '#/login';
        location.reload();
      } catch (err) {
        toastError(err);
      }
    });
  };
}
