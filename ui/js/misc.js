// Links, Commands and Notes tabs.
import { h, icon, iconBtn, copyText, confirmDialog, emptyState, envColor } from './lib.js';
import { state, update, rerender, envNames, isSensitive, isHttp, displayValue } from './store.js';

const hostOf = (url) => { try { return new URL(url).host; } catch { return url; } };
const editing = new Set();
const toggleEdit = (id) => { editing.has(id) ? editing.delete(id) : editing.add(id); rerender(); };

// ============================== LINKS ======================================= //
export function linksTab(project) {
  const doc = state.docs[project];
  const links = doc.project.links;
  const root = h('div', {});

  const title = h('input', { placeholder: 'Title — e.g. Grafana dashboard', 'aria-label': 'Link title' });
  const url = h('input', { placeholder: 'https://…', class: 'mono', 'aria-label': 'Link URL' });
  const add = () => {
    const u = url.value.trim();
    if (!/^https?:\/\//i.test(u)) { url.focus(); return; }
    update(project, (d) => { d.project.links.push({ title: title.value.trim() || hostOf(u), url: u }); });
  };
  url.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') url.focus(); });
  root.append(h('div', { class: 'form-inline' }, h('div', { class: 'row' }, title, url, h('button', { class: 'btn primary', onClick: add }, icon('plus'), 'Add link'))));

  if (!links.length) {
    root.append(emptyState('🔗', 'No saved links', 'Dashboards, admin panels, repos, docs, tickets — anything you keep hunting for.'));
  } else {
    links.forEach((link, index) => {
      const id = `link:${project}:${index}`;
      if (editing.has(id)) {
        const t = h('input', { value: link.title }), u = h('input', { value: link.url, class: 'mono' });
        const save = () => { const nu = u.value.trim(); if (!/^https?:\/\//i.test(nu)) return; toggleEdit(id); update(project, (d) => { d.project.links[index] = { ...d.project.links[index], title: t.value.trim() || hostOf(nu), url: nu }; }); };
        u.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
        root.append(h('div', { class: 'item', style: { gridTemplateColumns: '1fr 1fr auto' } }, t, u, h('div', { class: 'row' }, iconBtn('check', 'Save', save), iconBtn('x', 'Cancel', () => toggleEdit(id)))));
        return;
      }
      root.append(h('div', { class: 'item' },
        h('span', { class: 'ico' }, icon('link')),
        h('div', { style: { minWidth: 0 } }, h('a', { class: 't', href: link.url, target: '_blank', rel: 'noopener noreferrer' }, link.title), h('div', { class: 'u' }, link.url)),
        h('div', { class: 'row' },
          iconBtn('copy', 'Copy URL', () => copyText(link.url, 'URL copied')),
          iconBtn('edit', 'Edit', () => toggleEdit(id)),
          iconBtn('trash', 'Delete', () => update(project, (d) => { d.project.links.splice(index, 1); }), 'danger'))));
    });
  }

  // URLs already stored in your environments — shown, not duplicated.
  const found = [];
  for (const env of envNames(doc)) {
    for (const [service, vars] of Object.entries(doc[env])) {
      if (!vars || typeof vars !== 'object' || Array.isArray(vars)) continue;
      for (const [key, value] of Object.entries(vars)) {
        const text = displayValue(value);
        if (isHttp(text) && !isSensitive(key, text)) found.push({ env, service, key, url: text });
      }
    }
  }
  const unique = found.filter((f, i) => found.findIndex((g) => g.url === f.url && g.env === f.env) === i);
  if (unique.length) {
    root.append(h('div', { class: 'card-h', style: { margin: '26px 0 10px' } }, icon('layers'), h('h3', {}, 'Found in your environments'), h('span', { class: 'faint' }, 'read from the Envs tab, nothing duplicated')));
    for (const f of unique) {
      root.append(h('div', { class: 'item' },
        h('span', { class: 'chip env', style: { background: envColor(f.env) } }, f.env),
        h('div', { style: { minWidth: 0 } }, h('a', { class: 't', href: f.url, target: '_blank', rel: 'noopener noreferrer' }, f.key), h('div', { class: 'u' }, `${f.service} · ${f.url}`)),
        h('div', { class: 'row' }, iconBtn('copy', 'Copy URL', () => copyText(f.url, 'URL copied')))));
    }
  }
  return root;
}

// ============================== COMMANDS ==================================== //
export function commandsTab(project) {
  const commands = state.docs[project].project.commands;
  const entries = Object.entries(commands);
  const root = h('div', {});

  const name = h('input', { placeholder: 'name — e.g. migrate', class: 'mono', style: { maxWidth: '200px' }, 'aria-label': 'Command name' });
  const cmd = h('input', { placeholder: 'python manage.py migrate', class: 'mono', 'aria-label': 'Command' });
  const add = () => {
    const n = name.value.trim(), c = cmd.value.trim();
    if (!n || !c) { (n ? cmd : name).focus(); return; }
    update(project, (d) => { d.project.commands[n] = c; });
  };
  cmd.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') cmd.focus(); });
  root.append(h('div', { class: 'form-inline' }, h('div', { class: 'row' }, name, cmd, h('button', { class: 'btn primary', onClick: add }, icon('plus'), 'Add'))));

  if (!entries.length) return (root.append(emptyState('⌨️', 'No commands saved', 'Run, migrate, test, deploy… store the ones you always forget.')), root);

  root.append(h('div', { class: 'stack' }, entries.map(([key, value]) => {
    const id = `cmd:${project}:${key}`;
    if (editing.has(id)) {
      const input = h('input', { value, class: 'mono' });
      const save = () => { const v = input.value.trim(); if (!v) return; toggleEdit(id); update(project, (d) => { d.project.commands[key] = v; }); };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') toggleEdit(id); });
      return h('div', { class: 'row' }, h('b', { class: 'mono', style: { minWidth: '120px' } }, key), input, iconBtn('check', 'Save', save), iconBtn('x', 'Cancel', () => toggleEdit(id)));
    }
    return h('div', {},
      h('div', { class: 'row', style: { marginBottom: '5px' } }, h('b', {}, key), h('span', { class: 'spacer' }),
        iconBtn('copy', 'Copy command', () => copyText(value, 'Command copied')), iconBtn('edit', 'Edit', () => toggleEdit(id)),
        iconBtn('trash', 'Delete', () => update(project, (d) => { delete d.project.commands[key]; }), 'danger')),
      h('div', { class: 'cmd', title: 'Click to copy', style: { cursor: 'pointer' }, onClick: () => copyText(value, 'Command copied') }, value));
  })));
  return root;
}

// ============================== NOTES ======================================= //
export function notesTab(project) {
  const notes = state.docs[project].project.notes;
  const root = h('div', {});

  const area = h('textarea', { placeholder: 'Jot something worth remembering…  (⌘↵ to add)', rows: 2, 'aria-label': 'New note' });
  const add = () => {
    const text = area.value.trim();
    if (!text) return;
    update(project, (d) => { d.project.notes.unshift(text); });
  };
  area.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') add(); });
  root.append(h('div', { class: 'form-inline' }, area, h('div', { class: 'row' }, h('span', { class: 'spacer' }), h('button', { class: 'btn primary', onClick: add }, icon('plus'), 'Add note'))));

  if (!notes.length) return (root.append(emptyState('📝', 'No notes yet', 'Gotchas, setup quirks, "never forget to…" reminders for this project.')), root);

  root.append(h('div', { class: 'stack' }, notes.map((note, index) => {
    const id = `note:${project}:${index}`;
    if (editing.has(id)) {
      const text = h('textarea', { value: note, rows: 3 });
      const save = () => { const v = text.value.trim(); toggleEdit(id); if (v && v !== note) update(project, (d) => { d.project.notes[index] = v; }); };
      text.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save(); if (e.key === 'Escape') toggleEdit(id); });
      queueMicrotask(() => text.focus());
      return h('div', { class: 'stack' }, text, h('div', { class: 'row' }, h('span', { class: 'spacer' }), h('button', { class: 'btn', onClick: () => toggleEdit(id) }, 'Cancel'), h('button', { class: 'btn primary', onClick: save }, 'Save')));
    }
    return h('div', { class: 'note' },
      h('div', { class: 'row', style: { alignItems: 'flex-start' } }, h('div', { class: 'grow' }, note),
        iconBtn('copy', 'Copy', () => copyText(note)), iconBtn('edit', 'Edit', () => toggleEdit(id)),
        iconBtn('trash', 'Delete', async () => { if (await confirmDialog({ title: 'Delete this note?', message: note.slice(0, 120) })) update(project, (d) => { d.project.notes.splice(index, 1); }); }, 'danger')));
  })));
  return root;
}
