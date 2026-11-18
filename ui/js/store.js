// State, API client, and the (small) domain logic shared by every view.
import { toast, todayStr, nowStr, ymd, pad, daysBetween } from './lib.js';

// ---------- workspaces: Office and Personal --------------------------------- //
export const WORKSPACES = ['office', 'personal'];
export const WS_META = {
  office: {
    label: 'Office', icon: 'briefcase',
    categories: ['feature', 'bug', 'improvement', 'chore', 'research'], defaultCategory: 'feature',
    taskPlaceholder: 'Capture a task…  e.g.  Upgrade DB to PG16 !high #chore @friday',
    projectHint: 'Work project with environments, links and commands.',
    descPlaceholder: 'One line about it (optional)',
  },
  personal: {
    label: 'Personal', icon: 'heart',
    categories: ['errand', 'health', 'money', 'home', 'learning', 'family', 'fun'], defaultCategory: 'errand',
    taskPlaceholder: 'Capture a task…  e.g.  Renew passport !high #errand @+3d',
    projectHint: 'Life project: tasks, links and notes. No environments.',
    descPlaceholder: 'e.g. Moving to a new flat',
  },
};

export const STATUSES = ['todo', 'doing', 'blocked', 'review', 'done'];
export const STATUS_LABEL = { todo: 'To do', doing: 'In progress', blocked: 'Blocked', review: 'In review', done: 'Done' };
export const STATUS_COLOR = { todo: 'var(--todo)', doing: 'var(--doing)', blocked: 'var(--blocked)', review: 'var(--review)', done: 'var(--done)' };
export const PRIORITIES = ['urgent', 'high', 'medium', 'low'];
export const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 };
export const DEFAULT_CATEGORIES = ['feature', 'bug', 'improvement', 'chore', 'research'];

export const state = {
  docs: {},       // project name -> document
  revs: {},       // project name -> version token (for conflict detection)
  errors: {},     // project name -> read error
  meta: {},
  ui: loadUi(),   // persisted view preferences
};

function loadUi() {
  const defaults = { view: 'board', showDone: false, ws: 'office', env: {}, filter: { q: '', category: '', priority: '' } };
  try {
    const ui = { ...defaults, ...JSON.parse(localStorage.getItem('envfetch.ui') || '{}') };
    if (!WORKSPACES.includes(ui.ws)) ui.ws = 'office';
    return ui;
  } catch { return defaults; }
}

export const wsOf = (doc) => (doc && doc.project && WORKSPACES.includes(doc.project.workspace) ? doc.project.workspace : 'office');

export function setWorkspace(ws) {
  if (!WORKSPACES.includes(ws)) return;
  state.ui.ws = ws;
  state.ui.filter = { q: '', category: '', priority: '' };
  try { document.documentElement.dataset.ws = ws; } catch { /* not in a browser */ }
  saveUi();
}

export const categoriesFor = (doc, tasks = []) =>
  [...new Set([...WS_META[wsOf(doc)].categories, ...tasks.map((t) => t.category)])].filter(Boolean);
export function saveUi() {
  try {
    const { editing, diff, ...persisted } = state.ui; // transient bits stay out of storage
    localStorage.setItem('envfetch.ui', JSON.stringify(persisted));
  } catch { /* private mode */ }
}

export const bus = new EventTarget();
export const rerender = () => bus.dispatchEvent(new Event('render'));

// ---------- API ------------------------------------------------------------- //
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-EnvFetch': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const error = new Error((data && data.error) || res.statusText);
    error.status = res.status;
    throw error;
  }
  return data;
}

export async function loadAll() {
  const [meta, all] = await Promise.all([api('/meta'), api('/all')]);
  state.meta = meta;
  state.docs = {};
  state.revs = {};
  for (const [name, { doc, rev }] of Object.entries(all.projects)) {
    state.docs[name] = shape(doc);
    state.revs[name] = rev;
  }
  state.errors = all.errors || {};
}

const isObj = (value) => value && typeof value === 'object' && !Array.isArray(value);

export function shape(doc) {
  const project = doc.project = isObj(doc.project) ? doc.project : {};
  if (typeof project.description !== 'string') project.description = '';
  if (!WORKSPACES.includes(project.workspace)) project.workspace = 'office';
  if (!isObj(project.commands)) project.commands = {};
  if (!Array.isArray(project.notes)) project.notes = [];
  if (!Array.isArray(project.links)) project.links = [];
  if (!Array.isArray(project.tasks)) project.tasks = [];
  // Hand-edited JSON may skip fields; fill the gaps so views never crash.
  project.tasks = project.tasks.filter(isObj).map((task) => {
    const full = { ...blankTask(), ...task };
    if (!Array.isArray(full.steps)) full.steps = [];
    if (!Array.isArray(full.links)) full.links = [];
    full.steps = full.steps.map((s) => (isObj(s) ? { text: String(s.text ?? ''), done: !!s.done } : { text: String(s), done: false }));
    if (!STATUSES.includes(full.status)) full.status = 'todo';
    if (!(full.priority in PRIORITY_RANK)) full.priority = 'medium';
    return full;
  });
  return doc;
}

