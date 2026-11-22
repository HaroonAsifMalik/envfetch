// App shell, router, keyboard shortcuts, theme, workspaces.
import { $, h, icon, avatar, openModal, closeModal, modalOpen, toast } from './lib.js';
import {
  state, bus, loadAll, createProject, projectNames, allTasks, dueState, remindDue, saveUi, rerender,
  setWorkspace, wsOf, WS_META, WORKSPACES,
} from './store.js';
import { homeView } from './home.js';
import { projectView } from './project.js';
import { openTaskModal } from './tasks.js';
import { openPalette } from './search.js';
import { openStandup } from './standup.js';

const app = $('#app');

// ---------- theme ------------------------------------------------------------ //
function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('envfetch.theme', next); } catch { /* ignore */ }
  rerender();
}

// ---------- workspaces ------------------------------------------------------- //
function switchWorkspace(ws) {
  if (ws === state.ui.ws) return;
  setWorkspace(ws);
  if (location.hash && location.hash !== '#/' && location.hash !== '#') location.hash = '#/';
  else rerender();
}

// How many things in a workspace need a human right now.
function attention(ws) {
  return allTasks(ws).filter(({ task }) => task.status !== 'done' && (['overdue', 'today'].includes(dueState(task)) || remindDue(task))).length;
}

// ---------- routing ---------------------------------------------------------- //
function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'p' && parts[1]) return { page: 'project', name: parts[1], tab: parts[2] || 'overview', taskId: parts[2] === 'tasks' ? parts[3] : null };
  return { page: 'home' };
}

// ---------- dialogs ---------------------------------------------------------- //
function newProjectDialog() {
  let ws = state.ui.ws;
  const name = h('input', { placeholder: 'my-awesome-app', autofocus: true, autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Project name' });
  const description = h('input', { 'aria-label': 'Description' });
  const hint = h('div', { class: 'hint' });
  const seg = h('div', { class: 'seg wide', role: 'group', 'aria-label': 'Workspace' });
  const draw = () => {
    seg.replaceChildren(...WORKSPACES.map((key) => h('button', { type: 'button', class: ws === key ? 'on' : '', onClick: () => { ws = key; draw(); } }, icon(WS_META[key].icon), WS_META[key].label)));
    hint.textContent = WS_META[ws].projectHint;
    description.placeholder = WS_META[ws].descPlaceholder;
  };
  draw();

  const submit = async () => {
    const value = name.value.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value)) return toast('Use letters, numbers, - or _ for the name', 'warn', 3000);
    try {
      const created = await createProject(value, description.value.trim(), ws);
      closeModal(true);
      setWorkspace(ws);
      location.hash = `#/p/${created}`;
      rerender();
    } catch (error) { toast(error.message, 'error', 3500); }
  };
  [name, description].forEach((el) => el.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); }));
  openModal([
    h('div', { class: 'm-body' }, h('b', { class: 'dlg-title' }, 'New project'),
      h('div', { class: 'field' }, h('label', {}, 'Where does it live?'), seg, hint),
      h('div', { class: 'field' }, h('label', {}, 'Name'), name, h('div', { class: 'hint' }, 'Becomes projects/<name>.json. Lowercase, no spaces.')),
      h('div', { class: 'field' }, h('label', {}, 'Description'), description)),
    h('div', { class: 'm-foot' }, h('span', { class: 'spacer' }), h('button', { class: 'btn', onClick: () => closeModal() }, 'Cancel'), h('button', { class: 'btn primary', onClick: submit }, 'Create project')),
  ], { size: 'narrow' });
}

function newTaskDialog() {
  const route = parseRoute();
  const names = projectNames(state.ui.ws);
  if (route.page === 'project' && state.docs[route.name]) {
    const quickInput = document.getElementById('quick-input');
    if (quickInput) { quickInput.focus(); return; }
    return openTaskModal(route.name, null);
  }
  if (!names.length) return newProjectDialog();
  const select = h('select', { value: state.ui.lastProject && names.includes(state.ui.lastProject) ? state.ui.lastProject : names[0], autofocus: true, 'aria-label': 'Project' }, names.map((n) => h('option', { value: n }, n)));
  openModal([
    h('div', { class: 'm-body' }, h('b', { class: 'dlg-title' }, 'Which project is this for?'), select),
    h('div', { class: 'm-foot' }, h('span', { class: 'spacer' }), h('button', { class: 'btn', onClick: () => closeModal() }, 'Cancel'),
      h('button', { class: 'btn primary', onClick: () => { const p = select.value; state.ui.lastProject = p; saveUi(); closeModal(true); openTaskModal(p, null); } }, 'Continue')),
  ], { size: 'narrow' });
}

