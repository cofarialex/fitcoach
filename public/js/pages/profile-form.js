// A profil űrlap részei — a bevezető kérdőív és a Beállítások oldal is ezt használja
import { esc } from '../ui.js';

const GOAL_DESC = {
  muscle_gain: 'Több izom, kontrollált kalóriatöbblettel',
  fat_loss: 'Testsúlycsökkentés kalóriadeficittel',
  recomp: 'Zsírvesztés úgy, hogy az izom megmarad',
  cut: 'Alacsony testzsír, látható izomzat',
  strength: 'Nagyobb súlyok az alapgyakorlatokban',
  endurance: 'Jobb kondíció, kardió és izomállóképesség',
  health: 'Kiegyensúlyozott, fenntartható fittség',
};

const opt = (value, label, current) => `<option value="${esc(value)}" ${String(current) === String(value) ? 'selected' : ''}>${esc(label)}</option>`;
const chip = (name, value, label, checked, type = 'checkbox') => `<label class="chip"><input type="${type}" name="${name}" value="${esc(value)}" ${checked ? 'checked' : ''}><span>${esc(label)}</span></label>`;
const v = (x) => (x === null || x === undefined ? '' : esc(x));

export function basicsSection(p) {
  return `<div class="form-grid">
    <div class="field"><label>Nem</label><div class="chips">${chip('sex', 'male', 'Férfi', p.sex !== 'female', 'radio')}${chip('sex', 'female', 'Nő', p.sex === 'female', 'radio')}</div></div>
    <div class="field"><label for="age">Életkor</label><input id="age" name="age" type="number" min="13" max="100" required value="${v(p.age)}"></div>
    <div class="field"><label for="height">Magasság (cm)</label><input id="height" name="height_cm" type="number" min="120" max="230" required value="${v(p.height_cm)}"></div>
    <div class="field"><label for="weight">Testsúly (kg)</label><input id="weight" name="weight_kg" type="number" step="0.1" min="30" max="300" required value="${v(p.weight_kg)}"></div>
    <div class="field"><label for="bf">Testzsír % (ha ismert)</label><input id="bf" name="body_fat" type="number" step="0.1" min="3" max="60" value="${v(p.body_fat)}" placeholder="pl. 18"></div>
  </div>`;
}

export function trainingSection(p, meta) {
  const loc = p.location || 'gym';
  return `<div class="form-grid">
    <div class="field"><label for="act">Aktivitási szint (edzésen kívül is)</label><select id="act" name="activity_level">${Object.entries(meta.activity).map(([k, l]) => opt(k, l, p.activity_level || 'moderate')).join('')}</select></div>
    <div class="field"><label for="exp">Edzési tapasztalat</label><select id="exp" name="experience">${Object.entries(meta.experience).map(([k, l]) => opt(k, l, p.experience || 'beginner')).join('')}</select></div>
    <div class="field"><label for="days">Heti edzések száma</label><select id="days" name="days_per_week">${[1, 2, 3, 4, 5, 6].map((d) => opt(d, `${d} alkalom`, p.days_per_week || 3)).join('')}</select></div>
    <div class="field"><label for="mins">Idő egy edzésre</label><select id="mins" name="session_minutes">${[30, 45, 60, 75, 90, 120].map((m) => opt(m, `${m} perc`, p.session_minutes || 60)).join('')}</select></div>
  </div>
  <div class="field"><label>Edzés helyszíne</label><div class="chips">${chip('location', 'gym', 'Edzőterem', loc === 'gym', 'radio')}${chip('location', 'home', 'Otthon', loc === 'home', 'radio')}</div></div>
  <div class="field" id="equipmentField" ${loc === 'gym' ? 'hidden' : ''}><label>Otthon elérhető eszközök</label>
    <div class="chips">${Object.entries(meta.equipment).filter(([k]) => !['machine', 'cable'].includes(k)).map(([k, l]) => chip('equipment', k, l, (p.equipment || []).includes(k))).join('')}</div>
    <div class="hint">Eszköz nélkül is kapsz teljes értékű, saját testsúlyos tervet.</div></div>
  <div class="field"><label>Sérülések / kímélendő területek</label><div class="chips">${Object.entries(meta.injuries).map(([k, l]) => chip('injuries', k, l, (p.injuries || []).includes(k))).join('')}</div></div>
  <div class="field"><label for="health">Egészségügyi korlátozások, megjegyzések</label><textarea id="health" name="health_notes" placeholder="pl. magas vérnyomás, 2 éve műtött térd…">${v(p.health_notes)}</textarea></div>`;
}

export function goalSection(p, meta) {
  return `<div class="option-cards">${Object.entries(meta.goals).map(([k, l]) => `<label class="chip"><input type="radio" name="goal" value="${k}" ${(p.goal || 'health') === k ? 'checked' : ''}><span><b>${esc(l)}</b><small>${esc(GOAL_DESC[k] || '')}</small></span></label>`).join('')}</div>`;
}

export function nutritionSection(p, meta) {
  return `<div class="form-grid">
    <div class="field"><label for="meals">Étkezések száma naponta</label><select id="meals" name="meals_per_day">${[3, 4, 5].map((m) => opt(m, `${m} étkezés`, p.meals_per_day || 4)).join('')}</select></div>
    <div class="field"><label for="cook">Főzésre szánt idő / étkezés</label><select id="cook" name="cook_minutes">${[10, 15, 20, 30, 45, 60].map((m) => opt(m, `${m} perc`, p.cook_minutes || 30)).join('')}</select></div>
    <div class="field"><label for="budget">Napi étkezési keret (Ft)</label><input id="budget" name="daily_budget" type="number" min="0" step="100" value="${v(p.daily_budget)}" placeholder="pl. 3500"></div>
  </div>
  <div class="field"><label for="likes">Kedvelt ételek, alapanyagok</label><input id="likes" name="likes" value="${v(p.likes)}" placeholder="pl. csirke, rizs, zabpehely, banán"></div>
  <div class="field"><label for="dislikes">Nem kedvelt ételek</label><input id="dislikes" name="dislikes" value="${v(p.dislikes)}" placeholder="pl. brokkoli, hal"></div>
  <div class="field"><label>Ételallergia</label><div class="chips">${Object.entries(meta.allergens).map(([k, l]) => chip('allergies', k, l, (p.allergies || []).includes(k))).join('')}</div></div>
  <div class="field"><label>Ételintolerancia</label><div class="chips">${Object.entries(meta.allergens).map(([k, l]) => chip('intolerances', k, l, (p.intolerances || []).includes(k))).join('')}</div></div>`;
}

// A helyszín váltásakor mutatjuk/elrejtjük az otthoni eszközöket
export function bindProfileForm(form) {
  form.querySelectorAll('input[name=location]').forEach((r) => r.addEventListener('change', () => {
    form.querySelector('#equipmentField').hidden = form.querySelector('input[name=location]:checked').value === 'gym';
  }));
}

// A form adatait a szerver által várt formára alakítja
export function profilePayload(data) {
  const out = { ...data };
  for (const k of ['equipment', 'injuries', 'allergies', 'intolerances']) out[k] = data[k] || [];
  return out;
}
