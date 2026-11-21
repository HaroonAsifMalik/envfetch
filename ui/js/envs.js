// Environments tab: per-env services, masked values, copy/reveal/edit, .env export, and diff.
import { h, icon, iconBtn, toast, copyText, envColor, isProd, confirmDialog, emptyState, openModal, closeModal } from './lib.js';
import { state, saveUi, update, rerender, envNames, isSensitive, displayValue, isHttp } from './store.js';

// ---------- reveal state (auto re-masks after 20s) -------------------------- //
const revealed = new Map();
const isShown = (...ids) => ids.some((id) => revealed.has(id));
function toggleReveal(id) {
  if (revealed.has(id)) { clearTimeout(revealed.get(id)); revealed.delete(id); }
  else revealed.set(id, setTimeout(() => { revealed.delete(id); rerender(); }, 20000));
  rerender();
}

const rowId = (p, e, s, k) => `${p}|${e}|${s}|${k}`;
const svcId = (p, e, s) => `${p}|${e}|${s}|*`;

// ---------- .env formatting -------------------------------------------------- //
const dotenvValue = (value) => {
  const text = displayValue(value);
  return /[\s#"'$`\\]/.test(text) || text === '' ? JSON.stringify(text) : text;
};
function dotenv(envData, header) {
  const lines = header ? [header, ''] : [];
  for (const [service, vars] of Object.entries(envData)) {
    if (!vars || typeof vars !== 'object' || Array.isArray(vars)) continue;
    lines.push(`# ${service}`);
    for (const [key, value] of Object.entries(vars)) lines.push(`${key}=${dotenvValue(value)}`);
    lines.push('');
  }
  return lines.join('\n').trim() + '\n';
}
const countVars = (envData) => Object.values(envData).reduce((n, v) => n + (v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).length : 0), 0);

// ---------- tab -------------------------------------------------------------- //
export function envsTab(project) {
  const doc = state.docs[project];
  const names = envNames(doc);
  const root = h('div', {});

  if (!names.length) {
    return emptyState('🌱', 'No environments yet', 'Add one (local, dev, staging, prod…) and start storing variables.',
      h('button', { class: 'btn primary', onClick: () => addEnvDialog(project) }, icon('plus'), 'Add environment'));
  }

  const mode = state.ui.envMode && state.ui.envMode[project];
  let current = state.ui.env[project];
  if (!names.includes(current)) current = names[0];
  state.ui.env[project] = current;

  root.append(h('div', { class: 'envbar' },
    names.map((name) => h('button', {
      class: 'env-pill' + (current === name && mode !== 'diff' ? ' on' : ''), style: { '--c': envColor(name) },
      onClick: () => { state.ui.env[project] = name; setMode(project, ''); },
    }, h('i'), name)),
    h('button', { class: 'btn ghost sm', onClick: () => addEnvDialog(project) }, icon('plus'), 'Add'),
    h('span', { class: 'spacer' }),
    names.length > 1 ? h('button', { class: 'btn sm' + (mode === 'diff' ? ' primary' : ''), onClick: () => setMode(project, mode === 'diff' ? '' : 'diff') }, icon('diff'), 'Compare') : null));

  root.append(mode === 'diff' && names.length > 1 ? diffView(project, doc, names, current) : envView(project, doc, current));
  return root;
}

function setMode(project, mode) {
  state.ui.envMode = { ...(state.ui.envMode || {}), [project]: mode };
  saveUi();
  rerender();
}

function envView(project, doc, env) {
  const data = doc[env];
  const root = h('div', {});

  if (isProd(env)) root.append(h('div', { class: 'prodwarn' }, icon('alert'), 'Production — double-check before you copy or change anything.'));

  const total = countVars(data);
  root.append(h('div', { class: 'row wrap', style: { marginBottom: '14px' } },
    h('span', { class: 'muted' }, `${Object.keys(data).length} services · ${total} values`),
    h('span', { class: 'spacer' }),
    total ? h('button', { class: 'btn sm', onClick: () => copyText(dotenv(data), `Copied ${total} variables as .env`) }, icon('copy'), 'Copy as .env') : null,
    total ? h('button', { class: 'btn sm', onClick: () => downloadEnv(project, env, data) }, icon('download'), 'Download .env') : null,
    h('button', { class: 'btn sm', onClick: () => addServiceDialog(project, env) }, icon('plus'), 'Add service'),
    h('button', { class: 'btn sm danger', onClick: () => removeEnv(project, env) }, icon('trash'), 'Delete env')));

  const services = Object.entries(data);
  if (!services.length) {
    root.append(emptyState('📦', 'This environment is empty', 'Add a service such as db, redis, aws or urls, then add its variables.'));
  } else {
    root.append(h('div', { class: 'grid-2' }, services.map(([service, vars]) => serviceCard(project, env, service, vars))));
  }
  return root;
}

