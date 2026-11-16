// Első belépés: többlépéses kérdőív a személyre szabáshoz
import { put } from '../api.js';
import { esc, toast, toastError, withLoading, formData } from '../ui.js';
import { basicsSection, trainingSection, goalSection, nutritionSection, bindProfileForm, profilePayload } from './profile-form.js';

const STEPS = [
  { title: 'Alapadatok', text: 'Ezekből számoljuk ki az energiaszükségletedet.', html: (p) => basicsSection(p) },
  { title: 'Edzési lehetőségek', text: 'Hányszor, mennyi ideig és hol tudsz edzeni?', html: (p, m) => trainingSection(p, m) },
  { title: 'Mi a fő célod?', text: 'Ehhez igazítjuk az edzés- és étrendtervet.', html: (p, m) => goalSection(p, m) },
  { title: 'Étkezési szokások', text: 'Az étrend mindig ehhez és az otthon lévő alapanyagokhoz igazodik.', html: (p, m) => nutritionSection(p, m) },
];

export function render(root, { store, onDone }) {
  const p = store.me.profile || {};
  let step = 0;
  root.innerHTML = `<div class="wizard">
    <div class="brand" style="padding:0">Fit<b>Coach</b></div>
    <div class="wizard-steps">${STEPS.map(() => '<i></i>').join('')}</div>
    <form id="wizForm" class="card" novalidate>
      ${STEPS.map((s, i) => `<section data-step="${i}" hidden><h1>${esc(s.title)}</h1><p class="muted">${esc(s.text)}</p>${s.html(p, store.meta)}</section>`).join('')}
      <div class="row between" style="margin-top:8px">
        <button type="button" class="btn" id="back">Vissza</button>
        <button type="submit" class="btn btn-primary" id="next">Tovább</button>
      </div>
    </form>
    <p class="tiny" style="text-align:center;margin-top:12px">Szia ${esc(store.me.user.name)}! Az adataidat bármikor módosíthatod a Beállításokban.</p>
  </div>`;
  const form = root.querySelector('#wizForm');
  bindProfileForm(form);

  const show = () => {
    form.querySelectorAll('section').forEach((s) => (s.hidden = +s.dataset.step !== step));
    root.querySelectorAll('.wizard-steps i').forEach((el, i) => el.classList.toggle('done', i <= step));
    root.querySelector('#back').style.visibility = step === 0 ? 'hidden' : 'visible';
    root.querySelector('#next').textContent = step === STEPS.length - 1 ? 'Tervem elkészítése' : 'Tovább';
  };

  // Az aktuális lépés kötelező mezőinek ellenőrzése
  const validStep = () => {
    const sec = form.querySelector(`section[data-step="${step}"]`);
    for (const el of sec.querySelectorAll('input[required]')) {
      if (!el.checkValidity()) {
        el.reportValidity();
        return false;
      }
    }
    return true;
  };

  root.querySelector('#back').onclick = () => {
    step = Math.max(0, step - 1);
    show();
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!validStep()) return;
    if (step < STEPS.length - 1) {
      step++;
      show();
      window.scrollTo(0, 0);
      return;
    }
    const btn = root.querySelector('#next');
    btn.textContent = store.me.aiEnabled ? 'Az AI készíti a tervedet…' : 'Terv készítése…';
    await withLoading(btn, async () => {
      try {
        const r = await put('/profile', profilePayload(formData(form)));
        if (r.aiError) toast(`Az AI most nem volt elérhető, a beépített motor készítette a tervet. (${r.aiError})`, 'error');
        else toast('Elkészült a személyre szabott terved!');
        await onDone();
      } catch (err) {
        toastError(err);
        btn.textContent = 'Tervem elkészítése';
      }
    });
  };
  show();
  return null;
}
