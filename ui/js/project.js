// A single project: header, tabs, and the Overview tab.
import { h, icon, iconBtn, avatar, envColor, copyText, emptyState, friendlyDate, toast } from './lib.js';
import { state, update, envNames, sortTasks, dueState, taskWriteup, wsOf, WS_META, deleteProject, renameProject } from './store.js';
import { openModal, closeModal, confirmDialog } from './lib.js';
import { tasksTab, taskRow, openTaskModal } from './tasks.js';
import { envsTab } from './envs.js';
import { commandsTab, notesTab } from './misc.js';

export const TABS = [
  ['overview', 'Overview', 'home'],
  ['tasks', 'Tasks', 'board'],
  ['env', 'Environments', 'layers'],
  ['commands', 'Commands', 'terminal'],
  ['notes', 'Notes', 'note'],
];

export function projectView(name, tab) {
  const doc = state.docs[name];
  if (!doc) return emptyState('🕳️', 'Project not found', `There is no project called "${name}".`, h('a', { class: 'btn', href: '#/' }, 'Back home'));
  const p = doc.project;
  // Personal projects don't need environments or shell commands, unless the file already has some.
  const personal = wsOf(doc) === 'personal';
  const tabList = TABS.filter(([key]) =>
    !personal || !((key === 'env' && !envNames(doc).length) || (key === 'commands' && !Object.keys(p.commands).length)));
  if (!tabList.some(([key]) => key === tab)) tab = 'overview';

  const open = p.tasks.filter((t) => t.status !== 'done');
  const overdue = open.filter((t) => dueState(t) === 'overdue').length;
  const counts = {
    tasks: open.length,
    env: envNames(doc).length,
    commands: Object.keys(p.commands).length,
    notes: p.notes.length,
  };

  const openProjectMenu = () => {
    const rename = async () => {
      const input = h('input', { placeholder: name, value: name, autofocus: true, autocomplete: 'off', spellcheck: 'false', 'aria-label': 'New project name' });
      const hint = h('div', { class: 'hint' });
      const submit = async () => {
        const val = input.value.trim().toLowerCase();
        if (!val || val === name) return closeModal();
        if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(val)) { hint.textContent = 'Use letters, numbers, - or _ only'; return; }
        try {
          closeModal(true);
          const newName = await renameProject(name, val);
          location.hash = `#/p/${newName}`;
        } catch (err) { toast(err.message, 'error', 3500); }
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
      openModal([
        h('div', { class: 'm-body' }, h('b', { class: 'dlg-title' }, 'Rename project'),
          h('div', { class: 'field' }, h('label', {}, 'New name'), input, hint)),
        h('div', { class: 'm-foot' }, h('span', { class: 'spacer' }),
          h('button', { class: 'btn', onClick: () => closeModal() }, 'Cancel'),
          h('button', { class: 'btn primary', onClick: submit }, 'Rename')),
      ], { size: 'narrow' });
    };
    const del = async () => {
      if (!(await confirmDialog({ title: `Delete "${name}"?`, message: 'All tasks, environments and notes will be permanently removed.', confirmLabel: 'Delete project' }))) return;
      try { await deleteProject(name); location.hash = '#/'; } catch (err) { toast(err.message, 'error', 3500); }
    };
    const menu = h('div', { class: 'proj-menu' },
      h('button', { class: 'menu-item', onClick: () => { closeModal(true); rename(); } }, icon('edit'), 'Rename project'),
      h('button', { class: 'menu-item danger', onClick: () => { closeModal(true); del(); } }, icon('trash'), 'Delete project'));
    openModal([menu], { size: 'narrow' });
  };

  const header = h('div', { class: 'phead' },
    avatar(name, true),
    h('div', { class: 'grow' }, h('h1', {}, name, h('span', { class: 'ws-tag' }, icon(WS_META[wsOf(doc)].icon), WS_META[wsOf(doc)].label)), h('div', { class: 'muted' }, p.description || 'No description yet')),
    iconBtn('more', 'Project settings', openProjectMenu),
    h('button', { class: 'btn primary', onClick: () => openTaskModal(name, null) }, icon('plus'), 'New task'));

  const tabs = h('nav', { class: 'tabs' }, tabList.map(([key, label, ico]) => h('a', { class: 'tab' + (key === tab ? ' active' : ''), href: `#/p/${name}/${key}` },
    icon(ico), label,
    counts[key] ? h('span', { class: 'count', style: key === 'tasks' && overdue ? { background: 'color-mix(in srgb, var(--blocked) 25%, transparent)', color: 'var(--blocked)' } : null }, counts[key]) : null)));

  const content = { overview: () => overviewTab(name), tasks: () => tasksTab(name), env: () => envsTab(name), commands: () => commandsTab(name), notes: () => notesTab(name) }[tab]();
  return h('div', {}, header, tabs, content);
}

