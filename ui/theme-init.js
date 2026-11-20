// Runs before first paint so the page never flashes the wrong theme or workspace colours.
// (External file, not inline: the server's Content-Security-Policy forbids inline scripts.)
try {
  var root = document.documentElement;
  var theme = localStorage.getItem('envfetch.theme');
  if (!theme) theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  root.dataset.theme = theme;
  var ui = JSON.parse(localStorage.getItem('envfetch.ui') || '{}');
  root.dataset.ws = ui.ws === 'personal' ? 'personal' : 'office';
} catch (e) { /* storage blocked: keep the defaults (light, office) */ }
