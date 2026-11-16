// Téma: 'light' | 'dark' | 'system' (localStorage-ban tárolva)
(function () {
  var pref = 'system';
  try { pref = localStorage.getItem('fc_theme') || 'system'; } catch (e) { /* privát mód */ }
  var dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
