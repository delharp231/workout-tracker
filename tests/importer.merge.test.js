import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeExercises, applyRestore } from '../js/importer.js';

test('mergeExercises adds new names, skips existing (case-insensitive)', () => {
  const existing = [{ id: 'a', name: 'Back Squat' }];
  const incoming = [{ id: 'x', name: 'back squat' }, { id: 'y', name: 'Bench Press' }];
  const { merged, added, skipped } = mergeExercises(existing, incoming);
  assert.equal(added, 1);
  assert.equal(skipped, 1);
  assert.equal(merged.length, 2);
  assert.ok(merged.find((e) => e.name === 'Bench Press'));
  assert.equal(merged.find((e) => e.name === 'Back Squat').id, 'a'); // original untouched
});

test('mergeExercises skips blank/empty incoming names', () => {
  const { added, skipped, merged } = mergeExercises([{ id: 'a', name: 'Squat' }], [{ id: 'b', name: '   ' }, { id: 'c', name: '' }]);
  assert.equal(added, 0); assert.equal(skipped, 2); assert.equal(merged.length, 1);
});

test('mergeExercises tolerates an existing entry with no name', () => {
  const { added, merged } = mergeExercises([{ id: 'a' }], [{ id: 'b', name: 'Row' }]);
  assert.equal(added, 1); assert.equal(merged.length, 2);
});

test('applyRestore replace mode returns the incoming state', () => {
  const existing = { settings: { units: 'lb' }, exercises: [{ id: 'a', name: 'A' }], routines: [], sessions: [{ id: 's' }] };
  const incoming = { settings: { units: 'kg' }, exercises: [{ id: 'b', name: 'B' }], routines: [], sessions: [] };
  const out = applyRestore(existing, incoming, 'replace');
  assert.deepEqual(out.exercises, incoming.exercises);
  assert.deepEqual(out.sessions, []);
  assert.equal(out.settings.units, 'kg');
});

test('applyRestore replace falls back for omitted fields', () => {
  const existing = { settings: { units: 'lb' }, exercises: [{ id: 'a' }], routines: [{ id: 'r' }], sessions: [{ id: 's' }] };
  const out = applyRestore(existing, { exercises: [{ id: 'b' }] }, 'replace');
  assert.deepEqual(out.exercises, [{ id: 'b' }]);
  assert.deepEqual(out.routines, []); assert.deepEqual(out.sessions, []);
  assert.equal(out.settings.units, 'lb');
});

test('applyRestore merge unions by id (existing wins) and merges exercises by name', () => {
  const existing = { settings: { units: 'lb' }, exercises: [{ id: 'a', name: 'Squat' }], routines: [{ id: 'r1', name: 'EXISTING' }], sessions: [{ id: 's1', name: 'EXISTING' }] };
  const incoming = { settings: { units: 'kg' }, exercises: [{ id: 'z', name: 'Squat' }, { id: 'w', name: 'Row' }], routines: [{ id: 'r1', name: 'INCOMING' }, { id: 'r2' }], sessions: [{ id: 's1', name: 'INCOMING' }, { id: 's2' }] };
  const out = applyRestore(existing, incoming, 'merge');
  assert.equal(out.exercises.length, 2);
  assert.deepEqual(out.routines.map(r => r.id).sort(), ['r1', 'r2']);
  assert.deepEqual(out.sessions.map(s => s.id).sort(), ['s1', 's2']);
  assert.equal(out.routines.find(r => r.id === 'r1').name, 'EXISTING');
  assert.equal(out.sessions.find(s => s.id === 's1').name, 'EXISTING');
  assert.equal(out.settings.units, 'lb');
});
