// Bejelentkezés és regisztráció
import { post } from '../api.js';
import { toastError, withLoading, formData } from '../ui.js';

export function render(root, { onDone }) {
  let mode = 'login';
  const draw = () => {
    root.innerHTML = `<div class="auth-wrap">
      <section class="auth-hero">
        <div class="brand" style="padding:0"><div class="brand-logo" style="background:#f1f3f0;color:#0b0c0b">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg></div>
          <span>Fit<b style="color:#34c27f">Coach</b></span></div>
        <div>
          <h1>A személyi edződ és táplálkozási tanácsadód — <b>egy helyen</b>.</h1>
          <ul>
            <li>Egyéni edzésterv a céljaid, időd és eszközeid alapján</li>
            <li>Étrend abból, ami otthon van — grammra pontosan</li>
            <li>Automatikus terhelésnövelés a naplózott edzéseid alapján</li>
            <li>AI Coach, aki ismeri az adataidat</li>
          </ul>
        </div>
        <div class="tiny" style="color:#737a72">© ${new Date().getFullYear()} FitCoach</div>
      </section>
      <section class="auth-form">
        <div class="card">
          <h2>${mode === 'login' ? 'Bejelentkezés' : 'Fiók létrehozása'}</h2>
          <p class="muted">${mode === 'login' ? 'Üdv újra! Lépj be a folytatáshoz.' : 'Pár másodperc, és indulhat az edzés.'}</p>
          <form id="authForm" novalidate>
            ${mode === 'register' ? '<div class="field"><label for="name">Név</label><input id="name" name="name" autocomplete="name" required></div>' : ''}
            <div class="field"><label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="email" required></div>
            <div class="field"><label for="password">Jelszó</label><input id="password" name="password" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" minlength="8" required>
              ${mode === 'register' ? '<div class="hint">Legalább 8 karakter.</div>' : ''}</div>
            <button class="btn btn-primary" style="width:100%" type="submit">${mode === 'login' ? 'Belépés' : 'Regisztráció'}</button>
          </form>
          <hr>
          <p class="muted" style="text-align:center;margin:0">${mode === 'login' ? 'Még nincs fiókod?' : 'Van már fiókod?'}
            <a href="#" id="switch">${mode === 'login' ? 'Regisztrálj' : 'Jelentkezz be'}</a></p>
        </div>
      </section>
    </div>`;
    root.querySelector('#switch').onclick = (e) => {
      e.preventDefault();
      mode = mode === 'login' ? 'register' : 'login';
      draw();
    };
    const form = root.querySelector('#authForm');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const data = formData(form);
      await withLoading(form.querySelector('button[type=submit]'), async () => {
        try {
          await post(mode === 'login' ? '/auth/login' : '/auth/register', data);
          await onDone();
        } catch (err) {
          toastError(err);
        }
      });
    };
    root.querySelector('input').focus();
  };
  draw();
  return null;
}
