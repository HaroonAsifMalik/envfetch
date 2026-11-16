// Tasks: cards, board, list, the task editor modal, and quick-add.
import {
  h, icon, iconBtn, toast, copyText, openModal, closeModal, confirmDialog, avatar, friendlyDate, ago, emptyState,
} from './lib.js';
import {
  state, saveUi, update, rerender, importLegacy, addTask, applyStatus, blankTask, dueState, remindDue,
  stepProgress, sortTasks, taskWriteup, parseQuick,
  STATUSES, STATUS_LABEL, STATUS_COLOR, PRIORITIES, DEFAULT_CATEGORIES,
} from './store.js';

// ---------- small building blocks ------------------------------------------ //
export function dueChip(task) {
  const dueNow = dueState(task);
  if (!task.due) return null;
  const label = dueNow === 'overdue' ? `Overdue · ${friendlyDate(task.due)}` : friendlyDate(task.due);
  return h('span', { class: 'chip ' + dueNow }, icon('clock'), label);
}

function progressBar(task) {
  const { done, total } = stepProgress(task);
  if (!total) return null;
  return h('div', { class: 'pbar', title: `${done}/${total} steps` }, h('i', { style: { width: (done / total) * 100 + '%' } }));
}

function badges(task, { project } = {}) {
  const { done, total } = stepProgress(task);
  return [
    project ? h('span', { class: 'chip' }, project) : null,
    h('span', { class: 'chip' }, task.category),
    dueChip(task),
    remindDue(task) ? h('span', { class: 'chip reminder' }, icon('bell'), 'Reminder') : null,
    total ? h('span', { class: 'chip' }, icon('check'), `${done}/${total}`) : null,
    task.impact ? h('span', { class: 'chip good', title: 'Has an impact write-up' }, icon('target'), 'Impact') : null,
  ];
}

export function toggleDone(project, task) {
  const next = task.status === 'done' ? 'todo' : 'done';
  update(project, (doc) => applyStatus(doc.project.tasks.find((t) => t.id === task.id), next));
}

export function taskRow(project, task, { showProject = false } = {}) {
  const done = task.status === 'done';
  return h('div', {
    class: `trow p-${task.priority}` + (done ? ' is-done' : ''),
    onClick: () => openTaskModal(project, task.id),
  },
  h('button', {
    class: 'tcheck' + (done ? ' done' : ''), style: { '--c': STATUS_COLOR[task.status] }, title: done ? 'Reopen' : 'Mark done',
    onClick: (event) => { event.stopPropagation(); toggleDone(project, task); },
  }, done ? icon('check') : null),
  h('div', { class: 'grow' }, h('div', { class: 'ttitle' }, task.title), h('div', { class: 'tmeta', style: { marginTop: '4px' } }, badges(task, { project: showProject ? project : null }))),
  h('span', { class: 'pdot', title: task.priority + ' priority' }));
}

function taskCard(project, task) {
  return h('div', {
    class: `tcard p-${task.priority}` + (task.status === 'done' ? ' is-done' : ''),
    draggable: true,
    onClick: () => openTaskModal(project, task.id),
    onDragstart: (event) => {
      event.dataTransfer.setData('text/plain', task.id);
      event.dataTransfer.effectAllowed = 'move';
      event.currentTarget.classList.add('dragging');
    },
    onDragend: (event) => event.currentTarget.classList.remove('dragging'),
  },
  h('div', { class: 'ttitle' }, task.title),
  h('div', { class: 'tmeta' }, badges(task)),
  progressBar(task));
}

// ---------- filters --------------------------------------------------------- //
function applyFilters(tasks) {
  const { q, category, priority } = state.ui.filter;
  const needle = q.trim().toLowerCase();
  return tasks.filter((task) =>
    (!category || task.category === category) &&
    (!priority || task.priority === priority) &&
    (!needle || [task.title, task.notes, task.impact, task.solution, task.challenges, task.id, ...task.steps.map((s) => s.text)].join(' ').toLowerCase().includes(needle)));
}

