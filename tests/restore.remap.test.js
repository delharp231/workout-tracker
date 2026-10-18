import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRestore, remapIncoming } from '../js/importer.js';

// A new phone seeded its own starter data (new ids); the backup carries the old ids.
const phone = {
  settings: null,
  exercises: [{ id: 'new-bench', name: 'Barbell Bench Press' }, { id: 'new-row', name: 'Barbell Row' }],
  routines: [{ id: 'new-push', name: 'Push (Cycle 1)', origin: { cycle: 1, key: 'push' }, items: [{ exerciseId: 'new-bench' }] }],
  sessions: [],
  bodyweight: [],
};
const backup = {
  exercises: [{ id: 'old-bench', name: 'barbell bench press ' }, { id: 'old-custom', name: 'My Cable Fly' }],
  routines: [
    { id: 'old-push', name: 'Push (Cycle 1)', origin: { cycle: 1, key: 'push' }, items: [{ exerciseId: 'old-bench' }] },
    { id: 'old-mine', name: 'My Routine', origin: null, items: [{ exerciseId: 'old-bench' }, { exerciseId: 'old-custom' }] },
  ],
  sessions: [{ id: 's1', routineId: 'old-push', entries: [{ exerciseId: 'old-bench' }, { exerciseId: 'old-custom' }] }],
  bodyweight: [{ date: '2026-10-01', weight: 190 }],
};

test('merge remaps skipped exercise ids inside routines and sessions', () => {
  const out = applyRestore(phone, backup, 'merge');
  const mine = out.routines.find((r) => r.id === 'old-mine');
  assert.deepEqual(mine.items.map((i) => i.exerciseId), ['new-bench', 'old-custom']);
  assert.deepEqual(out.sessions[0].entries.map((e) => e.exerciseId), ['new-bench', 'old-custom']);
});

test('merge does not duplicate a starter routine the phone already has, and repoints its sessions', () => {
  const out = applyRestore(phone, backup, 'merge');
  assert.equal(out.routines.filter((r) => r.name === 'Push (Cycle 1)').length, 1);
  assert.equal(out.sessions[0].routineId, 'new-push');
  assert.equal(out.exercises.length, 3); // the custom exercise came across
  assert.equal(out.bodyweight.length, 1);
});

test('remapIncoming leaves the inputs alone and changes nothing when ids already match', () => {
  const copy = JSON.stringify(backup);
  remapIncoming(phone, backup);
  assert.equal(JSON.stringify(backup), copy);
  const same = remapIncoming({ exercises: backup.exercises, routines: backup.routines }, backup);
  assert.deepEqual(same.routines, backup.routines);
  assert.deepEqual(same.sessions, backup.sessions);
});

test('replace mode is untouched', () => {
  const out = applyRestore(phone, backup, 'replace');
  assert.equal(out.routines.length, 2);
  assert.equal(out.routines[0].items[0].exerciseId, 'old-bench');
});
