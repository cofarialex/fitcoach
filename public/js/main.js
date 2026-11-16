// Az alkalmazás belépési pontja: bejelentkezés-ellenőrzés, elrendezés, egyszerű hash alapú router
import { get, post, setUnauthorizedHandler } from './api.js';
import { esc, icon, toastError } from './ui.js';
import { destroyAll } from './charts.js';
import * as authPage from './pages/auth.js';
import * as onboardingPage from './pages/onboarding.js';
import * as dashboardPage from './pages/dashboard.js';
import * as planPage from './pages/plan.js';
import * as logPage from './pages/log.js';
import * as mealsPage from './pages/meals.js';
import * as pantryPage from './pages/pantry.js';
import * as progressPage from './pages/progress.js';
import * as coachPage from './pages/coach.js';
import * as settingsPage from './pages/settings.js';

const ROUTES = [
  { path: 'dashboard', title: 'Dashboard', icon: 'dashboard', page: dashboardPage, short: 'Főoldal' },
  { path: 'plan', title: 'Edzésterv', icon: 'dumbbell', page: planPage, short: 'Edzés' },
  { path: 'log', title: 'Edzésnapló', icon: 'notebook', page: logPage },
  { path: 'meals', title: 'Étrend', icon: 'meal', page: mealsPage, short: 'Étrend' },
  { path: 'pantry', title: 'Alapanyagok', icon: 'basket', page: pantryPage },
  { path: 'progress', title: 'Fejlődésem', icon: 'chart', page: progressPage },
  { path: 'coach', title: 'AI Coach', icon: 'coach', page: coachPage, short: 'Coach' },
  { path: 'settings', title: 'Beállítások', icon: 'settings', page: settingsPage },
];

// Közös állapot, amit minden oldal megkap
export const store = { me: null, meta: null };
const root = document.getElementById('root');
let cleanup = null;

// Csak akkor irányítunk át, ha használat közben járt le a munkamenet (indításkor a route() kezeli)
setUnauthorizedHandler(() => {
  if (!store.me) return;
  store.me = null;
  if (location.hash !== '#/login') location.hash = '#/login';
  else route();
});

export async function refreshMe() {
  store.me = await get('/me');
  return store.me;
}
export async function refreshMeta() {
  store.meta = await get('/meta');
  return store.meta;
}

export function navigate(path) {
  if (location.hash === `#/${path}`) route();
  else location.hash = `#/${path}`;
}

function currentPath() {
  return (location.hash.replace(/^#\/?/, '').split('?')[0] || 'dashboard');
}

// Az oldalon belüli paraméterek, pl. #/meals?date=2026-11-17
export function hashParams() {
  const q = location.hash.split('?')[1] || '';
  return Object.fromEntries(new URLSearchParams(q));
}

function layout(active) {
  const initials = esc((store.me.user.name || '?').trim().slice(0, 1).toUpperCase());
  const navLinks = ROUTES.map((r) => `<a href="#/${r.path}" class="${r.path === active ? 'active' : ''}">${icon(r.icon)}<span>${r.title}</span></a>`).join('');
  const bottom = ROUTES.filter((r) => r.short).map((r) => `<a href="#/${r.path}" class="${r.path === active ? 'active' : ''}">${icon(r.icon)}<span>${r.short}</span></a>`).join('');
  const activeRoute = ROUTES.find((r) => r.path === active);
  return `<div class="app">
    <aside class="sidebar" id="sidebar">
      <div class="brand"><div class="brand-logo">${icon('trend')}</div><span>Fit<b>Coach</b></span></div>
      <nav class="nav">${navLinks}</nav>
      <div class="sidebar-foot">
        <div class="avatar">${initials}</div>
        <div class="grow ellipsis" style="flex:1;min-width:0"><div class="ellipsis" style="font-weight:600;font-size:.9rem">${esc(store.me.user.name)}</div>
          <div class="tiny">${store.me.aiEnabled ? 'AI mód aktív' : 'Beépített motor'}</div></div>
        <button class="btn btn-ghost btn-icon" id="logout" title="Kijelentkezés" aria-label="Kijelentkezés">${icon('logout')}</button>
      </div>
    </aside>
    <div class="main">
      <div class="mobile-bar">
        <button class="btn btn-ghost btn-icon" id="menuBtn" aria-label="Menü">${icon('menu')}</button>
        <b>${esc(activeRoute ? activeRoute.title : '')}</b>
        <div class="avatar" style="width:30px;height:30px;font-size:.85rem">${initials}</div>
      </div>
      <div id="page"></div>
    </div>
    <nav class="bottom-nav">${bottom}<a href="#" id="moreBtn">${icon('more')}<span>Több</span></a></nav>
  </div>`;
}

function bindLayout() {
  const sidebar = document.getElementById('sidebar');
  const toggle = (open) => {
    sidebar.classList.toggle('open', open);
    const old = document.querySelector('.scrim');
    if (old) old.remove();
    if (open) {
      const s = document.createElement('div');
      s.className = 'scrim';
      s.onclick = () => toggle(false);
      document.body.appendChild(s);
    }
  };
  document.getElementById('menuBtn').onclick = () => toggle(true);
  document.getElementById('moreBtn').onclick = (e) => {
    e.preventDefault();
    toggle(true);
  };
  sidebar.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => toggle(false)));
  document.getElementById('logout').onclick = async () => {
    await post('/auth/logout');
    store.me = null;
    location.hash = '#/login';
  };
}

async function route() {
  if (cleanup) {
    try {
      cleanup();
    } catch { /* nem kritikus */ }
    cleanup = null;
  }
  destroyAll();
  document.querySelector('.scrim')?.remove();
  const path = currentPath();

  // 1) Bejelentkezés ellenőrzése
  if (!store.me) {
    try {
      await refreshMe();
    } catch {
      store.me = null;
    }
  }
  if (!store.me) {
    cleanup = authPage.render(root, { onDone: async () => { await refreshMe(); navigate('dashboard'); } });
    return;
  }
  if (path === 'login') return navigate('dashboard');
  if (!store.meta) await refreshMeta();

  // 2) Első belépés: bevezető kérdőív
  if (!store.me.profile || !store.me.profile.onboarded) {
    cleanup = onboardingPage.render(root, { store, onDone: async () => { await refreshMe(); await refreshMeta(); navigate('dashboard'); } });
    return;
  }

  // 3) Normál oldalak
  const r = ROUTES.find((x) => x.path === path) || ROUTES[0];
  document.title = `${r.title} · FitCoach`;
  root.innerHTML = layout(r.path);
  bindLayout();
  const page = document.getElementById('page');
  page.innerHTML = '<div class="spinner-page">Betöltés…</div>';
  try {
    cleanup = (await r.page.render(page, { store, navigate, refreshMe, refreshMeta, params: hashParams() })) || null;
  } catch (e) {
    toastError(e);
    page.innerHTML = `<div class="page"><div class="card">${esc(e.message)}</div></div>`;
  }
  window.scrollTo(0, 0);
}

// Téma váltás (világos / sötét / rendszer)
export function setTheme(pref) {
  try {
    localStorage.setItem('fc_theme', pref);
  } catch { /* privát mód */ }
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}
export function getTheme() {
  try {
    return localStorage.getItem('fc_theme') || 'system';
  } catch {
    return 'system';
  }
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => getTheme() === 'system' && setTheme('system'));

window.addEventListener('hashchange', route);
route();
