import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STALE_SEC, countLoggedSets, entryProgress, lastLoggedAt, finishedAtFor, finishSummary, applyFinish,
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
