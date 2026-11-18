// Run with:  node --test tests/js/*.test.mjs
// Covers the DOM-free logic: quick-add parsing, reminders, similar tasks, standup text.
import test from 'node:test';
import assert from 'node:assert/strict';

const { parseQuick, parseDelay, remindAtFrom, untilLabel, tomorrowAt, wsOf } = await import('../../ui/js/store.js');
const { findSimilar, tokens } = await import('../../ui/js/similar.js');
const { buildStandup } = await import('../../ui/js/standup.js');

const at = new Date(2026, 10, 18, 11, 0); // Wed 18 Nov 2026 11:00 local

test('parseDelay understands m/h/d/w', () => {
  assert.equal(parseDelay('30m'), 30 * 60000);
  assert.equal(parseDelay('12h'), 12 * 3600000);
  assert.equal(parseDelay('2 days'), 2 * 86400000);
  assert.equal(parseDelay('1w'), 7 * 86400000);
  assert.equal(parseDelay('soon'), null);
});

test('remindAtFrom / tomorrowAt / untilLabel', () => {
  assert.equal(remindAtFrom('12h', at), '2026-11-18T23:00');
  assert.equal(remindAtFrom('90m', at), '2026-11-18T12:30');
  assert.equal(remindAtFrom('nope', at), '');
  assert.equal(tomorrowAt(9, at), '2026-11-19T09:00');
  assert.equal(untilLabel('2026-11-18T23:00', at), 'in 12h');
  assert.equal(untilLabel('2026-11-18T11:25', at), 'in 25 min');
  assert.equal(untilLabel('2026-11-18T10:00', at), 'time has passed');
  assert.equal(untilLabel('2026-11-18T13:30', at), 'in 2h 30m');
});

test('parseQuick reads priority, category, due and ~reminder', () => {
  const q = parseQuick('Verify prod metrics !high #chore @+3d ~12h');
  assert.equal(q.title, 'Verify prod metrics');
  assert.equal(q.priority, 'high');
  assert.equal(q.category, 'chore');
  assert.match(q.due, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(q.remind_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  assert.equal(parseQuick('Email ~soon me').title, 'Email ~soon me');
});

test('wsOf defaults to office', () => {
  assert.equal(wsOf({ project: {} }), 'office');
  assert.equal(wsOf({ project: { workspace: 'personal' } }), 'personal');
  assert.equal(wsOf({ project: { workspace: 'bogus' } }), 'office');
});

const done = (id, title, extra = {}) => ({ project: 'api', task: { id, title, status: 'done', category: 'chore', steps: [], notes: '', solution: '', impact: '', challenges: '', completed_on: '2026-11-10', ...extra } });

test('tokens drops stop words and light-stems', () => {
  assert.ok(tokens('Deploying the new Redis cluster').includes('cluster'));
  assert.ok(!tokens('Deploying the new Redis cluster').includes('the'));
  assert.ok(tokens('Deploying').includes('deploy'));
  assert.ok(!tokens('the and for').length);
});

test('findSimilar ranks real matches and ignores noise and itself', () => {
  const pool = [
    done('t-001', 'Upgrade Postgres to 16', { solution: 'pg_upgrade --link after a backup', steps: [{ text: 'Backup prod', done: true }] }),
    done('t-002', 'Rotate Redis password', { solution: 'Update secret then restart workers' }),
    done('t-003', 'Fix typo in footer'),
    { project: 'api', task: { id: 't-004', title: 'Upgrade Postgres later', status: 'todo', category: 'chore', steps: [], notes: '', solution: '' } },
  ];
  const hits = findSimilar({ title: 'Upgrade Postgres 15 to 16 on staging', notes: '', category: 'chore' }, pool, 3);
  assert.equal(hits[0].task.id, 't-001');
  assert.ok(!hits.some((h) => h.task.id === 't-004'), 'open tasks without steps/solution are not "done before"');
  assert.ok(!hits.some((h) => h.task.id === 't-003'));
  assert.deepEqual(findSimilar({ title: 'Upgrade Postgres', notes: '' }, pool, 3, { project: 'api', id: 't-001' }).map((h) => h.task.id), []);
  assert.deepEqual(findSimilar({ title: 'ab', notes: '' }, pool), []);
});

test('buildStandup (Wednesday): yesterday, today, blockers', () => {
  const entries = [
    done('t-1', 'Ship invoices export', { completed_on: '2026-11-17', impact: 'Finance saves 2h a week' }),
    done('t-2', 'Old thing', { completed_on: '2026-11-01' }),
    { project: 'api', task: { id: 't-3', title: 'Migrate cache', status: 'doing', priority: 'high', due: '', steps: [{ text: 'a', done: true }, { text: 'b', done: false }] } },
    { project: 'web', task: { id: 't-4', title: 'Fix login redirect', status: 'todo', priority: 'urgent', due: '2026-11-16', steps: [] } },
    { project: 'web', task: { id: 't-5', title: 'Waiting on design', status: 'blocked', priority: 'medium', due: '', steps: [] } },
  ];
  const out = buildStandup(entries, { mode: 'daily', today: '2026-11-18' });
  assert.match(out.markdown, /\*\*Yesterday\*\*\n- Ship invoices export \(api\): Finance saves 2h a week/);
  assert.ok(!out.markdown.includes('Old thing'));
  assert.match(out.markdown, /- Migrate cache \(api\) 1\/2 steps/);
  assert.match(out.markdown, /- Fix login redirect \(web\) - overdue/);
  assert.match(out.markdown, /\*\*Blockers\*\*\n- Waiting on design \(web\)/);
});

test('buildStandup on Monday looks back to Friday; weekly lists a week', () => {
  const entries = [done('t-1', 'Friday task', { completed_on: '2026-11-13' })];
  const monday = buildStandup(entries, { mode: 'daily', today: '2026-11-16' });
  assert.match(monday.markdown, /\*\*Since Friday\*\*\n- Friday task/);
  const weekly = buildStandup(entries, { mode: 'weekly', today: '2026-11-18' });
  assert.match(weekly.markdown, /\*\*Done this week\*\*\n- Friday task/);
  assert.match(weekly.markdown, /\*\*Blockers\*\*\n- None/);
});
