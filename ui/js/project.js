// A single project: header, tabs, and the Overview tab.
import { h, icon, iconBtn, avatar, envColor, copyText, emptyState, friendlyDate } from './lib.js';
import { state, update, envNames, sortTasks, dueState, taskWriteup, STATUS_LABEL } from './store.js';
import { tasksTab, taskRow, openTaskModal } from './tasks.js';
import { envsTab } from './envs.js';
import { linksTab, commandsTab, notesTab } from './misc.js';

export const TABS = [
  ['overview', 'Overview', 'home'],
  ['tasks', 'Tasks', 'board'],
  ['env', 'Environments', 'layers'],
  ['links', 'Links', 'link'],
  ['commands', 'Commands', 'terminal'],
  ['notes', 'Notes', 'note'],
];

export function projectView(name, tab) {
  const doc = state.docs[name];
  if (!doc) return emptyState('🕳️', 'Project not found', `There is no project called "${name}".`, h('a', { class: 'btn', href: '#/' }, 'Back home'));
  if (!TABS.some(([key]) => key === tab)) tab = 'overview';

  const p = doc.project;
  const open = p.tasks.filter((t) => t.status !== 'done');
  const overdue = open.filter((t) => dueState(t) === 'overdue').length;
  const counts = {
    tasks: open.length,
    env: envNames(doc).length,
    links: p.links.length,
    commands: Object.keys(p.commands).length,
    notes: p.notes.length,
  };

  const header = h('div', { class: 'phead' },
    avatar(name, true),
    h('div', { class: 'grow' }, h('h1', {}, name), h('div', { class: 'muted' }, p.description || 'No description yet')),
    h('button', { class: 'btn primary', onClick: () => openTaskModal(name, null) }, icon('plus'), 'New task'));

  const tabs = h('nav', { class: 'tabs' }, TABS.map(([key, label, ico]) => h('a', { class: 'tab' + (key === tab ? ' active' : ''), href: `#/p/${name}/${key}` },
    icon(ico), label,
    counts[key] ? h('span', { class: 'count', style: key === 'tasks' && overdue ? { background: 'color-mix(in srgb, var(--blocked) 25%, transparent)', color: 'var(--blocked)' } : null }, counts[key]) : null)));

  const content = { overview: () => overviewTab(name), tasks: () => tasksTab(name), env: () => envsTab(name), links: () => linksTab(name), commands: () => commandsTab(name), notes: () => notesTab(name) }[tab]();
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
      h('div', { class: 'card' },
        h('div', { class: 'card-h' }, icon('layers'), h('h3', {}, 'Environments')),
        envNames(doc).length
          ? h('div', { class: 'row', style: { flexWrap: 'wrap' } }, envNames(doc).map((env) => h('a', { class: 'chip env', style: { background: envColor(env), padding: '4px 12px', textDecoration: 'none' }, href: `#/p/${name}/env`, onClick: () => { state.ui.env[name] = env; } }, env)))
          : h('span', { class: 'muted' }, 'None yet'),
        p.links.length ? h('div', { style: { marginTop: '16px' } }, h('div', { class: 'card-h' }, icon('link'), h('h3', {}, 'Quick links')),
          h('div', { class: 'row', style: { flexWrap: 'wrap' } }, p.links.slice(0, 6).map((l) => h('a', { class: 'btn sm', href: l.url, target: '_blank', rel: 'noopener noreferrer' }, icon('external'), l.title)))) : null),
      h('div', { class: 'card' }, h('div', { class: 'card-h' }, icon('edit'), h('h3', {}, 'Description')), descInput)));
}
