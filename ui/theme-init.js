// Runs before first paint so the page never flashes the wrong theme.
// (External file, not inline: the server's Content-Security-Policy forbids inline scripts.)
try {
  var theme = localStorage.getItem('envfetch.theme');
  if (!theme) theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
} catch (e) { /* storage blocked: keep the default dark theme */ }
