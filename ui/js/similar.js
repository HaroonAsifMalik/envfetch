// "Have I done this before?" — finds past tasks that look like the one you are writing,
// so you can reuse the steps and the solution instead of re-deriving them.
// The matching (findSimilar) is plain functions with no DOM, so it is easy to test.
import { h, icon } from './lib.js';
import { state, allTasks, wsOf } from './store.js';

const STOP = new Set(('the and for with from into onto this that these those then than when what where which while will would '
  + 'should could have has had are was were been being not but all any can our out its their your you per via new add fix make '
  + 'use using need needs get set run task todo item thing stuff more less some also just very about after before over under').split(' '));

// Very light stemming so "deploying", "deployed" and "deploys" all match "deploy".
function stem(word) {
  return word.replace(/(ing|ed|es|s)$/, (m, end, offset) => (offset >= 3 ? '' : m));
}

export function tokens(text) {
  const words = String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
  return [...new Set(words.map(stem).filter((w) => w.length > 2))];
}

const bodyOf = (task) => [task.notes, task.solution, task.challenges, task.impact, ...(task.steps || []).map((s) => s.text)].join(' ');
const hasValue = (task) => task.status === 'done' || !!task.solution || (task.steps || []).length > 0;

/**
 * @param target      {title, notes, category, id}   the task being written
 * @param candidates  [{project, task}]               everything to search
 * @param limit       how many to return
 * @param skip        {project, id} to leave out (the task itself)
 * @returns [{project, task, score, shared}] best first
 */
export function findSimilar(target, candidates, limit = 3, skip = null) {
  const wantTitle = tokens(target.title);
  const wantBody = tokens(target.notes);
  if (!wantTitle.length) return [];

  const scored = [];
  for (const { project, task } of candidates) {
    if (skip && skip.project === project && skip.id === task.id) continue;
    if (!hasValue(task)) continue;
    const theirTitle = new Set(tokens(task.title));
    const theirBody = new Set(tokens(bodyOf(task)));
    const shared = new Set();
    let score = 0;
    for (const word of wantTitle) {
      if (theirTitle.has(word)) { score += 3; shared.add(word); }
      else if (theirBody.has(word)) { score += 1; shared.add(word); }
    }
    for (const word of wantBody) if (theirTitle.has(word) || theirBody.has(word)) { score += 0.5; shared.add(word); }
    if (!shared.size) continue;
    if (target.category && target.category === task.category) score += 0.5;
    if (task.solution || task.impact) score += 0.5;
    if (score < 3) continue; // one passing word in the body is noise
    scored.push({ project, task, score, shared: [...shared] });
  }
  scored.sort((a, b) => b.score - a.score || (b.task.completed_on || '').localeCompare(a.task.completed_on || ''));
  return scored.slice(0, limit);
}

// ---------- the panel inside the task editor --------------------------------- //
export function similarPanel({ project, getTask, onReuse, onOpen }) {
  const box = h('section', { class: 'similar hidden', 'aria-label': 'Similar past tasks' });
  let lastSignature = '';

  const refresh = () => {
    const task = getTask();
    const ws = wsOf(state.docs[project]);
    const found = findSimilar(task, allTasks(ws), 3, { project, id: task.id });
    const signature = found.map((f) => f.project + f.task.id + f.score).join('|');
    if (signature === lastSignature) return;
    lastSignature = signature;
    box.classList.toggle('hidden', !found.length);
    box.replaceChildren(...(found.length ? [
      h('div', { class: 'similar-h' }, icon('clock'), h('b', {}, 'You have done something like this before'),
        h('span', { class: 'faint' }, 'Reuse what worked')),
      ...found.map(({ project: from, task: past }) => entry(from, past)),
    ] : []));
  };

  const entry = (from, past) => {
    const steps = (past.steps || []).filter((s) => s.text);
    const detail = [];
    if (past.solution) detail.push(h('div', {}, h('b', {}, 'How it was done'), h('p', {}, past.solution)));
    if (past.challenges) detail.push(h('div', {}, h('b', {}, 'What was tricky'), h('p', {}, past.challenges)));
    if (steps.length) detail.push(h('div', {}, h('b', {}, 'Steps'), h('ul', {}, steps.map((s) => h('li', {}, s.text)))));
    return h('div', { class: 'sim' },
      h('div', { class: 'row' },
        h('b', { class: 'grow' }, past.title),
        h('span', { class: 'chip' }, from),
        past.completed_on ? h('span', { class: 'faint' }, 'finished ' + past.completed_on) : h('span', { class: 'faint' }, past.status)),
      past.impact || past.solution ? h('p', { class: 'muted sim-snip' }, past.impact || past.solution) : null,
      detail.length ? h('details', {}, h('summary', {}, 'See how it was done'), h('div', { class: 'sim-detail' }, detail)) : null,
      h('div', { class: 'row wrap' },
        steps.length ? h('button', { class: 'btn sm', onClick: () => onReuse(steps.map((s) => s.text)) }, icon('plus'), `Reuse ${steps.length} step${steps.length > 1 ? 's' : ''}`) : null,
        h('button', { class: 'btn sm ghost', onClick: () => onOpen(from, past.id) }, icon('external'), 'Open it')));
  };

  return { el: box, refresh };
}
