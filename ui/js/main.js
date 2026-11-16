// App shell, router, keyboard shortcuts, theme.
import { $, h, icon, avatar, openModal, closeModal, modalOpen, toast } from './lib.js';
import { state, bus, loadAll, createProject, projectNames, dueState, saveUi, rerender } from './store.js';
import { homeView } from './home.js';
import { projectView } from './project.js';
import { openTaskModal } from './tasks.js';
import { openPalette } from './search.js';

const app = $('#app');

// ---------- theme ------------------------------------------------------------ //
function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('envfetch.theme', next); } catch { /* ignore */ }
  rerender();
}

// ---------- routing ---------------------------------------------------------- //
function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'p' && parts[1]) return { page: 'project', name: parts[1], tab: parts[2] || 'overview', taskId: parts[2] === 'tasks' ? parts[3] : null };
  return { page: 'home' };
}

// ---------- dialogs ---------------------------------------------------------- //
function newProjectDialog() {
  const name = h('input', { placeholder: 'my-awesome-app', autofocus: true, autocomplete: 'off', spellcheck: 'false' });
  const description = h('input', { placeholder: 'One line about it (optional)' });
  const submit = async () => {
    const value = name.value.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value)) return toast('Use letters, numbers, - or _ for the name', 'warn', 3000);
    try {
      const created = await createProject(value, description.value.trim());
      closeModal(true);
      location.hash = `#/p/${created}`;
      rerender();
    } catch (error) { toast(error.message, 'error', 3500); }
  };
  [name, description].forEach((el) => el.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); }));
  openModal([
    h('div', { class: 'm-body' }, h('b', { style: { fontSize: '16px' } }, 'New project'),
      h('div', { class: 'field' }, h('label', {}, 'Name'), name, h('div', { class: 'hint' }, 'Becomes projects/<name>.json — lowercase, no spaces.')),
      h('div', { class: 'field' }, h('label', {}, 'Description'), description)),
    h('div', { class: 'm-foot' }, h('span', { class: 'spacer' }), h('button', { class: 'btn', onClick: () => closeModal() }, 'Cancel'), h('button', { class: 'btn primary', onClick: submit }, 'Create project')),
  ], { size: 'narrow' });
}

function newTaskDialog() {
  const route = parseRoute();
  const names = projectNames();
  if (!names.length) return newProjectDialog();
  if (route.page === 'project' && state.docs[route.name]) return openTaskModal(route.name, null);
  const select = h('select', { value: state.ui.lastProject || names[0], autofocus: true }, names.map((n) => h('option', { value: n }, n)));
  openModal([
    h('div', { class: 'm-body' }, h('b', { style: { fontSize: '16px' } }, 'Which project is this for?'), select),
    h('div', { class: 'm-foot' }, h('span', { class: 'spacer' }), h('button', { class: 'btn', onClick: () => closeModal() }, 'Cancel'),
      h('button', { class: 'btn primary', onClick: () => { const p = select.value; state.ui.lastProject = p; saveUi(); closeModal(true); openTaskModal(p, null); } }, 'Continue')),
  ], { size: 'narrow' });
}

function helpDialog() {
  const row = (keys, text) => [h('span', {}, keys.map((k, i) => [i ? ' ' : null, h('kbd', {}, k)])), h('span', {}, text)];
  openModal([
    h('div', { class: 'm-body' }, h('b', { style: { fontSize: '16px' } }, 'Keyboard shortcuts'),
      h('div', { class: 'keys' },
        row(['⌘', 'K'], 'Search everything (also  /)'), row(['N'], 'New task'), row(['G'], 'Go home'), row(['T'], 'Toggle light / dark'),
        row(['⌘', '↵'], 'Save the task you are editing'), row(['Esc'], 'Close dialogs'), row(['?'], 'Show this help'))),
    h('div', { class: 'm-foot' }, h('span', { class: 'spacer' }), h('button', { class: 'btn primary', onClick: () => closeModal() }, 'Got it')),
  ], { size: 'narrow' });
}

document.addEventListener('envfetch:new-task', newTaskDialog);
document.addEventListener('envfetch:new-project', newProjectDialog);
document.addEventListener('envfetch:toggle-theme', toggleTheme);

