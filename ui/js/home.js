// Home: high-level view of the current workspace.
import { h, icon, avatar, envColor, todayStr, ymd, toast } from './lib.js';
import {
  state, allTasks, dueState, remindDue, projectNames, envNames, update, wsOf, WS_META, PRIORITY_RANK,
  tomorrowAt,
} from './store.js';
import { quickAdd, taskRow } from './tasks.js';
import { openStandup } from './standup.js';

function greeting() {
  const hour = new Date().getHours();
  return hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

function remindLater(project, task, value, message) {
  update(project, (d) => {
    const t = d.project.tasks.find((x) => x.id === task.id);
    t.remind_at = value;
    delete t.dismissed;
    delete t.notified;
  }, { silent: true });
  toast(message);
}

function reminderActions(project, task) {
  const inOneHour = () => {
    const d = new Date(Date.now() + 3600000);
    return `${ymd(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  return h('div', { class: 'row wrap reminder-actions' },
    h('span', { class: 'muted' }, 'Remind me again'),
    h('button', { class: 'chip-btn', onClick: () => remindLater(project, task, inOneHour(), 'Snoozed for an hour') }, 'In 1 hour'),
    h('button', { class: 'chip-btn', onClick: () => remindLater(project, task, tomorrowAt(9), 'Snoozed until tomorrow 9am') }, 'Tomorrow 9am'),
    h('button', { class: 'chip-btn quiet', onClick: () => update(project, (d) => { const t = d.project.tasks.find((x) => x.id === task.id); t.dismissed = t.remind_at; }, { silent: true }) }, 'Dismiss'));
}

const fact = (value, label, tone) => h('div', { class: 'fact' + (value && tone ? ' ' + tone : '') }, h('b', {}, value), h('span', {}, label));

export function homeView() {
  const ws = state.ui.ws;
  const meta = WS_META[ws];
  const names = projectNames(ws);
  const everything = allTasks(ws);
  const open = everything.filter(({ task }) => task.status !== 'done');
  const today = todayStr();

  if (!names.length) {
    return h('div', { class: 'welcome' },
      h('span', { class: 'ws-badge' }, icon(meta.icon)),
      h('h1', {}, ws === 'office' ? 'Nothing at the office yet' : 'Your personal space is empty'),
      h('p', {}, ws === 'office'
        ? 'Add a work project to keep its environments, commands and tasks together.'
        : 'Add a project for anything outside work: a move, a trip, health, money, a course.'),
      h('button', { class: 'btn primary', onClick: () => document.dispatchEvent(new CustomEvent('envfetch:new-project')) }, icon('plus'), 'New project'));
  }

  const needs = open.filter(({ task }) => dueState(task) === 'overdue' || dueState(task) === 'today' || remindDue(task) || task.status === 'blocked');
  const score = ({ task }) => (dueState(task) === 'overdue' ? 0 : remindDue(task) ? 1 : dueState(task) === 'today' ? 2 : 3);
  needs.sort((a, b) => score(a) - score(b) || PRIORITY_RANK[a.task.priority] - PRIORITY_RANK[b.task.priority]);
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const doneWeek = everything.filter(({ task }) => task.status === 'done' && task.completed_on >= ymd(weekAgo));
  const doing = open.filter(({ task }) => task.status === 'doing');
  const overdueCount = open.filter(({ task }) => dueState(task) === 'overdue').length;
  const todayCount = open.filter(({ task }) => dueState(task) === 'today').length;
  const dateText = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const headline = needs.length ? `${needs.length} thing${needs.length > 1 ? 's need' : ' needs'} you` : 'All caught up';

  return h('div', { class: 'home' },
    h('header', { class: 'hero' },
      h('div', { class: 'grow' }, h('p', { class: 'hello' }, `${greeting()} · ${dateText}`), h('h1', {}, headline)),
      h('button', { class: 'btn', onClick: openStandup, title: 'Write today\'s update (S)' }, icon('sparkle'), 'Write my update')),
    h('div', { class: 'facts' },
      fact(overdueCount, 'overdue', 'bad'),
      fact(todayCount, 'due today', 'warn'),
      fact(doing.length, 'in progress'),
      fact(doneWeek.length, 'done this week', 'good')),
    quickAdd(null, { projects: names }),
    needs.length ? h('section', { class: 'panel lead' },
      h('header', {}, icon('alert'), h('h3', {}, 'Needs you'), h('span', { class: 'count' }, needs.length)),
      needs.map(({ project, task }) => h('div', {},
        taskRow(project, task, { showProject: true }),
        remindDue(task) ? reminderActions(project, task) : null))) : null,
    h('h2', { class: 'section-h' }, ws === 'office' ? 'Your projects' : 'Your lists'),
    h('div', { class: 'grid-auto' }, names.map((name) => projectCard(name))));
}

function projectCard(name) {
  const doc = state.docs[name];
  const p = doc.project;
  const open = p.tasks.filter((t) => t.status !== 'done');
  const overdue = open.filter((t) => dueState(t) === 'overdue').length;
  const doing = open.filter((t) => t.status === 'doing').length;
  const envs = wsOf(doc) === 'office' ? envNames(doc) : [];
  return h('a', { class: 'proj-card', href: `#/p/${name}` },
    h('div', { class: 'row' }, avatar(name, true), h('div', { class: 'grow' }, h('h4', {}, name), h('div', { class: 'faint' }, `${open.length} open · ${p.tasks.length - open.length} done`))),
    h('p', {}, p.description || 'No description'),
    h('div', { class: 'proj-meta' },
      overdue ? h('span', { class: 'chip overdue' }, `${overdue} overdue`) : null,
      doing ? h('span', { class: 'chip soon' }, `${doing} in progress`) : null,
      envs.map((env) => h('span', { class: 'chip env', style: { background: envColor(env) } }, env))));
}