const clone = (value) => JSON.parse(JSON.stringify(value));

// Saves are queued per project so rapid edits (drag, drag, drag) never race.
const queues = {};
export function update(name, mutate, { silent = false } = {}) {
  const run = async () => {
    const draft = clone(state.docs[name]);
    if (mutate(draft) === false) return;
    try {
      const res = await api('/projects/' + name, { method: 'PUT', body: { doc: draft, rev: state.revs[name] } });
      state.docs[name] = shape(draft);
      state.revs[name] = res.rev;
      if (!silent) toast('Saved', 'ok', 1100);
    } catch (error) {
      if (error.status === 409) {
        toast('That file changed on disk, so I reloaded it. Please redo your last edit.', 'warn', 4000);
        await loadAll();
      } else {
        toast('Could not save: ' + error.message, 'error', 4000);
      }
    }
    rerender();
  };
  queues[name] = (queues[name] || Promise.resolve()).then(run, run);
  return queues[name];
}

export async function createProject(name, description, workspace = 'office') {
  const res = await api('/projects', { method: 'POST', body: { name, description, workspace } });
  state.docs[res.name] = shape(res.doc);
  state.revs[res.name] = res.rev;
  return res.name;
}

export async function importLegacy(name) {
  const res = await api(`/projects/${name}/import-legacy`, { method: 'POST', body: {} });
  state.docs[name] = shape(res.doc);
  state.revs[name] = res.rev;
  rerender();
  return res.imported;
}

// ---------- projects & environments ---------------------------------------- //
const ENV_ORDER = ['local', 'dev', 'development', 'staging', 'stage', 'qa', 'uat', 'prod', 'production'];

export const projectNames = (ws) => Object.keys(state.docs).filter((name) => !ws || wsOf(state.docs[name]) === ws).sort();

export function envNames(doc) {
  const names = Object.keys(doc).filter((key) => key !== 'project' && isObj(doc[key]));
  const rank = (n) => { const i = ENV_ORDER.indexOf(n.toLowerCase()); return i === -1 ? 99 : i; };
  return names.sort((a, b) => rank(a) - rank(b));
}

const SENSITIVE_KEY = /(secret|password|passwd|pwd|token|api[_-]?key|access[_-]?key|private|credential|auth|dsn|signature|salt)|(^|[_-])key($|[_-])/i;
const URL_WITH_CREDENTIALS = /:\/\/[^/\s:@]+:[^@\s]+@/;
export const isSensitive = (key, value) => SENSITIVE_KEY.test(key) || URL_WITH_CREDENTIALS.test(String(value));
export const displayValue = (value) => (typeof value === 'string' ? value : JSON.stringify(value));
export const isHttp = (value) => /^https?:\/\/\S+$/i.test(String(value));

// ---------- tasks ----------------------------------------------------------- //
export function blankTask(defaults = {}) {
  return {
    id: '', title: '', status: 'todo', priority: 'medium', category: 'feature', due: '', remind_at: '',
    notes: '', links: [], steps: [], impact: '', challenges: '', solution: '',
    created: '', updated: '', completed_on: '', ...defaults,
  };
}

export function nextTaskId(tasks) {
  let max = 0;
  for (const task of tasks) {
    const match = /^t-(\d+)$/.exec(task.id || '');
    if (match) max = Math.max(max, Number(match[1]));
  }
  return 't-' + String(max + 1).padStart(3, '0');
}

const isoNow = () => new Date().toISOString().slice(0, 19);

export function applyStatus(task, status) {
  task.status = status;
  task.updated = isoNow();
  task.completed_on = status === 'done' ? (task.completed_on || todayStr()) : '';
}

export function addTask(doc, fields) {
  const task = { ...blankTask({ category: WS_META[wsOf(doc)].defaultCategory }), ...fields, id: nextTaskId(doc.project.tasks), created: isoNow(), updated: isoNow() };
  if (task.status === 'done') task.completed_on = todayStr();
  doc.project.tasks.push(task);
  return task;
}

export function allTasks(ws) {
  const out = [];
  for (const [project, doc] of Object.entries(state.docs)) {
    if (ws && wsOf(doc) !== ws) continue;
    for (const task of doc.project.tasks) out.push({ project, task });
  }
  return out;
}

// ---------- relative reminders: "remind me 12h after I deploy" -------------- //
const UNIT_MINUTES = { m: 1, h: 60, d: 1440, w: 10080 };

