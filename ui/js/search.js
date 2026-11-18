// ⌘K command palette: one search box across everything you have stored.
// Env VALUES are never indexed or shown here — only service and key names.
import { h, icon, avatar, openModal, closeModal, copyText, friendlyDate } from './lib.js';
import { state, projectNames, envNames, wsOf, WS_META, STATUS_LABEL } from './store.js';
import { openTaskModal } from './tasks.js';

function buildIndex() {
  const items = [];
  for (const name of projectNames()) {
    const doc = state.docs[name];
    const p = doc.project;
    items.push({ kind: 'Projects', ico: 'folder', title: name, sub: `${WS_META[wsOf(doc)].label}: ${p.description || 'no description'}`, hay: `${name} ${p.description} ${wsOf(doc)}`, run: () => { location.hash = `#/p/${name}`; } });

    for (const task of p.tasks) {
      const text = [task.title, task.notes, task.impact, task.challenges, task.solution, task.category, task.id, ...task.steps.map((s) => s.text)].join(' ');
      items.push({
        kind: 'Tasks', ico: task.status === 'done' ? 'check' : 'board', title: task.title,
        sub: `${name} · ${STATUS_LABEL[task.status]}${task.due ? ' · due ' + friendlyDate(task.due) : ''}`, hay: `${name} ${text}`,
        run: () => { location.hash = `#/p/${name}/tasks`; setTimeout(() => openTaskModal(name, task.id), 30); },
      });
    }
    for (const env of envNames(doc)) {
      for (const [service, vars] of Object.entries(doc[env])) {
        const keys = vars && typeof vars === 'object' && !Array.isArray(vars) ? Object.keys(vars) : [];
        items.push({
          kind: 'Environments', ico: 'layers', title: `${service}`, sub: `${name} · ${env} · ${keys.slice(0, 4).join(', ')}${keys.length > 4 ? '…' : ''}`,
          hay: `${name} ${env} ${service} ${keys.join(' ')}`, run: () => { state.ui.env[name] = env; location.hash = `#/p/${name}/env`; },
        });
      }
    }
    for (const link of p.links) items.push({ kind: 'Links', ico: 'link', title: link.title, sub: `${name} · ${link.url}`, hay: `${name} ${link.title} ${link.url}`, run: () => window.open(link.url, '_blank', 'noopener') });
    for (const [key, value] of Object.entries(p.commands)) items.push({ kind: 'Commands', ico: 'terminal', title: key, sub: `${name} · ${value}`, hay: `${name} ${key} ${value}`, hint: 'copy', run: () => copyText(value, 'Command copied') });
    p.notes.forEach((note) => items.push({ kind: 'Notes', ico: 'note', title: note.split('\n')[0].slice(0, 90), sub: name, hay: `${name} ${note}`, run: () => { location.hash = `#/p/${name}/notes`; } }));
  }
  return items;
}

function actions(openNewProject) {
  return [
    { kind: 'Actions', ico: 'plus', title: 'New task', sub: 'Capture something', hay: 'new task add create', run: () => document.dispatchEvent(new CustomEvent('envfetch:new-task')) },
    { kind: 'Actions', ico: 'folder', title: 'New project', sub: 'Start tracking another project', hay: 'new project add create', run: openNewProject },
    { kind: 'Actions', ico: 'sparkle', title: 'Write my update', sub: 'Daily standup or weekly summary', hay: 'standup update weekly daily report summary', run: () => document.dispatchEvent(new CustomEvent('envfetch:standup')) },
    { kind: 'Actions', ico: 'briefcase', title: 'Switch Office / Personal', sub: 'Change workspace', hay: 'switch workspace office personal', run: () => document.dispatchEvent(new CustomEvent('envfetch:switch-workspace')) },
    { kind: 'Actions', ico: 'home', title: 'Go home', sub: 'Dashboard', hay: 'home dashboard today', run: () => { location.hash = '#/'; } },
    { kind: 'Actions', ico: 'sun', title: 'Toggle theme', sub: 'Light / dark', hay: 'theme dark light mode', run: () => document.dispatchEvent(new CustomEvent('envfetch:toggle-theme')) },
  ];
}

function score(item, tokens) {
  const title = item.title.toLowerCase(), hay = item.hay.toLowerCase();
  let total = 0;
  for (const token of tokens) {
    if (!hay.includes(token)) return -1;
    total += title.startsWith(token) ? 4 : title.includes(token) ? 3 : 1;
  }
  return total;
}

export function openPalette(openNewProject) {
  const index = [...actions(openNewProject), ...buildIndex()];
  let results = [], selected = 0;

  const input = h('input', { placeholder: 'Search projects, tasks, variables, links, commands, notes…', autofocus: true, autocomplete: 'off', spellcheck: 'false' });
  const list = h('div', { class: 'p-list' });

  const compute = () => {
    const tokens = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) {
      results = [...index.filter((i) => i.kind === 'Actions'), ...index.filter((i) => i.kind === 'Projects')];
    } else {
      results = index.map((item) => [score(item, tokens), item]).filter(([s]) => s >= 0).sort((a, b) => b[0] - a[0]).slice(0, 40).map(([, item]) => item);
    }
    selected = 0;
    draw();
  };

  const choose = (item) => { closeModal(true); if (item) item.run(); };

  const draw = () => {
    list.replaceChildren();
    if (!results.length) { list.append(h('div', { class: 'empty', style: { margin: '10px', border: 0 } }, h('b', {}, 'No matches'), 'Try fewer words, or search by project name.')); return; }
    let lastKind = '';
    results.forEach((item, i) => {
      if (item.kind !== lastKind) { list.append(h('div', { class: 'p-group' }, item.kind)); lastKind = item.kind; }
      list.append(h('div', { class: 'p-item' + (i === selected ? ' sel' : ''), onMousemove: () => { if (selected !== i) { selected = i; draw(); } }, onClick: () => choose(item) },
        h('span', { class: 'ico' }, item.kind === 'Projects' ? avatar(item.title) : icon(item.ico)),
        h('div', { class: 'grow' }, h('div', { class: 't' }, item.title), item.sub ? h('div', { class: 's' }, item.sub) : null),
        item.hint ? h('span', { class: 'faint' }, item.hint) : null));
    });
    const sel = list.querySelector('.sel');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  };

  input.addEventListener('input', compute);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); selected = Math.min(results.length - 1, selected + 1); draw(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); selected = Math.max(0, selected - 1); draw(); }
    else if (event.key === 'Enter') { event.preventDefault(); choose(results[selected]); }
  });

  const box = openModal([
    h('div', { class: 'p-in' }, icon('search'), input, h('kbd', {}, 'esc')),
    list,
    h('div', { class: 'p-foot' }, h('span', {}, h('kbd', {}, '↑'), ' ', h('kbd', {}, '↓'), ' navigate'), h('span', {}, h('kbd', {}, '↵'), ' open / copy'), h('span', { class: 'spacer' }), h('span', {}, 'Values stay private — only names are searched')),
  ], { size: 'palette' });
  box.classList.add('palette');
  compute();
}