// ---------- the Tasks tab --------------------------------------------------- //
export function tasksTab(project) {
  const doc = state.docs[project];
  const all = doc.project.tasks;
  const filtered = applyFilters(all);
  const categories = [...new Set([...DEFAULT_CATEGORIES, ...all.map((t) => t.category)])].filter(Boolean);
  const legacyCount = countLegacy(doc);
  const root = h('div', {});

  if (legacyCount) {
    root.append(h('div', { class: 'banner' }, icon('bolt'),
      h('div', { class: 'grow' }, h('b', {}, `${legacyCount} items in your old "pending_tasks" list`),
        h('div', { class: 'muted' }, 'Turn them into real tasks with status, steps and a write-up.')),
      h('button', { class: 'btn primary', onClick: async () => { const n = await importLegacy(project); toast(`Imported ${n} tasks`); } }, 'Import as tasks')));
  }

  const quick = quickAdd(project);
  root.append(quick);

  root.append(h('div', { class: 'toolbar' },
    h('input', {
      id: 'task-search', class: 'search', type: 'search', placeholder: 'Filter tasks…', value: state.ui.filter.q,
      onInput: (event) => { state.ui.filter.q = event.target.value; rerender(); },
    }),
    h('select', { onChange: (event) => { state.ui.filter.category = event.target.value; rerender(); }, value: state.ui.filter.category },
      h('option', { value: '' }, 'All categories'), categories.map((c) => h('option', { value: c }, c))),
    h('select', { onChange: (event) => { state.ui.filter.priority = event.target.value; rerender(); }, value: state.ui.filter.priority },
      h('option', { value: '' }, 'Any priority'), PRIORITIES.map((p) => h('option', { value: p }, p))),
    h('span', { class: 'spacer' }),
    h('div', { class: 'seg' },
      h('button', { class: state.ui.view === 'board' ? 'on' : '', onClick: () => { state.ui.view = 'board'; saveUi(); rerender(); } }, icon('board'), 'Board'),
      h('button', { class: state.ui.view === 'list' ? 'on' : '', onClick: () => { state.ui.view = 'list'; saveUi(); rerender(); } }, icon('list'), 'List')),
    h('button', { class: 'btn primary', onClick: () => openTaskModal(project, null) }, icon('plus'), 'New task')));

  if (!all.length) {
    root.append(emptyState('🚀', 'No tasks yet', 'Type one into the box above, or press N. Use !high  #bug  @friday to set details as you type.'));
  } else if (!filtered.length) {
    root.append(emptyState('🔎', 'Nothing matches those filters', 'Clear the filter box or pick "All categories".'));
  } else {
    root.append(state.ui.view === 'board' ? board(project, filtered) : list(project, filtered));
  }
  return root;
}

function countLegacy(doc) {
  const pending = doc.project.pending_tasks;
  if (Array.isArray(pending)) return pending.length;
  if (pending && typeof pending === 'object') return Object.values(pending).reduce((n, items) => n + (Array.isArray(items) ? items.length : 1), 0);
  return 0;
}

