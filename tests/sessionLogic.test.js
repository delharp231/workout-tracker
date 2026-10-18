import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STALE_SEC, countLoggedSets, entryProgress, lastLoggedAt, finishedAtFor, finishSummary, applyFinish, homeModel,
} from '../js/sessionLogic.js';

const set = (reps, loggedAt) => ({ weight: 100, reps, rir: null, rpe: null, note: '', loggedAt });
const exIndex = new Map([
  ['bench', { id: 'bench', name: 'Barbell Bench Press' }],
  ['ohp', { id: 'ohp', name: 'Overhead Press' }],
  ['bike', { id: 'bike', name: 'Stationary Bike', type: 'cardio' }],
  ['row', { id: 'row', name: 'Rowing Erg', type: 'cardio' }],
]);
function session() {
  return { id: 's', date: '2026-09-25T17:00:00.000Z', name: 'Push (Cycle 1)', finishedAt: null, cursor: 3, entries: [
    { exerciseId: 'bench', type: 'strength', target: { sets: 3 }, sets: [set(8, '2026-09-25T17:05:00.000Z'), set(8, '2026-09-25T17:09:00.000Z'), set(7, '2026-09-25T17:13:00.000Z')] },
    { exerciseId: 'ohp', type: 'strength', target: { sets: 3 }, sets: [] },
    { exerciseId: 'bike', type: 'cardio', target: null, done: true, durationSec: null, distance: null },
    { exerciseId: 'row', type: 'cardio', target: null, done: false, durationSec: null, distance: null },
  ] };
}

test('STALE_SEC is 30 minutes', () => assert.equal(STALE_SEC, 1800));

test('countLoggedSets counts strength sets only', () => assert.equal(countLoggedSets(session()), 3));

test('entryProgress labels', () => {
  const s = session();
  assert.deepEqual(entryProgress(s.entries[0]), { done: true, label: '✓', spoken: 'done' });
  assert.deepEqual(entryProgress(s.entries[1]), { done: false, label: '—', spoken: 'not started' });
  assert.deepEqual(entryProgress({ type: 'strength', target: { sets: 3 }, sets: [set(8, null)] }), { done: false, label: '1 / 3', spoken: '1 of 3 sets' });
  assert.deepEqual(entryProgress({ type: 'strength', target: null, sets: [set(8, null), set(8, null)] }), { done: false, label: '2 sets', spoken: '2 sets' });
  assert.deepEqual(entryProgress(s.entries[2]), { done: true, label: '✓', spoken: 'done' });
  assert.deepEqual(entryProgress(s.entries[3]), { done: false, label: '—', spoken: 'not started' });
});

test('lastLoggedAt finds the latest set time', () => {
  assert.equal(lastLoggedAt(session()), '2026-09-25T17:13:00.000Z');
});

test('finishSummary: counts, what gets removed, staleness', () => {
  const sum = finishSummary(session(), exIndex, '2026-09-25T17:43:00.000Z');
  assert.equal(sum.setCount, 3);
  assert.deepEqual(sum.removeNames, ['Overhead Press', 'Rowing Erg']);
  assert.equal(sum.lastLoggedAt, '2026-09-25T17:13:00.000Z');
  assert.equal(sum.staleSec, 1800);
  assert.equal(sum.nothingLogged, false);
});

test('finishSummary: nothing logged', () => {
  const s = session();
  s.entries = [s.entries[1], s.entries[3]];
  assert.equal(finishSummary(s, exIndex, '2026-09-25T18:00:00.000Z').nothingLogged, true);
});

test('cardio with minutes or distance counts as logged even if not marked done', () => {
  const s = session();
  s.entries[3].durationSec = 480;
  assert.deepEqual(finishSummary(s, exIndex, '2026-09-25T18:00:00.000Z').removeNames, ['Overhead Press']);
});

test('applyFinish prunes, stamps finishedAt, resets the cursor, leaves the input alone', () => {
  const s = session();
  const done = applyFinish(s, { nowIso: '2026-09-25T17:43:00.000Z' });
  assert.equal(done.finishedAt, '2026-09-25T17:43:00.000Z');
  assert.equal(done.cursor, 0);
  assert.deepEqual(done.entries.map((e) => e.exerciseId), ['bench', 'bike']);
  assert.equal(s.entries.length, 4);
  assert.equal(s.finishedAt, null);
});

test('applyFinish can use the last set time + 60 s for a stale workout', () => {
  assert.equal(applyFinish(session(), { nowIso: '2026-09-25T20:00:00.000Z', useLastSetTime: true }).finishedAt, '2026-09-25T17:14:00.000Z');
});

test('finishedAtFor falls back to now when there are no timed sets', () => {
  const s = session();
  s.entries = [s.entries[2]];
  assert.equal(finishedAtFor(s, { nowIso: '2026-09-25T18:00:00.000Z', useLastSetTime: true }), '2026-09-25T18:00:00.000Z');
});

