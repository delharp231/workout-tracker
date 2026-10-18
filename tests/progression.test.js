import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lastPerformance, prefillSet, nextRoutine } from '../js/progression.js';

const set = (weight, reps, rir = null) => ({ weight, reps, rir, rpe: null, note: '', loggedAt: null });
const S = (id, date, entries) => ({ id, date, name: id, routineId: null, entries });
const sessions = [
  S('a', '2026-09-14T17:00:00.000Z', [{ exerciseId: 'bench', type: 'strength', sets: [set(130, 8), set(130, 8)] }]),
  S('b', '2026-09-21T17:00:00.000Z', [{ exerciseId: 'bench', type: 'strength', sets: [set(135, 8, 2), set(135, 8, 2), set(135, 7, 1)] }]),
  S('c', '2026-09-23T17:00:00.000Z', [{ exerciseId: 'bench', type: 'strength', sets: [] }, { exerciseId: 'squat', type: 'strength', sets: [set(185, 6)] }]),
  S('live', '2026-09-25T17:00:00.000Z', [{ exerciseId: 'bench', type: 'strength', sets: [set(140, 6)] }]),
];

test('lastPerformance: most recent other session that actually logged the exercise', () => {
  assert.deepEqual(lastPerformance(sessions, 'bench', { excludeId: 'live' }), { date: '2026-09-21T17:00:00.000Z', sets: sessions[1].entries[0].sets });
  assert.equal(lastPerformance(sessions, 'bench').date, '2026-09-25T17:00:00.000Z');
});

test('lastPerformance: `before` limits to earlier sessions (edit mode)', () => {
  assert.equal(lastPerformance(sessions, 'bench', { excludeId: 'b', before: '2026-09-21T17:00:00.000Z' }).date, '2026-09-14T17:00:00.000Z');
});

test('lastPerformance: null when never logged', () => {
  assert.equal(lastPerformance(sessions, 'deadlift', {}), null);
  assert.equal(lastPerformance([], 'bench'), null);
});

const target = { sets: 3, repMin: 6, repMax: 8, rirMin: 1, rirMax: 2, note: '' };

test('prefill: copies the previous set logged this session exactly', () => {
  assert.deepEqual(prefillSet({ loggedThisSession: [set(135, 8, 2), set(140, 6, null)], lastSets: [set(100, 10, 3)], target }), { weight: 140, reps: 6, rir: null });
});

test('prefill: otherwise last time set 1, falling back to the target RIR for legacy sets', () => {
  assert.deepEqual(prefillSet({ lastSets: [set(135, 8, 1), set(135, 7, 0)], target }), { weight: 135, reps: 8, rir: 1 });
  assert.deepEqual(prefillSet({ lastSets: [{ weight: 135, reps: 8, rir: null, rpe: 8 }], target }), { weight: 135, reps: 8, rir: 2 });
});

test('prefill: otherwise the target (bottom of the rep range, top of the RIR range, weight empty)', () => {
  assert.deepEqual(prefillSet({ target }), { weight: null, reps: 6, rir: 2 });
});

test('prefill: nothing known → all empty', () => {
  assert.deepEqual(prefillSet({}), { weight: null, reps: null, rir: null });
});

const push = { id: 'p', name: 'Push (Cycle 1)', position: 0 };
const pull = { id: 'l', name: 'Pull (Cycle 1)', position: 1 };
const legs = { id: 'g', name: 'Legs (Cycle 1)', position: 2 };

test('nextRoutine: first by position when there is no history', () => {
  assert.equal(nextRoutine([legs, pull, push], []), push);
});

test('nextRoutine: the one after the most recent routine session, wrapping round', () => {
  const hist = [{ id: 1, date: '2026-09-21T17:00:00.000Z', routineId: 'p' }, { id: 2, date: '2026-09-23T17:00:00.000Z', routineId: 'l' }];
  assert.equal(nextRoutine([push, pull, legs], hist), legs);
  assert.equal(nextRoutine([push, pull, legs], [{ id: 3, date: '2026-09-25T17:00:00.000Z', routineId: 'g' }]), push);
});

test('nextRoutine: ignores freestyle sessions and deleted routines', () => {
  const hist = [
    { id: 1, date: '2026-09-21T17:00:00.000Z', routineId: 'p' },
    { id: 2, date: '2026-09-24T17:00:00.000Z', routineId: null },
    { id: 3, date: '2026-09-25T17:00:00.000Z', routineId: 'deleted' },
  ];
  assert.equal(nextRoutine([push, pull, legs], hist), pull);
});

test('nextRoutine: null with no routines', () => {
  assert.equal(nextRoutine([], []), null);
});

test('nextRoutine skips routines left out of the rotation', async () => {
  const { nextRoutine } = await import('../js/progression.js');
  const rts = [
    { id: 'push', name: 'Push', position: 0, inRotation: false },
    { id: 'a', name: 'Full Body A', position: 1 },
    { id: 'b', name: 'Full Body B', position: 2 },
  ];
  assert.equal(nextRoutine(rts, []).id, 'a');
  assert.equal(nextRoutine(rts, [{ routineId: 'a', date: '2026-10-18T10:00:00.000Z' }]).id, 'b');
  assert.equal(nextRoutine(rts, [{ routineId: 'b', date: '2026-10-19T10:00:00.000Z' }]).id, 'a');
  // a session of a left-out routine does not move the rotation
  assert.equal(nextRoutine(rts, [{ routineId: 'a', date: '2026-10-18T10:00:00.000Z' }, { routineId: 'push', date: '2026-10-19T10:00:00.000Z' }]).id, 'b');
});

test('nextRoutine falls back to every routine when all are left out', async () => {
  const { nextRoutine } = await import('../js/progression.js');
  const rts = [{ id: 'x', name: 'X', position: 0, inRotation: false }, { id: 'y', name: 'Y', position: 1, inRotation: false }];
  assert.equal(nextRoutine(rts, []).id, 'x');
});
