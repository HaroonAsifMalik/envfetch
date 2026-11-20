// Standup generator: turns what you did, are doing and are stuck on into text you can paste into chat.
// buildStandup() is pure (no DOM) so it can be tested; openStandup() is the dialog around it.
import { h, icon, openModal, closeModal, copyText, ymd } from './lib.js';
import { state, allTasks, WS_META } from './store.js';

const DAY = 86400000;
const parse = (s) => new Date(s + 'T00:00:00');
const addDays = (s, n) => ymd(new Date(parse(s).getTime() + n * DAY));
const weekday = (s) => parse(s).toLocaleDateString('en-US', { weekday: 'long' });

function line(entry, { withImpact = false, today }) {
  const { project, task } = entry;
  const steps = task.steps || [];
  const done = steps.filter((s) => s.done).length;
  let text = `- ${task.title} (${project})`;
  if (steps.length && task.status !== 'done') text += ` ${done}/${steps.length} steps`;
  if (task.status !== 'done' && task.due && task.due < today) text += ' - overdue';
  else if (task.status !== 'done' && task.due === today) text += ' - due today';
  if (withImpact && task.impact) text += `: ${task.impact.replace(/\s+/g, ' ').trim()}`;
  return text;
}

const byPriority = (a, b) => ['urgent', 'high', 'medium', 'low'].indexOf(a.task.priority) - ['urgent', 'high', 'medium', 'low'].indexOf(b.task.priority);

/**
 * @param entries  [{project, task}]
 * @param mode     'daily' | 'weekly'
 * @param today    'YYYY-MM-DD' (injectable for tests)
 * @returns {title, markdown, sections: [{heading, items:[entry]}]}
 */
export function buildStandup(entries, { mode = 'daily', today = ymd(new Date()) } = {}) {
  const open = entries.filter(({ task }) => task.status !== 'done');
  const finished = entries.filter(({ task }) => task.status === 'done' && task.completed_on);
  const sections = [];

  if (mode === 'weekly') {
    const since = addDays(today, -7);
    sections.push({ heading: 'Done this week', items: finished.filter(({ task }) => task.completed_on > since).sort((a, b) => b.task.completed_on.localeCompare(a.task.completed_on)), impact: true });
    sections.push({ heading: 'In progress', items: open.filter(({ task }) => task.status === 'doing' || task.status === 'review').sort(byPriority) });
    sections.push({ heading: 'Coming up', items: open.filter(({ task }) => task.due && task.due >= today && task.due <= addDays(today, 7)).sort((a, b) => a.task.due.localeCompare(b.task.due)) });
  } else {
    // Monday's standup looks back to Friday, any other day to yesterday.
    const dow = parse(today).getDay();
    const since = addDays(today, dow === 1 ? -3 : dow === 0 ? -2 : -1);
    const heading = since === addDays(today, -1) ? 'Yesterday' : `Since ${weekday(since)}`;
    sections.push({ heading, items: finished.filter(({ task }) => task.completed_on >= since && task.completed_on <= today).sort((a, b) => b.task.completed_on.localeCompare(a.task.completed_on)), impact: true });
    const todayItems = open.filter(({ task }) => task.status === 'doing' || (task.due && task.due <= today && task.status !== 'blocked'));
    sections.push({ heading: 'Today', items: todayItems.sort(byPriority) });
  }
  sections.push({ heading: 'Blockers', items: open.filter(({ task }) => task.status === 'blocked').sort(byPriority), empty: 'None' });

  const title = mode === 'weekly' ? `Weekly update, week of ${addDays(today, -6)}` : `Standup, ${weekday(today)} ${today}`;
  const out = [`**${title}**`, ''];
  for (const section of sections) {
    out.push(`**${section.heading}**`);
    if (section.items.length) out.push(...section.items.map((entry) => line(entry, { withImpact: section.impact, today })));
    else out.push(`- ${section.empty || 'Nothing'}`);
    out.push('');
  }
  return { title, markdown: out.join('\n').trim() + '\n', sections };
}

// ---------- dialog ----------------------------------------------------------- //
export function openStandup() {
  let mode = 'daily';
  const ws = state.ui.ws;
  const entries = () => allTasks(ws);
  const preview = h('textarea', { class: 'standup-text', readonly: true, rows: 14, spellcheck: 'false' });
  const seg = h('div', { class: 'seg' });

  const draw = () => {
    const result = buildStandup(entries(), { mode });
    preview.value = result.markdown;
    seg.replaceChildren(...[['daily', 'Daily standup'], ['weekly', 'Weekly update']].map(([key, label]) =>
      h('button', { class: mode === key ? 'on' : '', onClick: () => { mode = key; draw(); } }, label)));
  };
  draw();

  openModal([
    h('div', { class: 'm-head' }, icon('note'), h('b', { style: { color: 'var(--text)' } }, 'Write my update'), h('span', { class: 'faint' }, `from your ${WS_META[ws].label.toLowerCase()} tasks`),
      h('span', { class: 'spacer' }), h('button', { class: 'icon-btn', title: 'Close', 'aria-label': 'Close', onClick: () => closeModal() }, icon('x'))),
    h('div', { class: 'm-body' }, seg, preview,
      h('div', { class: 'hint faint' }, 'Built from finished tasks, work in progress and blockers. Edit the text after you paste it.')),
    h('div', { class: 'm-foot' }, h('span', { class: 'spacer' }),
      h('button', { class: 'btn', onClick: () => closeModal() }, 'Close'),
      h('button', { class: 'btn primary', onClick: () => copyText(preview.value, 'Update copied') }, icon('copy'), 'Copy as Markdown')),
  ], { size: 'wide' });
}