function board(project, tasks) {
  const doneTasks = sortTasks(tasks.filter((t) => t.status === 'done')).sort((a, b) => (b.completed_on || '').localeCompare(a.completed_on || ''));
  return h('div', { class: 'board' }, STATUSES.map((status) => {
    let items = status === 'done' ? doneTasks : sortTasks(tasks.filter((t) => t.status === status));
    const total = items.length;
    if (status === 'done' && !state.ui.showDone) items = items.slice(0, 6);
    const body = h('div', { class: 'col-body' },
      items.map((task) => taskCard(project, task)),
      status === 'done' && total > 6 ? h('button', { class: 'btn ghost sm', onClick: () => { state.ui.showDone = !state.ui.showDone; saveUi(); rerender(); } },
        state.ui.showDone ? 'Show fewer' : `Show all ${total}`) : null);

    return h('div', {
      class: 'col',
      onDragover: (event) => { event.preventDefault(); event.currentTarget.classList.add('over'); },
      onDragleave: (event) => event.currentTarget.classList.remove('over'),
      onDrop: (event) => {
        event.preventDefault();
        event.currentTarget.classList.remove('over');
        const id = event.dataTransfer.getData('text/plain');
        const task = state.docs[project].project.tasks.find((t) => t.id === id);
        if (!task || task.status === status) return;
        update(project, (doc) => applyStatus(doc.project.tasks.find((t) => t.id === id), status));
      },
    },
    h('div', { class: 'col-h', style: { '--c': STATUS_COLOR[status] } }, h('span', { class: 'dot' }), STATUS_LABEL[status], h('span', { class: 'count' }, total),
      h('span', { class: 'spacer' }), iconBtn('plus', 'Add to ' + STATUS_LABEL[status], () => openTaskModal(project, null, { status }))),
    body);
  }));
}

function list(project, tasks) {
  const root = h('div', {});
  for (const status of STATUSES) {
    let items = sortTasks(tasks.filter((t) => t.status === status));
    if (!items.length) continue;
    if (status === 'done') items.sort((a, b) => (b.completed_on || '').localeCompare(a.completed_on || ''));
    root.append(h('div', { class: 'group-h', style: { '--c': STATUS_COLOR[status] } }, h('span', { class: 'dot' }), STATUS_LABEL[status], h('span', { class: 'faint' }, items.length)),
      items.map((task) => taskRow(project, task)));
  }
  return root;
}

// ---------- quick add ------------------------------------------------------- //
export function quickAdd(project, { projects } = {}) {
  const input = h('input', { id: 'quick-input', placeholder: 'Capture a task…  e.g.  Upgrade DB to PG16 !high #chore @friday', autocomplete: 'off' });
  const select = projects
    ? h('select', { id: 'quick-project', title: 'Project', value: state.ui.lastProject && projects.includes(state.ui.lastProject) ? state.ui.lastProject : projects[0] },
      projects.map((p) => h('option', { value: p }, p)))
    : null;

  const submit = () => {
    const parsed = parseQuick(input.value);
    if (!parsed.title) return;
    const target = project || (select && select.value);
    if (!target) return toast('Create a project first', 'warn');
    if (select) { state.ui.lastProject = target; saveUi(); }
    update(target, (doc) => { addTask(doc, parsed); });
    input.value = '';
  };
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); submit(); } });

  return h('div', {},
    h('div', { class: 'quick' }, icon('plus'), input, select, h('button', { class: 'btn primary', onClick: submit }, 'Add')),
    h('div', { class: 'quick-hint' }, 'Shortcuts while typing: ', h('code', {}, '!high'), ' priority · ', h('code', {}, '#bug'), ' category · ', h('code', {}, '@tomorrow'), ' ', h('code', {}, '@fri'), ' ', h('code', {}, '@+3d'), ' due date'));
}