function downloadEnv(project, env, data) {
  const blob = new Blob([dotenv(data, `# ${project} · ${env}`)], { type: 'text/plain' });
  const link = h('a', { href: URL.createObjectURL(blob), download: `${project}.${env}.env` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

// ---------- a service card ---------------------------------------------------- //
function serviceCard(project, env, service, vars) {
  const isList = Array.isArray(vars);
  const isMap = vars && typeof vars === 'object' && !isList;
  const entries = isMap ? Object.entries(vars) : [];
  const allShown = isShown(svcId(project, env, service));
  const editing = state.ui.editing || {};

  const head = h('div', { class: 'svc-h' },
    h('b', {}, service), h('span', { class: 'faint' }, isMap ? entries.length : isList ? vars.length : 1), h('span', { class: 'spacer' }),
    isMap && entries.some(([k, v]) => isSensitive(k, v)) ? iconBtn(allShown ? 'eyeOff' : 'eye', allShown ? 'Hide all values' : 'Reveal all values (hides again after 20s)', () => toggleReveal(svcId(project, env, service))) : null,
    isMap ? iconBtn('copy', 'Copy this service as .env', () => copyText(dotenv({ [service]: vars }), 'Copied service as .env')) : null,
    iconBtn('trash', 'Delete service', async () => {
      if (await confirmDialog({ title: `Delete "${service}"?`, message: `All values under ${service} in ${env} will be removed.` })) update(project, (d) => { delete d[env][service]; });
    }, 'danger'));

  const body = [];
  if (isMap) {
    for (const [key, value] of entries) body.push(editing[rowId(project, env, service, key)] ? editRow(project, env, service, key, value) : viewRow(project, env, service, key, value, allShown));
    body.push(addVarRow(project, env, service));
  } else if (isList) {
    vars.forEach((item, index) => body.push(h('div', { class: 'kv', style: { gridTemplateColumns: '1fr auto' } },
      h('span', { class: 'v' }, String(item)),
      h('div', { class: 'acts' }, iconBtn('copy', 'Copy', () => copyText(String(item))), iconBtn('trash', 'Remove', () => update(project, (d) => { d[env][service].splice(index, 1); }), 'danger')))));
    body.push(h('div', { class: 'add-row' }, h('button', { class: 'btn ghost sm', onClick: () => { const value = prompt('New item'); if (value) update(project, (d) => { d[env][service].push(value); }); } }, icon('plus'), 'Add item')));
  } else {
    body.push(h('div', { class: 'kv', style: { gridTemplateColumns: '1fr auto' } }, h('span', { class: 'v' }, displayValue(vars)), h('div', { class: 'acts' }, iconBtn('copy', 'Copy', () => copyText(displayValue(vars))))));
  }
  return h('div', { class: 'card svc' }, head, body);
}

function viewRow(project, env, service, key, value, serviceShown) {
  const text = displayValue(value);
  const sensitive = isSensitive(key, text);
  const shown = !sensitive || serviceShown || isShown(rowId(project, env, service, key));
  return h('div', { class: 'kv' },
    h('span', { class: 'k', title: 'Click to copy the key', onClick: () => copyText(key, 'Key copied') }, key),
    h('span', { class: 'v' + (shown ? '' : ' masked') }, shown ? text : '••••••••••'),
    h('div', { class: 'acts' },
      sensitive ? iconBtn(shown ? 'eyeOff' : 'eye', shown ? 'Hide' : 'Reveal for 20s', () => toggleReveal(rowId(project, env, service, key))) : null,
      isHttp(text) ? h('a', { class: 'icon-btn', href: text, target: '_blank', rel: 'noopener noreferrer', title: 'Open link' }, icon('external')) : null,
      iconBtn('copy', 'Copy value', () => copyText(text, `Copied ${key}`)),
      iconBtn('edit', 'Edit', () => { state.ui.editing = { ...(state.ui.editing || {}), [rowId(project, env, service, key)]: true }; rerender(); }),
      iconBtn('trash', 'Delete', () => update(project, (d) => { delete d[env][service][key]; }), 'danger')));
}

function editRow(project, env, service, key, value) {
  const id = rowId(project, env, service, key);
  const keyInput = h('input', { value: key, 'aria-label': 'Key' });
  const valueInput = h('input', { value: displayValue(value), 'aria-label': 'Value', autofocus: true });
  const stop = () => { const next = { ...(state.ui.editing || {}) }; delete next[id]; state.ui.editing = next; rerender(); };
  const commit = () => {
    const newKey = keyInput.value.trim();
    if (!newKey) return toast('Key cannot be empty', 'warn');
    const newValue = valueInput.value;
    const unchanged = newKey === key && newValue === displayValue(value);
    stop();
    if (unchanged) return;
    update(project, (d) => {
      const vars = d[env][service];
      const rebuilt = {};
      for (const [k, v] of Object.entries(vars)) { if (k === key) rebuilt[newKey] = typeof value === 'string' || newValue !== displayValue(value) ? newValue : value; else if (k !== newKey) rebuilt[k] = v; }
      d[env][service] = rebuilt;
    });
  };
  const onKey = (event) => { if (event.key === 'Enter') commit(); if (event.key === 'Escape') stop(); };
  keyInput.addEventListener('keydown', onKey);
  valueInput.addEventListener('keydown', onKey);
  queueMicrotask(() => valueInput.focus());
  return h('div', { class: 'kv' }, keyInput, valueInput, h('div', { class: 'acts', style: { opacity: 1 } }, iconBtn('check', 'Save', commit), iconBtn('x', 'Cancel', stop)));
}

function addVarRow(project, env, service) {
  const key = h('input', { placeholder: 'KEY', class: 'mono', 'aria-label': 'New key' });
  const value = h('input', { placeholder: 'value', class: 'mono', 'aria-label': 'New value' });
  const add = () => {
    const k = key.value.trim();
    if (!k) { key.focus(); return; }
    update(project, (d) => { d[env][service][k] = value.value; });
  };
  const onKey = (event) => { if (event.key === 'Enter') add(); };
  key.addEventListener('keydown', onKey);
  value.addEventListener('keydown', onKey);
  return h('div', { class: 'kv', style: { background: 'var(--bg-2)' } }, key, value, h('div', { class: 'acts', style: { opacity: 1 } }, iconBtn('plus', 'Add variable', add)));
}

// ---------- dialogs ----------------------------------------------------------- //
function nameDialog({ title, label, placeholder, suggestions = [], onSubmit }) {
  const input = h('input', { placeholder, autofocus: true, list: 'suggest', autocomplete: 'off' });
  const submit = () => { const value = input.value.trim(); if (!value) return; closeModal(true); onSubmit(value); };
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') submit(); });
  openModal([
    h('div', { class: 'm-body' }, h('b', { style: { fontSize: '16px' } }, title),
      h('div', { class: 'field' }, h('label', {}, label), input, h('datalist', { id: 'suggest' }, suggestions.map((s) => h('option', { value: s })))),
    ),
    h('div', { class: 'm-foot' }, h('span', { class: 'spacer' }), h('button', { class: 'btn', onClick: () => closeModal() }, 'Cancel'), h('button', { class: 'btn primary', onClick: submit }, 'Add')),
  ], { size: 'narrow' });
}

function addEnvDialog(project) {
  const existing = envNames(state.docs[project]);
  nameDialog({
    title: 'Add environment', label: 'Name', placeholder: 'staging', suggestions: ['local', 'dev', 'staging', 'prod'].filter((n) => !existing.includes(n)),
    onSubmit: (name) => {
      const key = name.toLowerCase().replace(/\s+/g, '-');
      if (key === 'project' || existing.includes(key)) return toast('That name is taken', 'warn');
      state.ui.env[project] = key;
      update(project, (d) => { d[key] = { urls: {} }; });
    },
  });
}

function addServiceDialog(project, env) {
  nameDialog({
    title: `Add service to ${env}`, label: 'Service name', placeholder: 'db', suggestions: ['db', 'redis', 'aws', 'elastic', 'urls', 'smtp', 'sentry'],
    onSubmit: (name) => {
      const key = name.toLowerCase().replace(/\s+/g, '-');
      if (state.docs[project][env][key]) return toast('That service already exists', 'warn');
      update(project, (d) => { d[env][key] = {}; });
    },
  });
}

async function removeEnv(project, env) {
  if (await confirmDialog({ title: `Delete the "${env}" environment?`, message: 'All of its services and values will be removed. (A backup of the file is kept in .backups.)' })) {
    update(project, (d) => { delete d[env]; });
  }
}

// ---------- diff ---------------------------------------------------------------- //
function flatten(envData) {
  const out = new Map();
  for (const [service, vars] of Object.entries(envData || {})) {
    if (vars && typeof vars === 'object' && !Array.isArray(vars)) for (const [k, v] of Object.entries(vars)) out.set(`${service}\u0000${k}`, displayValue(v));
    else out.set(`${service}\u0000(value)`, displayValue(vars));
  }
  return out;
}

function diffView(project, doc, names, current) {
  const ui = state.ui;
  ui.diff = ui.diff || {};
  const pair = ui.diff[project] || { a: names[0], b: names[names.length - 1] };
  if (!names.includes(pair.a)) pair.a = names[0];
  if (!names.includes(pair.b) || pair.b === pair.a) pair.b = names.find((n) => n !== pair.a);
  ui.diff[project] = pair;

  const a = flatten(doc[pair.a]), b = flatten(doc[pair.b]);
  const keys = [...new Set([...a.keys(), ...b.keys()])];
  const rows = keys.map((k) => {
    const [service, key] = k.split('\u0000');
    const status = !b.has(k) ? 'only-a' : !a.has(k) ? 'only-b' : a.get(k) === b.get(k) ? 'same' : 'diff';
    return { service, key, status, va: a.get(k), vb: b.get(k), sensitive: isSensitive(key, a.get(k) ?? b.get(k)) };
  });
  const count = (s) => rows.filter((r) => r.status === s).length;
  const showSame = !!ui.diffShowSame;
  const reveal = isShown(`${project}|diff`);

  const select = (value, onChange) => h('select', { value, onChange: (e) => onChange(e.target.value), style: { width: 'auto' } }, names.map((n) => h('option', { value: n }, n)));
  const cell = (row, v) => (v === undefined ? h('span', { class: 'na' }, 'missing') : h('span', {}, row.sensitive && !reveal ? '••••••••••' : v));

  const grouped = new Map();
  for (const row of rows.filter((r) => showSame || r.status !== 'same')) {
    if (!grouped.has(row.service)) grouped.set(row.service, []);
    grouped.get(row.service).push(row);
  }

  const root = h('div', {},
    h('div', { class: 'row wrap', style: { marginBottom: '8px' } },
      select(pair.a, (v) => { pair.a = v; rerender(); }), icon('diff'), select(pair.b, (v) => { pair.b = v; rerender(); }),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn sm', onClick: () => toggleReveal(`${project}|diff`) }, icon(reveal ? 'eyeOff' : 'eye'), reveal ? 'Hide secrets' : 'Reveal secrets'),
      h('label', { class: 'row muted', style: { fontSize: '12.5px' } }, h('input', { type: 'checkbox', checked: showSame, onChange: (e) => { ui.diffShowSame = e.target.checked; rerender(); } }), 'Show identical')),
    h('div', { class: 'diff-sum' },
      h('span', { class: 'chip good' }, `${count('same')} identical`),
      h('span', { class: 'chip today' }, `${count('diff')} different`),
      h('span', { class: 'chip overdue' }, `${count('only-a')} only in ${pair.a}`),
      h('span', { class: 'chip overdue' }, `${count('only-b')} only in ${pair.b}`)));

  if (!grouped.size) {
    root.append(emptyState('✨', 'These environments match', 'Every service and variable is identical.'));
    return root;
  }
  root.append(h('div', { class: 'stack' }, [...grouped].map(([service, items]) => h('div', { class: 'card svc' },
    h('div', { class: 'svc-h' }, h('b', {}, service), h('span', { class: 'faint' }, items.length)),
    h('div', { class: 'drow head' }, h('span', {}, 'Key'), h('span', {}, pair.a), h('span', {}, pair.b)),
    items.map((row) => h('div', { class: 'drow ' + (row.status === 'diff' ? 'diff' : row.status.startsWith('only') ? 'only' : '') },
      h('span', { class: 'muted' }, row.key), cell(row, row.va), cell(row, row.vb)))))));
  return root;
}
