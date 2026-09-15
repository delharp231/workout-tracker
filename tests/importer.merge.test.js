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

test('applyRestore replace mode returns the incoming state', () => {
  const existing = { settings: { units: 'lb' }, exercises: [{ id: 'a', name: 'A' }], routines: [], sessions: [{ id: 's' }] };
  const incoming = { settings: { units: 'kg' }, exercises: [{ id: 'b', name: 'B' }], routines: [], sessions: [] };
  const out = applyRestore(existing, incoming, 'replace');
  assert.deepEqual(out.exercises, incoming.exercises);
  assert.deepEqual(out.sessions, []);
  assert.equal(out.settings.units, 'kg');
});

test('applyRestore merge mode unions sessions/routines by id and merges exercises by name', () => {
  const existing = { settings: { units: 'lb' }, exercises: [{ id: 'a', name: 'Squat' }], routines: [{ id: 'r1' }], sessions: [{ id: 's1' }] };
  const incoming = { settings: { units: 'kg' }, exercises: [{ id: 'z', name: 'Squat' }, { id: 'w', name: 'Row' }], routines: [{ id: 'r1' }, { id: 'r2' }], sessions: [{ id: 's2' }] };
  const out = applyRestore(existing, incoming, 'merge');
  assert.equal(out.exercises.length, 2);            // Squat skipped, Row added
  assert.deepEqual(out.sessions.map((s) => s.id).sort(), ['s1', 's2']);
  assert.deepEqual(out.routines.map((r) => r.id).sort(), ['r1', 'r2']);
  assert.equal(out.settings.units, 'lb');           // merge keeps existing settings
});