const rt = (id, position) => ({ id, name: `Routine ${id}`, position, items: [] });
const sess = (id, date, routineId, extra = {}) => ({ id, date, name: `Routine ${routineId}`, routineId, finishedAt: null, entries: [], ...extra });
const NOW = '2026-10-18T12:00:00.000Z';

test('homeModel: an unfinished workout shows as active and hides the start list', () => {
  const open = sess('open', '2026-10-15T12:00:00.000Z', 'a', { entries: [{ exerciseId: 'bench', type: 'strength', sets: [set(8, '2026-10-15T12:05:00.000Z')] }] });
  const m = homeModel({ routines: [rt('a', 0), rt('b', 1)], sessions: [open], activeId: 'open', nowIso: NOW });
  assert.equal(m.active.session.id, 'open');
  assert.equal(m.active.setCount, 1);
  assert.equal(m.active.ageSec, 3 * 86400);
  assert.equal(m.next, null);
  assert.deepEqual(m.rest, []);
});

test('homeModel: a stale pointer is ignored', () => {
  const m = homeModel({ routines: [rt('a', 0)], sessions: [], activeId: 'gone', nowIso: NOW });
  assert.equal(m.active, null);
  assert.equal(m.next.id, 'a');
});

test('homeModel: up next goes first, the rest keep position order', () => {
  const done = sess('s1', '2026-10-16T12:00:00.000Z', 'b', { finishedAt: '2026-10-16T13:00:00.000Z' });
  const m = homeModel({ routines: [rt('a', 0), rt('b', 1), rt('c', 2)], sessions: [done], activeId: null, nowIso: NOW });
  assert.equal(m.next.id, 'c');
  assert.deepEqual(m.rest.map((r) => r.id), ['a', 'b']);
});

test('homeModel: last is the latest finished session, never an unfinished one', () => {
  const old = sess('s1', '2026-10-10T12:00:00.000Z', 'a', { finishedAt: '2026-10-10T13:00:00.000Z' });
  const recent = sess('s2', '2026-10-14T12:00:00.000Z', 'b', { finishedAt: '2026-10-14T13:00:00.000Z' });
  const open = sess('s3', '2026-10-17T12:00:00.000Z', 'a');
  const m = homeModel({ routines: [rt('a', 0)], sessions: [old, recent, open], activeId: null, nowIso: NOW });
  assert.deepEqual(m.last, { name: 'Routine b', date: '2026-10-14T12:00:00.000Z' });
  assert.equal(homeModel({ routines: [], sessions: [], activeId: null, nowIso: NOW }).last, null);
});

import { reopenSession, weekCount, weighInSummary } from '../js/sessionLogic.js';

test('reopenSession keeps the original, and finishing restores its finish time and drops the copy', () => {
  const orig = { ...session(), finishedAt: '2026-09-25T17:40:00.000Z' };
  const open = reopenSession(orig);
  assert.equal(open.finishedAt, null);
  assert.equal(open.reopenedFrom.finishedAt, '2026-09-25T17:40:00.000Z');
  assert.equal(orig.finishedAt, '2026-09-25T17:40:00.000Z'); // not mutated
  assert.equal(finishedAtFor(open, { nowIso: '2026-10-18T12:00:00.000Z', useLastSetTime: true }), '2026-09-25T17:40:00.000Z');
  const done = applyFinish(open, { nowIso: '2026-10-18T12:00:00.000Z' });
  assert.equal(done.finishedAt, '2026-09-25T17:40:00.000Z');
  assert.equal('reopenedFrom' in done, false);
});

test('weekCount counts finished sessions in the local Mon to Sun week', () => {
  const at = (y, m, d) => new Date(y, m - 1, d, 9).toISOString();
  const fin = (date) => ({ date, finishedAt: date });
  const sessions = [fin(at(2026, 10, 12)), fin(at(2026, 10, 14)), fin(at(2026, 10, 18)), fin(at(2026, 10, 11)), fin(at(2026, 10, 19)), { date: at(2026, 10, 15), finishedAt: null }];
  // Sunday Oct 18 2026: the week is Mon Oct 12 to Sun Oct 18
  assert.equal(weekCount(sessions, new Date(2026, 9, 18, 20)), 3);
  assert.equal(weekCount(sessions, new Date(2026, 9, 19, 8)), 1);
});

test('weighInSummary: latest, 7-day average and the week before', () => {
  assert.equal(weighInSummary([]), null);
  const e = (date, weight) => ({ date, weight });
  const s = weighInSummary([e('2026-10-18', 180), e('2026-10-16', 182), e('2026-10-12', 184), e('2026-10-10', 186), e('2026-10-08', 188)]);
  assert.equal(s.latest.weight, 180);
  assert.equal(s.avg7, 182); // Oct 12 to 18: 180, 182, 184
  assert.equal(s.prevAvg7, 187); // Oct 5 to 11: 186, 188
  assert.equal(weighInSummary([e('2026-10-18', 180)]).prevAvg7, null);
});