// ---------- task editor modal ----------------------------------------------- //
export function openTaskModal(project, id, defaults = {}) {
  const doc = state.docs[project];
  if (!doc) return;
  const existing = id ? doc.project.tasks.find((t) => t.id === id) : null;
  if (id && !existing) return toast('That task no longer exists', 'warn');

  const task = JSON.parse(JSON.stringify(existing || blankTask({ ...defaults })));
  let dirty = !existing && !!defaults.title;
  const touch = () => { dirty = true; };

  const categories = [...new Set([...DEFAULT_CATEGORIES, ...doc.project.tasks.map((t) => t.category)])].filter(Boolean);

  const title = h('input', { class: 'title-input', placeholder: 'What needs to happen?', value: task.title, autofocus: !existing, onInput: (e) => { task.title = e.target.value; touch(); } });
  const status = h('select', { value: task.status, onChange: (e) => { task.status = e.target.value; touch(); syncWriteupHint(); } }, STATUSES.map((s) => h('option', { value: s }, STATUS_LABEL[s])));
  const priority = h('select', { value: task.priority, onChange: (e) => { task.priority = e.target.value; touch(); } }, PRIORITIES.map((p) => h('option', { value: p }, p)));
  const category = h('input', { list: 'categories', value: task.category, onInput: (e) => { task.category = e.target.value.trim().toLowerCase(); touch(); } });
  const datalist = h('datalist', { id: 'categories' }, categories.map((c) => h('option', { value: c })));
  const due = h('input', { type: 'date', value: task.due, onInput: (e) => { task.due = e.target.value; touch(); } });
  const remind = h('input', { type: 'datetime-local', value: task.remind_at, onInput: (e) => { task.remind_at = e.target.value; touch(); } });
  const notes = h('textarea', { placeholder: 'Context, requirements, what to remember…', value: task.notes, onInput: (e) => { task.notes = e.target.value; touch(); } });
  const links = h('textarea', { placeholder: 'One link per line — PR, ticket, doc, dashboard', rows: 2, value: task.links.join('\n'), onInput: (e) => { task.links = e.target.value.split('\n').map((l) => l.trim()).filter(Boolean); touch(); } });

  // Steps checklist ------------------------------------------------------- //
  const stepsBox = h('div', { class: 'steps' });
  const renderSteps = (focusIndex) => {
    stepsBox.replaceChildren(...task.steps.map((step, index) => {
      const text = h('input', {
        type: 'text', value: step.text, placeholder: 'Step…',
        onInput: (e) => { step.text = e.target.value; touch(); },
        onKeydown: (e) => {
          if (e.key === 'Enter') { e.preventDefault(); task.steps.splice(index + 1, 0, { text: '', done: false }); touch(); renderSteps(index + 1); }
          if (e.key === 'Backspace' && !step.text && task.steps.length) { e.preventDefault(); task.steps.splice(index, 1); touch(); renderSteps(Math.max(0, index - 1)); }
        },
        onPaste: (e) => {
          const pasted = e.clipboardData.getData('text');
          if (!pasted.includes('\n')) return;
          e.preventDefault();
          const lines = pasted.split('\n').map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])?\s*(?:\[[ xX]?\])?\s*/, '').trim()).filter(Boolean);
          task.steps.splice(index, step.text ? 0 : 1, ...lines.map((t) => ({ text: t, done: false })));
          touch();
          renderSteps();
        },
      });
      return h('div', { class: 'step' + (step.done ? ' done' : '') },
        h('input', { type: 'checkbox', checked: step.done, onChange: (e) => { step.done = e.target.checked; touch(); renderSteps(); } }),
        text, iconBtn('x', 'Remove step', () => { task.steps.splice(index, 1); touch(); renderSteps(); }));
    }));
    if (focusIndex !== undefined) { const inputs = stepsBox.querySelectorAll('input[type="text"]'); if (inputs[focusIndex]) inputs[focusIndex].focus(); }
  };
  renderSteps();

  // Write-up -------------------------------------------------------------- //
  const writeupHint = h('span', {});
  const syncWriteupHint = () => { writeupHint.textContent = task.status === 'done' ? 'You finished this — capture it while it is fresh.' : 'Fill this in when you finish. It becomes your reusable playbook.'; };
  syncWriteupHint();
  const area = (key, label, placeholder) => h('div', { class: 'field' }, h('label', {}, label),
    h('textarea', { placeholder, rows: 2, value: task[key], onInput: (e) => { task[key] = e.target.value; touch(); } }));

  const field = (label, control, hint) => h('div', { class: 'field' }, h('label', {}, label), control, hint ? h('div', { class: 'hint' }, hint) : null);

  const save = () => {
    task.title = task.title.trim();
    if (!task.title) { title.focus(); return toast('Give the task a title', 'warn'); }
    task.category = task.category || 'feature';
    task.steps = task.steps.filter((s) => s.text.trim());
    closeModal(true);
    update(project, (d) => {
      if (existing) {
        const index = d.project.tasks.findIndex((t) => t.id === existing.id);
        if (index === -1) return false;
        const before = d.project.tasks[index];
        const merged = { ...before, ...task };
        if (merged.status !== before.status) applyStatus(merged, merged.status);
        if (merged.remind_at !== before.remind_at) { delete merged.dismissed; delete merged.notified; }
        merged.updated = new Date().toISOString().slice(0, 19);
        d.project.tasks[index] = merged;
      } else {
        const created = addTask(d, task);
        if (task.status !== 'todo') applyStatus(created, task.status);
      }
    });
  };

  const remove = async () => {
    if (!(await confirmDialog({ title: 'Delete this task?', message: `"${task.title}" will be removed from ${project}.` }))) return;
    closeModal(true);
    update(project, (d) => { d.project.tasks = d.project.tasks.filter((t) => t.id !== existing.id); });
  };

  const body = h('div', { class: 'm-body' },
    title,
    h('div', { class: 'fields' }, field('Status', status), field('Priority', priority), field('Category', category), field('Due', due), field('Remind me', remind)),
    datalist,
    field('Notes', notes),
    h('div', { class: 'field' }, h('label', {}, 'Steps'), stepsBox,
      h('button', { class: 'btn sm', style: { marginTop: '8px' }, onClick: () => { task.steps.push({ text: '', done: false }); touch(); renderSteps(task.steps.length - 1); } }, icon('plus'), 'Add step'),
      h('div', { class: 'hint' }, 'Tip: paste a whole checklist and it splits into steps.')),
    field('Links', links),
    h('div', { class: 'section-t' }, icon('trophy'), 'Write-up', writeupHint),
    area('impact', 'Impact', 'What changed? Who or what did it affect? Numbers help: "cut report load from 9s to 2s".'),
    area('challenges', 'Challenges', 'What was tricky or surprising?'),
    area('solution', 'Solution / how I did it', 'The approach, commands, gotchas — what future-you should know.'));

  const head = h('div', { class: 'm-head' }, avatar(project), h('b', { style: { color: 'var(--text)' } }, project),
    existing ? h('span', { class: 'chip mono' }, existing.id) : h('span', { class: 'chip' }, 'New task'),
    existing && existing.created ? h('span', { class: 'faint' }, 'created ' + ago(existing.created)) : null,
    h('span', { class: 'spacer' }), iconBtn('x', 'Close', () => closeModal()));

  const foot = h('div', { class: 'm-foot' },
    existing ? h('button', { class: 'btn danger', onClick: remove }, icon('trash'), 'Delete') : null,
    existing ? h('button', { class: 'btn', title: 'Copy as Markdown', onClick: () => copyText(taskWriteup(project, { ...existing, ...task }), 'Write-up copied as Markdown') }, icon('copy'), 'Copy write-up') : null,
    h('span', { class: 'spacer' }), h('span', { class: 'faint' }, h('kbd', {}, '⌘'), ' ', h('kbd', {}, '↵')), ' to save',
    h('button', { class: 'btn', onClick: () => closeModal() }, 'Cancel'),
    h('button', { class: 'btn primary', onClick: save }, icon('check'), existing ? 'Save' : 'Create task'));

  const box = openModal([head, body, foot], {
    size: 'wide',
    guard: () => !dirty || confirm('Discard your unsaved changes?'),
    onClose: () => { if (location.hash.includes('/tasks/')) location.hash = location.hash.replace(/\/tasks\/[^/]+$/, '/tasks'); },
  });
  box.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); save(); }
  });
}