// ---------- shell ------------------------------------------------------------ //
function sidebar(route) {
  const names = projectNames();
  return h('aside', { class: 'side' },
    h('a', { class: 'brand', href: '#/' }, h('span', { class: 'brand-logo' }, icon('bolt')), h('div', {}, h('b', {}, 'EnvFetch'), h('small', {}, 'projects · envs · tasks'))),
    h('a', { class: 'nav' + (route.page === 'home' ? ' active' : ''), href: '#/' }, icon('home'), h('span', { class: 'grow' }, 'Home')),
    h('div', { class: 'nav-label' }, 'Projects'),
    names.map((name) => {
      const doc = state.docs[name];
      const open = doc.project.tasks.filter((t) => t.status !== 'done');
      const overdue = open.filter((t) => dueState(t) === 'overdue').length;
      return h('a', { class: 'nav' + (route.page === 'project' && route.name === name ? ' active' : ''), href: `#/p/${name}` },
        avatar(name), h('span', { class: 'grow' }, name), open.length ? h('span', { class: 'count' + (overdue ? ' bad' : '') }, overdue || open.length) : null);
    }),
    h('button', { class: 'nav', onClick: newProjectDialog }, icon('plus'), h('span', { class: 'grow' }, 'New project')),
    Object.keys(state.errors).length ? h('div', { class: 'faint', style: { padding: '8px 10px', fontSize: '12px' } }, `⚠️ Could not read: ${Object.keys(state.errors).join(', ')}`) : null,
    h('div', { class: 'side-foot' },
      h('div', { class: 'row' }, h('button', { class: 'btn ghost sm', onClick: toggleTheme, title: 'Toggle theme (T)' }, icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon'), 'Theme'),
        h('button', { class: 'btn ghost sm', onClick: helpDialog, title: 'Keyboard shortcuts (?)' }, icon('keyboard'), 'Shortcuts')),
      h('div', {}, 'Data folder', h('br'), h('code', {}, state.meta.data_dir || ''))));
}

function topbar(route) {
  const crumbs = route.page === 'home'
    ? [h('b', {}, 'Home')]
    : [h('a', { href: '#/', style: { textDecoration: 'none' } }, 'Home'), '/', h('b', {}, route.name)];
  return h('div', { class: 'topbar' },
    h('div', { class: 'crumbs' }, crumbs),
    h('button', { class: 'search-btn', onClick: () => openPalette(newProjectDialog) }, icon('search'), h('span', { class: 'grow' }, 'Search everything…'), h('kbd', {}, '⌘K')));
}

let lastTaskOpened = null;
function render() {
  const route = parseRoute();
  const scroller = $('.main');
  const scrollTop = scroller ? scroller.scrollTop : 0;
  const focused = document.activeElement && document.activeElement.id;
  const caret = focused && document.activeElement.selectionStart;

  const page = route.page === 'home' ? homeView() : projectView(route.name, route.tab);
  app.replaceChildren(sidebar(route), h('main', { class: 'main' }, topbar(route), h('div', { class: 'page' }, page)));

  const fresh = $('.main');
  if (fresh) fresh.scrollTop = scrollTop;
  if (focused) {
    const el = document.getElementById(focused);
    if (el) { el.focus(); if (typeof caret === 'number' && el.setSelectionRange) try { el.setSelectionRange(caret, caret); } catch { /* not a text input */ } }
  }
  document.title = route.page === 'project' ? `${route.name} · EnvFetch` : 'EnvFetch';

  // Deep link to a task: #/p/<project>/tasks/<id>
  if (route.taskId && route.taskId !== lastTaskOpened && state.docs[route.name]) {
    lastTaskOpened = route.taskId;
    openTaskModal(route.name, route.taskId);
  }
  if (!route.taskId) lastTaskOpened = null;
}

// ---------- keyboard --------------------------------------------------------- //
function typing(event) {
  const el = event.target;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && modalOpen()) { closeModal(); return; }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); if (modalOpen()) closeModal(true); openPalette(newProjectDialog); return; }
  if (typing(event) || modalOpen() || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === '/') { event.preventDefault(); openPalette(newProjectDialog); }
  else if (event.key === 'n') { event.preventDefault(); newTaskDialog(); }
  else if (event.key === 'g') { location.hash = '#/'; }
  else if (event.key === 't') { toggleTheme(); }
  else if (event.key === '?') { helpDialog(); }
});

// ---------- boot ------------------------------------------------------------- //
async function refresh() {
  if (modalOpen() || (document.activeElement && typing({ target: document.activeElement }))) return;
  try { await loadAll(); render(); } catch { /* server stopped; keep showing what we have */ }
}

async function boot() {
  try {
    await loadAll();
  } catch (error) {
    app.replaceChildren(h('div', { class: 'page' }, h('h1', { class: 'title' }, 'Cannot reach EnvFetch'), h('p', { class: 'sub' }, 'Start the server with: python envfetch.py --serve'), h('pre', {}, String(error.message))));
    return;
  }
  window.addEventListener('hashchange', render);
  bus.addEventListener('render', render);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  setInterval(refresh, 60000); // keep reminders and due dates fresh
  render();
}

boot();
