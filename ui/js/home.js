// Home: everything that needs you, across every project, on one page.
import { h, icon, avatar, envColor, todayStr, ymd, toast } from './lib.js';
import { state, allTasks, dueState, remindDue, projectNames, envNames, update, PRIORITY_RANK } from './store.js';
import { quickAdd, taskRow } from './tasks.js';

function greeting() {
  const hour = new Date().getHours();
  return hour < 5 ? 'Burning the midnight oil' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

function reminderActions(project, task) {
  const snooze = (minutes) => {
    const when = new Date(Date.now() + minutes * 60000);
    const value = `${ymd(when)}T${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;
    update(project, (d) => { const t = d.project.tasks.find((x) => x.id === task.id); t.remind_at = value; delete t.dismissed; delete t.notified; }, { silent: true });
    toast('Snoozed');
  };
  return h('div', { class: 'row', style: { padding: '0 12px 8px 50px', flexWrap: 'wrap' } },
    h('span', { class: 'muted', style: { fontSize: '12px' } }, 'Snooze or dismiss:'),
    h('button', { class: 'btn sm', onClick: () => snooze(60) }, 'Snooze 1h'),
    h('button', { class: 'btn sm', onClick: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); const v = `${ymd(d)}T09:00`; update(project, (doc) => { const t = doc.project.tasks.find((x) => x.id === task.id); t.remind_at = v; delete t.dismissed; delete t.notified; }, { silent: true }); toast('Snoozed until tomorrow 9am'); } }, 'Tomorrow 9am'),
    h('button', { class: 'btn sm ghost', onClick: () => update(project, (d) => { const t = d.project.tasks.find((x) => x.id === task.id); t.dismissed = t.remind_at; }, { silent: true }) }, 'Dismiss'));
}

export function homeView() {
  const names = projectNames();
  const everything = allTasks();
  const open = everything.filter(({ task }) => task.status !== 'done');
  const today = todayStr();

  const needs = open.filter(({ task }) => dueState(task) === 'overdue' || dueState(task) === 'today' || remindDue(task) || task.status === 'blocked');
  const score = ({ task }) => (dueState(task) === 'overdue' ? 0 : remindDue(task) ? 1 : dueState(task) === 'today' ? 2 : 3);
  needs.sort((a, b) => score(a) - score(b) || PRIORITY_RANK[a.task.priority] - PRIORITY_RANK[b.task.priority]);
  const doing = open.filter(({ task }) => task.status === 'doing');
  const weekAhead = new Date(); weekAhead.setDate(weekAhead.getDate() + 7);
  const upcoming = open.filter(({ task }) => task.due && task.due > today && task.due <= ymd(weekAhead)).sort((a, b) => a.task.due.localeCompare(b.task.due));
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const doneWeek = everything.filter(({ task }) => task.status === 'done' && task.completed_on >= ymd(weekAgo));

  const stat = (value, label, color) => h('div', { class: 'stat', style: { '--c': color } }, h('b', {}, value), h('span', {}, label));
  const section = (title, ico, items, empty) => h('div', { class: 'card' },
    h('div', { class: 'card-h' }, icon(ico), h('h3', {}, title), h('span', { class: 'faint' }, items.length || '')),
    items.length ? items.map(({ project, task }) => h('div', {}, taskRow(project, task, { showProject: true }), remindDue(task) ? reminderActions(project, task) : null)) : h('div', { class: 'muted', style: { padding: '6px 2px' } }, empty));

  if (!names.length) {
    return h('div', { class: 'hero' }, h('h1', {}, 'Welcome to ', h('span', {}, 'EnvFetch')), h('p', {}, 'Create your first project to start collecting env vars, links, commands and tasks.'),
      h('div', { style: { marginTop: '18px' } }, h('button', { class: 'btn primary', onClick: () => document.dispatchEvent(new CustomEvent('envfetch:new-project')) }, icon('plus'), 'New project')));
  }

  const dateText = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const overdueCount = open.filter(({ task }) => dueState(task) === 'overdue').length;
  const todayCount = open.filter(({ task }) => dueState(task) === 'today').length;

  return h('div', {},
    h('div', { class: 'hero' }, h('h1', {}, greeting(), '. ', h('span', {}, needs.length ? `${needs.length} thing${needs.length > 1 ? 's need' : ' needs'} you.` : 'You are all caught up.')), h('p', {}, dateText)),
    quickAdd(null, { projects: names }),
    h('div', { class: 'stats' },
      stat(overdueCount, 'Overdue', overdueCount ? 'var(--blocked)' : 'var(--border-2)'),
      stat(todayCount, 'Due today', todayCount ? 'var(--warn)' : 'var(--border-2)'),
      stat(doing.length, 'In progress', 'var(--doing)'),
      stat(doneWeek.length, 'Done this week', 'var(--done)')),
    h('div', { class: 'grid-2' },
      h('div', { class: 'stack' },
        section('Needs attention', 'alert', needs, 'Nothing overdue, due today, blocked or reminding you. Nice.'),
        section('Coming up this week', 'clock', upcoming, 'Nothing due in the next 7 days.')),
      h('div', { class: 'stack' },
        section('In progress', 'bolt', doing, 'Nothing in progress. Pick something from a board.'),
        h('div', { class: 'card' }, h('div', { class: 'card-h' }, icon('trophy'), h('h3', {}, 'Done this week'), h('span', { class: 'faint' }, doneWeek.length || '')),
          doneWeek.length ? doneWeek.slice(0, 6).map(({ project, task }) => taskRow(project, task, { showProject: true })) : h('div', { class: 'muted', style: { padding: '6px 2px' } }, 'Finished tasks show up here.')))),
    h('div', { class: 'card-h', style: { margin: '28px 0 12px' } }, icon('folder'), h('h3', {}, 'Projects')),
    h('div', { class: 'grid-auto' }, names.map((name) => projectCard(name))));
}

function projectCard(name) {
  const doc = state.docs[name];
  const p = doc.project;
  const open = p.tasks.filter((t) => t.status !== 'done');
  const overdue = open.filter((t) => dueState(t) === 'overdue').length;
  const doing = open.filter((t) => t.status === 'doing').length;
  return h('a', { class: 'proj-card', href: `#/p/${name}` },
    h('div', { class: 'row' }, avatar(name, true), h('div', { class: 'grow' }, h('h4', {}, name), h('div', { class: 'faint' }, `${open.length} open · ${p.tasks.length - open.length} done`))),
    h('p', {}, p.description || 'No description'),
    h('div', { class: 'proj-meta' },
      overdue ? h('span', { class: 'chip overdue' }, `${overdue} overdue`) : null,
      doing ? h('span', { class: 'chip soon' }, `${doing} in progress`) : null,
      envNames(doc).map((env) => h('span', { class: 'chip env', style: { background: envColor(env) } }, env))));
}