function overviewTab(name) {
  const doc = state.docs[name];
  const p = doc.project;
  const open = p.tasks.filter((t) => t.status !== 'done');
  const done = p.tasks.filter((t) => t.status === 'done');
  const overdue = open.filter((t) => dueState(t) === 'overdue');

  const stat = (value, label, color) => h('div', { class: 'stat', style: { '--c': color } }, h('b', {}, value), h('span', {}, label));
  const stats = h('div', { class: 'stats' },
    stat(open.length, 'Open tasks', 'var(--doing)'),
    stat(open.filter((t) => t.status === 'doing').length, 'In progress', 'var(--accent)'),
    stat(overdue.length, 'Overdue', overdue.length ? 'var(--blocked)' : 'var(--border-2)'),
    stat(done.length, 'Completed', 'var(--done)'));

  // Next up: what is being worked on, then what is most pressing.
  const rank = (t) => (t.status === 'doing' ? 0 : dueState(t) === 'overdue' ? 1 : t.status === 'blocked' ? 2 : 3);
  const next = sortTasks(open).sort((a, b) => rank(a) - rank(b)).slice(0, 6);

  const wins = done.filter((t) => t.impact || t.solution).sort((a, b) => (b.completed_on || '').localeCompare(a.completed_on || '')).slice(0, 5);

  const descInput = h('textarea', { rows: 2, placeholder: 'What is this project?', value: p.description });
  const saveDescription = () => { const v = descInput.value.trim(); if (v !== p.description) update(name, (d) => { d.project.description = v; }); };
  descInput.addEventListener('blur', saveDescription);

  return h('div', { class: 'stack', style: { gap: '18px' } },
    stats,
    h('div', { class: 'grid-2' },
      h('div', { class: 'card' },
        h('div', { class: 'card-h' }, icon('bolt'), h('h3', {}, 'Next up'), h('span', { class: 'grow' }), h('a', { class: 'btn ghost sm', href: `#/p/${name}/tasks` }, 'All tasks')),
        next.length ? next.map((t) => taskRow(name, t)) : emptyState('🎉', 'All clear', 'No open tasks. Add one when something comes up.')),
      h('div', { class: 'card' },
        h('div', { class: 'card-h' }, icon('trophy'), h('h3', {}, 'Wins & learnings'), h('span', { class: 'grow' }),
          wins.length ? h('button', { class: 'btn ghost sm', title: 'Copy every completed write-up as Markdown', onClick: () => copyText(done.filter((t) => t.impact || t.solution).map((t) => taskWriteup(name, t)).join('\n---\n\n'), 'Copied all write-ups as Markdown') }, icon('copy'), 'Copy all') : null),
        wins.length
          ? h('div', { class: 'stack' }, wins.map((t) => h('div', { class: 'win', onClick: () => openTaskModal(name, t.id) },
            h('div', { class: 'row' }, h('b', { class: 'grow' }, t.title), h('span', { class: 'faint' }, friendlyDate(t.completed_on))),
            h('p', {}, t.impact || t.solution))))
          : emptyState('🏆', 'Your playbook starts here', 'When you finish a task, add the impact and solution. They collect here — great for interviews and client pitches.'))),
    h('div', { class: 'grid-2' },
      wsOf(doc) === 'office' || envNames(doc).length ? h('div', { class: 'card' },
        h('div', { class: 'card-h' }, icon('layers'), h('h3', {}, 'Environments')),
        envNames(doc).length
          ? h('div', { class: 'row', style: { flexWrap: 'wrap' } }, envNames(doc).map((env) => h('a', { class: 'chip env', style: { background: envColor(env), padding: '4px 12px', textDecoration: 'none' }, href: `#/p/${name}/env`, onClick: () => { state.ui.env[name] = env; } }, env)))
          : h('span', { class: 'muted' }, 'None yet')) : null,
      h('div', { class: 'card' }, h('div', { class: 'card-h' }, icon('edit'), h('h3', {}, 'Description')), descInput)));
}