function helpDialog() {
  const row = (keys, text) => [h('span', {}, keys.map((k, i) => [i ? ' ' : null, h('kbd', {}, k)])), h('span', {}, text)];
  openModal([
    h('div', { class: 'm-body' }, h('b', { class: 'dlg-title' }, 'Keyboard shortcuts'),
      h('div', { class: 'keys' },
        row(['⌘', 'K'], 'Search everything (also  /)'), row(['N'], 'New task'), row(['W'], 'Switch Office / Personal'), row(['S'], 'Write my standup'),
        row(['G'], 'Go home'), row(['T'], 'Toggle light / dark'),
        row(['⌘', '↵'], 'Save the task you are editing'), row(['Esc'], 'Close dialogs'), row(['?'], 'Show this help'))),
    h('div', { class: 'm-foot' }, h('span', { class: 'spacer' }), h('button', { class: 'btn primary', onClick: () => closeModal() }, 'Got it')),
  ], { size: 'narrow' });
}

document.addEventListener('envfetch:new-task', newTaskDialog);
document.addEventListener('envfetch:new-project', newProjectDialog);
document.addEventListener('envfetch:toggle-theme', toggleTheme);
document.addEventListener('envfetch:standup', openStandup);
document.addEventListener('envfetch:switch-workspace', () => switchWorkspace(state.ui.ws === 'office' ? 'personal' : 'office'));

// ---------- shell ------------------------------------------------------------ //
function workspaceSwitch() {
  return h('div', { class: 'ws-switch', role: 'tablist', 'aria-label': 'Workspace' }, WORKSPACES.map((ws) => {
    const meta = WS_META[ws];
    const waiting = ws === state.ui.ws ? 0 : attention(ws);
    return h('button', {
      class: 'ws-btn' + (ws === state.ui.ws ? ' on' : ''), role: 'tab', 'aria-selected': ws === state.ui.ws ? 'true' : 'false',
      title: waiting ? `${waiting} need you in ${meta.label}` : meta.label, onClick: () => switchWorkspace(ws),
    }, icon(meta.icon), meta.label, waiting ? h('span', { class: 'ws-dot', 'aria-label': `${waiting} need attention` }, waiting) : null);
  }));
}