export function parseDelay(text) {
  const match = /^(\d+(?:\.\d+)?)\s*(m|mins?|minutes?|h|hrs?|hours?|d|days?|w|weeks?)$/i.exec(String(text || '').trim());
  if (!match) return null;
  return Math.round(Number(match[1]) * UNIT_MINUTES[match[2][0].toLowerCase()] * 60000);
}

const localStamp = (d) => `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** '12h' -> the local "YYYY-MM-DDTHH:MM" that many hours from now ('' if not understood). */
export function remindAtFrom(text, now = new Date()) {
  const ms = parseDelay(text);
  return ms ? localStamp(new Date(now.getTime() + ms)) : '';
}

export function tomorrowAt(hour, now = new Date()) {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return localStamp(d);
}

/** 'in 11h 30m', 'in 25 min', 'in 3 days' or 'time has passed'. */
export function untilLabel(remindAt, now = new Date()) {
  if (!remindAt) return '';
  const minutes = Math.round((new Date(remindAt) - now) / 60000);
  if (Number.isNaN(minutes)) return '';
  if (minutes <= 0) return 'time has passed';
  if (minutes < 60) return `in ${minutes} min`;
  if (minutes < 48 * 60) {
    const hours = Math.floor(minutes / 60), rest = minutes % 60;
    return rest && hours < 10 ? `in ${hours}h ${rest}m` : `in ${hours}h`;
  }
  return `in ${Math.round(minutes / 1440)} days`;
}

export function dueState(task) {
  if (task.status === 'done' || !task.due) return '';
  const diff = daysBetween(todayStr(), task.due);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  return diff <= 3 ? 'soon' : '';
}

export const remindDue = (task) =>
  !!task.remind_at && task.status !== 'done' && task.dismissed !== task.remind_at && task.remind_at.slice(0, 16) <= nowStr();

export function stepProgress(task) {
  const steps = task.steps || [];
  return { done: steps.filter((s) => s.done).length, total: steps.length };
}

export function sortTasks(tasks) {
  return [...tasks].sort((a, b) =>
    (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2) ||
    (a.due || '9999').localeCompare(b.due || '9999') ||
    a.id.localeCompare(b.id));
}

export function taskWriteup(project, task) {
  const lines = [`## ${task.title}`, ''];
  const meta = [`**Project:** ${project}`, `**Status:** ${STATUS_LABEL[task.status] || task.status}`, `**Category:** ${task.category}`];
  if (task.completed_on) meta.push(`**Completed:** ${task.completed_on}`);
  lines.push(meta.join(' · '), '');
  if (task.notes) lines.push(task.notes, '');
  if (task.steps.length) lines.push('### Steps', ...task.steps.map((s) => `- [${s.done ? 'x' : ' '}] ${s.text}`), '');
  if (task.impact) lines.push('### Impact', task.impact, '');
  if (task.challenges) lines.push('### Challenges', task.challenges, '');
  if (task.solution) lines.push('### Solution', task.solution, '');
  if (task.links.length) lines.push('### Links', ...task.links.map((l) => `- ${l}`), '');
  return lines.join('\n').trim() + '\n';
}

// ---------- quick add:  "Fix login bug !high #bug @friday" ------------------ //
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function parseDay(word) {
  const w = word.toLowerCase();
  const date = new Date();
  if (w === 'today') return ymd(date);
  if (w === 'tomorrow' || w === 'tmrw') { date.setDate(date.getDate() + 1); return ymd(date); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(w)) return w;
  const plus = /^\+(\d{1,3})d$/.exec(w);
  if (plus) { date.setDate(date.getDate() + Number(plus[1])); return ymd(date); }
  const day = WEEKDAYS.indexOf(w.slice(0, 3));
  if (day !== -1 && /^(sun|mon|tue|wed|thu|fri|sat)[a-z]*$/.test(w)) {
    date.setDate(date.getDate() + ((day - date.getDay() + 7) % 7 || 7));
    return ymd(date);
  }
  return '';
}

export function parseQuick(input) {
  const out = {};
  let text = input;
  text = text.replace(/(^|\s)!(low|medium|med|high|urgent)\b/i, (m, sp, p) => {
    p = p.toLowerCase();
    out.priority = p === 'med' ? 'medium' : p;
    return sp;
  });
  text = text.replace(/(^|\s)#([\w-]+)/, (m, sp, c) => { out.category = c.toLowerCase(); return sp; });
  // ~12h, ~30m, ~2d: remind me that long from now
  text = text.replace(/(^|\s)~(\d+(?:\.\d+)?[mhdw])(?=\s|$)/i, (m, sp, delay) => {
    const at = remindAtFrom(delay);
    if (!at) return m;
    out.remind_at = at;
    return sp;
  });
  text = text.replace(/(^|\s)@([\w+-]+)/, (m, sp, d) => {
    const due = parseDay(d);
    if (!due) return m;
    out.due = due;
    return sp;
  });
  out.title = text.replace(/\s+/g, ' ').trim();
  return out;
}