function sidebar(route) {
  const names = projectNames(state.ui.ws);
  return h('aside', { class: 'side' },
    h('a', { class: 'brand', href: '#/' }, h('span', { class: 'brand-logo' }, icon('check')), h('b', {}, 'EnvFetch')),
    workspaceSwitch(),
    h('a', { class: 'nav' + (route.page === 'home' ? ' active' : ''), href: '#/' }, icon('home'), h('span', { class: 'grow' }, 'Home')),
    h('div', { class: 'nav-label' }, state.ui.ws === 'office' ? 'Projects' : 'Lists'),
    names.map((name) => {
      const doc = state.docs[name];
      const open = doc.project.tasks.filter((t) => t.status !== 'done');
      const overdue = open.filter((t) => dueState(t) === 'overdue').length;
      return h('a', { class: 'nav' + (route.page === 'project' && route.name === name ? ' active' : ''), href: `#/p/${name}` },
        avatar(name), h('span', { class: 'grow' }, name), open.length ? h('span', { class: 'count' + (overdue ? ' bad' : '') }, overdue || open.length) : null);
    }),
    h('button', { class: 'nav', onClick: newProjectDialog }, icon('plus'), h('span', { class: 'grow' }, 'New project')),
    Object.keys(state.errors).length ? h('div', { class: 'side-note' }, `Could not read: ${Object.keys(state.errors).join(', ')}`) : null,
    h('div', { class: 'side-foot' },
      h('div', { class: 'row' }, h('button', { class: 'btn ghost sm', onClick: toggleTheme, title: 'Toggle theme (T)' }, icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon'), 'Theme'),
        h('button', { class: 'btn ghost sm', onClick: helpDialog, title: 'Keyboard shortcuts (?)' }, icon('keyboard'), 'Shortcuts')),
      h('div', {}, 'Data folder', h('br'), h('code', {}, state.meta.data_dir || ''))));
}

function topbar(route) {
  const crumbs = route.page === 'home'
    ? [h('b', {}, WS_META[state.ui.ws].label)]
    : [h('a', { href: '#/' }, WS_META[state.ui.ws].label), icon('chevron'), h('b', {}, route.name)];
  return h('div', { class: 'topbar' },
    h('div', { class: 'crumbs' }, crumbs),
    h('button', { class: 'search-btn', onClick: () => openPalette(newProjectDialog) }, icon('search'), h('span', { class: 'grow' }, 'Search everything'), h('kbd', {}, '⌘K')));
}

// ---------- browser push notifications -------------------------------------- //
function requestNotifPermission() {
  // Must be called from a user gesture — browsers silently deny auto-requests.
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
}

function pushNotif(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  new Notification(title, { body, icon: '/favicon.ico' });
}

// Fire at 17:40 every day while the page is open.
// Uses recursive setTimeout so DST clock changes don't drift the schedule.
function scheduleDailyDigest() {
  function scheduleNext() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(17, 40, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    setTimeout(() => { fireDigest(); scheduleNext(); }, next - now);
  }
  scheduleNext();
}

function fireDigest() {
  const ws = state.ui.ws || 'office';
  const tasks = allTasks(ws).filter(({ task }) => task.status !== 'done' && (dueState(task) === 'today' || dueState(task) === 'overdue' || remindDue(task)));
  if (!tasks.length) return;
  const titles = tasks.slice(0, 3).map(({ task }) => `• ${task.title}`).join('\n');
  const extra = tasks.length > 3 ? `\n+${tasks.length - 3} more` : '';
  pushNotif(`EnvFetch — ${tasks.length} task${tasks.length > 1 ? 's' : ''} need attention`, titles + extra);
}

// ---------- reminders: toast once per reminder, and show a count in the tab title ---------- //
const announced = new Set();
let baseTitle = 'EnvFetch';

function announceReminders() {
  const due = allTasks().filter(({ task }) => remindDue(task));
  const fresh = due.filter(({ project, task }) => !announced.has(`${project}/${task.id}/${task.remind_at}`));
  fresh.forEach(({ project, task }) => announced.add(`${project}/${task.id}/${task.remind_at}`));
  fresh.slice(0, 3).forEach(({ project, task }) => {
    toast(`Reminder: ${task.title} (${project})`, 'warn', 8000);
    pushNotif('EnvFetch reminder', `${task.title} (${project})`);
  });
  if (fresh.length > 3) toast(`and ${fresh.length - 3} more reminders`, 'warn', 8000);
  document.title = (due.length ? `(${due.length}) ` : '') + baseTitle;
}

let lastTaskOpened = null;
function render() {
  const route = parseRoute();
  // Opening a project from the other workspace (search, a link) flips the workspace with it.
  if (route.page === 'project' && state.docs[route.name] && wsOf(state.docs[route.name]) !== state.ui.ws) setWorkspace(wsOf(state.docs[route.name]));
  document.documentElement.dataset.ws = state.ui.ws;

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
  baseTitle = route.page === 'project' ? `${route.name} - EnvFetch` : `${WS_META[state.ui.ws].label} - EnvFetch`;
  announceReminders();

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
  else if (event.key === 'w') { document.dispatchEvent(new CustomEvent('envfetch:switch-workspace')); }
  else if (event.key === 's') { event.preventDefault(); openStandup(); }
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
  setInterval(announceReminders, 20000); // a reminder can come due while a dialog keeps refresh paused
  // Request permission on first user interaction (browsers block auto-requests).
  document.addEventListener('click', () => requestNotifPermission(), { once: true });
  scheduleDailyDigest();
  render();
}

boot();
